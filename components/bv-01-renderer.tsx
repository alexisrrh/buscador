"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useBrowserReady } from "@/lib/browser-signals";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";
import { markBV01Load, measureBV01Load } from "@/lib/bv01-load-metrics";
import { BV01_POSTER_URL } from "@/lib/bv01-model-asset";
import { BV01_POSTER_ALPHA_BOUNDS, BV01_POSTER_INTRINSIC, pixelBounds, type PixelBounds } from "@/lib/bv01-poster-alignment";
import type { BV01FrameSample } from "@/components/bv-01-model";

const loadBV01ThreeStage = () => import("@/components/bv-01-three-stage");
const BV01ThreeStage = dynamic(() => loadBV01ThreeStage().then((module) => module.BV01ThreeStage), { ssr: false });

const REQUIRED_STABLE_MS = 200;
const RESIZE_QUIET_MS = 150;
const MAX_FRAME_DELTA_PX = 1;
const MAX_POSTER_CENTER_DELTA_PX = 3;
const MAX_POSTER_HEIGHT_RATIO_DELTA = 0.01;

type BV01RendererProps = { state: BV01VisualState; forceFallback?: boolean; staticOnly?: boolean };
type CapabilityState = "CHECKING" | "WEBGL" | "FALLBACK";

export function BV01Renderer({ state, forceFallback = false, staticOnly = false }: BV01RendererProps) {
  if (staticOnly) return <BV01StaticPoster state={state} />;
  return <BV01InteractiveRenderer key={String(forceFallback)} state={state} forceFallback={forceFallback} />;
}

function BV01InteractiveRenderer({ state, forceFallback = false }: Omit<BV01RendererProps, "staticOnly">) {
  const browserReady = useBrowserReady();
  const [capability, setCapability] = useState<CapabilityState>(forceFallback ? "FALLBACK" : "CHECKING");
  const effectiveCapability = forceFallback || (browserReady && (isLowCapabilityDevice() || typeof window.WebGLRenderingContext === "undefined")) ? "FALLBACK" : capability;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [captureReady, setCaptureReady] = useState(false);
  const rendererRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const posterBoundsRef = useRef<PixelBounds | undefined>(undefined);
  const lastResizeAtRef = useRef(0);
  const previousFrameRef = useRef<BV01FrameSample | undefined>(undefined);
  const stabilityStartedAtRef = useRef<number | undefined>(undefined);
  const revealStartedAtRef = useRef<number | undefined>(undefined);
  const revealedRef = useRef(false);
  const [debugEnabled] = useState(() => isDevelopmentFlag("bv01Debug"));
  const [capturePoster] = useState(() => isDevelopmentFlag("bv01CapturePoster"));
  const [debugBounds, setDebugBounds] = useState<{ stage?: DOMRect; poster?: PixelBounds; model?: PixelBounds }>({});
  const [debugSample, setDebugSample] = useState<BV01FrameSample>();
  const [debugGate, setDebugGate] = useState({ runtimeStable: false, posterMatch: false });
  const [debugLayout, setDebugLayout] = useState<{ hero?: DOMRect; agent?: DOMRect; slot?: DOMRect; canvas?: DOMRect }>({});
  const debugFrames = useRef<BV01FrameSample[]>([]);
  const debugLayoutSamples = useRef<{ timestamp: number; hero?: DOMRect; agent?: DOMRect; slot?: DOMRect; canvas?: DOMRect }[]>([]);

  useEffect(() => { markBV01Load("hero-render-start"); }, []);

  // The gate uses actual on-screen alpha bounds, in production as well as in
  // debug. A design-time stage estimate cannot detect a runtime mismatch.
  useLayoutEffect(() => {
    if (!rendererRef.current || !posterRef.current) return;
    const update = () => {
      const stage = rendererRef.current?.getBoundingClientRect();
      const image = posterRef.current?.querySelector("img");
      if (!stage || !image) return;
      const imageRect = image.getBoundingClientRect();
      const scale = Math.min(imageRect.width / BV01_POSTER_INTRINSIC.width, imageRect.height / BV01_POSTER_INTRINSIC.height);
      const renderedWidth = BV01_POSTER_INTRINSIC.width * scale;
      const renderedHeight = BV01_POSTER_INTRINSIC.height * scale;
      const originX = imageRect.left + (imageRect.width - renderedWidth) / 2;
      const originY = imageRect.top + (imageRect.height - renderedHeight) / 2;
      const poster = pixelBounds(
        originX + BV01_POSTER_ALPHA_BOUNDS.minX * scale,
        originY + BV01_POSTER_ALPHA_BOUNDS.minY * scale,
        originX + (BV01_POSTER_ALPHA_BOUNDS.maxX + 1) * scale,
        originY + (BV01_POSTER_ALPHA_BOUNDS.maxY + 1) * scale,
      );
      posterBoundsRef.current = poster;
      lastResizeAtRef.current = performance.now();
      if (debugEnabled) setDebugBounds((current) => ({ ...current, stage, poster }));
    };
    update();
    const image = posterRef.current.querySelector("img");
    image?.addEventListener("load", update);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(rendererRef.current);
    return () => {
      image?.removeEventListener("load", update);
      observer?.disconnect();
    };
  }, [debugEnabled, modelReady]);

  useLayoutEffect(() => {
    if (!debugEnabled || !rendererRef.current) return;
    const slot = rendererRef.current;
    const snapshot = () => {
      const agent = slot.closest(".public-entry__agent");
      const hero = slot.closest(".public-entry");
      const canvas = slot.querySelector("canvas");
      const sample = {
        timestamp: performance.now(),
        hero: hero?.getBoundingClientRect(),
        agent: agent?.getBoundingClientRect(),
        slot: slot.getBoundingClientRect(),
        canvas: canvas?.getBoundingClientRect(),
      };
      if (debugLayoutSamples.current.length < 120) debugLayoutSamples.current.push(sample);
      setDebugLayout(sample);
    };
    snapshot();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(snapshot);
    observer?.observe(slot);
    const agent = slot.closest(".public-entry__agent");
    const hero = slot.closest(".public-entry");
    if (agent) observer?.observe(agent);
    if (hero) observer?.observe(hero);
    window.addEventListener("load", snapshot, { once: true });
    const debugStartedAt = performance.now();
    let frame = 0;
    const sampleForTwoSeconds = () => {
      snapshot();
      if (performance.now() - debugStartedAt < 2_000) frame = requestAnimationFrame(sampleForTwoSeconds);
    };
    frame = requestAnimationFrame(sampleForTwoSeconds);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [debugEnabled, capability]);

  useEffect(() => {
    if (forceFallback) return;
    let media: MediaQueryList | undefined;
    const updateMotion = () => setReducedMotion(Boolean(media?.matches));
    // Capability detection is a browser measurement, scheduled after hydration.
    const frame = requestAnimationFrame(() => {
      markBV01Load("capability-check-start");
      if (isLowCapabilityDevice() || typeof window.WebGLRenderingContext === "undefined") {
        setCapability("FALLBACK");
        return;
      }
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!context) {
        setCapability("FALLBACK");
        return;
      }
      markBV01Load("stage-chunk-request");
      void loadBV01ThreeStage().then(() => {
        markBV01Load("stage-chunk-ready");
        measureBV01Load("stage-chunk", "stage-chunk-request", "stage-chunk-ready");
      });
      media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      updateMotion();
      markBV01Load("capability-check-complete");
      measureBV01Load("capability", "capability-check-start", "capability-check-complete");
      setCapability("WEBGL");
      media?.addEventListener("change", updateMotion);
    });
    return () => { cancelAnimationFrame(frame); media?.removeEventListener("change", updateMotion); };
  }, [forceFallback]);

  useEffect(() => {
    if (!modelReady) return;
    markBV01Load("model-visible");
    measureBV01Load("hero-to-visible", "hero-render-start", "model-visible");
  }, [modelReady]);

  const onFrameSample = useCallback((incoming: BV01FrameSample) => {
    const now = performance.now();
    const previous = previousFrameRef.current;
    const poster = posterBoundsRef.current;
    const geometricStable = previous ? Math.abs(incoming.centerY - previous.centerY) <= MAX_FRAME_DELTA_PX
      && Math.abs(incoming.height - previous.height) <= MAX_FRAME_DELTA_PX
      && incoming.canvasWidth === previous.canvasWidth
      && incoming.canvasHeight === previous.canvasHeight
      && incoming.stageWidth === previous.stageWidth
      && incoming.stageHeight === previous.stageHeight
      && Math.abs(incoming.cameraAspect - previous.cameraAspect) < 0.0001 : false;
    const resizeQuiet = now - lastResizeAtRef.current >= RESIZE_QUIET_MS;
    const posterMatch = poster ? Math.abs(incoming.centerY - poster.centerY) <= MAX_POSTER_CENTER_DELTA_PX
      && Math.abs(incoming.centerX - poster.centerX) <= MAX_POSTER_CENTER_DELTA_PX
      && Math.abs(incoming.height / poster.height - 1) <= MAX_POSTER_HEIGHT_RATIO_DELTA : false;

    const runtimeStable = geometricStable && resizeQuiet;
    if (runtimeStable) stabilityStartedAtRef.current ??= now;
    else stabilityStartedAtRef.current = undefined;
    const stableMs = stabilityStartedAtRef.current ? now - stabilityStartedAtRef.current : 0;
    if (capturePoster && stableMs >= REQUIRED_STABLE_MS) setCaptureReady(true);
    // Poster matching is now diagnostic only. The physical stage slot is the
    // invariant; a sub-pixel poster delta must never make the 3D scene remain
    // hidden indefinitely.
    const isRevealStart = !revealedRef.current && stableMs >= REQUIRED_STABLE_MS;
    if (isRevealStart) {
      revealedRef.current = true;
      revealStartedAtRef.current = now;
      markBV01Load("model-stable");
      measureBV01Load("stable-prewarm", "gltf-parse-complete", "model-stable");
      setModelReady(true);
    }
    const phase = isRevealStart ? "REVEAL_START" : revealStartedAtRef.current && now - revealStartedAtRef.current >= 120 ? "REVEAL_END" : stabilityStartedAtRef.current ? "STABLE_CANDIDATE" : "PREWARM";
    const sample: BV01FrameSample = { ...incoming, stableMs, stableFrames: Math.floor(stableMs / 16.67), phase };
    previousFrameRef.current = incoming;

    if (debugEnabled) {
      if (debugFrames.current.length < 180) debugFrames.current.push(sample);
      setDebugBounds((current) => ({ ...current, model: pixelBounds(sample.left, sample.top, sample.right, sample.bottom) }));
      setDebugSample((current) => !current || sample.phase !== current.phase || Math.abs(sample.centerY - current.centerY) > 1 || Math.abs(sample.height - current.height) > 1 || sample.frame % 10 === 0 ? sample : current);
      setDebugGate((current) => current.runtimeStable === runtimeStable && current.posterMatch === posterMatch ? current : { runtimeStable, posterMatch });
    }
  }, [capturePoster, debugEnabled]);

  const modelBounds = debugBounds.model;
  const posterBounds = debugBounds.poster;
  const alignment = debugEnabled && posterBounds && modelBounds ? JSON.stringify({
    stage: debugBounds.stage && { left: debugBounds.stage.left, top: debugBounds.stage.top, width: debugBounds.stage.width, height: debugBounds.stage.height },
    poster: posterBounds, model: modelBounds,
    delta: { x: posterBounds.centerX - modelBounds.centerX, y: posterBounds.centerY - modelBounds.centerY, scale: posterBounds.height / modelBounds.height },
  }) : undefined;
  return <div ref={rendererRef} className="bv-01-renderer bv-01-stage-slot" data-testid="bv-01-renderer" data-model-ready={modelReady} data-bv01-alignment={alignment} data-runtime-stable={debugGate.runtimeStable} data-poster-match={debugGate.posterMatch}>
    {effectiveCapability === "CHECKING" ? <BV01Poster state={state} posterRef={posterRef} /> : null}
    {effectiveCapability === "FALLBACK" ? <BV01NeutralStage state={state} mode="fallback" /> : null}
    {effectiveCapability === "WEBGL" ? <>
      <BV01Poster state={state} posterRef={posterRef} />
      <BV01ThreeStage state={state} reducedMotion={reducedMotion} modelReady={modelReady} capturePoster={capturePoster} captureReady={captureReady} onModelError={() => setCapability("FALLBACK")} onFrameSample={onFrameSample} />
    </> : null}
    {debugEnabled && posterBounds && modelBounds ? <BV01AlignmentOverlay poster={posterBounds} model={modelBounds} stage={debugBounds.stage} sample={debugSample} layout={debugLayout} runtimeStable={debugGate.runtimeStable} posterMatch={debugGate.posterMatch} modelReady={modelReady} /> : null}
  </div>;
}

function BV01Poster({ state, posterRef }: { state: BV01VisualState; posterRef?: RefObject<HTMLDivElement | null> }) {
  const visual = bv01VisualStateMap[state];
  return <div ref={posterRef} className="bv-01-poster" data-testid="bv-01-poster" data-state={state.toLowerCase()} role="img" aria-label={`BV-01: ${visual.status}`}>
    <Image src={BV01_POSTER_URL} alt="" width={BV01_POSTER_INTRINSIC.width} height={BV01_POSTER_INTRINSIC.height} unoptimized loading="eager" fetchPriority="high" />
  </div>;
}

/** Static landing representation: server-rendered immediately and deliberately
 * isolated from WebGL capability checks or the BV-01 GLB loading path. */
function BV01StaticPoster({ state }: { state: BV01VisualState }) {
  return <div className="bv-01-renderer bv-01-stage-slot bv-01-static-hero" data-testid="bv-01-static-hero" data-state={state.toLowerCase()}>
    <div className="bv-01-static-pedestal" aria-hidden="true"><i /><i /><i /></div>
    <BV01Poster state={state} />
  </div>;
}

function BV01AlignmentOverlay({ poster, model, stage }: { poster: PixelBounds; model: PixelBounds; stage?: DOMRect; sample?: BV01FrameSample; layout: { hero?: DOMRect; agent?: DOMRect; slot?: DOMRect; canvas?: DOMRect }; runtimeStable: boolean; posterMatch: boolean; modelReady: boolean }) {
  const relative = (bounds: PixelBounds) => ({ left: bounds.left - (stage?.left ?? 0), top: bounds.top - (stage?.top ?? 0), width: bounds.width, height: bounds.height });
  return <div className="bv-01-alignment-debug" aria-hidden="true">
    <i className="bv-01-alignment-debug__poster" style={relative(poster)} />
    <i className="bv-01-alignment-debug__model" style={relative(model)} />
  </div>;
}

function BV01NeutralStage({ state, mode }: { state: BV01VisualState; mode: "loading" | "fallback" }) {
  const visual = bv01VisualStateMap[state];
  const label = mode === "loading" ? `Preparando BV-01: ${visual.status}` : `BV-01 disponible sin renderizado 3D: ${visual.status}`;
  return <div className={`bv-01-neutral bv-01-neutral--${mode}`} data-testid={`bv-01-${mode}`} data-state={state.toLowerCase()} role="img" aria-label={label}>
    <div className="bv-01-neutral__halo" aria-hidden="true" />
    <div className="bv-01-neutral__core" aria-hidden="true">B</div>
    <span>BV-01</span>
    <strong>{visual.status}</strong>
  </div>;
}

function isLowCapabilityDevice() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === "number" && memory <= 2;
}

function isDevelopmentFlag(name: string) {
  return process.env.NODE_ENV === "development"
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has(name);
}
