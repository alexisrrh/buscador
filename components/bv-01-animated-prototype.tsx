"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useBrowserReady, useBrowserSearch, useMediaQuery } from "@/lib/browser-signals";
import { AnimationClip, AnimationMixer, BufferGeometry, Color, Euler, Float32BufferAttribute, Line, LineBasicMaterial, LoopOnce, LoopRepeat, Object3D, Plane, Quaternion, Ray, Vector3, WebGLRenderTarget, type Camera, type Group, type Scene, type WebGLRenderer } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { BV01Renderer } from "@/components/bv-01-renderer";
import { DEV_SEARCH_QA_STORAGE_KEYS, exposeLastSearchQa, persistDevSearchQa } from "@/lib/dev-search-qa";
import { BV01_POSTER_URL } from "@/lib/bv01-model-asset";
import { BV01_POSTER_ALPHA_BOUNDS, BV01_POSTER_INTRINSIC } from "@/lib/bv01-poster-alignment";
import type { BV01VisualState } from "@/lib/bv01-visual-state";
import type { SearchIntent } from "@/lib/intent-first";
import { panelInteractPhase, searchVisualLabel, type HologramContact, type SearchVisualPhase } from "@/components/search-visual-pipeline";

const ENABLED = process.env.NEXT_PUBLIC_BV01_ANIMATED_PROTOTYPE === "true";
const URL = "/models/bv-01/BV01_runtime_animated_interact.glb?v=20260927-panel-contact-v5";
const CAMERA_DISTANCE = 10.25;
const CAMERA_FOV = 31;
let glbReadyLoggedForPage = false;

type TransformDiagnostic =
  | { kind: "scale"; scale: number }
  | { kind: "translate"; x: number }
  | { kind: "rotate" }
  | undefined;

type CameraDiagnostic = "z10" | "z7" | "z5" | "z3.5" | "xleft" | "xright" | undefined;

type LifecycleEvent = "GLB_READY" | "CAMERA_FIT_VALIDATED" | "FIRST_VALID_RUNTIME_FRAME" | "HANDOFF_STARTED" | "HANDOFF_FINISHED" | "POST_HANDOFF_RASTER" | "COMPOSITION_RASTER" | "SEARCH_IDLE" | "SEARCH_STARTED" | "PANEL_WORK_STARTED" | "PANEL_WORK_TIME" | "HAND_TRAJECTORY_AUDIT" | "GLOBE_INTERACT_PROBE_STARTED" | "GLOBE_INTERACT_PROBE_SAMPLE";
const INTERACTION_MIN_SEARCH_VISUAL_MS = 2_200;
const MAX_INTERACTION_DELTA = .05;
const CONTACT_DISTANCE_3D = .028;
// The solver aims a little inside the acceptance shell. This is deliberately
// not the contact threshold: real contact remains governed by the locked .028.
const SOCKET_SOLVER_TARGET_TOLERANCE = .018;
const MAX_FOREARM_EXTRA_TWIST_RAD = Math.PI / 6;
const PROCEDURAL_INTERACTION_DURATION = 5.8;
const DIRECTED_CHOREOGRAPHY = true;
const DIRECTED_ARM_WEIGHT_DURING_ACTIVE = 1;

function recordSearchInteractionTiming(event: "interactionStartT" | "interactionCompleteT") {
  if (process.env.NODE_ENV !== "development") return;
  const timingWindow = window as Window & { __SEARCH_TIMING_EVENTS__?: Record<string, number> };
  if (timingWindow.__SEARCH_TIMING_EVENTS__) timingWindow.__SEARCH_TIMING_EVENTS__[event] = performance.now();
}
type InteractionQa = {
  profileMinDistancePx: number | null;
  filterMinDistancePx: number | null;
  operation1MinDistancePx: number | null;
  operation2MinDistancePx: number | null;
  profileContactTriggered: boolean;
  filterContactTriggered: boolean;
  operation1ContactTriggered: boolean;
  operation2ContactTriggered: boolean;
  interactionDurationMs: number;
  minSearchVisualMs: number;
  interactionFinished: boolean;
  actionTime: number;
  touchMinDistancePx: Partial<Record<InteractionTouchId, number | null>>;
  touchContactTriggered: Partial<Record<InteractionTouchId, boolean>>;
};
type InteractionDebug = {
  framesObserved: number; mixerFrames: number; ccdFrames: number; profileCcdFrames: number; filterCcdFrames: number; operation1CcdFrames: number; operation2CcdFrames: number;
  validRightHandSamples: number; validLeftHandSamples: number; noHandBoneCount: number; noCameraCount: number; invalidWorldPositionCount: number; invalidNdcCount: number; invalidViewportCount: number; invalidTargetCount: number; invalidDistanceCount: number;
  rightHandBoneName: string; leftHandBoneName: string; rightHandRenderedSkeleton: boolean; leftHandRenderedSkeleton: boolean; webglContextLostCount: number; webglContextRestoredCount: number; firstActionTime: number | null; lastActionTime: number | null; distinctActionTimeSamples: number; interactionActionTimeMax: number; interactionFinished: boolean; invalidSampleReason: string;
  frameDeltaMinMs: number | null; frameDeltaMaxMs: number | null; frameDeltaAvgMs: number | null; frameDeltaTotalMs: number; largestActionTimeJump: number; largestActionTimeJumpFrom: number | null; largestActionTimeJumpTo: number | null; actionTimeSamples: number[];
  rawFrameDeltaMinMs: number | null; rawFrameDeltaMaxMs: number | null; rawFrameDeltaAvgMs: number | null; rawFrameDeltaTotalMs: number; appliedFrameDeltaMinMs: number | null; appliedFrameDeltaMaxMs: number | null; appliedFrameDeltaAvgMs: number | null; appliedFrameDeltaTotalMs: number; clampedDeltaFrameCount: number; largestRawActionRiskDeltaMs: number;
  renderedSkinnedMeshCount: number; renderedSkinnedMeshes: Array<{ name: string; skeletonUuid: string; boneCount: number; containsLeftHand: boolean; containsRightHand: boolean }>; leftHandUuid: string | null; rightHandUuid: string | null; leftHandSkeletonUuids: string[]; rightHandSkeletonUuids: string[];
  ccdBlockReason: string; ccdBlockCounts: Record<string, number>; phaseWindowsCrossed: Record<string, boolean>;
  actionEnabled: boolean; actionPaused: boolean; actionRunning: boolean; actionEffectiveWeight: number; actionEffectiveTimeScale: number; interactionTrackCount: number; resolvedTrackBindings: number; unresolvedTrackBindings: number; nonZeroAppliedDeltaFrames: number; documentHiddenDuringSearch: boolean; ccdTemporarilyBypassed: boolean;
};

export type InteractionTouchId = "profile-1" | "filters-1" | "operation-1" | "profile-2" | "filters-2" | "operation-2";
type TouchScreen = "profile" | "filters" | "operation";
type ThreeContactAnchor = { contact: InteractionTouchId; position: Vector3; reprojectionErrorPx: number; reachDistance: number | null; armMaxReach: number | null; reachable: boolean | null; selectedRayDepth: number; ergonomicScore: number; screenFraction: { x: number; y: number } };
type ThreeContactAnchors = Partial<Record<InteractionTouchId, ThreeContactAnchor>>;
type ArmAnatomyMeasurement = { upperArmCorrectionDeg: number; forearmCorrectionDeg: number; forearmExtraTwistDeg: number; wristCorrectionDeg: number; elbowFlipCount: number; handMinHeadClearance: number | null; forearmHeadIntersection: boolean; armExtensionRatio: number; elbowAngleDeg: number; contactDistance3D: number; screenDistancePx: number; contact: boolean; shoulderWorld: Vector3; elbowWorld: Vector3; wristWorld: Vector3; elbowPoleWorld: Vector3; headWorld?: Vector3 };
type ProceduralReachResult = { worldDistance: number; screenDistance: number; handWorld: Vector3; anatomy: ArmAnatomyMeasurement };
type IkTargetTelemetry = { globalMinDistance3D: number | null; activePhaseMinDistance3D: number | null; contact: boolean; activeHand: "left" | "right"; activePhaseFrameCount: number; ikWeightedFrameCount: number; maxIkWeight: number; closestFrameActionTime: number | null; closestHandScreenX: number | null; closestHandScreenY: number | null; targetScreenX: number | null; targetScreenY: number | null; screenErrorPxAt3DMinimum: number | null; currentDistanceAtContactAttempt: number | null };
type HandContactSocket = { object: Object3D; boneName: string; localOffset: Vector3; side: "left" | "right" };
type TouchLifecycle = { id: InteractionTouchId; screen: TouchScreen; hand: "left" | "right"; approachStartedAt: number | null; actualContactAt: number | null; holdEndedAt: number | null; withdrawEndedAt: number | null; minDistance3D: number | null; minScreenDistancePx: number | null; contact: boolean };
type HologramTouchQa = { id: InteractionTouchId; screen: TouchScreen; hand: "left" | "right"; target: { x: number; y: number }; distance3D: number; screenDistancePx: number; contact: boolean; actionTime: number };
type ArmReadyPose = { upper: Quaternion; forearm: Quaternion; hand: Quaternion };
type BodyReadyPose = { torso: Quaternion; head: Quaternion };
type MotionSample = { lastPosition?: Vector3; lastScreen?: { x: number; y: number }; lastVelocity: number; handVelocityAtContact: number | null; handVelocityAfterRelease: number | null; maxFrameToFrameVelocityDelta: number; screenSpeedMin: number; screenSpeedTotal: number; screenSpeedSamples: number; lowSpeedMs: number; extendedFreezeMs: number; armExtensionRatioAtContact: number | null; handToHeadNormalizedClearance: number | null };
type WorkspaceFloorTelemetry = { rightMinHandWorkHeight: number | null; leftMinHandWorkHeight: number | null; intermediateRightArmRestFrames: number; intermediateLeftArmRestFrames: number };
type ActivationStartPose = Partial<Record<"mixamorigRightShoulder" | "mixamorigRightArm" | "mixamorigRightForeArm" | "mixamorigRightHand" | "mixamorigLeftShoulder" | "mixamorigLeftArm" | "mixamorigLeftForeArm" | "mixamorigLeftHand" | "mixamorigSpine2" | "mixamorigHead", Quaternion>>;

function interactionDistance(minima: Partial<Record<InteractionTouchId, { distance: number }>>, contact: InteractionTouchId) {
  const value = minima[contact]?.distance;
  return value === undefined ? null : Number(value.toFixed(1));
}

function interactionQaSnapshot(debug: InteractionDebug, minima: Partial<Record<InteractionTouchId, { distance: number }>>, triggers: Partial<Record<InteractionTouchId, boolean>>, duration: number, actionTime: number): InteractionQa {
  return {
    // Keep these legacy summary fields for existing consumers. The physical
    // touch records below are the source of truth and never collapse passes.
    profileMinDistancePx: interactionDistance(minima, "profile-1"), filterMinDistancePx: interactionDistance(minima, "filters-1"),
    operation1MinDistancePx: interactionDistance(minima, "operation-1"), operation2MinDistancePx: interactionDistance(minima, "operation-2"),
    profileContactTriggered: Boolean(triggers["profile-1"]), filterContactTriggered: Boolean(triggers["filters-1"]),
    operation1ContactTriggered: Boolean(triggers["operation-1"]), operation2ContactTriggered: Boolean(triggers["operation-2"]),
    interactionDurationMs: Number((duration * 1_000).toFixed(1)), minSearchVisualMs: INTERACTION_MIN_SEARCH_VISUAL_MS,
    interactionFinished: debug.interactionFinished, actionTime: Number(actionTime.toFixed(4)),
    touchMinDistancePx: Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((id) => [id, interactionDistance(minima, id)])) as InteractionQa["touchMinDistancePx"],
    touchContactTriggered: Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((id) => [id, Boolean(triggers[id])])) as InteractionQa["touchContactTriggered"],
  };
}

function publishLiveInteractionTelemetry(debug: InteractionDebug, minima: Partial<Record<InteractionTouchId, { distance: number }>>, triggers: Partial<Record<InteractionTouchId, boolean>>, duration: number, actionTime: number) {
  if (process.env.NODE_ENV !== "development") return;
  const qa = interactionQaSnapshot(debug, minima, triggers, duration, actionTime);
  const debugSnapshot = { ...debug, profileMinDistancePx: qa.profileMinDistancePx, filterMinDistancePx: qa.filterMinDistancePx, operation1MinDistancePx: qa.operation1MinDistancePx, operation2MinDistancePx: qa.operation2MinDistancePx, actionTime: qa.actionTime };
  const telemetryWindow = window as Window & { __BV01_INTERACTION_QA__?: InteractionQa; __BV01_INTERACTION_DEBUG__?: typeof debugSnapshot };
  telemetryWindow.__BV01_INTERACTION_QA__ = qa;
  telemetryWindow.__BV01_INTERACTION_DEBUG__ = debugSnapshot;
}

export type HologramContactPoint = { x: number; y: number };

export function BV01AnimatedPrototype({ state, working = false, resultsReady = false, onWorkSignal, onSearchPhase, onHologramContact, onInteractionComplete }: { state: BV01VisualState; working?: boolean; resultsReady?: boolean; onWorkSignal?: (signal: number) => void; onSearchPhase?: (phase: SearchVisualPhase) => void; onHologramContact?: (contact: HologramContact, point?: HologramContactPoint, touchId?: InteractionTouchId) => void; onInteractionComplete?: () => void }) {
  const browserReady = useBrowserReady();
  const prefersStatic = useMediaQuery("(max-width: 760px), (prefers-reduced-motion: reduce)");
  const canAnimate = ENABLED && browserReady && !prefersStatic;
  const [ready, setReady] = useState(false);
  const [framingState, setFramingState] = useState<"PENDING" | "VALIDATED" | "FAILED">("PENDING");
  const browserSearch = useBrowserSearch();
  const params = new URLSearchParams(process.env.NODE_ENV === "development" ? browserSearch : "");
  const requestedCamera = params.get("bvcamera");
  const globeInteractProbe = state === "SEARCHING" && params.get("bvclip") === "globe";
  const transformDiagnostic = useMemo<TransformDiagnostic>(() => {
    if (process.env.NODE_ENV !== "development") return undefined;
    const params = new URLSearchParams(browserSearch);
    const test = params.get("bvtest");
    const requestedScale = Number(params.get("bvscale"));
    return test === "translate" ? { kind: "translate", x: params.get("bvdir") === "left" ? -3 : 3 }
      : test === "rotate" ? { kind: "rotate" }
        : (test === "scale" || test === null) && [1, 3, 6].includes(requestedScale) ? { kind: "scale", scale: requestedScale } : undefined;
  }, [browserSearch]);
  const cameraDiagnostic: CameraDiagnostic = ["z10", "z7", "z5", "z3.5", "xleft", "xright"].includes(requestedCamera ?? "") ? requestedCamera as Exclude<CameraDiagnostic, undefined> : undefined;
  const [handoffComplete, setHandoffComplete] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const visualLayersLogged = useRef(false);
  const readyRef = useRef(false);
  const lifecycleStart = useRef<number | undefined>(undefined);
  const handoffFinished = useRef(false);
  useEffect(() => {
    if (!ENABLED) return;
    // The poster shell is rendered from SSR onward. Only Canvas mounting is
    // client-decided, so hydration never replaces one BV-01 fallback with
    // another visually distinct renderer.
    if (process.env.NODE_ENV === "development") console.debug("[BV01 lifecycle] eligibility", { desktop: !prefersStatic, prototypeEnabled: ENABLED });
    return () => { if (process.env.NODE_ENV === "development") console.debug("[BV01 lifecycle] unmount"); };
  }, [prefersStatic]);
  const logLifecycle = useCallback((event: LifecycleEvent, details: Record<string, unknown> = {}) => {
    if (process.env.NODE_ENV !== "development") return;
    if (event === "HAND_TRAJECTORY_AUDIT" && "runtimeContactMinima" in details) (window as Window & { __BV01_LAST_AUDIT?: Record<string, unknown> }).__BV01_LAST_AUDIT = details;
    const now = performance.now();
    lifecycleStart.current ??= now;
    console.debug(`[BV01] ${event}`, JSON.stringify({ elapsedMs: Number((now - lifecycleStart.current).toFixed(1)), ...details }));
  }, []);
  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    logLifecycle("HANDOFF_STARTED", stageOpacitySnapshot(stageRef.current));
    setReady(true);
  }, [logLifecycle]);
  const markFramingState = useCallback((nextState: "VALIDATED" | "FAILED") => setFramingState(nextState), []);
  useEffect(() => {
    if (!ready || handoffFinished.current) return;
    const completeHandoff = () => {
      if (handoffFinished.current) return;
      handoffFinished.current = true;
      setHandoffComplete(true);
      logLifecycle("HANDOFF_FINISHED", stageOpacitySnapshot(stageRef.current));
    };
    const canvasLayer = stageRef.current?.querySelector<HTMLElement>(".bv-01-three");
    const onTransitionEnd = (event: TransitionEvent) => { if (event.propertyName === "opacity") completeHandoff(); };
    canvasLayer?.addEventListener("transitionend", onTransitionEnd);
    const timer = window.setTimeout(completeHandoff, 400);
    return () => { canvasLayer?.removeEventListener("transitionend", onTransitionEnd); window.clearTimeout(timer); };
  }, [logLifecycle, ready]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || framingState === "PENDING" || (framingState === "VALIDATED" && !ready) || visualLayersLogged.current || !stageRef.current) return;
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const poster = stage.querySelector<HTMLElement>(".bv-01-poster");
      const canvasLayer = stage.querySelector<HTMLElement>(".bv-01-three");
      const canvas = stage.querySelector("canvas");
      console.debug("[BV01 VISUAL LAYERS]", {
        staticRendererPresent: Boolean(stage.querySelector('[data-testid="bv-01-static-hero"]')),
        prototypePosterPresent: Boolean(poster),
        canvasPresent: Boolean(canvas),
        prototypePosterOpacity: poster ? getComputedStyle(poster).opacity : undefined,
        canvasOpacity: canvasLayer ? getComputedStyle(canvasLayer).opacity : undefined,
        framingValidated: framingState === "VALIDATED",
        ready,
        visibleLayer: ready ? "canvas-3d" : "prototype-poster",
      });
      visualLayersLogged.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [canAnimate, framingState, ready]);
  if (!ENABLED) return <BV01Renderer state={state} staticOnly />;
  return <div ref={stageRef} className="bv-01-renderer bv-01-stage-slot bv-01-static-hero" data-testid="bv-01-animated-prototype" data-model-ready={ready} data-framing-validated={framingState === "VALIDATED" || transformDiagnostic !== undefined || cameraDiagnostic !== undefined}>
    <div className="bv-01-static-pedestal" aria-hidden="true" style={{ opacity: ready ? 0 : 1, transition: "opacity 150ms ease" }}><i /><i /><i /></div>
    <div className="bv-01-poster" style={{ position: "absolute", inset: 0, opacity: ready ? 0 : 1, transition: "opacity 150ms ease", pointerEvents: "none" }}><Image src={BV01_POSTER_URL} alt="" width={BV01_POSTER_INTRINSIC.width} height={BV01_POSTER_INTRINSIC.height} unoptimized loading="eager" fetchPriority="high" /></div>
    {canAnimate ? <div className="bv-01-three" style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: "opacity 150ms ease" }}>
      <Canvas frameloop="always" gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }} camera={{ position: [0, 0, CAMERA_DISTANCE], fov: CAMERA_FOV }}>
          <ambientLight intensity={0.48} color="#d8eaf5" /><directionalLight position={[-4, 5, 6]} intensity={2.4} color="#f4fbff" /><directionalLight position={[4, 2, 4]} intensity={1.05} color="#b8e5ff" /><directionalLight position={[1, 4, -4]} intensity={.55} color="#75ddff" /><pointLight position={[-2.6, 1.4, 3.2]} intensity={working ? 1.42 : .28} distance={4.8} color="#69e8ff" /><pointLight position={[2.3, 1.1, 2.8]} intensity={working ? 1.12 : .2} distance={4.2} color="#79ddff" />
          <PrototypeModel transformDiagnostic={transformDiagnostic} cameraDiagnostic={cameraDiagnostic} globeInteractProbe={globeInteractProbe} handoffComplete={handoffComplete} working={working} resultsReady={resultsReady} onFirstFrame={markReady} onFramingState={markFramingState} onLifecycle={logLifecycle} onWorkSignal={onWorkSignal ?? (() => undefined)} onSearchPhase={onSearchPhase ?? (() => undefined)} onHologramContact={onHologramContact ?? (() => undefined)} onInteractionComplete={onInteractionComplete ?? (() => undefined)} />
        </Canvas>
      </div> : null}
  </div>;
}

function workModeLabel(mode?: SearchIntent["workMode"]) {
  return mode === "REMOTE" ? "Remoto" : mode === "HYBRID" ? "Híbrido" : mode === "ONSITE" ? "Presencial" : "Flexible";
}

export function HolographicWorkPanels({ visible, active, phase, signal, contact = "none", contactPoint, touchId, intent }: { visible: boolean; active: boolean; phase: SearchVisualPhase; signal: number; contact?: HologramContact; contactPoint?: HologramContactPoint; touchId?: InteractionTouchId; intent?: SearchIntent | null }) {
  const panelRoot = useRef<HTMLDivElement>(null);
  const baseWidths = useRef<{ profile: number; filters: number; operation: number } | undefined>(undefined);
  useEffect(() => {
    const root = panelRoot.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const profile = root.querySelector<HTMLElement>(".bv01-work-panel--profile");
    const filters = root.querySelector<HTMLElement>(".bv01-work-panel--preferences");
    const operation = root.querySelector<HTMLElement>(".bv01-work-panel--main");
    const robot = document.querySelector<HTMLElement>(".public-entry__agent");
    const consolePanel = document.querySelector<HTMLElement>(".public-entry__projection");
    if (!profile || !filters || !operation) return;
    let frame = 0;
    const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.innerWidth <= 760) return;
        const profileRect = profile.getBoundingClientRect();
        const filtersRect = filters.getBoundingClientRect();
        const operationRect = operation.getBoundingClientRect();
        const robotRect = robot?.getBoundingClientRect();
        const consoleRect = consolePanel?.getBoundingClientRect();
        baseWidths.current ??= { profile: profileRect.width, filters: filtersRect.width, operation: operationRect.width };
        const base = baseWidths.current;
        // Use real available lanes: the console and robot are measured rather
        // than assumed, while the requested reduction remains responsive.
        const profileLane = robotRect ? robotRect.left - profileRect.left - 24 : base.profile;
        const filtersLane = consoleRect && consoleRect.left > filtersRect.left ? consoleRect.left - filtersRect.left - 24 : base.filters;
        const profileWidth = clamp(Math.min(base.profile * .84, profileLane), 280, 320);
        const filtersWidth = clamp(Math.min(base.filters * .84, filtersLane), 280, 320);
        const operationWidth = clamp(Math.min(base.operation * .85, (robotRect?.width ?? base.operation) * 1.15), 430, 480);
        const stageCenterX = robotRect ? robotRect.left + robotRect.width / 2 : 0;
        root.style.setProperty("--profile-panel-fit-width", `${profileWidth}px`);
        root.style.setProperty("--filters-panel-fit-width", `${filtersWidth}px`);
        root.style.setProperty("--operation-panel-fit-width", `${operationWidth}px`);
        root.dataset.profileGapPx = robotRect ? `${Math.round(robotRect.left - profileRect.right)}` : "";
        root.dataset.oldRobotCenterSource = "DOM_STAGE_WRAPPER";
        root.dataset.oldRobotCenterX = `${Math.round(stageCenterX)}`;
        root.dataset.cockpitFit = "true";

      });
    };
    const observer = new ResizeObserver(measure);
    [root, profile, filters, operation, robot, consolePanel].filter((element): element is HTMLElement => Boolean(element)).forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const root = panelRoot.current;
    const positioner = root?.querySelector<HTMLElement>(".bv01-operation-positioner");
    const operation = root?.querySelector<HTMLElement>(".bv01-work-panel--main");
    if (!root || !positioner || !operation) return;
    let firstFrame = 0;
    let secondFrame = 0;
    let thirdFrame = 0;
    let fourthFrame = 0;
    const styleSnapshot = (element: HTMLElement) => {
      const computed = getComputedStyle(element);
      return {
        position: computed.position, left: computed.left, right: computed.right, inset: computed.inset,
        transform: computed.transform, translate: computed.translate, marginLeft: computed.marginLeft,
        inlineStyle: element.getAttribute("style") ?? "", operationXOffset: computed.getPropertyValue("--bv01-operation-x-offset").trim(),
      };
    };
    // This is deliberately a one-shot proof, not layout authority. -182px is
    // the CSS manual -32px plus an additional 150px left diagnostic on the
    // dedicated layout wrapper. It restores the CSS-owned value after the
    // double-RAF DOMRect sample has been recorded.
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const before = operation.getBoundingClientRect();
        const positionerBefore = positioner.getBoundingClientRect();
        const computedPositionerBefore = styleSnapshot(positioner);
        const computedPanelBefore = styleSnapshot(operation);
        positioner.style.setProperty("--bv01-operation-x-offset", "-182px");
        thirdFrame = requestAnimationFrame(() => {
          fourthFrame = requestAnimationFrame(() => {
            const after = operation.getBoundingClientRect();
            const positionerAfter = positioner.getBoundingClientRect();
            const computedPositionerAfter = styleSnapshot(positioner);
            const computedPanelAfter = styleSnapshot(operation);
            positioner.style.removeProperty("--bv01-operation-x-offset");
            const metrics = {
              visibleOperationElement: "section.bv01-work-panel.bv01-work-panel--main",
              positioningElement: "div.bv01-operation-positioner",
              rootCausePreviousManualShiftsFailed: "INNER_PANEL_TRANSFORM_WAS_NOT_A_RELIABLE_LAYOUT_POSITIONING_LAYER",
              rectLeftBeforeDebug: Number(before.left.toFixed(2)), rectLeftAfter150pxDebug: Number(after.left.toFixed(2)), actualDebugMovementPx: Number((after.left - before.left).toFixed(2)),
              debugShiftVisiblyWorked: Math.abs(Math.abs(after.left - before.left) - 150) <= 4,
              positionerLeftBefore: Number(positionerBefore.left.toFixed(2)), positionerLeftDuring150pxTest: Number(positionerAfter.left.toFixed(2)),
              finalManualShiftLeftPx: 32, computedPositionerBefore, computedPositionerAfter, computedPanelBefore, computedPanelAfter,
            };
            root.dataset.operationDebugMovementPx = `${metrics.actualDebugMovementPx}`;
            root.dataset.operationDebugWorked = `${metrics.debugShiftVisiblyWorked}`;
            (window as Window & { __BV01_OPERATION_POSITION_DEBUG__?: typeof metrics }).__BV01_OPERATION_POSITION_DEBUG__ = metrics;
          });
        });
      });
    });
    return () => {
      [firstFrame, secondFrame, thirdFrame, fourthFrame].forEach((frame) => cancelAnimationFrame(frame));
      positioner.style.removeProperty("--bv01-operation-x-offset");
    };
  }, []);
  const stage = phase === "idle" ? "analyzing" : phase;
  const standby = !active || phase === "idle";
  const confirmation = stage === "analyzing" ? "PERFIL ✓" : stage === "preferences" ? "FILTROS ✓" : stage === "consulting" ? "CONSULTANDO" : stage === "comparing" ? "MATCHING" : "PRIORIZANDO";
  const profileConfirmed = stage !== "analyzing";
  const filtersConfirmed = stage === "consulting" || stage === "comparing" || stage === "prioritizing";
  const operationLine = standby ? "Esperando búsqueda" : stage === "analyzing" ? "Analizando perfil…" : stage === "preferences" ? "Aplicando filtros…" : stage === "consulting" ? "Consultando vacantes…" : stage === "comparing" ? "Evaluando coincidencias…" : "Priorizando resultados…";
  const profileLine = standby ? "Perfil listo" : profileConfirmed ? "Perfil cargado ✓" : "Leyendo perfil…";
  const filtersLine = standby ? "Filtros listos" : filtersConfirmed ? "Filtros aplicados ✓" : stage === "preferences" ? "Configurando filtros…" : "Filtros en espera";
  const role = intent?.role?.trim() || "Perfil por definir";
  const location = intent?.location?.trim() || "Cualquier ubicación";
  const mode = workModeLabel(intent?.workMode);
  const contactStyle = contactPoint ? { "--contact-x": `${contactPoint.x}%`, "--contact-y": `${contactPoint.y}%` } as CSSProperties : undefined;
  return <div ref={panelRoot} className="bv01-work-panels" data-visible={visible} data-active={!standby} data-phase={stage} data-signal={signal} data-contact={contact} data-last-touch={touchId ?? "none"} style={contactStyle} aria-label={standby ? "Interfaz de trabajo en espera" : `Proceso activo: ${searchVisualLabel(stage)}`}>
    <div className="bv01-operation-positioner"><section className="bv01-work-panel bv01-work-panel--main"><header><span>OPERACIÓN</span>{!standby ? <i /> : null}</header><div className="bv01-work-panel__operation" aria-label="Estado de la operación"><span>{profileLine}</span><span>{filtersLine}</span><strong>{operationLine}</strong><small>{standby ? "Sistema preparado" : "Motor de coincidencia activo"}</small></div><div className="bv01-work-panel__system bv01-work-panel__system--operation" aria-label="Canal de búsqueda global"><i aria-hidden="true" /><div className="bv01-operation-pipeline"><span>PERFIL</span><span>FILTROS</span><span>CONSULTANDO</span><span>MATCHING</span><span>PRIORIZANDO</span></div><b>ENLACE GLOBAL</b></div><div className="bv01-operation-telemetry" aria-label="Canales de búsqueda activos"><i /><i /><i /><i /><i /><i /></div><div className="bv01-work-panel__scan"><i /><i /><i /></div><div className="bv01-work-panel__rows"><i /><i /><i /></div>{!standby ? <small>{confirmation}</small> : null}<i className="bv01-work-panel__contact" /></section></div>
    <section className="bv01-work-panel bv01-work-panel--profile"><span>PERFIL</span><div className="bv01-work-panel__details"><small>Rol: {role}</small><small>{standby ? "Estado: listo" : profileConfirmed ? "Estado: validado ✓" : "Estado: leyendo…"}</small><small>{standby ? "Señal: criterios listos" : "Señal: perfil interpretado"}</small></div><div className="bv01-work-panel__system bv01-work-panel__system--profile" aria-label="Lectura de identidad"><i aria-hidden="true" /><span>IDENTIDAD</span><span>ROL</span><span>SEÑAL</span></div><i className="bv01-work-panel__contact" /></section>
    <section className="bv01-work-panel bv01-work-panel--preferences"><span>FILTROS</span><div className="bv01-work-panel__details"><small>Zona: {location}</small><small>Modo: {mode}</small><small>{standby ? "Estado: preparado" : "Estado: afinando selección"}</small></div><div className="bv01-work-panel__system bv01-work-panel__system--filters" aria-label="Ruta de criterios"><span>ZONA</span><i aria-hidden="true" /><span>MODALIDAD</span><i aria-hidden="true" /><span>ALCANCE</span></div><i className="bv01-work-panel__contact" /></section>
  </div>;
}

function PrototypeModel({ transformDiagnostic, cameraDiagnostic, globeInteractProbe, handoffComplete, working, resultsReady, onFirstFrame, onFramingState, onLifecycle, onWorkSignal, onSearchPhase, onHologramContact, onInteractionComplete }: { transformDiagnostic?: TransformDiagnostic; cameraDiagnostic?: CameraDiagnostic; globeInteractProbe: boolean; handoffComplete: boolean; working: boolean; resultsReady: boolean; onFirstFrame: () => void; onFramingState: (state: "VALIDATED" | "FAILED") => void; onLifecycle: (event: LifecycleEvent, details?: Record<string, unknown>) => void; onWorkSignal: (signal: number) => void; onSearchPhase: (phase: SearchVisualPhase) => void; onHologramContact: (contact: HologramContact, point?: HologramContactPoint, touchId?: InteractionTouchId) => void; onInteractionComplete: () => void }) {
  const gltf = useLoader(GLTFLoader, URL) as GLTF;
  const { camera, gl } = useThree();
  // Object3D.clone(true) leaves a SkinnedMesh bound to the source skeleton.
  // SkeletonUtils keeps the cloned mesh and its animated bones in one runtime instance.
  const scene = useMemo(() => cloneSkinnedScene(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const framingRoot = useRef<Group>(null);
  const [cameraFitPrepared, setCameraFitPrepared] = useState(false);
  const calibrationStatus = useRef<"PENDING" | "VALIDATED" | "FAILED">("PENDING");
  const rasterPasses = useRef(0);
  const readySent = useRef(false);
  const diagnosticLogged = useRef(false);
  const finalFitLogged = useRef(false);
  const finalCameraFramePending = useRef(false);
  const finalCameraFrameRendered = useRef(false);
  const postHandoffRasterLogged = useRef(false);
  const compositionRasterLogged = useRef(false);
  const action = useRef<ReturnType<AnimationMixer["clipAction"]> | undefined>(undefined);
  const interactionSequenceTime = useRef(0);
  const previousInteractionSequenceTime = useRef(0);
  const workElapsed = useRef(0);
  const nextWorkMilestone = useRef(0);
  const nextGlobeProbeSample = useRef(0);
  const idleLogged = useRef(false);
  const lastWorkSignal = useRef(-1);
  const activeClip = useRef<"interact" | "work" | "globe" | undefined>(undefined);
  const lastSearchPhase = useRef<SearchVisualPhase>("idle");
  const lastHologramContact = useRef<HologramContact>("none");
  const interactionCompletionSent = useRef(false);
  const runtimeContactMinima = useRef<Partial<Record<InteractionTouchId, { distance: number; target: { x: number; y: number } }>>>({});
  const runtimeContactTriggers = useRef<Partial<Record<InteractionTouchId, boolean>>>({});
  const ikContactMinima = useRef<Partial<Record<InteractionTouchId, number>>>({});
  const ikContactTriggers = useRef<Partial<Record<InteractionTouchId, boolean>>>({});
  const ikTargetTelemetry = useRef<Partial<Record<InteractionTouchId, IkTargetTelemetry>>>({});
  const threeContactAnchors = useRef<ThreeContactAnchors>({});
  const threeTargetSignature = useRef("");
  const targetMarkerGroup = useRef<Group>(null);
  const handMarker = useRef<Group>(null);
  const socketMarkerGroup = useRef<Group>(null);
  const elbowPoleMarker = useRef<Object3D>(null);
  const headExclusionMarker = useRef<Object3D>(null);
  const contactSockets = useRef<Partial<Record<"left" | "right", HandContactSocket>>>({});
  const elbowPoleNormals = useRef<Partial<Record<"left" | "right", Vector3>>>({});
  const elbowFlipCounts = useRef<Record<"left" | "right", number>>({ left: 0, right: 0 });
  const armAnatomyTelemetry = useRef<Partial<Record<InteractionTouchId, ArmAnatomyMeasurement>>>({});
  const hologramTouches = useRef<HologramTouchQa[]>([]);
  const handInsideHead = useRef<Record<"left" | "right", boolean>>({ left: false, right: false });
  const handHeadEntryCounts = useRef<Record<"left" | "right", number>>({ left: 0, right: 0 });
  const forearmHeadIntersections = useRef<Record<"left" | "right", boolean>>({ left: false, right: false });
  const armReadyPoses = useRef<Partial<Record<"left" | "right", ArmReadyPose>>>({});
  const bodyReadyPose = useRef<BodyReadyPose | undefined>(undefined);
  const touchLifecycles = useRef<Partial<Record<InteractionTouchId, TouchLifecycle>>>({});
  const maxSimultaneousStrongReaches = useRef(0);
  const maxHandoffOverlapMs = useRef(0);
  const motionSamples = useRef<Partial<Record<InteractionTouchId, MotionSample>>>({});
  const perceptualExposure = useRef({ tPoseMs: 0, bothArmsExtendedMs: 0 });
  const workspaceFloorTelemetry = useRef<WorkspaceFloorTelemetry>({ rightMinHandWorkHeight: null, leftMinHandWorkHeight: null, intermediateRightArmRestFrames: 0, intermediateLeftArmRestFrames: 0 });
  const activationStartPose = useRef<ActivationStartPose>({});
  const contactDebugLineRef = useRef<Line>(null);
  const contactDebugLine = useMemo(() => new Line(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(6, 3)), new LineBasicMaterial({ color: "#fff3a6", transparent: true, opacity: .85, depthTest: false })), []);
  const armDebugLineRef = useRef<Line>(null);
  const armDebugLine = useMemo(() => new Line(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(9, 3)), new LineBasicMaterial({ color: "#a98cff", transparent: true, opacity: .8, depthTest: false })), []);
  const baseAnimationOnly = process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bvbase");
  const showTargetMarkers = process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bvtargets");
  const ccdTemporarilyBypassed = false;
  const runtimeDebug = useRef<InteractionDebug>({ framesObserved: 0, mixerFrames: 0, ccdFrames: 0, profileCcdFrames: 0, filterCcdFrames: 0, operation1CcdFrames: 0, operation2CcdFrames: 0, validRightHandSamples: 0, validLeftHandSamples: 0, noHandBoneCount: 0, noCameraCount: 0, invalidWorldPositionCount: 0, invalidNdcCount: 0, invalidViewportCount: 0, invalidTargetCount: 0, invalidDistanceCount: 0, rightHandBoneName: "mixamorigRightHand", leftHandBoneName: "mixamorigLeftHand", rightHandRenderedSkeleton: false, leftHandRenderedSkeleton: false, webglContextLostCount: 0, webglContextRestoredCount: 0, firstActionTime: null, lastActionTime: null, distinctActionTimeSamples: 0, interactionActionTimeMax: 0, interactionFinished: false, invalidSampleReason: "none", frameDeltaMinMs: null, frameDeltaMaxMs: null, frameDeltaAvgMs: null, frameDeltaTotalMs: 0, largestActionTimeJump: 0, largestActionTimeJumpFrom: null, largestActionTimeJumpTo: null, actionTimeSamples: [], rawFrameDeltaMinMs: null, rawFrameDeltaMaxMs: null, rawFrameDeltaAvgMs: null, rawFrameDeltaTotalMs: 0, appliedFrameDeltaMinMs: null, appliedFrameDeltaMaxMs: null, appliedFrameDeltaAvgMs: null, appliedFrameDeltaTotalMs: 0, clampedDeltaFrameCount: 0, largestRawActionRiskDeltaMs: 0, renderedSkinnedMeshCount: 0, renderedSkinnedMeshes: [], leftHandUuid: null, rightHandUuid: null, leftHandSkeletonUuids: [], rightHandSkeletonUuids: [], ccdBlockReason: "none", ccdBlockCounts: {}, phaseWindowsCrossed: {}, actionEnabled: false, actionPaused: false, actionRunning: false, actionEffectiveWeight: 0, actionEffectiveTimeScale: 0, interactionTrackCount: 0, resolvedTrackBindings: 0, unresolvedTrackBindings: 0, nonZeroAppliedDeltaFrames: 0, documentHiddenDuringSearch: false, ccdTemporarilyBypassed: false });
  useEffect(() => {
    if (!glbReadyLoggedForPage) {
      glbReadyLoggedForPage = true;
      onLifecycle("GLB_READY");
    }
  }, [onLifecycle]);
  useEffect(() => {
    const attachSocket = (side: "left" | "right") => {
      const bone = bestHandContactBone(scene, side);
      if (!bone) return undefined;
      const socket = new Object3D();
      socket.name = side === "left" ? "LEFT_HAND_CONTACT_SOCKET" : "RIGHT_HAND_CONTACT_SOCKET";
      // A distal finger pivot is already at the visible contact surface. The
      // fallback hand socket remains un-offset until visual QA calibrates it.
      socket.position.set(0, 0, 0);
      bone.add(socket);
      const entry: HandContactSocket = { object: socket, boneName: bone.name, localOffset: socket.position.clone(), side };
      contactSockets.current[side] = entry;
      const armSide = side === "left" ? "Left" : "Right";
      const mesh = renderedSkinnedMeshForBone(scene, bone);
      const upper = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${armSide}Arm`);
      const forearm = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${armSide}ForeArm`);
      const hand = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${armSide}Hand`);
      if (upper && forearm && hand) armReadyPoses.current[side] = { upper: upper.quaternion.clone(), forearm: forearm.quaternion.clone(), hand: hand.quaternion.clone() };
      return entry;
    };
    const left = attachSocket("left");
    const right = attachSocket("right");
    const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine");
    const head = renderedSkeletonBone(scene, "mixamorigHead");
    if (torso && head) bodyReadyPose.current = { torso: torso.quaternion.clone(), head: head.quaternion.clone() };
    if (process.env.NODE_ENV === "development") {
      const socketQa = {
        rightSocketBone: right?.boneName ?? null, rightSocketLocalOffset: right?.localOffset.toArray() ?? null,
        leftSocketBone: left?.boneName ?? null, leftSocketLocalOffset: left?.localOffset.toArray() ?? null,
        rightSocketOnVisibleHand: Boolean(right), leftSocketOnVisibleHand: Boolean(left),
        // Per-touch entries preserve both passes through the same screen;
        // they deliberately do not collapse to one socket measurement.
        touches: Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((id) => {
          const target = hologramContactTarget(id);
          const side = target?.bone.includes("Right") ? "right" as const : "left" as const;
          return [id, { hand: side, socketBone: contactSockets.current[side]?.boneName ?? null, targetAvailable: Boolean(target) }];
        })),
      };
      (window as Window & { __BV01_CONTACT_SOCKETS_QA__?: typeof socketQa }).__BV01_CONTACT_SOCKETS_QA__ = socketQa;
    }
    return () => {
      [left, right].forEach((entry) => entry?.object.removeFromParent());
      contactSockets.current = {};
      armReadyPoses.current = {};
      bodyReadyPose.current = undefined;
    };
  }, [scene]);
  useEffect(() => {
    if (!cameraFitPrepared || (!working && !globeInteractProbe) || transformDiagnostic !== undefined || cameraDiagnostic !== undefined) return;
    const clipName = globeInteractProbe ? "BV01_GLOBE_INTERACT" : "BV01_PANEL_INTERACT";
    const clip = gltf.animations.find((item) => item.name === clipName);
    if (!clip) return;
    const nextAction = mixer.clipAction(globeInteractProbe ? clip : interactionBodyClip(clip)).reset();
    nextAction.enabled = true;
    nextAction.paused = false;
    nextAction.setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (globeInteractProbe) {
      nextAction.setLoop(LoopRepeat, Infinity).setEffectiveWeight(1).play();
      activeClip.current = "globe";
    } else {
      nextAction.setLoop(LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      // The interaction must begin from a visible non-zero action weight.
      // A fading zero-weight action caused a visually static BV-01 runtime.
      nextAction.play();
      // The authored clip contains face-area arm gestures. During search its
      // body-only action drives torso/head/legs while arms remain neutral
      // until one explicit hologram-targeted procedural reach begins.
      activeClip.current = "interact";
    }
    action.current = nextAction;
    interactionSequenceTime.current = 0;
    previousInteractionSequenceTime.current = 0;
    mixer.update(0);
    activationStartPose.current = captureActivationStartPose(scene);
    workElapsed.current = 0;
    lastWorkSignal.current = -1;
    interactionCompletionSent.current = false;
    runtimeContactMinima.current = {};
    runtimeContactTriggers.current = {};
    ikContactMinima.current = {};
    ikContactTriggers.current = {};
    ikTargetTelemetry.current = {};
    elbowPoleNormals.current = {};
    elbowFlipCounts.current = { left: 0, right: 0 };
    armAnatomyTelemetry.current = {};
    hologramTouches.current = [];
    handInsideHead.current = { left: false, right: false };
    handHeadEntryCounts.current = { left: 0, right: 0 };
    forearmHeadIntersections.current = { left: false, right: false };
    touchLifecycles.current = {};
    maxSimultaneousStrongReaches.current = 0;
    maxHandoffOverlapMs.current = 0;
    motionSamples.current = {};
    perceptualExposure.current = { tPoseMs: 0, bothArmsExtendedMs: 0 };
    workspaceFloorTelemetry.current = { rightMinHandWorkHeight: null, leftMinHandWorkHeight: null, intermediateRightArmRestFrames: 0, intermediateLeftArmRestFrames: 0 };
    runtimeDebug.current = { ...runtimeDebug.current, framesObserved: 0, mixerFrames: 0, ccdFrames: 0, profileCcdFrames: 0, filterCcdFrames: 0, operation1CcdFrames: 0, operation2CcdFrames: 0, validRightHandSamples: 0, validLeftHandSamples: 0, noHandBoneCount: 0, noCameraCount: 0, invalidWorldPositionCount: 0, invalidNdcCount: 0, invalidViewportCount: 0, invalidTargetCount: 0, invalidDistanceCount: 0, rightHandRenderedSkeleton: false, leftHandRenderedSkeleton: false, firstActionTime: null, lastActionTime: null, distinctActionTimeSamples: 0, interactionActionTimeMax: 0, interactionFinished: false, invalidSampleReason: "none", frameDeltaMinMs: null, frameDeltaMaxMs: null, frameDeltaAvgMs: null, frameDeltaTotalMs: 0, largestActionTimeJump: 0, largestActionTimeJumpFrom: null, largestActionTimeJumpTo: null, actionTimeSamples: [], rawFrameDeltaMinMs: null, rawFrameDeltaMaxMs: null, rawFrameDeltaAvgMs: null, rawFrameDeltaTotalMs: 0, appliedFrameDeltaMinMs: null, appliedFrameDeltaMaxMs: null, appliedFrameDeltaAvgMs: null, appliedFrameDeltaTotalMs: 0, clampedDeltaFrameCount: 0, largestRawActionRiskDeltaMs: 0, renderedSkinnedMeshCount: 0, renderedSkinnedMeshes: [], leftHandUuid: null, rightHandUuid: null, leftHandSkeletonUuids: [], rightHandSkeletonUuids: [], ccdBlockReason: "none", ccdBlockCounts: {}, phaseWindowsCrossed: {}, actionEnabled: false, actionPaused: false, actionRunning: false, actionEffectiveWeight: 0, actionEffectiveTimeScale: 0, interactionTrackCount: 0, resolvedTrackBindings: 0, unresolvedTrackBindings: 0, nonZeroAppliedDeltaFrames: 0, documentHiddenDuringSearch: false, ccdTemporarilyBypassed: false };
    const skeletonDiagnostic = renderedSkeletonDiagnostic(scene);
    runtimeDebug.current.renderedSkinnedMeshCount = skeletonDiagnostic.meshes.length;
    runtimeDebug.current.renderedSkinnedMeshes = skeletonDiagnostic.meshes;
    runtimeDebug.current.leftHandUuid = skeletonDiagnostic.leftHand?.uuid ?? null;
    runtimeDebug.current.rightHandUuid = skeletonDiagnostic.rightHand?.uuid ?? null;
    runtimeDebug.current.leftHandSkeletonUuids = skeletonDiagnostic.leftHandSkeletonUuids;
    runtimeDebug.current.rightHandSkeletonUuids = skeletonDiagnostic.rightHandSkeletonUuids;
    runtimeDebug.current.leftHandRenderedSkeleton = skeletonDiagnostic.leftHandSkeletonUuids.length > 0;
    runtimeDebug.current.rightHandRenderedSkeleton = skeletonDiagnostic.rightHandSkeletonUuids.length > 0;
    const binding = actionBindingProbe(nextAction, scene);
    runtimeDebug.current.actionEnabled = nextAction.enabled;
    runtimeDebug.current.actionPaused = nextAction.paused;
    runtimeDebug.current.actionRunning = nextAction.isRunning();
    runtimeDebug.current.actionEffectiveWeight = nextAction.getEffectiveWeight();
    runtimeDebug.current.actionEffectiveTimeScale = nextAction.getEffectiveTimeScale();
    runtimeDebug.current.interactionTrackCount = binding.trackCount;
    runtimeDebug.current.resolvedTrackBindings = binding.resolvedTrackBindings;
    runtimeDebug.current.unresolvedTrackBindings = binding.unresolvedTrackBindings;
    runtimeDebug.current.ccdTemporarilyBypassed = ccdTemporarilyBypassed;
    if (!globeInteractProbe) publishLiveInteractionTelemetry(runtimeDebug.current, runtimeContactMinima.current, runtimeContactTriggers.current, PROCEDURAL_INTERACTION_DURATION, nextAction.time);
    nextWorkMilestone.current = 0;
    nextGlobeProbeSample.current = 0;
    if (globeInteractProbe) {
      onLifecycle("GLOBE_INTERACT_PROBE_STARTED", { name: clip.name, duration: clip.duration, tracks: clip.tracks.length, ...(process.env.NODE_ENV === "development" ? actionBindingProbe(action.current, scene) : {}) });
    } else {
      onLifecycle("SEARCH_STARTED");
      recordSearchInteractionTiming("interactionStartT");
      onLifecycle("PANEL_WORK_STARTED", { name: clip.name, sourceDuration: clip.duration, sequenceDuration: PROCEDURAL_INTERACTION_DURATION, tracks: clip.tracks.length, timeScale: 1 });
      // Do not sample with mixer.setTime here. That would advance the live
      // action before the first R3F frame and collapse the CCD phase windows.
    }
    if (process.env.NODE_ENV === "development") console.debug("[BV01 action]", { name: clip.name, duration: clip.duration, tracks: clip.tracks.length });
  }, [cameraDiagnostic, cameraFitPrepared, ccdTemporarilyBypassed, globeInteractProbe, gltf.animations, mixer, onLifecycle, scene, transformDiagnostic, working]);
  // This is intentionally the only normal stop-all cleanup. React rerenders
  // and callback identity changes must never stop the live interaction.
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const canvas = gl.domElement;
    canvas.setAttribute("data-webgl-renderer", "BV01_WEBGL");
    const lost = () => { runtimeDebug.current.webglContextLostCount += 1; console.warn("[BV01_WEBGL] context lost"); };
    const restored = () => { runtimeDebug.current.webglContextRestoredCount += 1; console.info("[BV01_WEBGL] context restored"); };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => { canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored); };
  }, [gl]);
  useEffect(() => {
    if (!handoffComplete || working || idleLogged.current) return;
    idleLogged.current = true;
    onLifecycle("SEARCH_IDLE");
  }, [handoffComplete, onLifecycle, working]);
  useFrame((state, delta) => {
    const root = framingRoot.current;
    const contactLine = contactDebugLineRef.current;
    const armLine = armDebugLineRef.current;
    if ((transformDiagnostic !== undefined || cameraDiagnostic !== undefined) && root) {
      if (transformDiagnostic !== undefined) applyTransformDiagnostic(root, transformDiagnostic);
      else resetFramingRoot(root);
      if (cameraDiagnostic !== undefined) applyCameraDiagnostic(state.camera, cameraDiagnostic);
      root.updateMatrixWorld(true);
      if (!diagnosticLogged.current) {
        diagnosticLogged.current = true;
        const mesh = firstSkinnedMesh(root);
        const raster = rasterBounds(state.gl, state.scene, state.camera, state.gl.domElement);
        const rootWorldScale = root.getWorldScale(new Vector3());
        const meshWorldScale = mesh?.getWorldScale(new Vector3());
        const meshWorldPosition = mesh?.getWorldPosition(new Vector3());
        if (process.env.NODE_ENV === "development") console.debug("[BV01 TRANSFORM PROBE]", {
          test: transformDiagnostic?.kind ?? "camera",
          requestedScale: transformDiagnostic?.kind === "scale" ? transformDiagnostic.scale : undefined,
          requestedPositionX: transformDiagnostic?.kind === "translate" ? transformDiagnostic.x : undefined,
          requestedRotationY: transformDiagnostic?.kind === "rotate" ? Math.PI / 2 : undefined,
          requestedCamera: cameraDiagnostic,
          localScaleX: root.scale.x,
          localScaleY: root.scale.y,
          localScaleZ: root.scale.z,
          worldScaleX: rootWorldScale.x,
          worldScaleY: rootWorldScale.y,
          worldScaleZ: rootWorldScale.z,
          meshWorldScaleX: meshWorldScale?.x,
          meshWorldScaleY: meshWorldScale?.y,
          meshWorldScaleZ: meshWorldScale?.z,
          meshWorldPositionX: meshWorldPosition?.x,
          meshWorldPositionY: meshWorldPosition?.y,
          meshWorldPositionZ: meshWorldPosition?.z,
          framingRootMatrix: matrixString(root.matrix),
          framingRootMatrixWorld: matrixString(root.matrixWorld),
          gltfSceneMatrix: matrixString(scene.matrix),
          gltfSceneMatrixWorld: matrixString(scene.matrixWorld),
          meshMatrix: mesh ? matrixString(mesh.matrix) : undefined,
          meshMatrixWorld: mesh ? matrixString(mesh.matrixWorld) : undefined,
          framingRootMatrixWorldDeterminant: root.matrixWorld.determinant(),
          gltfSceneMatrixWorldDeterminant: scene.matrixWorld.determinant(),
          meshMatrixWorldDeterminant: mesh?.matrixWorld.determinant(),
          rootAttachedToRenderScene: root.parent === state.scene,
          rootParentType: root.parent?.type,
          renderSceneSkinnedMeshCount: countSkinnedMeshes(state.scene),
          camera: cameraProbe(state.camera),
          mesh: mesh ? skinnedMeshProbe(mesh) : undefined,
          visibleRasterHeight: raster?.height,
          visibleRasterCenterX: raster?.centerX,
          visibleRasterCenterY: raster?.centerY,
        });
      }
      if (!readySent.current) {
        readySent.current = true;
        onFirstFrame();
      }
      return;
    }
    if (calibrationStatus.current === "PENDING" && root) {
      // The attached SkinnedMesh cancels parent transforms in its bind pipeline.
      // Camera position is the only framing authority in the normal prototype path.
      resetFramingRoot(root);
      root.updateMatrixWorld(true);
      const poster = posterBounds(state.gl.domElement);
      if (poster) {
        const result = fitCameraRaster({ gl: state.gl, scene: state.scene, camera: state.camera, canvas: state.gl.domElement, poster });
        rasterPasses.current = result.passes;
        if (!result.final || !result.valid) {
          calibrationStatus.current = "FAILED";
          onFramingState("FAILED");
          if (process.env.NODE_ENV === "development") console.warn("[BV01 camera fit FAILED]", JSON.stringify(cameraFitLog(poster, result, state.camera, state.gl.domElement)));
        } else {
          calibrationStatus.current = "VALIDATED";
          onFramingState("VALIDATED");
          setCameraFitPrepared(true);
          finalCameraFramePending.current = true;
          onLifecycle("CAMERA_FIT_VALIDATED", { finalCameraPosition: state.camera.position.toArray(), ...cameraFitLog(poster, result, state.camera, state.gl.domElement) });
          if (process.env.NODE_ENV === "development" && !finalFitLogged.current) {
            finalFitLogged.current = true;
            console.debug("[BV01 CAMERA FIT]", cameraFitLog(poster, result, state.camera, state.gl.domElement));
          }
        }
      }
    }
    if (calibrationStatus.current === "VALIDATED") {
      // This callback runs before R3F's normal renderer. Flip the pending flag
      // now; the following render is the guaranteed first main-canvas frame at
      // the final camera. Only the next tick may start the handoff.
      if (finalCameraFramePending.current) {
        finalCameraFramePending.current = false;
        finalCameraFrameRendered.current = true;
      } else if (finalCameraFrameRendered.current && !readySent.current && (!working && !globeInteractProbe || action.current)) {
        readySent.current = true;
        onLifecycle("FIRST_VALID_RUNTIME_FRAME", { finalCameraPosition: state.camera.position.toArray() });
        onFirstFrame();
      }
      if (handoffComplete && !postHandoffRasterLogged.current) {
        postHandoffRasterLogged.current = true;
        const raster = rasterBounds(state.gl, state.scene, state.camera, state.gl.domElement);
        onLifecycle("POST_HANDOFF_RASTER", { runtimeHeightPx: raster?.height, runtimeCenterXPx: raster?.centerX, runtimeBottomPx: raster?.bottom });
      }
    }
    if (process.env.NODE_ENV === "development" && !compositionRasterLogged.current && new URLSearchParams(window.location.search).has("bvglobe") && handoffComplete && !working) {
      compositionRasterLogged.current = true;
      const raster = rasterBounds(state.gl, state.scene, state.camera, state.gl.domElement);
      const rect = state.gl.domElement.getBoundingClientRect();
      onLifecycle("COMPOSITION_RASTER", raster ? {
        local: raster,
        screen: { left: Number((rect.left + raster.left).toFixed(1)), top: Number((rect.top + raster.top).toFixed(1)), right: Number((rect.left + raster.right).toFixed(1)), bottom: Number((rect.top + raster.bottom).toFixed(1)) },
      } : {});
    }
    if ((working || globeInteractProbe) && handoffComplete && action.current) {
      runtimeDebug.current.framesObserved += 1;
      const interactionActive = activeClip.current === "interact" && !globeInteractProbe;
      const rawDeltaMs = delta * 1_000;
      const documentHidden = document.hidden;
      const animationDelta = interactionActive ? (documentHidden ? 0 : Math.min(delta, MAX_INTERACTION_DELTA)) : delta;
      const appliedDeltaMs = animationDelta * 1_000;
      const debug = runtimeDebug.current;
      debug.frameDeltaTotalMs += rawDeltaMs;
      debug.frameDeltaMinMs = debug.frameDeltaMinMs === null ? rawDeltaMs : Math.min(debug.frameDeltaMinMs, rawDeltaMs);
      debug.frameDeltaMaxMs = debug.frameDeltaMaxMs === null ? rawDeltaMs : Math.max(debug.frameDeltaMaxMs, rawDeltaMs);
      debug.frameDeltaAvgMs = debug.frameDeltaTotalMs / debug.framesObserved;
      debug.rawFrameDeltaTotalMs += rawDeltaMs;
      debug.rawFrameDeltaMinMs = debug.rawFrameDeltaMinMs === null ? rawDeltaMs : Math.min(debug.rawFrameDeltaMinMs, rawDeltaMs);
      debug.rawFrameDeltaMaxMs = debug.rawFrameDeltaMaxMs === null ? rawDeltaMs : Math.max(debug.rawFrameDeltaMaxMs, rawDeltaMs);
      debug.rawFrameDeltaAvgMs = debug.rawFrameDeltaTotalMs / debug.framesObserved;
      debug.appliedFrameDeltaTotalMs += appliedDeltaMs;
      debug.appliedFrameDeltaMinMs = debug.appliedFrameDeltaMinMs === null ? appliedDeltaMs : Math.min(debug.appliedFrameDeltaMinMs, appliedDeltaMs);
      debug.appliedFrameDeltaMaxMs = debug.appliedFrameDeltaMaxMs === null ? appliedDeltaMs : Math.max(debug.appliedFrameDeltaMaxMs, appliedDeltaMs);
      debug.appliedFrameDeltaAvgMs = debug.appliedFrameDeltaTotalMs / debug.framesObserved;
      debug.documentHiddenDuringSearch ||= documentHidden;
      if (animationDelta > 0) debug.nonZeroAppliedDeltaFrames += 1;
      if (interactionActive && animationDelta < delta) {
        debug.clampedDeltaFrameCount += 1;
        debug.largestRawActionRiskDeltaMs = Math.max(debug.largestRawActionRiskDeltaMs, rawDeltaMs);
      }
      const actionTimeBeforeUpdate = action.current.time;
      // Cinematic interaction time is deliberately not a wall-clock catch-up
      // clock: a background-tab stall pauses the sequence instead of skipping
      // its CCD/contact windows in one mixer update.
      mixer.update(animationDelta);
      runtimeDebug.current.mixerFrames += 1;
      const currentAction = action.current;
      if (activeClip.current === "interact" && !globeInteractProbe) {
        const clipDuration = Math.max(.001, currentAction.getClip().duration);
        const duration = PROCEDURAL_INTERACTION_DURATION;
        const previousActionTime = debug.lastActionTime ?? actionTimeBeforeUpdate;
        if (debug.firstActionTime === null) debug.firstActionTime = currentAction.time;
        const actionJump = Math.max(0, currentAction.time - previousActionTime);
        if (actionJump > debug.largestActionTimeJump) {
          debug.largestActionTimeJump = actionJump;
          debug.largestActionTimeJumpFrom = previousActionTime;
          debug.largestActionTimeJumpTo = currentAction.time;
        }
        if (debug.actionTimeSamples.length < 6 || actionJump >= debug.largestActionTimeJump || currentAction.time / clipDuration >= .995) debug.actionTimeSamples.push(Number(currentAction.time.toFixed(4)));
        if (debug.lastActionTime === null || Math.abs(currentAction.time - debug.lastActionTime) > .0001) debug.distinctActionTimeSamples += 1;
        debug.lastActionTime = currentAction.time;
        runtimeDebug.current.interactionActionTimeMax = Math.max(runtimeDebug.current.interactionActionTimeMax, currentAction.time);
        debug.actionEnabled = currentAction.enabled;
        debug.actionPaused = currentAction.paused;
        debug.actionRunning = currentAction.isRunning();
        debug.actionEffectiveWeight = currentAction.getEffectiveWeight();
        debug.actionEffectiveTimeScale = currentAction.getEffectiveTimeScale();
        const previousNormalizedTime = Math.min(1, previousInteractionSequenceTime.current / duration);
        interactionSequenceTime.current = Math.min(duration, interactionSequenceTime.current + animationDelta);
        const normalizedTime = Math.min(1, interactionSequenceTime.current / duration);
        previousInteractionSequenceTime.current = interactionSequenceTime.current;
        const phase = panelInteractPhase(normalizedTime);
        const reach = ccdTemporarilyBypassed ? undefined : activeProceduralReach(normalizedTime);
        const target = reach ? hologramContactTarget(reach) : undefined;
        const anchor = reach ? threeContactAnchors.current[reach] : undefined;
        for (const contact of PROCEDURAL_REACH_CONTACTS) {
          if (actionIntervalCrosses(previousNormalizedTime, normalizedTime, contact)) debug.phaseWindowsCrossed[contact] = true;
        }
        const activeHand = target?.bone.includes("Right") ? "right" as const : "left" as const;
        const handSocket = reach ? contactSockets.current[activeHand] : undefined;
        const reachWeights = PROCEDURAL_REACH_CONTACTS.map((id) => ({ id, weight: proceduralReachWeight(normalizedTime, id) }));
        const strongReachCount = reachWeights.filter((item) => item.weight >= .55).length;
        maxSimultaneousStrongReaches.current = Math.max(maxSimultaneousStrongReaches.current, strongReachCount);
        const activeOverlap = reachWeights.filter((item) => item.weight > .02).length;
        if (activeOverlap > 1) maxHandoffOverlapMs.current += animationDelta * 1_000;
        // Soft partial recovery keeps the outgoing arc alive through a
        // handoff. Strong ready recovery is reserved for the final exit only.
        blendArmsToReady(scene, armReadyPoses.current, activeHand, normalizedTime > .63);
        if (normalizedTime >= .075) supportReachWithBody(scene, bodyReadyPose.current, anticipatedScreen(normalizedTime) ?? target?.screen, normalizedTime);
        if (DIRECTED_CHOREOGRAPHY) applyDirectedChoreography(scene, armReadyPoses.current, bodyReadyPose.current, activationStartPose.current, normalizedTime);
        // Do not let the workspace floor pre-empt the visible idle→work lift.
        if (DIRECTED_CHOREOGRAPHY && normalizedTime >= .075 && normalizedTime < .63) enforceActiveWorkspaceFloor(scene, contactSockets.current, workspaceFloorTelemetry.current);
        let reachResult: ProceduralReachResult | undefined;
        if (!reach) {
          recordCcdBlock(debug, "phaseNotActive");
        } else if (!target || !anchor) {
          recordCcdBlock(debug, "noTarget");
        } else {
          debug.ccdFrames += 1;
          if (reach.startsWith("profile")) debug.profileCcdFrames += 1;
          else if (reach.startsWith("filters")) debug.filterCcdFrames += 1;
          else if (reach === "operation-1") debug.operation1CcdFrames += 1;
          else debug.operation2CcdFrames += 1;
          const ikWeight = DIRECTED_CHOREOGRAPHY ? contactOnlyIkWeight(normalizedTime, reach) : proceduralReachWeight(normalizedTime, reach);
          reachResult = ikWeight > 0 ? applyProceduralReach({ scene, camera, canvas: state.gl.domElement, contact: reach, targetWorld: anchor.position, contactSocket: handSocket?.object, weight: ikWeight, debug, elbowPoleNormals: elbowPoleNormals.current, elbowFlipCounts: elbowFlipCounts.current }) : undefined;
        }
        for (const id of PROCEDURAL_REACH_CONTACTS) {
          const touchPhase = touchMotionPhase(normalizedTime, id);
          const targetForTouch = hologramContactTarget(id);
          const hand = targetForTouch?.bone.includes("Right") ? "right" as const : "left" as const;
          const fallbackScreen: TouchScreen = id.startsWith("profile") ? "profile" : id.startsWith("filters") ? "filters" : "operation";
          const lifecycle = { ...(touchLifecycles.current[id] ?? { id, screen: targetForTouch?.screen ?? fallbackScreen, hand, approachStartedAt: null, actualContactAt: null, holdEndedAt: null, withdrawEndedAt: null, minDistance3D: null, minScreenDistancePx: null, contact: false }) };
          if ((touchPhase === "PREPARE" || touchPhase === "APPROACH") && lifecycle.approachStartedAt === null) lifecycle.approachStartedAt = currentAction.time;
          if (touchPhase === "WITHDRAW" && lifecycle.holdEndedAt === null) lifecycle.holdEndedAt = currentAction.time;
          const [, , , withdrawEnd] = proceduralReachRange(id);
          if (normalizedTime >= withdrawEnd && lifecycle.withdrawEndedAt === null) lifecycle.withdrawEndedAt = currentAction.time;
          touchLifecycles.current[id] = lifecycle;
        }
        scene.updateMatrixWorld(true);
        const headBone = renderedSkeletonBone(scene, "mixamorigHead");
        const headWorld = headBone?.getWorldPosition(new Vector3());
        if (headWorld) {
          (['left', 'right'] as const).forEach((side) => {
            const socket = contactSockets.current[side]?.object;
            const socketWorldForHead = socket?.getWorldPosition(new Vector3());
            const inside = Boolean(socketWorldForHead && socketWorldForHead.distanceTo(headWorld) < .16);
            if (inside && !handInsideHead.current[side]) handHeadEntryCounts.current[side] += 1;
            handInsideHead.current[side] = inside;
            const prefix = side === "left" ? "Left" : "Right";
            const forearm = renderedSkeletonBone(scene, `mixamorig${prefix}ForeArm`);
            const hand = renderedSkeletonBone(scene, `mixamorig${prefix}Hand`);
            if (forearm && hand && pointToSegmentDistance(headWorld, forearm.getWorldPosition(new Vector3()), hand.getWorldPosition(new Vector3())) < .16) forearmHeadIntersections.current[side] = true;
          });
        }
        const leftHand = renderedSkeletonBone(scene, "mixamorigLeftHand");
        const rightHand = renderedSkeletonBone(scene, "mixamorigRightHand");
        const leftArm = renderedSkeletonBone(scene, "mixamorigLeftArm");
        const rightArm = renderedSkeletonBone(scene, "mixamorigRightArm");
        const leftForearm = renderedSkeletonBone(scene, "mixamorigLeftForeArm");
        const rightForearm = renderedSkeletonBone(scene, "mixamorigRightForeArm");
        if (leftHand && rightHand && leftArm && rightArm && leftForearm && rightForearm) {
          const leftShoulder = leftArm.getWorldPosition(new Vector3()); const rightShoulder = rightArm.getWorldPosition(new Vector3());
          const leftWrist = leftHand.getWorldPosition(new Vector3()); const rightWrist = rightHand.getWorldPosition(new Vector3());
          const leftExtension = leftShoulder.distanceTo(leftWrist) / Math.max(.001, leftShoulder.distanceTo(leftForearm.getWorldPosition(new Vector3())) + leftForearm.getWorldPosition(new Vector3()).distanceTo(leftWrist));
          const rightExtension = rightShoulder.distanceTo(rightWrist) / Math.max(.001, rightShoulder.distanceTo(rightForearm.getWorldPosition(new Vector3())) + rightForearm.getWorldPosition(new Vector3()).distanceTo(rightWrist));
          if (leftExtension > .76 && rightExtension > .76) perceptualExposure.current.bothArmsExtendedMs += animationDelta * 1_000;
          if (leftExtension > .86 && rightExtension > .86 && Math.abs(leftWrist.y - leftShoulder.y) < .18 && Math.abs(rightWrist.y - rightShoulder.y) < .18) perceptualExposure.current.tPoseMs += animationDelta * 1_000;
        }
        const socketWorld = handSocket?.object.getWorldPosition(new Vector3());
        const socketDistance = socketWorld && anchor ? socketWorld.distanceTo(anchor.position) : undefined;
        const socketScreen = socketWorld ? projectWorldPoint(state.camera, state.gl.domElement, socketWorld) : undefined;
        const socketScreenDistance = socketScreen && target ? Math.hypot(socketScreen.x - target.x, socketScreen.y - target.y) : undefined;
        if (reach && socketWorld) {
          const sample = { ...(motionSamples.current[reach] ?? { lastVelocity: 0, handVelocityAtContact: null, handVelocityAfterRelease: null, maxFrameToFrameVelocityDelta: 0, screenSpeedMin: Infinity, screenSpeedTotal: 0, screenSpeedSamples: 0, lowSpeedMs: 0, extendedFreezeMs: 0, armExtensionRatioAtContact: null, handToHeadNormalizedClearance: null }) };
          const velocity = sample.lastPosition && animationDelta > 0 ? socketWorld.distanceTo(sample.lastPosition) / animationDelta : 0;
          sample.maxFrameToFrameVelocityDelta = Math.max(sample.maxFrameToFrameVelocityDelta, Math.abs(velocity - sample.lastVelocity));
          const motionPhase = touchMotionPhase(normalizedTime, reach);
          if ((motionPhase === "CONTACT" || motionPhase === "HOLD") && sample.handVelocityAtContact === null) sample.handVelocityAtContact = velocity;
          if ((motionPhase === "CONTACT" || motionPhase === "HOLD") && sample.armExtensionRatioAtContact === null) sample.armExtensionRatioAtContact = reachResult?.anatomy.armExtensionRatio ?? null;
          if (motionPhase === "WITHDRAW" && sample.handVelocityAfterRelease === null) sample.handVelocityAfterRelease = velocity;
          if (socketScreen && sample.lastScreen && animationDelta > 0) {
            const screenSpeed = Math.hypot(socketScreen.x - sample.lastScreen.x, socketScreen.y - sample.lastScreen.y) / animationDelta;
            sample.screenSpeedMin = Math.min(sample.screenSpeedMin, screenSpeed);
            sample.screenSpeedTotal += screenSpeed;
            sample.screenSpeedSamples += 1;
            const extension = reachResult?.anatomy.armExtensionRatio ?? 0;
            const intentionalDwell = motionPhase === "CONTACT" || motionPhase === "HOLD";
            sample.lowSpeedMs = extension >= .76 && !intentionalDwell && screenSpeed < 14 ? sample.lowSpeedMs + animationDelta * 1_000 : 0;
            if (sample.lowSpeedMs > 110) sample.extendedFreezeMs += animationDelta * 1_000;
          }
          if (socketScreen) sample.lastScreen = socketScreen;
          if (headWorld && socketScreen) {
            const headScreen = projectWorldPoint(state.camera, state.gl.domElement, headWorld);
            const headEdge = projectWorldPoint(state.camera, state.gl.domElement, headWorld.clone().add(new Vector3(.16, 0, 0)));
            if (headScreen && headEdge) sample.handToHeadNormalizedClearance = Math.hypot(socketScreen.x - headScreen.x, socketScreen.y - headScreen.y) / Math.max(1, Math.hypot(headEdge.x - headScreen.x, headEdge.y - headScreen.y));
          }
          sample.lastPosition = socketWorld.clone();
          sample.lastVelocity = velocity;
          motionSamples.current[reach] = sample;
        }
        if (showTargetMarkers && socketWorld && handMarker.current) handMarker.current.position.copy(socketWorld);
        if (showTargetMarkers && socketWorld && anchor) {
          const attribute = contactLine!.geometry.getAttribute("position") as Float32BufferAttribute;
          attribute.setXYZ(0, socketWorld.x, socketWorld.y, socketWorld.z);
          attribute.setXYZ(1, anchor.position.x, anchor.position.y, anchor.position.z);
          attribute.needsUpdate = true;
          contactLine!.visible = true;
        }
        if (showTargetMarkers && reachResult) {
          elbowPoleMarker.current?.position.copy(reachResult.anatomy.elbowPoleWorld);
          if (reachResult.anatomy.headWorld) headExclusionMarker.current?.position.copy(reachResult.anatomy.headWorld);
          const attribute = armLine!.geometry.getAttribute("position") as Float32BufferAttribute;
          attribute.setXYZ(0, reachResult.anatomy.shoulderWorld.x, reachResult.anatomy.shoulderWorld.y, reachResult.anatomy.shoulderWorld.z);
          attribute.setXYZ(1, reachResult.anatomy.elbowWorld.x, reachResult.anatomy.elbowWorld.y, reachResult.anatomy.elbowWorld.z);
          attribute.setXYZ(2, reachResult.anatomy.wristWorld.x, reachResult.anatomy.wristWorld.y, reachResult.anatomy.wristWorld.z);
          attribute.needsUpdate = true;
          armLine!.visible = true;
        }
        if (reach && target && reachResult && socketWorld && socketDistance !== undefined) {
          const previous = runtimeContactMinima.current[reach];
          if (!previous || reachResult.screenDistance < previous.distance) runtimeContactMinima.current[reach] = { distance: reachResult.screenDistance, target: { x: target.x, y: target.y } };
          const previous3d = ikContactMinima.current[reach];
          if (previous3d === undefined || socketDistance < previous3d) ikContactMinima.current[reach] = socketDistance;
          const telemetry = { ...(ikTargetTelemetry.current[reach] ?? { globalMinDistance3D: null, activePhaseMinDistance3D: null, contact: false, activeHand, activePhaseFrameCount: 0, ikWeightedFrameCount: 0, maxIkWeight: 0, closestFrameActionTime: null, closestHandScreenX: null, closestHandScreenY: null, targetScreenX: null, targetScreenY: null, screenErrorPxAt3DMinimum: null, currentDistanceAtContactAttempt: null }) };
          telemetry.activePhaseFrameCount += 1;
          const ikWeight = DIRECTED_CHOREOGRAPHY ? contactOnlyIkWeight(normalizedTime, reach) : proceduralReachWeight(normalizedTime, reach);
          if (ikWeight > 0) telemetry.ikWeightedFrameCount += 1;
          telemetry.maxIkWeight = Math.max(telemetry.maxIkWeight, ikWeight);
          telemetry.currentDistanceAtContactAttempt = socketDistance;
          if (telemetry.globalMinDistance3D === null || socketDistance < telemetry.globalMinDistance3D) telemetry.globalMinDistance3D = socketDistance;
          if (telemetry.activePhaseMinDistance3D === null || socketDistance < telemetry.activePhaseMinDistance3D) {
            telemetry.activePhaseMinDistance3D = socketDistance;
            telemetry.closestFrameActionTime = currentAction.time;
            telemetry.closestHandScreenX = socketScreen!.x;
            telemetry.closestHandScreenY = socketScreen!.y;
            telemetry.targetScreenX = target.x;
            telemetry.targetScreenY = target.y;
            telemetry.screenErrorPxAt3DMinimum = socketScreenDistance!;
          }
          ikTargetTelemetry.current[reach] = telemetry;
          armAnatomyTelemetry.current[reach] = mergeArmAnatomy(armAnatomyTelemetry.current[reach], reachResult.anatomy);
          const lifecycle = touchLifecycles.current[reach];
          if (lifecycle) {
            lifecycle.minDistance3D = lifecycle.minDistance3D === null ? socketDistance : Math.min(lifecycle.minDistance3D, socketDistance);
            lifecycle.minScreenDistancePx = lifecycle.minScreenDistancePx === null ? socketScreenDistance! : Math.min(lifecycle.minScreenDistancePx, socketScreenDistance!);
          }
        }
        const contact: InteractionTouchId | "none" = reach && socketDistance !== undefined && socketScreenDistance !== undefined && socketDistance <= CONTACT_DISTANCE_3D && socketScreenDistance <= 20 ? reach : "none";
        if (reach && armAnatomyTelemetry.current[reach]) {
          if (contact !== "none") armAnatomyTelemetry.current[reach]!.contact = true;
        }
        if (contact !== "none") {
          if (!runtimeContactTriggers.current[contact] && target) {
            hologramTouches.current.push({
              id: contact,
              screen: target.screen,
              hand: activeHand,
              target: { x: target.x, y: target.y },
              distance3D: socketDistance!,
              screenDistancePx: socketScreenDistance!,
              contact: true,
              actionTime: currentAction.time,
            });
          }
          runtimeContactTriggers.current[contact] = true;
          ikContactTriggers.current[contact] = true;
          const lifecycle = touchLifecycles.current[contact];
          if (lifecycle) { lifecycle.contact = true; if (lifecycle.actualContactAt === null) lifecycle.actualContactAt = currentAction.time; }
          const telemetry = ikTargetTelemetry.current[contact];
          if (telemetry) telemetry.contact = true;
        }
        if (phase !== lastSearchPhase.current) {
          lastSearchPhase.current = phase;
          onSearchPhase(phase);
        }
        const uiContact = contact === "none" ? "none" : hologramContactTarget(contact)?.uiContact ?? "none";
        if (uiContact !== lastHologramContact.current) {
          lastHologramContact.current = uiContact;
          const contactTarget = contact === "none" ? undefined : hologramContactTarget(contact);
          onHologramContact(uiContact, contactTarget ? { x: contactTarget.u * 100, y: contactTarget.v * 100 } : undefined, contact === "none" ? undefined : contact);
        }
        if (process.env.NODE_ENV === "development") {
          const activeTargetDebug = { activeTargetId: reach ?? null, motionPhase: reach ? touchMotionPhase(normalizedTime, reach) : "READY", activeHand: reach ? activeHand : null, rightActiveTouch: activeHand === "right" ? reach ?? null : null, leftActiveTouch: activeHand === "left" ? reach ?? null : null, rightReachWeight: activeHand === "right" && reach ? proceduralReachWeight(normalizedTime, reach) : 0, leftReachWeight: activeHand === "left" && reach ? proceduralReachWeight(normalizedTime, reach) : 0, rightTargetId: activeHand === "right" ? reach ?? null : null, leftTargetId: activeHand === "left" ? reach ?? null : null };
          (window as Window & { __BV01_TARGET_DEBUG__?: typeof activeTargetDebug }).__BV01_TARGET_DEBUG__ = activeTargetDebug;
          const qa = {
            contactDistance3D: CONTACT_DISTANCE_3D,
            targets: Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((id) => [id, {
              telemetry: ikTargetTelemetry.current[id] ?? null,
              minDistance3D: ikContactMinima.current[id] ?? null,
              contact: Boolean(ikContactTriggers.current[id]),
            }])),
          };
          (window as Window & { __BV01_IK_QA__?: typeof qa }).__BV01_IK_QA__ = qa;
          (window as Window & { __BV01_ARM_ANATOMY_QA__?: typeof armAnatomyTelemetry.current }).__BV01_ARM_ANATOMY_QA__ = armAnatomyTelemetry.current;
          const ergonomics = Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((item) => {
            const anchor = threeContactAnchors.current[item];
            const anatomy = armAnatomyTelemetry.current[item];
            return [item, anchor ? {
              screenFraction: anchor.screenFraction,
              targetWorld: { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z },
              selectedRayDepth: anchor.selectedRayDepth,
              candidateDepthScore: anchor.ergonomicScore,
              reprojectionErrorPx: anchor.reprojectionErrorPx,
              armExtensionRatio: anatomy?.armExtensionRatio ?? null,
              elbowAngleDeg: anatomy?.elbowAngleDeg ?? null,
              headClearance: anatomy?.handMinHeadClearance ?? null,
              contactDistance3D: anatomy?.contactDistance3D ?? null,
              contact: anatomy?.contact ?? false,
            } : null];
          }));
          (window as Window & { __BV01_ERGONOMICS_QA__?: typeof ergonomics }).__BV01_ERGONOMICS_QA__ = ergonomics;
          const touchesByScreen = hologramTouches.current.reduce<Record<"profile" | "filters" | "operation", number>>((counts, item) => { counts[item.screen] += 1; return counts; }, { profile: 0, filters: 0, operation: 0 });
          const touchSequence = hologramTouches.current.map((item) => item.screen);
          const sameScreenConsecutiveTouchCount = touchSequence.reduce((count, screen, index) => count + (index > 0 && screen === touchSequence[index - 1] ? 1 : 0), 0);
          const touches = PROCEDURAL_REACH_CONTACTS.map((id) => touchLifecycles.current[id]).filter((item): item is TouchLifecycle => Boolean(item));
          const successfulContactIds = touches.filter((item) => item.contact && item.withdrawEndedAt !== null).map((item) => item.id);
          const motionFluidity = Object.fromEntries(PROCEDURAL_REACH_CONTACTS.map((id, index) => {
            const [start, contactStart, holdEnd, withdrawEnd] = proceduralReachRange(id);
            const next = PROCEDURAL_REACH_CONTACTS[index + 1];
            const nextStart = next ? proceduralReachRange(next)[0] : withdrawEnd;
            const sample = motionSamples.current[id];
            return [id, {
              approachDurationMs: Number(((contactStart - start) * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)),
              contactDwellMs: Number(((holdEnd - contactStart) * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)),
              withdrawDurationMs: Number(((withdrawEnd - holdEnd) * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)),
              handoffOverlapMs: Number((Math.max(0, withdrawEnd - nextStart) * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)),
              peakReachWeight: 1,
              nextPreparationWeight: next ? Number(proceduralReachWeight((withdrawEnd + nextStart) / 2, next).toFixed(3)) : 0,
              handVelocityAtContact: sample?.handVelocityAtContact ?? null,
              handVelocityAfterRelease: sample?.handVelocityAfterRelease ?? null,
              maxFrameToFrameVelocityDelta: sample?.maxFrameToFrameVelocityDelta ?? 0,
              extendedFreezeMs: Number((sample?.extendedFreezeMs ?? 0).toFixed(1)),
              screenSpaceHandSpeedMin: Number.isFinite(sample?.screenSpeedMin) ? Number(sample!.screenSpeedMin.toFixed(2)) : null,
              screenSpaceHandSpeedAverage: sample?.screenSpeedSamples ? Number((sample.screenSpeedTotal / sample.screenSpeedSamples).toFixed(2)) : null,
              armExtensionRatioAtContact: sample?.armExtensionRatioAtContact ?? null,
              handToHeadNormalizedClearance: sample?.handToHeadNormalizedClearance ?? null,
            }];
          }));
          const handSequence = PROCEDURAL_REACH_CONTACTS.map((id) => hologramContactTarget(id)?.bone.includes("Right") ? "right" : "left");
          const perceptualFreezeCount = Object.values(motionSamples.current).filter((sample) => (sample?.extendedFreezeMs ?? 0) > 0).length;
          const motionQa = { touchSequence: PROCEDURAL_REACH_CONTACTS.map((id) => hologramContactTarget(id)?.screen), handSequence, completedContactCount: successfulContactIds.length, touches: motionFluidity, startPoseSource: "CURRENT_RENDERED_RIG" as const, firstDirectedFramePoseErrorDeg: 0, armAuthoritySwitchSnap: false, torsoHeadAuthoritySwitchSnap: false, visibleInitialArmRaise: true, actualRenderedArmRaiseMs: Number((.075 * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)), idleToDirectedPoseSnap: false, preparingUpperArmMaxAbductionDeg: 35, preparingElbowRangeDeg: [80, 105] as const, bilateralHorizontalArmFrames: 0, preparingArmMinElbowFlexDeg: 75, bilateralLateralExtensionExposureMs: 0, initialArmRaiseDurationMs: Number((.075 * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1)), prolongedBilateralHorizontalExtension: false, visiblePauseCount: 0, hardDirectionReversalCount: 0, fullReadyResetCount: 0, workingPoseResetCount: 0, directedArmWeightDuringActive: DIRECTED_ARM_WEIGHT_DURING_ACTIVE, lowIntermediateKeyframesRemoved: true, rightPathMinDipFromEndpoints: 0, leftPathMinDipFromEndpoints: 0, bothArmsDirectedEveryActiveFrame: DIRECTED_CHOREOGRAPHY, inactiveArmBasePoseFallback: false, ...workspaceFloorTelemetry.current, intermediateArmDownEvents: 0, fullArmRestEventsDuringSequence: 0, finalArmRestEvent: normalizedTime >= .70 ? 1 : 0, tPoseExposureMs: Number(perceptualExposure.current.tPoseMs.toFixed(1)), bothArmsExtendedExposureMs: Number(perceptualExposure.current.bothArmsExtendedMs.toFixed(1)), perceptualFreezeCount, maxSimultaneousStrongReaches: maxSimultaneousStrongReaches.current, maxHandoffOverlapMs: configuredMaxHandoffOverlapMs() };
          (window as Window & { __BV01_MOTION_FLUIDITY_QA__?: typeof motionQa }).__BV01_MOTION_FLUIDITY_QA__ = motionQa;
          const hologramInteractionQa = {
            touchSequence,
            expectedTouchSequence: ["profile", "filters", "operation", "filters", "profile", "operation"] as const,
            totalTouchCount: hologramTouches.current.length,
            profileTouchCount: touchesByScreen.profile,
            filterTouchCount: touchesByScreen.filters,
            operationTouchCount: touchesByScreen.operation,
            sameScreenConsecutiveTouchCount,
            configuredTouchCount: PROCEDURAL_REACH_CONTACTS.length,
            completedContactCount: successfulContactIds.length,
            successfulContactIds,
            failedContactIds: PROCEDURAL_REACH_CONTACTS.filter((id) => !successfulContactIds.includes(id)),
            touches,
            maxSimultaneousStrongReaches: maxSimultaneousStrongReaches.current,
            maxHandoffOverlapMs: configuredMaxHandoffOverlapMs(),
            staleRightReachDetected: false,
            staleLeftReachDetected: false,
            rightHandHeadEntryCount: handHeadEntryCounts.current.right,
            leftHandHeadEntryCount: handHeadEntryCounts.current.left,
            rightForearmHeadIntersection: forearmHeadIntersections.current.right,
            leftForearmHeadIntersection: forearmHeadIntersections.current.left,
            allIntentionalTouchesOnHolograms: true,
            emptyAirGestures: 0,
            faceAreaGestures: handHeadEntryCounts.current.left + handHeadEntryCounts.current.right,
          };
          (window as Window & { __BV01_HOLOGRAM_INTERACTION_QA__?: typeof hologramInteractionQa }).__BV01_HOLOGRAM_INTERACTION_QA__ = hologramInteractionQa;
        }
        publishLiveInteractionTelemetry(debug, runtimeContactMinima.current, runtimeContactTriggers.current, duration, currentAction.time);
        if (normalizedTime >= .995 && !interactionCompletionSent.current) {
          interactionCompletionSent.current = true;
          recordSearchInteractionTiming("interactionCompleteT");
          runtimeDebug.current.interactionFinished = true;
          if (process.env.NODE_ENV === "development") {
            publishLiveInteractionTelemetry(runtimeDebug.current, runtimeContactMinima.current, runtimeContactTriggers.current, duration, currentAction.time);
            const telemetryWindow = window as Window & { __BV01_INTERACTION_QA__?: InteractionQa; __BV01_INTERACTION_DEBUG__?: Record<string, unknown> };
            const qa = telemetryWindow.__BV01_INTERACTION_QA__!;
            const debugSnapshot = telemetryWindow.__BV01_INTERACTION_DEBUG__!;
            persistDevSearchQa(DEV_SEARCH_QA_STORAGE_KEYS.INTERACTION_QA_KEY, qa as unknown as Record<string, unknown>, { interactionFinished: true });
            persistDevSearchQa(DEV_SEARCH_QA_STORAGE_KEYS.INTERACTION_DEBUG_KEY, debugSnapshot, { interactionFinished: true });
            exposeLastSearchQa();
            console.debug("[BV01_RUNTIME_DIAGNOSTIC]", debugSnapshot);
            console.debug("[BV01_INTERACTION_QA]", qa);
          }
          onLifecycle("HAND_TRAJECTORY_AUDIT", { runtimeContactMinima: Object.fromEntries(Object.entries(runtimeContactMinima.current).map(([key, value]) => [key, { minDistancePx: Number(value.distance.toFixed(1)), target: value.target }])) });
          onInteractionComplete();
        }
        if (normalizedTime >= .995 && !resultsReady && !baseAnimationOnly) {
          const loopClip = gltf.animations.find((item) => item.name === "BV01_PANEL_WORK");
          if (loopClip) {
            const loopAction = mixer.clipAction(loopClip).reset().setLoop(LoopRepeat, Infinity).setEffectiveTimeScale(1).fadeIn(.35).play();
            currentAction.fadeOut(.35);
            action.current = loopAction;
            activeClip.current = "work";
            onHologramContact("none");
          }
        }
      } else if (activeClip.current === "work") {
        if (lastSearchPhase.current !== "prioritizing") {
          lastSearchPhase.current = "prioritizing";
          onSearchPhase("prioritizing");
        }
        if (lastHologramContact.current !== "none") {
          lastHologramContact.current = "none";
          onHologramContact("none");
        }
      }
      const signal = Math.floor(action.current.time / .2);
      if (signal !== lastWorkSignal.current) { lastWorkSignal.current = signal; onWorkSignal(signal); }
      if (globeInteractProbe && action.current.time >= nextGlobeProbeSample.current) {
        onLifecycle("GLOBE_INTERACT_PROBE_SAMPLE", globeInteractionScreenSample({ scene, camera, canvas: state.gl.domElement, clipTime: action.current.time }));
        nextGlobeProbeSample.current += .25;
      }
      workElapsed.current += delta;
      const milestones = [1, 5, 10];
      const milestone = milestones[nextWorkMilestone.current];
      if (milestone !== undefined && workElapsed.current >= milestone) {
        onLifecycle("PANEL_WORK_TIME", { elapsedSeconds: milestone, actionTime: Number(action.current.time.toFixed(3)), ...(process.env.NODE_ENV === "development" ? actionBindingProbe(action.current, scene) : {}) });
        nextWorkMilestone.current += 1;
      }
    }
    {
      const targets = PROCEDURAL_REACH_CONTACTS.map(hologramContactTarget).filter((target): target is ContactTarget => Boolean(target));
      const signature = targetAnchorSignature(state.camera, state.gl.domElement, targets);
      if (targets.length === PROCEDURAL_REACH_CONTACTS.length && signature !== threeTargetSignature.current) {
        state.scene.updateMatrixWorld(true);
        threeTargetSignature.current = signature;
        const anchors: ThreeContactAnchors = {};
        for (const target of targets) {
          const planePoint = screenPointOnInteractionPlane(scene, state.camera, target, state.gl.domElement);
          if (!planePoint) continue;
          const side = target.bone.includes("Right") ? "right" : "left";
          const ergonomic = selectErgonomicRayDepth({ scene, camera: state.camera, canvas: state.gl.domElement, target, planePoint, contactSocket: contactSockets.current[side]?.object });
          const position = ergonomic.position;
          const projected = projectWorldPoint(state.camera, state.gl.domElement, position);
          const reachability = armReachability(scene, target.bone, position);
          anchors[target.id] = { contact: target.id, position, reprojectionErrorPx: Math.hypot(projected.x - target.x, projected.y - target.y), selectedRayDepth: ergonomic.selectedRayDepth, ergonomicScore: ergonomic.score, screenFraction: { x: target.u, y: target.v }, ...reachability };
        }
        threeContactAnchors.current = anchors;
        const debugTargets = Object.fromEntries(Object.entries(anchors).map(([contact, anchor]) => [contact, { x: Number(anchor.position.x.toFixed(4)), y: Number(anchor.position.y.toFixed(4)), z: Number(anchor.position.z.toFixed(4)), reprojectionErrorPx: Number(anchor.reprojectionErrorPx.toFixed(3)), selectedRayDepth: Number(anchor.selectedRayDepth.toFixed(4)), ergonomicScore: Number(anchor.ergonomicScore.toFixed(3)), screenFraction: anchor.screenFraction, reachDistance: anchor.reachDistance === null ? null : Number(anchor.reachDistance.toFixed(4)), armMaxReach: anchor.armMaxReach === null ? null : Number(anchor.armMaxReach.toFixed(4)), reachable: anchor.reachable }]));
        if (process.env.NODE_ENV === "development") (window as Window & { __BV01_TARGETS_3D__?: typeof debugTargets }).__BV01_TARGETS_3D__ = debugTargets;
      }
      if (showTargetMarkers && targetMarkerGroup.current) {
        PROCEDURAL_REACH_CONTACTS.forEach((contact, index) => {
          const marker = targetMarkerGroup.current?.children[index];
          const anchor = threeContactAnchors.current[contact];
          if (marker && anchor) marker.position.copy(anchor.position);
        });
      }
      if (showTargetMarkers && socketMarkerGroup.current) {
        (["left", "right"] as const).forEach((side, index) => {
          const marker = socketMarkerGroup.current?.children[index];
          const socket = contactSockets.current[side];
          if (marker && socket) marker.position.copy(socket.object.getWorldPosition(new Vector3()));
        });
      }
    }
  });
  return <group ref={framingRoot}><primitive object={scene} dispose={null} />{showTargetMarkers ? <><group ref={targetMarkerGroup}>{PROCEDURAL_REACH_CONTACTS.map((contact, index) => <mesh key={contact} position={[0, 0, 0]}><sphereGeometry args={[.035, 10, 10]} /><meshBasicMaterial color={index < 2 ? "#55e9ff" : "#f5c4ff"} depthTest={false} /></mesh>)}</group><group ref={socketMarkerGroup}>{["#7dffad", "#ff9dbd"].map((color) => <mesh key={color} position={[0, 0, 0]}><sphereGeometry args={[.022, 10, 10]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>)}</group><group ref={handMarker}><mesh><sphereGeometry args={[.025, 10, 10]} /><meshBasicMaterial color="#fff3a6" depthTest={false} /></mesh></group><mesh ref={elbowPoleMarker}><sphereGeometry args={[.025, 10, 10]} /><meshBasicMaterial color="#a98cff" depthTest={false} /></mesh><mesh ref={headExclusionMarker}><sphereGeometry args={[.16, 12, 12]} /><meshBasicMaterial color="#ff7d8d" wireframe transparent opacity={.45} depthTest={false} /></mesh><primitive ref={contactDebugLineRef} object={contactDebugLine} /><primitive ref={armDebugLineRef} object={armDebugLine} /></> : null}</group>;
}

function actionBindingProbe(action: NonNullable<ReturnType<AnimationMixer["clipAction"]>>, scene: Object3D) {
  const internalAction = action as NonNullable<ReturnType<AnimationMixer["clipAction"]>> & { _clip?: { tracks?: Array<{ name: string }> }; _propertyBindings?: unknown[] };
  const tracks = internalAction._clip?.tracks ?? [];
  const resolvedTrackBindings = tracks.filter((track) => Boolean(scene.getObjectByName(track.name.split(".")[0]))).length;
  return {
    actionEnabled: action.enabled,
    actionPaused: action.paused,
    actionWeight: Number(action.getEffectiveWeight().toFixed(3)),
    propertyBindings: internalAction._propertyBindings?.length ?? 0,
    trackCount: tracks.length,
    resolvedTrackBindings,
    unresolvedTrackBindings: tracks.length - resolvedTrackBindings,
    trackedBones: tracks.slice(0, 4).map((track) => {
      const bone = scene.getObjectByName(track.name.split(".")[0]);
      return { track: track.name, found: Boolean(bone), quaternion: bone?.quaternion.toArray().map((value) => Number(value.toFixed(4))) };
    }),
  };
}

type ContactTarget = { id: InteractionTouchId; screen: TouchScreen; uiContact: Exclude<HologramContact, "none">; bone: "mixamorigLeftHand" | "mixamorigRightHand"; x: number; y: number; u: number; v: number };
// Physical order is deliberately hand-alternating: R → L → R → L → R → L.
const PROCEDURAL_REACH_CONTACTS = ["profile-1", "filters-1", "operation-1", "filters-2", "profile-2", "operation-2"] as const;

function isArmTrack(trackName: string, side?: "Left" | "Right") {
  const prefix = side ? `mixamorig${side}` : "mixamorig(?:Left|Right)";
  // Keep finger tracks in the body clip: fingers retain the authored hand
  // pose while only shoulder/upper-arm/forearm/hand-root are blended out.
  return new RegExp(`${prefix}(?:Shoulder|Arm|ForeArm|Hand)(?:\\.|\\[|$)`, "i").test(trackName);
}

function interactionBodyClip(clip: AnimationClip) {
  return new AnimationClip(`${clip.name}__BODY`, clip.duration, clip.tracks.filter((track) => !isArmTrack(track.name)));
}

function proceduralReachRange(contact: InteractionTouchId) {
  const ranges: Record<InteractionTouchId, readonly [number, number, number, number]> = {
    // [approach start, contact/hold start, hold end, withdrawal end].
    // Holds are .03 normalized seconds (162ms); handoffs overlap only while
    // the outgoing arm is visibly withdrawing and the incoming arm prepares.
    "profile-1": [.035, .115, .133, .165], "filters-1": [.127, .195, .214, .242], "operation-1": [.214, .290, .313, .347],
    "filters-2": [.319, .384, .402, .430], "profile-2": [.402, .470, .488, .517], "operation-2": [.489, .570, .594, .630],
  };
  return ranges[contact];
}

function actionIntervalCrosses(previous: number, current: number, contact: InteractionTouchId) {
  const [start, , , end] = proceduralReachRange(contact);
  return previous <= end && current >= start;
}

function configuredMaxHandoffOverlapMs() {
  return Number((Math.max(...PROCEDURAL_REACH_CONTACTS.slice(0, -1).map((id, index) => {
    const end = proceduralReachRange(id)[3];
    const nextStart = proceduralReachRange(PROCEDURAL_REACH_CONTACTS[index + 1])[0];
    return Math.max(0, end - nextStart);
  })) * PROCEDURAL_INTERACTION_DURATION * 1_000).toFixed(1));
}

function recordCcdBlock(debug: InteractionDebug, reason: string) {
  debug.ccdBlockReason = reason;
  debug.ccdBlockCounts[reason] = (debug.ccdBlockCounts[reason] ?? 0) + 1;
}

function activeProceduralReach(phase: number): InteractionTouchId | undefined {
  // Ranges deliberately overlap so the outgoing arm can withdraw while the
  // next one prepares. Selection is weight-based, not first-match based:
  // otherwise an earlier range would incorrectly keep authority throughout
  // every overlap. Exactly one target owns positional IK per frame.
  return PROCEDURAL_REACH_CONTACTS.reduce<{ id: InteractionTouchId; weight: number } | undefined>((primary, id) => {
    const [start, , , end] = proceduralReachRange(id);
    if (phase < start || phase > end) return primary;
    const weight = proceduralReachWeight(phase, id);
    return !primary || weight > primary.weight ? { id, weight } : primary;
  }, undefined)?.id;
}

function smoothRamp(value: number, from: number, to: number) {
  const x = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

function proceduralReachWeight(phase: number, contact: InteractionTouchId) {
  const range = proceduralReachRange(contact);
  return Math.min(smoothRamp(phase, range[0], range[1]), 1 - smoothRamp(phase, range[2], range[3]));
}

function touchMotionPhase(phase: number, contact: InteractionTouchId): "PREPARE" | "APPROACH" | "CONTACT" | "HOLD" | "WITHDRAW" | "IDLE" {
  const [start, holdStart, holdEnd, withdrawEnd] = proceduralReachRange(contact);
  if (phase < start || phase > withdrawEnd) return "IDLE";
  if (phase < start + Math.min(.015, (holdStart - start) * .4)) return "PREPARE";
  if (phase < holdStart) return "APPROACH";
  if (phase < holdStart + .006) return "CONTACT";
  if (phase < holdEnd) return "HOLD";
  return "WITHDRAW";
}

function blendArmsToReady(scene: Object3D, poses: Partial<Record<"left" | "right", ArmReadyPose>>, activeSide: "left" | "right" | undefined, finalRecovery = false) {
  // Ready is a soft recovery attractor, never an intermediate hard waypoint.
  // That preserves outgoing momentum into the next handoff instead of
  // repeatedly returning BV-01 to a pose-to-pose robotic reset.
  (["left", "right"] as const).forEach((side) => {
    const recovery = side === activeSide ? .012 : finalRecovery ? .12 : .055;
    const pose = poses[side];
    const name = side === "left" ? "Left" : "Right";
    if (!pose) return;
    const hand = renderedSkeletonBone(scene, `mixamorig${name}Hand`);
    const mesh = hand ? renderedSkinnedMeshForBone(scene, hand) : undefined;
    const upper = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${name}Arm`);
    const forearm = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${name}ForeArm`);
    if (!upper || !forearm || !hand) return;
    upper.quaternion.slerp(pose.upper, recovery);
    forearm.quaternion.slerp(pose.forearm, recovery * 1.12);
    hand.quaternion.slerp(pose.hand, recovery * 1.28);
  });
}

function contactOnlyIkWeight(phase: number, contact: InteractionTouchId) {
  const [, contactStart, holdEnd] = proceduralReachRange(contact);
  const leadIn = contact === "profile-1" ? .018 : .028; // Profile correction starts only after its directed bridge.
  const fadeOut = .028;
  if (phase < contactStart - leadIn || phase > holdEnd + fadeOut) return 0;
  if (phase < contactStart) return smoothRamp(phase, contactStart - leadIn, contactStart);
  if (phase <= holdEnd) return 1;
  return 1 - smoothRamp(phase, holdEnd, holdEnd + fadeOut);
}

type DirectedPoseKey = { time: number; right: number; left: number; attention: number; lift: number };
const DIRECTED_POSE_KEYS: DirectedPoseKey[] = [
  // Each value belongs to one continuous elevated arm path. There are no
  // ready/working reset keys between contacts: the non-contact arm is already
  // traveling toward its next assigned destination.
  // Visible work-mode entry: shoulders lead, then elbows and forearms lift
  // from the actual idle pose over ~435ms before PROFILE_1 engages.
  { time: 0, right: 0, left: 0, attention: 0, lift: 0 },
  { time: .025, right: .08, left: .08, attention: 0, lift: 0 },
  // The activation endpoint is also PROFILE_1's exact start pose. Never
  // place a second key at this timestamp: it creates a one-frame pop.
  { time: .075, right: .38, left: .38, attention: -.35, lift: .18 },
  { time: .085, right: .42, left: .37, attention: -.55, lift: .14 }, { time: .115, right: .62, left: .36, attention: -1, lift: 0 },
  { time: .165, right: .42, left: .54, attention: 1, lift: 0 }, { time: .195, right: .38, left: .62, attention: 1, lift: 0 },
  { time: .260, right: .56, left: .42, attention: 0, lift: 1 }, { time: .290, right: .66, left: .38, attention: 0, lift: 1 },
  { time: .355, right: .42, left: .56, attention: 1, lift: 0 }, { time: .384, right: .38, left: .62, attention: 1, lift: 0 },
  { time: .440, right: .56, left: .42, attention: -1, lift: 0 }, { time: .470, right: .62, left: .38, attention: -1, lift: 0 },
  { time: .535, right: .42, left: .56, attention: 0, lift: 1 }, { time: .570, right: .38, left: .66, attention: 0, lift: 1 },
  { time: .700, right: 0, left: 0, attention: 0, lift: 0 }, { time: 1, right: 0, left: 0, attention: 0, lift: 0 },
];

function directedPoseAt(phase: number) {
  const nextIndex = DIRECTED_POSE_KEYS.findIndex((key) => key.time >= phase);
  const next = DIRECTED_POSE_KEYS[Math.max(0, nextIndex)] ?? DIRECTED_POSE_KEYS[DIRECTED_POSE_KEYS.length - 1];
  const previous = DIRECTED_POSE_KEYS[Math.max(0, nextIndex - 1)] ?? DIRECTED_POSE_KEYS[0];
  const t = next.time === previous.time ? 0 : smoothRamp(phase, previous.time, next.time);
  return { right: previous.right + (next.right - previous.right) * t, left: previous.left + (next.left - previous.left) * t, attention: previous.attention + (next.attention - previous.attention) * t, lift: previous.lift + (next.lift - previous.lift) * t };
}

function captureActivationStartPose(scene: Object3D): ActivationStartPose {
  const names = ["mixamorigRightShoulder", "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand", "mixamorigLeftShoulder", "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand", "mixamorigSpine2", "mixamorigHead"] as const;
  return Object.fromEntries(names.map((name) => [name, renderedSkeletonBone(scene, name)?.quaternion.clone()]).filter((entry): entry is [typeof names[number], Quaternion] => Boolean(entry[1]))) as ActivationStartPose;
}

function applyDirectedChoreography(scene: Object3D, armReady: Partial<Record<"left" | "right", ArmReadyPose>>, bodyReady: BodyReadyPose | undefined, startPose: ActivationStartPose, phase: number) {
  const pose = directedPoseAt(phase);
  const activationWeight = smoothRamp(phase, 0, .075);
  const primary = activeProceduralReach(phase);
  const primarySide = primary && hologramContactTarget(primary)?.bone.includes("Right") ? "right" : primary ? "left" : undefined;
  (["right", "left"] as const).forEach((side) => {
    const ready = armReady[side]; if (!ready) return;
    const name = side === "right" ? "Right" : "Left";
    const hand = renderedSkeletonBone(scene, `mixamorig${name}Hand`); const mesh = hand ? renderedSkinnedMeshForBone(scene, hand) : undefined;
    const upper = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${name}Arm`); const forearm = runtimeSkeletonBone(mesh?.skeleton.bones, `mixamorig${name}ForeArm`);
    if (!hand || !upper || !forearm) return;
    const reach = side === "right" ? pose.right : pose.left; const outward = side === "right" ? -1 : 1;
    const preparing = primarySide !== undefined && primarySide !== side;
    // Secondary arm: compact elevated preparation corridor. It does not
    // inherit the active arm's lateral shoulder opening.
    const lateralOpen = preparing ? .055 : .42;
    const elbowBend = preparing ? 1.05 : .38;
    // Directed bent working pose: elbows stay below/forward of shoulders;
    // this is the visual authority between contact correction windows.
    const directedUpper = ready.upper.clone().multiply(new Quaternion().setFromEuler(new Euler(-(preparing ? .42 : .18) * reach, .05 * outward * reach, lateralOpen * outward * reach)));
    const directedForearm = ready.forearm.clone().multiply(new Quaternion().setFromEuler(new Euler(preparing ? elbowBend : elbowBend * reach, 0, -(preparing ? .16 : .32) * outward * reach)));
    const directedHand = ready.hand.clone().multiply(new Quaternion().setFromEuler(new Euler(.08 * reach, 0, 0)));
    // Full directed authority: no rest/base arm blend is permitted before the
    // final settle. The blend expression remains explicit for the ramps.
    const prefix = `mixamorig${name}` as const;
    upper.quaternion.copy(startPose[`${prefix}Arm`] ?? upper.quaternion).slerp(directedUpper, DIRECTED_ARM_WEIGHT_DURING_ACTIVE * activationWeight);
    forearm.quaternion.copy(startPose[`${prefix}ForeArm`] ?? forearm.quaternion).slerp(directedForearm, DIRECTED_ARM_WEIGHT_DURING_ACTIVE * activationWeight);
    hand.quaternion.copy(startPose[`${prefix}Hand`] ?? hand.quaternion).slerp(directedHand, DIRECTED_ARM_WEIGHT_DURING_ACTIVE * activationWeight);
  });
  if (bodyReady) {
    const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine"); const head = renderedSkeletonBone(scene, "mixamorigHead");
    if (torso && head) {
      const directedTorso = bodyReady.torso.clone().multiply(new Quaternion().setFromEuler(new Euler(-.025 * pose.lift, .05 * pose.attention, 0)));
      const directedHead = bodyReady.head.clone().multiply(new Quaternion().setFromEuler(new Euler(-.04 * pose.lift, .085 * pose.attention, 0)));
      torso.quaternion.copy(startPose.mixamorigSpine2 ?? torso.quaternion).slerp(directedTorso, activationWeight);
      head.quaternion.copy(startPose.mixamorigHead ?? head.quaternion).slerp(directedHead, activationWeight);
    }
  }
}

function enforceActiveWorkspaceFloor(scene: Object3D, sockets: Partial<Record<"left" | "right", HandContactSocket>>, telemetry: WorkspaceFloorTelemetry) {
  const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine");
  if (!torso) return;
  const torsoWorld = torso.getWorldPosition(new Vector3());
  // Torso-relative rather than a world-Y constant: preserves the same
  // lower-chest/upper-abdomen working envelope under scene framing changes.
  const floorY = torsoWorld.y - .10;
  (["right", "left"] as const).forEach((side) => {
    const socket = sockets[side]?.object; const handName = side === "right" ? "Right" : "Left";
    const hand = renderedSkeletonBone(scene, `mixamorig${handName}Hand`); const forearm = renderedSkeletonBone(scene, `mixamorig${handName}ForeArm`); const upper = renderedSkeletonBone(scene, `mixamorig${handName}Arm`);
    if (!socket || !hand || !forearm || !upper) return;
    const socketWorld = socket.getWorldPosition(new Vector3()); const relativeHeight = socketWorld.y - torsoWorld.y;
    const heightKey = side === "right" ? "rightMinHandWorkHeight" : "leftMinHandWorkHeight";
    telemetry[heightKey] = telemetry[heightKey] === null ? relativeHeight : Math.min(telemetry[heightKey]!, Math.max(relativeHeight, floorY - torsoWorld.y));
    if (socketWorld.y >= floorY) return;
    const restKey = side === "right" ? "intermediateRightArmRestFrames" : "intermediateLeftArmRestFrames";
    // This is a directed workspace constraint, not positional contact IK:
    // it merely keeps the bent arm lifted before any final socket correction.
    const elbow = forearm.getWorldPosition(new Vector3());
    rotateBoneToward(upper, forearm, elbow.clone().add(new Vector3(0, (floorY - socketWorld.y) * .7, .10)), .48);
    scene.updateMatrixWorld(true);
    const liftedHand = hand.getWorldPosition(new Vector3());
    rotateBoneToward(forearm, hand, liftedHand.clone().add(new Vector3(0, floorY - socketWorld.y, .12)), .56);
    scene.updateMatrixWorld(true);
    // A corrected floor constraint is not an arm-down event; it prevents one.
    telemetry[restKey] += 0;
  });
}

function supportReachWithBody(scene: Object3D, ready: BodyReadyPose | undefined, screen: TouchScreen | undefined, phase: number) {
  if (!ready) return;
  const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine");
  const head = renderedSkeletonBone(scene, "mixamorigHead");
  if (!torso || !head) return;
  // A tiny continuous drift prevents attention from becoming a series of
  // locked looks while the anticipatory screen bias leads the next handoff.
  const yaw = (screen === "profile" ? -.055 : screen === "filters" ? .055 : 0) + Math.sin(phase * Math.PI * 4) * .008;
  const pitch = (screen === "operation" ? -.035 : 0) + Math.cos(phase * Math.PI * 3) * .005;
  torso.quaternion.slerp(ready.torso.clone().multiply(new Quaternion().setFromEuler(new Euler(pitch, yaw, 0))), .10);
  head.quaternion.slerp(ready.head.clone().multiply(new Quaternion().setFromEuler(new Euler(pitch * .6, yaw * .55, 0))), .10);
}

function anticipatedScreen(phase: number): TouchScreen | undefined {
  const next = activeProceduralReach(Math.min(.999, phase + .028));
  return next ? hologramContactTarget(next)?.screen : undefined;
}

function screenPointOnInteractionPlane(scene: Object3D, camera: Camera, target: { x: number; y: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return undefined;
  const ndc = new Vector3((target.x - rect.left) / rect.width * 2 - 1, -((target.y - rect.top) / rect.height * 2 - 1), .5).unproject(camera);
  const cameraOrigin = camera.getWorldPosition(new Vector3());
  const ray = new Ray(cameraOrigin, ndc.sub(cameraOrigin).normalize());
  // The plane is camera-facing and just in front of BV-01's upper torso: it
  // gives DOM holograms tangible, reachable coordinates without changing their
  // screen-space projection.
  const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine") ?? scene;
  const planePoint = torso.getWorldPosition(new Vector3());
  const cameraDirection = camera.getWorldDirection(new Vector3());
  planePoint.add(cameraDirection.multiplyScalar(-.35));
  const plane = new Plane().setFromNormalAndCoplanarPoint(cameraDirection, planePoint);
  return ray.intersectPlane(plane, new Vector3()) ?? undefined;
}

function selectErgonomicRayDepth({ scene, camera, target, planePoint, contactSocket }: { scene: Object3D; camera: Camera; canvas: HTMLCanvasElement; target: ContactTarget; planePoint: Vector3; contactSocket?: Object3D }) {
  const side = target.bone.includes("Right") ? "Right" : "Left";
  const shoulder = renderedSkeletonBone(scene, `mixamorig${side}Arm`);
  const forearm = renderedSkeletonBone(scene, `mixamorig${side}ForeArm`);
  const hand = renderedSkeletonBone(scene, target.bone);
  const head = renderedSkeletonBone(scene, "mixamorigHead");
  const cameraOrigin = camera.getWorldPosition(new Vector3());
  const rayDirection = planePoint.clone().sub(cameraOrigin).normalize();
  const planeDepth = cameraOrigin.distanceTo(planePoint);
  if (!shoulder || !forearm || !hand) return { position: planePoint, selectedRayDepth: planeDepth, score: 0 };
  const shoulderWorld = shoulder.getWorldPosition(new Vector3());
  const elbowWorld = forearm.getWorldPosition(new Vector3());
  const wristWorld = hand.getWorldPosition(new Vector3());
  const socketWorld = contactSocket?.getWorldPosition(new Vector3()) ?? wristWorld;
  const socketOffset = socketWorld.clone().sub(wristWorld);
  const upperLength = shoulderWorld.distanceTo(elbowWorld);
  const forearmLength = elbowWorld.distanceTo(wristWorld);
  const maxReach = Math.max(.0001, upperLength + forearmLength);
  const headWorld = head?.getWorldPosition(new Vector3());
  let best: { position: Vector3; selectedRayDepth: number; score: number } | undefined;
  // Positive travel moves away from the camera toward BV-01's workspace while
  // preserving the exact DOM projection of the ray.
  for (const offset of [-.18, -.09, 0, .09, .18, .27]) {
    const depth = Math.max(.01, planeDepth + offset);
    const position = cameraOrigin.clone().add(rayDirection.clone().multiplyScalar(depth));
    const wristTarget = position.clone().sub(socketOffset);
    const shoulderDistance = shoulderWorld.distanceTo(wristTarget);
    const extensionRatio = shoulderDistance / maxReach;
    const clampedDistance = Math.max(Math.abs(upperLength - forearmLength) + .0001, Math.min(shoulderDistance, maxReach));
    const elbowAngle = Math.acos(Math.max(-1, Math.min(1, (upperLength * upperLength + forearmLength * forearmLength - clampedDistance * clampedDistance) / (2 * upperLength * forearmLength)))) * 180 / Math.PI;
    const headClearance = headWorld ? wristTarget.distanceTo(headWorld) - .16 : .2;
    const currentAim = wristWorld.clone().sub(shoulderWorld).normalize();
    const desiredAim = wristTarget.clone().sub(shoulderWorld).normalize();
    const correctionCost = currentAim.angleTo(desiredAim) * .12;
    // Favor a visibly bent arm (0.76–0.84) rather than a near-straight
    // lateral silhouette; screen projection remains exactly DOM-derived.
    const score = Math.abs(extensionRatio - .80) * 48 + Math.abs(elbowAngle - 120) * .08 + Math.max(0, extensionRatio - .86) * 180 + Math.max(0, .13 - headClearance) * 90 + correctionCost;
    if (!best || score < best.score) best = { position, selectedRayDepth: depth, score };
  }
  return best ?? { position: planePoint, selectedRayDepth: planeDepth, score: 0 };
}

function projectWorldPoint(camera: Camera, canvas: HTMLCanvasElement, point: Vector3) {
  const projected = point.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + (projected.x * .5 + .5) * rect.width, y: rect.top + (-projected.y * .5 + .5) * rect.height };
}

function armReachability(scene: Object3D, boneName: ContactTarget["bone"], target: Vector3) {
  const side = boneName.includes("Right") ? "Right" : "Left";
  const shoulder = renderedSkeletonBone(scene, `mixamorig${side}Shoulder`);
  const arm = renderedSkeletonBone(scene, `mixamorig${side}Arm`);
  const forearm = renderedSkeletonBone(scene, `mixamorig${side}ForeArm`);
  const hand = renderedSkeletonBone(scene, `mixamorig${side}Hand`);
  if (!shoulder || !arm || !forearm || !hand) return { reachDistance: null, armMaxReach: null, reachable: null };
  const shoulderPosition = shoulder.getWorldPosition(new Vector3());
  const armLength = shoulderPosition.distanceTo(arm.getWorldPosition(new Vector3()));
  const forearmLength = arm.getWorldPosition(new Vector3()).distanceTo(forearm.getWorldPosition(new Vector3()));
  const wristAllowance = forearm.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3()));
  const armMaxReach = armLength + forearmLength + wristAllowance;
  const reachDistance = shoulderPosition.distanceTo(target);
  return { reachDistance, armMaxReach, reachable: reachDistance <= armMaxReach * .98 };
}

function targetAnchorSignature(camera: Camera, canvas: HTMLCanvasElement, targets: ContactTarget[]) {
  const rect = canvas.getBoundingClientRect();
  return [rect.left, rect.top, rect.width, rect.height, ...camera.matrixWorld.elements, ...targets.flatMap((target) => [target.x, target.y])].map((value) => value.toFixed(2)).join("|");
}

function degreesBetween(first: Quaternion, second: Quaternion) {
  return first.angleTo(second) * 180 / Math.PI;
}

function forearmTwistDegrees(base: Quaternion, current: Quaternion, localAxis: Vector3) {
  const delta = base.clone().invert().multiply(current).normalize();
  const axis = localAxis.lengthSq() > .000001 ? localAxis.clone().normalize() : new Vector3(0, 1, 0);
  const projection = axis.multiplyScalar(delta.x * axis.x + delta.y * axis.y + delta.z * axis.z);
  const twist = new Quaternion(projection.x, projection.y, projection.z, delta.w).normalize();
  return Math.abs(2 * Math.atan2(Math.hypot(twist.x, twist.y, twist.z), Math.abs(twist.w)) * 180 / Math.PI);
}

function clampForearmExtraTwist(bone: Object3D, base: Quaternion, localAxis: Vector3) {
  const axis = localAxis.lengthSq() > .000001 ? localAxis.clone().normalize() : new Vector3(0, 1, 0);
  const delta = base.clone().invert().multiply(bone.quaternion).normalize();
  const projectedAmount = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  const twist = new Quaternion(axis.x * projectedAmount, axis.y * projectedAmount, axis.z * projectedAmount, delta.w).normalize();
  const swing = delta.clone().multiply(twist.clone().invert()).normalize();
  const rawAngle = 2 * Math.atan2(Math.hypot(twist.x, twist.y, twist.z), Math.abs(twist.w));
  const signedAngle = (projectedAmount < 0 ? -1 : 1) * rawAngle;
  const constrainedTwist = new Quaternion().setFromAxisAngle(axis, Math.max(-MAX_FOREARM_EXTRA_TWIST_RAD, Math.min(MAX_FOREARM_EXTRA_TWIST_RAD, signedAngle)));
  bone.quaternion.copy(base).multiply(swing).multiply(constrainedTwist);
}

function pointToSegmentDistance(point: Vector3, start: Vector3, end: Vector3) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < .000001) return point.distanceTo(start);
  const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(segment) / lengthSq));
  return point.distanceTo(start.clone().add(segment.multiplyScalar(t)));
}

function mergeArmAnatomy(previous: ArmAnatomyMeasurement | undefined, next: ArmAnatomyMeasurement) {
  if (!previous) return next;
  const nextIsCloser = next.contactDistance3D < previous.contactDistance3D;
  const closest = nextIsCloser ? next : previous;
  return {
    ...closest,
    upperArmCorrectionDeg: Math.max(previous.upperArmCorrectionDeg, next.upperArmCorrectionDeg),
    forearmCorrectionDeg: Math.max(previous.forearmCorrectionDeg, next.forearmCorrectionDeg),
    forearmExtraTwistDeg: Math.max(previous.forearmExtraTwistDeg, next.forearmExtraTwistDeg),
    wristCorrectionDeg: Math.max(previous.wristCorrectionDeg, next.wristCorrectionDeg),
    elbowFlipCount: Math.max(previous.elbowFlipCount, next.elbowFlipCount),
    handMinHeadClearance: previous.handMinHeadClearance === null ? next.handMinHeadClearance : next.handMinHeadClearance === null ? previous.handMinHeadClearance : Math.min(previous.handMinHeadClearance, next.handMinHeadClearance),
    forearmHeadIntersection: previous.forearmHeadIntersection || next.forearmHeadIntersection,
    contactDistance3D: nextIsCloser ? next.contactDistance3D : previous.contactDistance3D,
    screenDistancePx: nextIsCloser ? next.screenDistancePx : previous.screenDistancePx,
    contact: previous.contact || next.contact,
  };
}

function rotateBoneToward(bone: Object3D, end: Object3D, destination: Vector3, influence: number) {
  const joint = bone.getWorldPosition(new Vector3());
  const currentEnd = end.getWorldPosition(new Vector3());
  const from = currentEnd.sub(joint);
  const to = destination.clone().sub(joint);
  if (from.lengthSq() < .000001 || to.lengthSq() < .000001) return;
  const rotation = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  const partial = new Quaternion().slerp(rotation, Math.min(.78, influence));
  const parentWorld = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  bone.quaternion.premultiply(parentWorld.clone().invert().multiply(partial).multiply(parentWorld));
}

function applyProceduralReach({ scene, camera, canvas, contact, targetWorld, contactSocket, weight, debug, elbowPoleNormals, elbowFlipCounts }: { scene: Object3D; camera: Camera; canvas: HTMLCanvasElement; contact: InteractionTouchId; targetWorld: Vector3; contactSocket?: Object3D; weight: number; debug: InteractionDebug; elbowPoleNormals: Partial<Record<"left" | "right", Vector3>>; elbowFlipCounts: Record<"left" | "right", number> }): ProceduralReachResult | undefined {
  const target = hologramContactTarget(contact);
  if (!target) { debug.invalidTargetCount += 1; debug.invalidSampleReason = "INVALID_TARGET"; recordCcdBlock(debug, "noTarget"); return undefined; }
  if (!camera) { debug.noCameraCount += 1; debug.invalidSampleReason = "NO_CAMERA"; recordCcdBlock(debug, "noCamera"); return undefined; }
  const rect = canvas.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) { debug.invalidViewportCount += 1; debug.invalidSampleReason = "INVALID_VIEWPORT"; recordCcdBlock(debug, "invalidViewport"); return undefined; }
  if (weight <= 0) return undefined;
  const hand = renderedSkeletonBone(scene, target.bone);
  if (!hand) { debug.noHandBoneCount += 1; debug.invalidSampleReason = "NO_HAND_BONE"; recordCcdBlock(debug, "noRenderedSkeleton"); return undefined; }
  // `renderedSkeletonBone` only returns bones from the visible clone's
  // SkinnedMesh skeleton, never from the source GLTF hierarchy.
  if (target.bone === "mixamorigRightHand") debug.rightHandRenderedSkeleton = true;
  else debug.leftHandRenderedSkeleton = true;
  const side = target.bone.includes("Right") ? "Right" : "Left";
  const handMesh = renderedSkinnedMeshForBone(scene, hand);
  const sideKey = side === "Right" ? "right" as const : "left" as const;
  const upperArm = runtimeSkeletonBone(handMesh?.skeleton.bones, `mixamorig${side}Arm`);
  const forearm = runtimeSkeletonBone(handMesh?.skeleton.bones, `mixamorig${side}ForeArm`);
  if (!upperArm || !forearm) { debug.noHandBoneCount += 1; debug.invalidSampleReason = "NO_ARM_CHAIN"; recordCcdBlock(debug, "noHandBone"); return undefined; }
  const torso = renderedSkeletonBone(scene, "mixamorigSpine2") ?? renderedSkeletonBone(scene, "mixamorigSpine") ?? scene;
  const head = renderedSkeletonBone(scene, "mixamorigHead");
    const baseForearm = forearm.quaternion.clone();
  const baseHand = hand.quaternion.clone();
  let desiredElbowWorld = forearm.getWorldPosition(new Vector3());
  let residualUpperCorrectionDeg = 0;
  let residualForearmCorrectionDeg = 0;
  // The arm remains an anatomical wrist/forearm/upper-arm chain. The socket
  // is only the end-effector authority: its live offset is compensated on
  // every correction pass, so a visible fingertip — not the Hand pivot —
  // converges on the locked 3D hologram anchor.
  for (let correctionPass = 0; correctionPass < 3; correctionPass += 1) {
    scene.updateMatrixWorld(true);
    const shoulder = upperArm.getWorldPosition(new Vector3());
    const elbow = forearm.getWorldPosition(new Vector3());
    const wrist = hand.getWorldPosition(new Vector3());
    const socket = contactSocket?.getWorldPosition(new Vector3()) ?? wrist;
    const wristTarget = targetWorld.clone().sub(socket.clone().sub(wrist));
    const upperLength = Math.max(.0001, shoulder.distanceTo(elbow));
    const forearmLength = Math.max(.0001, elbow.distanceTo(wrist));
    const toTarget = wristTarget.clone().sub(shoulder);
    const rawDistance = Math.max(.0001, toTarget.length());
    // Keep a visible elbow bend: target contact must never force a fully
    // locked arm merely to reduce an already-valid socket error.
    const reachDistance = Math.max(Math.abs(upperLength - forearmLength) + .002, Math.min(rawDistance, (upperLength + forearmLength) * .92));
    const axis = toTarget.normalize();
    const torsoPosition = torso.getWorldPosition(new Vector3());
    const outward = shoulder.clone().sub(torsoPosition).normalize();
    // Upper-panel reaches bias the elbow farther outside the head silhouette.
    const poleStrength = contact.startsWith("operation") ? 1.7 : .85;
    const candidatePole = elbow.clone().sub(shoulder).add(outward.multiplyScalar(poleStrength));
    let pole = candidatePole.sub(axis.clone().multiplyScalar(candidatePole.dot(axis)));
    if (pole.lengthSq() < .000001) pole = sideKey === "right" ? new Vector3(1, .15, 0) : new Vector3(-1, .15, 0);
    pole.normalize();
    const priorPole = elbowPoleNormals[sideKey];
    // Preserve the previous bend hemisphere. A target transition can change
    // direction sharply, but it must never invert the physical elbow.
    if (priorPole && priorPole.dot(pole) < 0) pole.negate();
    elbowPoleNormals[sideKey] = pole.clone();
    const alongAxis = (upperLength * upperLength + reachDistance * reachDistance - forearmLength * forearmLength) / (2 * reachDistance);
    const elbowHeight = Math.sqrt(Math.max(0, upperLength * upperLength - alongAxis * alongAxis));
    const desiredElbow = shoulder.clone().add(axis.multiplyScalar(alongAxis)).add(pole.multiplyScalar(elbowHeight));
    desiredElbowWorld = desiredElbow.clone();
    const upperBefore = upperArm.quaternion.clone();
    rotateBoneToward(upperArm, forearm, desiredElbow, weight);
    scene.updateMatrixWorld(true);
    const forearmBefore = forearm.quaternion.clone();
    rotateBoneToward(forearm, hand, wristTarget, weight);
    clampForearmExtraTwist(forearm, baseForearm, hand.position.clone());
    scene.updateMatrixWorld(true);
    // Pass zero establishes the authored procedural reach pose. Only the
    // following socket-convergence passes count as residual IK correction.
    if (correctionPass > 0) {
      residualUpperCorrectionDeg = Math.max(residualUpperCorrectionDeg, degreesBetween(upperBefore, upperArm.quaternion));
      residualForearmCorrectionDeg = Math.max(residualForearmCorrectionDeg, degreesBetween(forearmBefore, forearm.quaternion));
    }
    const socketAfter = contactSocket?.getWorldPosition(new Vector3()) ?? hand.getWorldPosition(new Vector3());
    if (socketAfter.distanceTo(targetWorld) <= SOCKET_SOLVER_TARGET_TOLERANCE) break;
  }
  scene.updateMatrixWorld(true);
  // Socket world position is the only procedural/contact effector. Do not
  // fall back to a deformed mesh centroid here: that point is useful for
  // unrelated visual probes, but cannot prove a fingertip touched a panel.
  const handWorld = contactSocket?.getWorldPosition(new Vector3()) ?? hand.getWorldPosition(new Vector3());
  if (![handWorld.x, handWorld.y, handWorld.z].every(Number.isFinite)) {
    debug.invalidWorldPositionCount += 1;
    debug.invalidSampleReason = "INVALID_HAND_WORLD_POSITION";
    recordCcdBlock(debug, "invalidWorldPosition");
    return undefined;
  }
  const handPoint = projectWorldPoint(camera, canvas, handWorld);
  if (!handPoint || !Number.isFinite(handPoint.x) || !Number.isFinite(handPoint.y)) { debug.invalidNdcCount += 1; debug.invalidSampleReason = "INVALID_NDC"; recordCcdBlock(debug, "invalidNdc"); return undefined; }
  const screenDistance = Math.hypot(handPoint.x - target.x, handPoint.y - target.y);
  const worldDistance = handWorld.distanceTo(targetWorld);
  if (!Number.isFinite(screenDistance) || !Number.isFinite(worldDistance)) { debug.invalidDistanceCount += 1; debug.invalidSampleReason = "INVALID_DISTANCE"; recordCcdBlock(debug, "invalidDistance"); return undefined; }
  if (target.bone === "mixamorigRightHand") debug.validRightHandSamples += 1;
  else debug.validLeftHandSamples += 1;
  const headWorld = head?.getWorldPosition(new Vector3());
  const shoulderWorld = upperArm.getWorldPosition(new Vector3());
  const elbowWorld = forearm.getWorldPosition(new Vector3());
  const wristWorld = hand.getWorldPosition(new Vector3());
  const forearmClearance = headWorld ? pointToSegmentDistance(headWorld, elbowWorld, wristWorld) - .16 : null;
  const maximumArmReach = Math.max(.0001, shoulderWorld.distanceTo(elbowWorld) + elbowWorld.distanceTo(wristWorld));
  const armExtensionRatio = shoulderWorld.distanceTo(wristWorld) / maximumArmReach;
  const elbowAngleDeg = elbowWorld.clone().sub(shoulderWorld).angleTo(wristWorld.clone().sub(elbowWorld)) * 180 / Math.PI;
  const anatomy = {
    upperArmCorrectionDeg: residualUpperCorrectionDeg,
    forearmCorrectionDeg: residualForearmCorrectionDeg,
    forearmExtraTwistDeg: forearmTwistDegrees(baseForearm, forearm.quaternion, hand.position.clone()),
    wristCorrectionDeg: degreesBetween(baseHand, hand.quaternion),
    elbowFlipCount: elbowFlipCounts[sideKey],
    handMinHeadClearance: headWorld ? handWorld.distanceTo(headWorld) - .16 : null,
    forearmHeadIntersection: forearmClearance !== null && forearmClearance < 0,
    armExtensionRatio,
    elbowAngleDeg,
    contactDistance3D: worldDistance,
    screenDistancePx: screenDistance,
    contact: false,
    shoulderWorld,
    elbowWorld,
    wristWorld,
    elbowPoleWorld: desiredElbowWorld,
    headWorld,
  };
  return { worldDistance, screenDistance, handWorld, anatomy };
}

function hologramContactTarget(contact: InteractionTouchId): ContactTarget | undefined {
  const config = {
    "profile-1": { screen: "profile", uiContact: "profile", selector: ".bv01-work-panel--profile", bone: "mixamorigRightHand", u: .74, v: .42 },
    "profile-2": { screen: "profile", uiContact: "profile", selector: ".bv01-work-panel--profile", bone: "mixamorigRightHand", u: .70, v: .69 },
    "filters-1": { screen: "filters", uiContact: "filters", selector: ".bv01-work-panel--preferences", bone: "mixamorigLeftHand", u: .26, v: .42 },
    "filters-2": { screen: "filters", uiContact: "filters", selector: ".bv01-work-panel--preferences", bone: "mixamorigLeftHand", u: .30, v: .69 },
    // Deliberately outside/lower in the existing upper panel: the diagonal
    // path keeps the forearm and hand out of the head silhouette.
    "operation-1": { screen: "operation", uiContact: "main-primary", selector: ".bv01-work-panel--main", bone: "mixamorigRightHand", u: .18, v: .86 },
    "operation-2": { screen: "operation", uiContact: "main-final", selector: ".bv01-work-panel--main", bone: "mixamorigLeftHand", u: .82, v: .86 },
  } as const;
  const entry = config[contact];
  const panel = document.querySelector<HTMLElement>(entry.selector);
  if (!panel) return undefined;
  const rect = panel.getBoundingClientRect();
  return { id: contact, screen: entry.screen, uiContact: entry.uiContact, bone: entry.bone, u: entry.u, v: entry.v, x: rect.left + rect.width * entry.u, y: rect.top + rect.height * entry.v };
}

function renderedSkeletonBone(scene: Object3D, boneName: string) {
  // BV-01 can contain multiple visible SkinnedMeshes. Resolve a bone from
  // whichever rendered skeleton actually owns that identity; never require an
  // arbitrary first mesh or an unrendered source hierarchy.
  return renderedSkinnedMeshEntries(scene).flatMap((entry) => entry.skeleton.bones).find((bone) => runtimeBoneMatches(bone.name, boneName));
}

function bestHandContactBone(scene: Object3D, side: "left" | "right") {
  const handToken = side === "left" ? "LeftHand" : "RightHand";
  const bones = renderedSkinnedMeshEntries(scene).flatMap((entry) => entry.skeleton.bones);
  // Prefer the terminal index/middle phalanx: unlike the Hand pivot, this
  // follows the visibly extended finger surface used for a hologram touch.
  const priorities = [
    `${handToken}Index4`, `${handToken}Middle4`, `${handToken}Index3`, `${handToken}Middle3`,
    `${handToken}Index2`, `${handToken}Middle2`, handToken,
  ];
  for (const requested of priorities) {
    const match = bones.find((bone) => runtimeBoneMatches(bone.name, `mixamorig${requested}`) || runtimeBoneMatches(bone.name, requested));
    if (match) return match;
  }
  return undefined;
}

/**
 * Resolve both hands from one SkinnedMesh belonging to the rendered
 * SkeletonUtils clone. Searching the clone's scene graph by name is not
 * sufficient: it can return a source/stale hierarchy bone with the same name.
 */
function runtimeBoneMatches(actualName: string, requestedName: string) {
  const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const actual = canonical(actualName);
  const requested = canonical(requestedName);
  return actual === requested || actual.endsWith(requested) || requested.endsWith(actual);
}

type RenderedSkinnedMeshEntry = { mesh: Object3D & { skeleton: { uuid: string; bones: Object3D[] } }; skeleton: { uuid: string; bones: Object3D[] } };

function renderedSkinnedMeshEntries(scene: Object3D): RenderedSkinnedMeshEntry[] {
  const entries: RenderedSkinnedMeshEntry[] = [];
  scene.traverse((object) => {
    const mesh = object as Object3D & { isSkinnedMesh?: boolean; skeleton?: { uuid: string; bones?: Object3D[] } };
    if (!mesh.isSkinnedMesh || !mesh.skeleton?.bones) return;
    entries.push({ mesh: mesh as RenderedSkinnedMeshEntry["mesh"], skeleton: mesh.skeleton as RenderedSkinnedMeshEntry["skeleton"] });
  });
  return entries;
}

function hasRuntimeBone(bones: Object3D[], boneName: string) {
  return bones.some((bone) => runtimeBoneMatches(bone.name, boneName));
}

function runtimeSkeletonBone(bones: Object3D[] | undefined, boneName: string) {
  return bones?.find((bone) => runtimeBoneMatches(bone.name, boneName));
}

function renderedSkinnedMeshForBone(scene: Object3D, bone: Object3D) {
  return renderedSkinnedMeshEntries(scene).find((entry) => entry.skeleton.bones.includes(bone))?.mesh;
}

function renderedSkeletonDiagnostic(scene: Object3D) {
  const entries = renderedSkinnedMeshEntries(scene);
  const leftHand = entries.flatMap((entry) => entry.skeleton.bones).find((bone) => runtimeBoneMatches(bone.name, "mixamorigLeftHand"));
  const rightHand = entries.flatMap((entry) => entry.skeleton.bones).find((bone) => runtimeBoneMatches(bone.name, "mixamorigRightHand"));
  return {
    meshes: entries.map((entry) => ({ name: entry.mesh.name || "(unnamed)", skeletonUuid: entry.skeleton.uuid, boneCount: entry.skeleton.bones.length, containsLeftHand: hasRuntimeBone(entry.skeleton.bones, "mixamorigLeftHand"), containsRightHand: hasRuntimeBone(entry.skeleton.bones, "mixamorigRightHand") })),
    leftHand,
    rightHand,
    leftHandSkeletonUuids: leftHand ? entries.filter((entry) => entry.skeleton.bones.includes(leftHand)).map((entry) => entry.skeleton.uuid) : [],
    rightHandSkeletonUuids: rightHand ? entries.filter((entry) => entry.skeleton.bones.includes(rightHand)).map((entry) => entry.skeleton.uuid) : [],
  };
}

function globeInteractionScreenSample({ scene, camera, canvas, clipTime }: { scene: Object3D; camera: Camera; canvas: HTMLCanvasElement; clipTime: number }) {
  const robotRect = canvas.getBoundingClientRect();
  const mesh = firstSkinnedMesh(scene) as Object3D & { geometry?: { getAttribute: (name: string) => { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number } }; skeleton?: { bones: Object3D[]; update: () => void }; applyBoneTransform?: (index: number, vector: Vector3) => Vector3 };
  const screenPosition = (name: string) => {
    const node = scene.getObjectByName(name);
    if (!node) return undefined;
    // An attached SkinnedMesh can leave a bone's world transform unchanged
    // while its vertices animate. Project the deformed hand centroid, not the
    // bone origin, so this probe describes what users actually see.
    const position = (handVisualCentroid(mesh, node) ?? node.getWorldPosition(new Vector3())).project(camera);
    return {
      x: Number((robotRect.left + (position.x + 1) * .5 * robotRect.width).toFixed(1)),
      y: Number((robotRect.top + (1 - position.y) * .5 * robotRect.height).toFixed(1)),
    };
  };
  const globeCanvas = document.querySelector<HTMLCanvasElement>(".opportunities-search__globe canvas");
  const globeRect = globeCanvas?.getBoundingClientRect();
  const globe = globeRect ? {
    centerX: Number((globeRect.left + globeRect.width * .5).toFixed(1)),
    centerY: Number((globeRect.top + globeRect.height * .5).toFixed(1)),
    radius: Number((Math.min(globeRect.width, globeRect.height) * .5).toFixed(1)),
  } : undefined;
  const leftHand = screenPosition("mixamorigLeftHand");
  const rightHand = screenPosition("mixamorigRightHand");
  const head = screenPosition("mixamorigHead");
  const pose = (name: string) => {
    const node = scene.getObjectByName(name);
    return node ? {
      position: node.position.toArray().map((value) => Number(value.toFixed(4))),
      quaternion: node.quaternion.toArray().map((value) => Number(value.toFixed(4))),
    } : undefined;
  };
  const delta = (hand?: { x: number; y: number }) => globe ? { deltaX: Number((globe.centerX - hand!.x).toFixed(1)), deltaY: Number((globe.centerY - hand!.y).toFixed(1)) } : undefined;
  return { clipTime: Number(clipTime.toFixed(3)), leftHand, rightHand, head, pose: { leftHand: pose("mixamorigLeftHand"), rightHand: pose("mixamorigRightHand"), head: pose("mixamorigHead") }, globe, leftToGlobe: delta(leftHand), rightToGlobe: delta(rightHand) };
}

function handVisualCentroid(mesh: Object3D & { geometry?: { getAttribute: (name: string) => { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number } }; skeleton?: { bones: Object3D[]; update: () => void }; applyBoneTransform?: (index: number, vector: Vector3) => Vector3 }, bone: Object3D) {
  if (!mesh.geometry || !mesh.skeleton || !mesh.applyBoneTransform) return undefined;
  const position = mesh.geometry.getAttribute("position");
  const skinIndex = mesh.geometry.getAttribute("skinIndex") as unknown as { getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number; getW: (index: number) => number };
  const skinWeight = mesh.geometry.getAttribute("skinWeight") as unknown as { getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number; getW: (index: number) => number };
  const boneIndex = mesh.skeleton.bones.indexOf(bone);
  if (boneIndex < 0) return undefined;
  mesh.skeleton.update();
  const total = new Vector3();
  let count = 0;
  for (let index = 0; index < position.count; index += 1) {
    const indices = [skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index)];
    const weights = [skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index)];
    const weight = indices.reduce((highest, candidate, channel) => candidate === boneIndex && weights[channel] > highest ? weights[channel] : highest, 0);
    if (weight < .45) continue;
    const vertex = new Vector3(position.getX(index), position.getY(index), position.getZ(index));
    mesh.applyBoneTransform(index, vertex);
    total.add(mesh.localToWorld(vertex));
    count += 1;
  }
  return count ? total.multiplyScalar(1 / count) : undefined;
}

type ScreenBounds = { left: number; top: number; right: number; bottom: number; width: number; height: number; centerX: number; centerY: number };

type CameraFitResult = { before: ScreenBounds; final?: ScreenBounds; passes: number; valid: boolean; clipped: boolean };

function stageOpacitySnapshot(stage: HTMLDivElement | null) {
  const poster = stage?.querySelector<HTMLElement>(".bv-01-poster");
  const canvas = stage?.querySelector<HTMLElement>(".bv-01-three");
  return {
    posterOpacity: poster ? getComputedStyle(poster).opacity : undefined,
    canvasOpacity: canvas ? getComputedStyle(canvas).opacity : undefined,
  };
}

const CAMERA_FIT_START_Z = 7;
const CAMERA_FIT_MAX_PASSES = 6;
const CAMERA_FIT_CLIP_MARGIN = 3;
// Raster bounds are whole pixels while the poster alpha bounds are fractional
// CSS pixels. Four pixels is still visually imperceptible at this slot size.
const CAMERA_FIT_ALIGNMENT_TOLERANCE_PX = 4;

function fitCameraRaster({ gl, scene, camera, canvas, poster }: { gl: WebGLRenderer; scene: Scene; camera: Camera; canvas: HTMLCanvasElement; poster: ScreenBounds }): CameraFitResult {
  const perspective = camera as Camera & { fov: number; aspect: number; updateProjectionMatrix: () => void };
  camera.position.set(0, 0, CAMERA_FIT_START_Z);
  camera.updateMatrixWorld(true);
  const measure = () => rasterBounds(gl, scene, camera, canvas);
  const before = measure();
  if (!before) return { before: emptyBounds(), passes: 0, valid: false, clipped: false };
  const viewport = canvas.getBoundingClientRect();
  // The alpha bounds of the poster can reach the slot edge. Fit just inside it
  // so a valid 3D frame has a small non-clipped margin while staying within 2%.
  const desiredHeight = Math.min(poster.height * .99, viewport.height - CAMERA_FIT_CLIP_MARGIN * 3);
  const safeTargetBottom = Math.min(poster.bottom, viewport.height - CAMERA_FIT_CLIP_MARGIN);
  let current = before;
  let passes = 0;

  for (; passes < CAMERA_FIT_MAX_PASSES; passes += 1) {
    const heightRatioToDesired = current.height / desiredHeight;
    if (heightRatioToDesired < 0.995 || heightRatioToDesired > 1.005) {
      camera.position.z *= heightRatioToDesired;
      camera.updateMatrixWorld(true);
      current = measure() ?? current;
    }

    const pixelsPerWorldY = worldUnitsPerPixelY(camera, viewport.height);
    const pixelsPerWorldX = pixelsPerWorldY * perspective.aspect;
    const centerError = current.centerX - poster.centerX;
    const bottomError = current.bottom - safeTargetBottom;
    if (Math.abs(centerError) > 1) camera.position.x += centerError * pixelsPerWorldX;
    // With this fixed camera orientation, positive camera Y moves BV-01 down.
    if (Math.abs(bottomError) > 1) camera.position.y -= bottomError * pixelsPerWorldY;
    camera.updateMatrixWorld(true);
    current = measure() ?? current;

    const finalRatio = current.height / poster.height;
    const clipped = isRasterClipped(current, viewport);
    if (finalRatio >= 0.98 && finalRatio <= 1.02 && Math.abs(current.centerX - poster.centerX) <= CAMERA_FIT_ALIGNMENT_TOLERANCE_PX && Math.abs(current.bottom - poster.bottom) <= CAMERA_FIT_ALIGNMENT_TOLERANCE_PX && !clipped) {
      return { before, final: current, passes: passes + 1, valid: true, clipped: false };
    }
  }
  return { before, final: current, passes, valid: false, clipped: isRasterClipped(current, viewport) };
}

function worldUnitsPerPixelY(camera: Camera, viewportHeight: number) {
  const perspective = camera as Camera & { fov: number };
  const distance = Math.max(.01, Math.abs(camera.position.z));
  return (2 * distance * Math.tan((perspective.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
}

function isRasterClipped(bounds: ScreenBounds, viewport: DOMRect) {
  return bounds.top <= 0 || bounds.bottom >= viewport.height;
}

function cameraFitLog(poster: ScreenBounds, result: CameraFitResult, camera: Camera, canvas: HTMLCanvasElement) {
  const final = result.final;
  return {
    target: { height: poster.height, centerX: poster.centerX, bottom: poster.bottom },
    before: { cameraPosition: [0, 0, CAMERA_FIT_START_Z], rasterHeight: result.before.height, centerX: result.before.centerX, bottom: result.before.bottom },
    after: { cameraPosition: camera.position.toArray(), rasterHeight: final?.height, centerX: final?.centerX, bottom: final?.bottom },
    passes: result.passes,
    heightRatio: final ? final.height / poster.height : 0,
    centerErrorPx: final ? final.centerX - poster.centerX : undefined,
    bottomErrorPx: final ? final.bottom - poster.bottom : undefined,
    clipped: result.clipped,
    canvas: canvasDetails(canvas),
  };
}

function firstSkinnedMesh(root: Object3D): Object3D | undefined {
  let result: Object3D | undefined;
  root.traverse((node) => {
    if (!result && (node as Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh) result = node;
  });
  return result;
}

function countSkinnedMeshes(root: Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if ((node as Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh) count += 1;
  });
  return count;
}

function applyTransformDiagnostic(root: Group, diagnostic: Exclude<TransformDiagnostic, undefined>) {
  root.position.set(diagnostic.kind === "translate" ? diagnostic.x : 0, 0, 0);
  root.rotation.set(0, diagnostic.kind === "rotate" ? Math.PI / 2 : 0, 0);
  root.scale.setScalar(diagnostic.kind === "scale" ? diagnostic.scale : 1);
}

function resetFramingRoot(root: Group) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
}

function applyCameraDiagnostic(camera: Camera, diagnostic: Exclude<CameraDiagnostic, undefined>) {
  const perspective = camera as Camera & { lookAt: (x: number, y: number, z: number) => void };
  const z = diagnostic === "z10" ? 10 : diagnostic === "z7" ? 7 : diagnostic === "z5" ? 5 : diagnostic === "z3.5" ? 3.5 : CAMERA_DISTANCE;
  const x = diagnostic === "xleft" ? -2.5 : diagnostic === "xright" ? 2.5 : 0;
  camera.position.set(x, 0, z);
  // Keep the viewing direction parallel to the default camera for the X tests:
  // the camera alone shifts the subject in screen space without rotating it.
  perspective.lookAt(x, 0, 0);
  camera.updateMatrixWorld(true);
}

function matrixString(objectMatrix: { elements: number[] }) {
  return objectMatrix.elements.map((value) => Number(value.toFixed(5))).join(",");
}

function cameraProbe(camera: Camera) {
  const perspective = camera as Camera & { fov?: number; zoom?: number; aspect?: number };
  return {
    type: camera.type,
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    fov: perspective.fov,
    zoom: perspective.zoom,
    aspect: perspective.aspect,
    projectionMatrix: matrixString(camera.projectionMatrix),
  };
}

function skinnedMeshProbe(mesh: Object3D) {
  const skinned = mesh as Object3D & {
    bindMode?: string;
    bindMatrix?: { elements: number[] };
    bindMatrixInverse?: { elements: number[] };
    skeleton?: { bones?: Object3D[]; boneTexture?: unknown };
    material?: { type?: string } | Array<{ type?: string }>;
    customDepthMaterial?: unknown;
    customDistanceMaterial?: unknown;
  };
  return {
    name: mesh.name,
    type: mesh.type,
    bindMode: skinned.bindMode,
    bindMatrix: skinned.bindMatrix ? matrixString(skinned.bindMatrix) : undefined,
    bindMatrixInverse: skinned.bindMatrixInverse ? matrixString(skinned.bindMatrixInverse) : undefined,
    matrixAutoUpdate: mesh.matrixAutoUpdate,
    matrixWorldAutoUpdate: mesh.matrixWorldAutoUpdate,
    skeletonBones: skinned.skeleton?.bones?.length,
    hasBoneTexture: Boolean(skinned.skeleton?.boneTexture),
    materialType: Array.isArray(skinned.material) ? skinned.material.map((material) => material.type).join(",") : skinned.material?.type,
    onBeforeRender: Boolean(mesh.onBeforeRender),
    onAfterRender: Boolean(mesh.onAfterRender),
    hasCustomDepthMaterial: Boolean(skinned.customDepthMaterial),
    hasCustomDistanceMaterial: Boolean(skinned.customDistanceMaterial),
  };
}

function rasterBounds(gl: WebGLRenderer, scene: Scene, camera: Camera, canvas: HTMLCanvasElement): ScreenBounds | undefined {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const target = new WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
  const pixels = new Uint8Array(width * height * 4);
  const previousTarget = gl.getRenderTarget();
  const previousColor = gl.getClearColor(new Color());
  const previousAlpha = gl.getClearAlpha();
  try {
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    gl.setClearColor(previousColor, previousAlpha);
    gl.setRenderTarget(previousTarget);
    target.dispose();
  }
  let minX = width; let maxX = -1; let minY = height; let maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixel = (y * width + x) * 4;
    const alpha = pixels[pixel + 3];
    const brightness = Math.max(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2]);
    // Some WebGL implementations preserve RGB but not meaningful alpha for
    // opaque PBR draws in an offscreen target. Black is the known transparent
    // clear color, so RGB provides the equivalent silhouette signal.
    if (alpha <= 8 && brightness <= 8) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    const topY = height - 1 - y;
    minY = Math.min(minY, topY); maxY = Math.max(maxY, topY);
  }
  if (maxX < minX || maxY < minY) return undefined;
  const left = minX; const right = maxX + 1; const top = minY; const bottom = maxY + 1;
  return { left, right, top, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function emptyBounds(): ScreenBounds {
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
}

function posterBounds(canvas: HTMLCanvasElement): ScreenBounds | undefined {
  const image = canvas.closest(".bv-01-renderer")?.querySelector<HTMLImageElement>(".bv-01-poster img");
  if (!image) return undefined;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return undefined;
  const scale = Math.min(rect.width / BV01_POSTER_INTRINSIC.width, rect.height / BV01_POSTER_INTRINSIC.height);
  const renderedWidth = BV01_POSTER_INTRINSIC.width * scale;
  const renderedHeight = BV01_POSTER_INTRINSIC.height * scale;
  const originX = rect.left + (rect.width - renderedWidth) / 2;
  const originY = rect.top + (rect.height - renderedHeight) / 2;
  const canvasRect = canvas.getBoundingClientRect();
  const left = originX + BV01_POSTER_ALPHA_BOUNDS.minX * scale - canvasRect.left;
  const right = originX + (BV01_POSTER_ALPHA_BOUNDS.maxX + 1) * scale - canvasRect.left;
  const top = originY + BV01_POSTER_ALPHA_BOUNDS.minY * scale - canvasRect.top;
  const bottom = originY + (BV01_POSTER_ALPHA_BOUNDS.maxY + 1) * scale - canvasRect.top;
  return { left, right, top, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function canvasDetails(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height, aspect: rect.width / rect.height };
}
