"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Component, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBrowserSearch } from "@/lib/browser-signals";
import { BV01HologramGlobe, type GlobeInteraction } from "@/components/bv-01-hologram-globe";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";
import type { GlobeBoundary, GlobeLocation } from "@/lib/globe-location";
import type { SearchIntent } from "@/lib/intent-first";
import type { SearchVisualPhase } from "@/components/search-visual-pipeline";

let nextGlobeCanvasId = 0;
const knownGlobeCanvases = new Set<HTMLCanvasElement>();
const FLOATING_MAP_HEADROOM_PX = 190;

type GlobeCompositionProbe = "A" | "B" | "C";

const compositionCandidates: Record<GlobeCompositionProbe, { radius: number; verticalRatio: number }> = {
  A: { radius: 110, verticalRatio: -.02 },
  B: { radius: 90, verticalRatio: .054 },
  C: { radius: 70, verticalRatio: .161 },
};

function globeDiagnostic(instanceId: string, canvas?: HTMLCanvasElement) {
  const rect = canvas?.getBoundingClientRect();
  return {
    timestampMs: Math.round(performance.now()),
    instanceId: `GLOBE_INSTANCE_${instanceId}`,
    canvasId: canvas?.dataset.globeCanvasId,
    route: window.location.pathname,
    documentContainsCanvas: canvas ? document.contains(canvas) : false,
    canvasConnected: canvas?.isConnected,
    visibility: canvas ? getComputedStyle(canvas).visibility : undefined,
    dimensions: rect ? { width: rect.width, height: rect.height } : undefined,
    documentCanvasCount: document.querySelectorAll("canvas").length,
    knownGlobeCanvasCount: [...knownGlobeCanvases].filter((item) => item.isConnected).length,
  };
}

export function HeroGlobeStage({ state, searchActive = false, location, boundary, searchPhase = "idle" }: { state: BV01VisualState; intent?: SearchIntent | null; compactLocation?: boolean; searchActive?: boolean; location?: GlobeLocation; boundary?: GlobeBoundary; searchPhase?: SearchVisualPhase }) {
  const instanceId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const [capability, setCapability] = useState<"WEBGL" | "FALLBACK">("FALLBACK");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interaction, setInteraction] = useState<GlobeInteraction>("idle");
  const [locationLocked, setLocationLocked] = useState(false);
  const browserSearch = useBrowserSearch();
  const candidate = process.env.NODE_ENV === "development" ? new URLSearchParams(browserSearch).get("bvglobe")?.toUpperCase() : undefined;
  const compositionProbe = candidate === "A" || candidate === "B" || candidate === "C" ? candidate : undefined;
  const [probeTransform, setProbeTransform] = useState<string | undefined>(undefined);
  const enterFallback = useCallback(() => setCapability("FALLBACK"), []);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.debug("[earth-globe] GLOBE_MOUNT", JSON.stringify(globeDiagnostic(instanceId)));
    return () => {
      if (process.env.NODE_ENV === "development") console.debug("[earth-globe] GLOBE_UNMOUNT", JSON.stringify(globeDiagnostic(instanceId)));
    };
  }, [instanceId]);

  // This is intentionally a development-only visual comparison. It keeps the
  // existing globe, canvas, and geometry intact; only its stage container is
  // resized and translated after real DOM bounds are available.
  useLayoutEffect(() => {
    if (!compositionProbe) return;
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      const robotCanvas = document.querySelector<HTMLCanvasElement>('[data-testid="bv-01-animated-prototype"] canvas');
      const centralPanel = document.querySelector<HTMLElement>(".opportunities-search__panel, .public-entry__projection");
      if (!stage || !robotCanvas || !centralPanel) return;
      const candidate = compositionCandidates[compositionProbe];
      const stageRect = stage.getBoundingClientRect();
      const robotRect = robotCanvas.getBoundingClientRect();
      const panelRect = centralPanel.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const margin = 25;
      const targetCenterX = Math.max(candidate.radius + margin, Math.min(panelRect.left - candidate.radius - margin, viewport.width - candidate.radius - margin));
      const targetCenterY = Math.max(candidate.radius + margin, Math.min(robotRect.top + robotRect.height * candidate.verticalRatio, viewport.height - candidate.radius - margin));
      const currentCenterX = stageRect.left + stageRect.width / 2;
      const currentCenterY = stageRect.top + stageRect.height / 2;
      const translateX = targetCenterX - currentCenterX;
      const translateY = targetCenterY - currentCenterY;
      setProbeTransform(`translate3d(${translateX}px, ${translateY}px, 0)`);
      console.debug("[GLOBE COMPOSITION PROBE]", {
        candidate: compositionProbe,
        radius: candidate.radius,
        robotRect: rectDetails(robotRect),
        centralPanelRect: rectDetails(panelRect),
        viewport,
        targetCenter: [Number(targetCenterX.toFixed(1)), Number(targetCenterY.toFixed(1))],
        stageCenterBefore: [Number(currentCenterX.toFixed(1)), Number(currentCenterY.toFixed(1))],
        translation: [Number(translateX.toFixed(1)), Number(translateY.toFixed(1))],
        panelMarginPx: Number((panelRect.left - (targetCenterX + candidate.radius)).toFixed(1)),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [compositionProbe, capability]);

  useEffect(() => {
    const motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const update = () => {
      const canvas = document.createElement("canvas");
      const supportsWebGL = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
      setCapability(supportsWebGL && window.innerWidth > 960 ? "WEBGL" : "FALLBACK");
      setReducedMotion(Boolean(motion?.matches));
    };
    update();
    window.addEventListener("resize", update);
    motion?.addEventListener("change", update);
    return () => { window.removeEventListener("resize", update); motion?.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const frame = requestAnimationFrame(() => {
      const stage = document.querySelector(".public-entry .hero-globe-stage");
      if (!stage) {
        console.info("[earth-globe] landing DOM", { stagePresent: false, canvasPresent: false, fallbackPresent: false });
        return;
      }
      const style = window.getComputedStyle(stage);
      const rect = stage.getBoundingClientRect();
      console.info("[earth-globe] landing DOM", {
        stagePresent: true,
        canvasPresent: Boolean(stage.querySelector("canvas")),
        fallbackPresent: Boolean(stage.querySelector(".earth-globe-fallback")),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        width: rect.width,
        height: rect.height,
        position: style.position,
        top: style.top,
        right: style.right,
        zIndex: style.zIndex,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [capability]);

  const visual = bv01VisualStateMap[state];
  const handleLocationLockChange = useCallback((locked: boolean) => setLocationLocked(locked), []);
  const onCreated = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement; dispose: () => void; forceContextLoss: () => void } }) => {
    if (process.env.NODE_ENV !== "development") return;
    const canvas = gl.domElement;
    canvas.dataset.globeCanvasId ??= `GLOBE_CANVAS_${++nextGlobeCanvasId}`;
    knownGlobeCanvases.add(canvas);
    console.debug("[earth-globe] GLOBE_CANVAS_CREATED", JSON.stringify(globeDiagnostic(instanceId, canvas)));
    console.debug("[earth-globe] GLOBE_RENDERER_CREATED", JSON.stringify(globeDiagnostic(instanceId, canvas)));

    const originalForceContextLoss = gl.forceContextLoss.bind(gl);
    const originalDispose = gl.dispose.bind(gl);
    gl.dispose = () => {
      console.debug("[earth-globe] GLOBE_DISPOSE", JSON.stringify(globeDiagnostic(instanceId, canvas)));
      originalDispose();
    };
    gl.forceContextLoss = () => {
      console.debug("[earth-globe] GLOBE_FORCE_CONTEXT_LOSS", JSON.stringify(globeDiagnostic(instanceId, canvas)));
      originalForceContextLoss();
    };
  }, [instanceId]);
  const probeDiameter = compositionProbe ? compositionCandidates[compositionProbe].radius * 2 : undefined;
  const resolvedLabel = locationLocked && location?.resolved && location.resolvedName ? `${location.resolvedName} · ${searchActive ? "ESCANEANDO VACANTES" : "ÁREA DE BÚSQUEDA"}` : searchActive ? "ESCANEO GLOBAL ACTIVO" : undefined;
  return <div ref={stageRef} data-search-phase={searchPhase} className={`hero-globe-stage hero-globe-stage--${interaction}${searchActive ? " hero-globe-stage--searching" : ""}${boundary?.available && locationLocked ? " hero-globe-stage--area-projection" : ""}${capability === "FALLBACK" ? " hero-globe-stage--fallback" : ""}`} style={compositionProbe ? { width: probeDiameter, transform: probeTransform } : undefined}>
    {capability === "FALLBACK" ? <EarthGlobeFallback /> : <EarthGlobeBoundary onError={enterFallback}><Canvas aria-hidden="true" style={{ position: "absolute", top: -FLOATING_MAP_HEADROOM_PX, left: 0, width: "100%", height: `calc(100% + ${FLOATING_MAP_HEADROOM_PX}px)` }} dpr={reducedMotion ? 1 : [1, 1.25]} frameloop={reducedMotion ? "demand" : "always"} camera={{ position: [0, 0, 4.4], fov: 34 }} gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} onCreated={onCreated}>
      <ambientLight intensity={0.35 * visual.ambient} color={visual.primary} />
      <pointLight position={[1.5, 1.5, 2]} intensity={1.1 * visual.globeLight} color={visual.primary} distance={4} />
      <BV01HologramGlobe state={state} reducedMotion={reducedMotion} searchActive={searchActive} location={location} boundary={boundary} searchPhase={searchPhase} scale={2} calloutHeadroomPx={FLOATING_MAP_HEADROOM_PX} onInteractionChange={setInteraction} onLocationLockChange={handleLocationLockChange} />
      <GlobeContextLifecycle instanceId={instanceId} onContextLost={enterFallback} />
    </Canvas></EarthGlobeBoundary>}
    {searchActive ? <i className="hero-globe-stage__operation-signal" aria-hidden="true" /> : null}
    {resolvedLabel ? <p className="hero-globe-stage__location-label" aria-live="polite">{resolvedLabel}</p> : null}
  </div>;
}

function rectDetails(rect: DOMRect) {
  return {
    left: Number(rect.left.toFixed(1)), top: Number(rect.top.toFixed(1)), right: Number(rect.right.toFixed(1)), bottom: Number(rect.bottom.toFixed(1)),
    width: Number(rect.width.toFixed(1)), height: Number(rect.height.toFixed(1)),
  };
}

function GlobeContextLifecycle({ instanceId, onContextLost }: { instanceId: string; onContextLost: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      const details = { ...globeDiagnostic(instanceId, canvas), statusMessage: (event as WebGLContextEvent).statusMessage };
      if (!canvas.isConnected) {
        console.debug("[earth-globe] GLOBE_CONTEXT_LOST_ON_TEARDOWN", JSON.stringify(details));
        return;
      }
      console.warn("[earth-globe] GLOBE_CONTEXT_LOST", JSON.stringify(details));
      onContextLost();
    };
    const onRestored = () => console.info("[earth-globe] GLOBE_CONTEXT_RESTORED", JSON.stringify(globeDiagnostic(instanceId, canvas)));
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      console.debug("[earth-globe] GLOBE_LISTENERS_REMOVED", JSON.stringify(globeDiagnostic(instanceId, canvas)));
    };
  }, [gl, instanceId, onContextLost]);

  return null;
}

function EarthGlobeFallback() {
  return <div className="earth-globe-fallback" role="img" aria-label="Tierra holográfica disponible sin WebGL"><i /><i /></div>;
}

class EarthGlobeBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV === "development") console.error("[earth-globe] render failed", { message: error.message });
    this.props.onError();
  }
  render() { return this.state.failed ? null : this.props.children; }
}
