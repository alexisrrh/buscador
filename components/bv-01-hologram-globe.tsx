"use client";

import { useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AdditiveBlending, BackSide, BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, MathUtils, PerspectiveCamera, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Group, type MeshBasicMaterial } from "three";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";
import { boundaryRings } from "@/lib/geographic-boundary";
import type { GlobeBoundary, GlobeLocation } from "@/lib/globe-location";
import type { SearchVisualPhase } from "@/components/search-visual-pipeline";

export type GlobeInteraction = "idle" | "hover" | "drag";

type GlobeProps = { state: BV01VisualState; reducedMotion: boolean; hovered?: boolean; searchActive?: boolean; location?: GlobeLocation; boundary?: GlobeBoundary; searchPhase?: SearchVisualPhase; position?: [number, number, number]; scale?: number; calloutHeadroomPx?: number; onInteractionChange?: (interaction: GlobeInteraction) => void; onLocationLockChange?: (locked: boolean) => void };

export const MAX_GLOBE_PITCH = Math.PI / 3;
export const AUTO_ROTATE_RESUME_DELAY_MS = 2_000;
export const ACTIVE_GLOBE_SPEED_MULTIPLIER = 3.5;
export const GLOBE_ACCELERATION_MS = 300;
export const GLOBE_DECELERATION_MS = 500;
export const GLOBAL_SEARCH_REVOLUTIONS = 2;
export const GLOBAL_SEARCH_ROTATION_RAD = GLOBAL_SEARCH_REVOLUTIONS * Math.PI * 2;
export const GLOBAL_SEARCH_SPIN_DURATION_MS = 1_350;
export const GLOBAL_SEARCH_ACCELERATION_MS = 200;
const EARTH_TEXTURE_Y_OFFSET = 1.92;
const MARKER_RADIUS = .575;
type BoundaryVisualStatus = { surfaceReady: boolean; surfaceVisible: boolean; traceProgress: number; projectionVisible: boolean; projectionReady: boolean; projectionRenderVisible: boolean; projectionHumanVisible: boolean; projectionObjectVisible: boolean; projectionParentVisible: boolean; projectionScale: number; projectionWorldScale: number[]; projectionScreenWidth: number; projectionScreenHeight: number; primaryScreenWidth: number; primaryScreenHeight: number; primaryScreenCenterX: number; primaryScreenCenterY: number; primaryLongestDimension: number; secondaryRendered: number; secondaryTotal: number; projectionOffsetScreenX: number; projectionOffsetScreenY: number; desiredProjectionScreenX: number; desiredProjectionScreenY: number; projectionRoundTripErrorPx: number; projectionExtractionProgress: number; floatingProjectionDrawProgress: number; projectionWorldPosition: number[]; projectionOpacity: number; projectionFacingDot: number; projectionCameraSpaceDepth: number; globeFrontCameraSpaceDepth: number; projectionInFrontOfGlobe: boolean; projectionGeometryVertexCount: number; primaryOutlineEffectiveOpacity: number; primaryOutlineScreenWidthPx: number; projectionDepthTest: boolean; projectionDepthWrite: boolean; projectionFrustumCulled: boolean; localBoundsCenterBefore: number[]; localBoundsCenterAfter: number[]; projectionRootToGeometryCenterErrorPx: number[] };

function globalSearchProgress(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  const acceleration = GLOBAL_SEARCH_ACCELERATION_MS / GLOBAL_SEARCH_SPIN_DURATION_MS;
  const cruiseVelocity = 1 / (1 - acceleration);
  if (progress < acceleration) return cruiseVelocity * progress * progress / (2 * acceleration);
  if (progress <= 1 - acceleration) return cruiseVelocity * (acceleration / 2 + progress - acceleration);
  const release = progress - (1 - acceleration);
  return 1 - cruiseVelocity * acceleration / 2 + cruiseVelocity * release - cruiseVelocity * release * release / (2 * acceleration);
}

// SphereGeometry's equirectangular UVs put longitude on +Z with the texture
// seam on -X. The coastline meshes then rotate by EARTH_TEXTURE_Y_OFFSET.
// This is the sole lat/lon authority for steering, boundaries, and debug data.
export function geoToGlobeLocal(latitude: number, longitude: number, radius = MARKER_RADIUS) {
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  return new Vector3(
    radius * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    radius * Math.sin(latitudeRadians),
    radius * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
  ).applyAxisAngle(new Vector3(0, 1, 0), EARTH_TEXTURE_Y_OFFSET);
}

export function clampGlobePitch(value: number) {
  return Math.max(-MAX_GLOBE_PITCH, Math.min(MAX_GLOBE_PITCH, value));
}

export function canAutoRotate(reducedMotion: boolean, dragging: boolean, now: number, resumeAt: number) {
  return !reducedMotion && !dragging && now >= resumeAt;
}

export function BV01HologramGlobe({ state, reducedMotion, searchActive = false, location, boundary, searchPhase = "idle", position = [0, 0, 0], scale = 1, calloutHeadroomPx = 0, onInteractionChange, onLocationLockChange }: GlobeProps) {
  const globe = useRef<Group>(null);
  const atmosphere = useRef<MeshBasicMaterial>(null);
  const scan = useRef<Group>(null);
  const drag = useRef({ active: false, lastX: 0, lastY: 0, resumeAt: 0, autoBlend: 1 });
  const searchBlend = useRef(0);
  const rotationSpeed = useRef<number | undefined>(undefined);
  const acquisition = useRef({ started: false, completed: false, reducedMotionAligned: false });
  const globalSearch = useRef({ started: false, startAtMs: 0, startY: 0, completed: false });
  const timing = useRef({ spin2CompletedAt: 0, targetSteeringStartedAt: 0, targetSteeringCompletedAt: 0 });
  const compositionRects = useRef<{ console?: DOMRect; label?: DOMRect }>({});
  const boundaryVisual = useRef<BoundaryVisualStatus>({ surfaceReady: false, surfaceVisible: false, traceProgress: 0, projectionVisible: false, projectionReady: false, projectionRenderVisible: false, projectionHumanVisible: false, projectionObjectVisible: false, projectionParentVisible: false, projectionScale: 0, projectionWorldScale: [], projectionScreenWidth: 0, projectionScreenHeight: 0, primaryScreenWidth: 0, primaryScreenHeight: 0, primaryScreenCenterX: 0, primaryScreenCenterY: 0, primaryLongestDimension: 0, secondaryRendered: 0, secondaryTotal: 0, projectionOffsetScreenX: 0, projectionOffsetScreenY: 0, desiredProjectionScreenX: 0, desiredProjectionScreenY: 0, projectionRoundTripErrorPx: 0, projectionExtractionProgress: 0, floatingProjectionDrawProgress: 0, projectionWorldPosition: [], projectionOpacity: 0, projectionFacingDot: 0, projectionCameraSpaceDepth: 0, globeFrontCameraSpaceDepth: 0, projectionInFrontOfGlobe: false, projectionGeometryVertexCount: 0, primaryOutlineEffectiveOpacity: 0, primaryOutlineScreenWidthPx: 0, projectionDepthTest: false, projectionDepthWrite: false, projectionFrustumCulled: false, localBoundsCenterBefore: [], localBoundsCenterAfter: [], projectionRootToGeometryCenterErrorPx: [] });
  const targetKey = JSON.stringify([location?.query, location?.latitude, location?.longitude, location?.resolved, searchActive]);
  const [targetState, setTargetState] = useState({ key: targetKey, visible: false, locked: false });
  if (targetState.key !== targetKey) setTargetState({ key: targetKey, visible: false, locked: false });
  const targetVisible = targetState.key === targetKey && targetState.visible;
  const locationLocked = targetState.key === targetKey && targetState.locked;
  const visual = bv01VisualStateMap[state];
  const landMask = useLoader(TextureLoader, "/models/bv-01/bv01-earth-landmask.webp");
  const coastMask = useLoader(TextureLoader, "/models/bv-01/bv01-earth-coast.webp");
  // useLoader caches shared textures. Each globe owns its configured copies.
  const earthTexture = useMemo(() => { const texture = landMask.clone(); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; return texture; }, [landMask]);
  const coastTexture = useMemo(() => { const texture = coastMask.clone(); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; return texture; }, [coastMask]);
  useEffect(() => () => { earthTexture.dispose(); coastTexture.dispose(); }, [earthTexture, coastTexture]);
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const resolved = location?.resolved;
  const resolvedPoint = useMemo(() => resolved && typeof latitude === "number" && typeof longitude === "number" ? geoToGlobeLocal(latitude, longitude) : undefined, [latitude, longitude, resolved]);
  const showGeoCalibration = process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bvgeodebug");

  useEffect(() => {
    acquisition.current = { started: false, completed: false, reducedMotionAligned: false };
    timing.current = { spin2CompletedAt: 0, targetSteeringStartedAt: 0, targetSteeringCompletedAt: 0 };
    onLocationLockChange?.(false);
  }, [location?.query, location?.latitude, location?.longitude, location?.resolved, onLocationLockChange]);

  useEffect(() => {
    globalSearch.current = { started: false, startAtMs: 0, startY: 0, completed: !searchActive };
    acquisition.current = { started: false, completed: false, reducedMotionAligned: false };
    timing.current = { spin2CompletedAt: 0, targetSteeringStartedAt: 0, targetSteeringCompletedAt: 0 };
    onLocationLockChange?.(false);
  }, [searchActive, onLocationLockChange]);

  useEffect(() => {
    const consoleElement = document.querySelector<HTMLElement>(".public-entry__console-search");
    const labelElement = document.querySelector<HTMLElement>(".hero-globe-stage__location-label");
    const measure = () => { compositionRects.current = { console: consoleElement?.getBoundingClientRect(), label: labelElement?.getBoundingClientRect() }; };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (consoleElement) observer?.observe(consoleElement);
    if (labelElement) observer?.observe(labelElement);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [locationLocked]);

  const lockLocation = () => {
    if (locationLocked) return;
    setTargetState((current) => ({ ...current, key: targetKey, locked: true }));
    onLocationLockChange?.(true);
  };

  useFrame((frameState, delta) => {
    const interaction = drag.current;
    searchBlend.current = MathUtils.damp(searchBlend.current, searchActive ? 1 : 0, 3.2, delta);
    const idleRotationSpeed = visual.globeSpeed;
    const targetRotationSpeed = idleRotationSpeed * (searchActive ? ACTIVE_GLOBE_SPEED_MULTIPLIER : 1);
    rotationSpeed.current = MathUtils.damp(rotationSpeed.current ?? idleRotationSpeed, targetRotationSpeed, searchActive ? 10 : 6, delta);
    const spinningGlobalScan = searchActive && !globalSearch.current.completed;
    if (scan.current) {
      scan.current.rotation.z += delta * (spinningGlobalScan ? 1.12 : searchActive ? .55 : .12);
      scan.current.rotation.y = Math.sin(frameState.clock.elapsedTime * (searchActive ? 1.8 : .6)) * .18;
      scan.current.scale.setScalar(spinningGlobalScan ? 1.08 : 1);
      scan.current.visible = !acquisition.current.completed;
    }
    if (atmosphere.current) atmosphere.current.opacity = .045 + searchBlend.current * .035;
    if (!globe.current) return;
    if (calloutHeadroomPx > 0) {
      const originalCanvasHeight = Math.max(1, frameState.size.height - calloutHeadroomPx);
      const visualScale = scale * originalCanvasHeight / frameState.size.height;
      const fovRadians = (frameState.camera as PerspectiveCamera).fov * Math.PI / 180;
      const centerShift = -(calloutHeadroomPx / frameState.size.height) * frameState.camera.position.z * Math.tan(fovRadians / 2);
      globe.current.scale.setScalar(visualScale);
      globe.current.position.set(position[0], position[1] + centerShift, position[2]);
    }
    let visible = false;
    let targetWorldDirection: Vector3 | undefined;
    let cameraFacingDirection: Vector3 | undefined;
    let targetFrontDot = 0;
    let targetScreenNdcX = 0;
    let targetScreenNdcY = 0;
    let targetDistanceFromGlobeScreenCenter = 0;
    if (resolvedPoint) {
      const worldPoint = globe.current.localToWorld(resolvedPoint.clone());
      const center = globe.current.getWorldPosition(new Vector3());
      const normal = worldPoint.clone().sub(center).normalize();
      const viewDirection = frameState.camera.position.clone().sub(worldPoint).normalize();
      targetWorldDirection = normal;
      cameraFacingDirection = viewDirection;
      targetFrontDot = normal.dot(viewDirection);
      visible = targetFrontDot > .06;
      const targetNdc = worldPoint.clone().project(frameState.camera);
      const globeNdc = center.clone().project(frameState.camera);
      targetScreenNdcX = targetNdc.x;
      targetScreenNdcY = targetNdc.y;
      targetDistanceFromGlobeScreenCenter = Math.hypot(targetNdc.x - globeNdc.x, targetNdc.y - globeNdc.y);
      if (visible !== targetVisible) setTargetState((current) => ({ ...current, key: targetKey, visible }));
    }
    const canvasRect = frameState.gl.domElement.getBoundingClientRect();
    const stageRect = frameState.gl.domElement.parentElement?.getBoundingClientRect();
    const projectionRect = boundaryVisual.current.projectionScreenWidth ? {
      left: canvasRect.left + (boundaryVisual.current.projectionOffsetScreenX + canvasRect.width / 2) - boundaryVisual.current.projectionScreenWidth / 2,
      top: canvasRect.top + (-boundaryVisual.current.projectionOffsetScreenY + canvasRect.height / 2) - boundaryVisual.current.projectionScreenHeight / 2,
      width: boundaryVisual.current.projectionScreenWidth, height: boundaryVisual.current.projectionScreenHeight,
    } : undefined;
    const primaryMapViewportRect = boundaryVisual.current.primaryScreenWidth ? {
      left: canvasRect.left + boundaryVisual.current.primaryScreenCenterX - boundaryVisual.current.primaryScreenWidth / 2,
      top: canvasRect.top + boundaryVisual.current.primaryScreenCenterY - boundaryVisual.current.primaryScreenHeight / 2,
      width: boundaryVisual.current.primaryScreenWidth, height: boundaryVisual.current.primaryScreenHeight,
    } : undefined;
    type ScreenRect = { left: number; top: number; width: number; height: number };
    const overlaps = (first: ScreenRect | undefined, second: ScreenRect | undefined) => Boolean(first && second && first.left < second.left + second.width && first.left + first.width > second.left && first.top < second.top + second.height && first.top + first.height > second.top);
    const clipped = (rect: { left: number; top: number; width: number; height: number } | DOMRect | undefined) => Boolean(rect && (rect.left < canvasRect.left || rect.top < canvasRect.top || rect.left + rect.width > canvasRect.right || rect.top + rect.height > canvasRect.bottom));
    const liveLabel = process.env.NODE_ENV === "development" ? document.querySelector<HTMLElement>(".hero-globe-stage__location-label") : undefined;
    const labelRect = liveLabel?.getBoundingClientRect() ?? compositionRects.current.label;
    const globeCenterWorld = globe.current.getWorldPosition(new Vector3());
    const globeRadiusWorld = .575 * globe.current.getWorldScale(new Vector3()).x;
    const cameraRight = new Vector3(1, 0, 0).applyQuaternion(frameState.camera.quaternion);
    const cameraUp = new Vector3(0, 1, 0).applyQuaternion(frameState.camera.quaternion);
    const globeScreenPoints = [cameraRight, cameraRight.clone().negate(), cameraUp, cameraUp.clone().negate()].map((axis) => globeCenterWorld.clone().addScaledVector(axis, globeRadiusWorld).project(frameState.camera));
    const globeScreenRect = {
      left: canvasRect.left + Math.min(...globeScreenPoints.map((point) => (point.x + 1) * canvasRect.width / 2)),
      top: canvasRect.top + Math.min(...globeScreenPoints.map((point) => (1 - point.y) * canvasRect.height / 2)),
      width: (Math.max(...globeScreenPoints.map((point) => point.x)) - Math.min(...globeScreenPoints.map((point) => point.x))) * canvasRect.width / 2,
      height: (Math.max(...globeScreenPoints.map((point) => point.y)) - Math.min(...globeScreenPoints.map((point) => point.y))) * canvasRect.height / 2,
    };
    const combinedCalloutRect = projectionRect && labelRect ? {
      left: Math.min(projectionRect.left, labelRect.left), top: Math.min(projectionRect.top, labelRect.top),
      width: Math.max(projectionRect.left + projectionRect.width, labelRect.right) - Math.min(projectionRect.left, labelRect.left),
      height: Math.max(projectionRect.top + projectionRect.height, labelRect.bottom) - Math.min(projectionRect.top, labelRect.top),
    } : undefined;
    const rectGap = (first: { left: number; top: number; width: number; height: number } | undefined, second: { left: number; top: number; width: number; height: number } | undefined) => {
      if (!first || !second) return 0;
      const horizontal = Math.max(first.left - (second.left + second.width), second.left - (first.left + first.width), 0);
      const vertical = Math.max(first.top - (second.top + second.height), second.top - (first.top + first.height), 0);
      return Math.hypot(horizontal, vertical);
    };
    if (process.env.NODE_ENV === "development") {
      const countryComponents = location?.locationType === "country" && boundary?.geometry ? polygonComponents(boundary.geometry).map((polygon, index) => {
        const vertices = polygon.flat();
        const longitudes = vertices.map(([longitude]) => longitude);
        const latitudes = vertices.map(([, latitude]) => latitude);
        return { index, vertexCount: vertices.length, bbox: { minLongitude: Math.min(...longitudes), maxLongitude: Math.max(...longitudes), minLatitude: Math.min(...latitudes), maxLatitude: Math.max(...latitudes) }, approximateArea: polygonArea(polygon), centroid: [longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length, latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length] };
      }) : [];
      const primaryComponentIndex = countryComponents.reduce((best, component) => component.approximateArea > (countryComponents[best]?.approximateArea ?? -1) ? component.index : best, 0);
      const qa = { searching: searchActive, idleRotationSpeed, targetRotationSpeed, currentRotationSpeed: rotationSpeed.current, speedMultiplier: rotationSpeed.current / idleRotationSpeed };
      (window as Window & { __BV01_GLOBE_QA__?: typeof qa }).__BV01_GLOBE_QA__ = qa;
      const locationQa = {
        query: location?.query ?? "", resolved: Boolean(resolvedPoint), resolvedName: location?.resolvedName,
        locationType: location?.locationType ?? "global", latitude: location?.latitude, longitude: location?.longitude,
        candidateCount: location?.candidateCount ?? 0, selectedDisplayName: location?.selectedDisplayName,
        category: location?.category, type: location?.type, rejectedPoiCount: location?.rejectedPoiCount ?? 0,
        country: location?.country, region: location?.region, boundaryId: location?.boundaryId,
        countryComponentCount: countryComponents.length, countryComponents, primaryComponentIndex,
        primaryComponentAreaRatio: countryComponents[primaryComponentIndex] ? countryComponents[primaryComponentIndex].approximateArea / countryComponents.reduce((sum, component) => sum + component.approximateArea, 0) : 0,
        primaryComponentScreenWidth: boundaryVisual.current.primaryScreenWidth, primaryComponentScreenHeight: boundaryVisual.current.primaryScreenHeight,
        primaryLongestDimensionPx: boundaryVisual.current.primaryLongestDimension,
        primaryMapViewportRect,
        primaryMapViewportCenterX: primaryMapViewportRect ? primaryMapViewportRect.left + primaryMapViewportRect.width / 2 : undefined,
        secondaryComponentsTotal: boundaryVisual.current.secondaryTotal, secondaryComponentsRendered: boundaryVisual.current.secondaryRendered,
        secondaryComponentsOmittedForLegibility: Math.max(0, boundaryVisual.current.secondaryTotal - boundaryVisual.current.secondaryRendered),
        locationModel: "area-based",
        boundaryAvailable: Boolean(boundary?.available && boundary.geometry), boundaryGeometryType: boundary?.geometry?.type,
        boundarySource: boundary?.source, originalVertexCount: boundary?.originalVertexCount ?? 0, simplifiedVertexCount: boundary?.simplifiedVertexCount ?? 0,
        surfaceBoundaryReady: boundaryVisual.current.surfaceReady, surfaceBoundaryVisible: boundaryVisual.current.surfaceVisible,
        boundaryTraceProgress: boundaryVisual.current.traceProgress, projectionVisible: boundaryVisual.current.projectionVisible,
        projectionScale: boundaryVisual.current.projectionScale, projectionReady: boundaryVisual.current.projectionReady,
        projectionRenderVisible: boundaryVisual.current.projectionRenderVisible, projectionHumanVisible: boundaryVisual.current.projectionHumanVisible,
        projectionObjectVisible: boundaryVisual.current.projectionObjectVisible, projectionParentVisible: boundaryVisual.current.projectionParentVisible,
        projectionWorldScale: boundaryVisual.current.projectionWorldScale,
        projectionScreenWidth: boundaryVisual.current.projectionScreenWidth, projectionScreenHeight: boundaryVisual.current.projectionScreenHeight,
        projectionOffsetScreenX: boundaryVisual.current.projectionOffsetScreenX, projectionOffsetScreenY: boundaryVisual.current.projectionOffsetScreenY,
        projectionExtractionProgress: boundaryVisual.current.projectionExtractionProgress,
        projectionWorldPosition: boundaryVisual.current.projectionWorldPosition, projectionScreenCenterX: boundaryVisual.current.projectionOffsetScreenX + canvasRect.left + canvasRect.width / 2,
        projectionScreenCenterY: -boundaryVisual.current.projectionOffsetScreenY + canvasRect.top + canvasRect.height / 2,
        projectionOpacity: boundaryVisual.current.projectionOpacity, projectionFacingDot: boundaryVisual.current.projectionFacingDot,
        projectionCameraSpaceDepth: boundaryVisual.current.projectionCameraSpaceDepth, globeFrontCameraSpaceDepth: boundaryVisual.current.globeFrontCameraSpaceDepth,
        projectionInFrontOfGlobe: boundaryVisual.current.projectionInFrontOfGlobe, projectionDepthTest: boundaryVisual.current.projectionDepthTest,
        projectionDepthWrite: boundaryVisual.current.projectionDepthWrite, projectionFrustumCulled: boundaryVisual.current.projectionFrustumCulled,
        desiredProjectionScreenX: boundaryVisual.current.desiredProjectionScreenX + canvasRect.left, desiredProjectionScreenY: boundaryVisual.current.desiredProjectionScreenY + canvasRect.top,
        actualProjectionScreenX: boundaryVisual.current.projectionOffsetScreenX + canvasRect.left + canvasRect.width / 2,
        actualProjectionScreenY: -boundaryVisual.current.projectionOffsetScreenY + canvasRect.top + canvasRect.height / 2,
        screenRoundTripErrorPx: boundaryVisual.current.projectionRoundTripErrorPx,
        projectionRootScreenX: boundaryVisual.current.desiredProjectionScreenX + canvasRect.left,
        projectionRootScreenY: boundaryVisual.current.desiredProjectionScreenY + canvasRect.top,
        projectionGeometryCenterScreenX: boundaryVisual.current.projectionOffsetScreenX + canvasRect.left + canvasRect.width / 2,
        projectionGeometryCenterScreenY: -boundaryVisual.current.projectionOffsetScreenY + canvasRect.top + canvasRect.height / 2,
        projectionLocalBoundsCenterBefore: boundaryVisual.current.localBoundsCenterBefore,
        projectionLocalBoundsCenterAfter: boundaryVisual.current.localBoundsCenterAfter,
        projectionRootToGeometryCenterErrorPx: boundaryVisual.current.projectionRootToGeometryCenterErrorPx,
        floatingProjectionDrawProgress: boundaryVisual.current.floatingProjectionDrawProgress,
        primaryOutlineEffectiveOpacity: boundaryVisual.current.primaryOutlineEffectiveOpacity, primaryOutlineScreenWidthPx: boundaryVisual.current.primaryOutlineScreenWidthPx,
        projectionGeometryVertexCount: boundaryVisual.current.projectionGeometryVertexCount, projectionInsideCanvas: !clipped(projectionRect),
        currentGlobePhase: !globalSearch.current.completed ? "global-search" : acquisition.current.started && !acquisition.current.completed ? "area-acquisition" : boundaryVisual.current.projectionReady ? "area-active" : "boundary-trace",
        areaVisualMode: boundary?.available ? "boundary-projection" : resolvedPoint ? "area-acquisition" : "global-scan",
        targetWorld: resolvedPoint?.toArray(), targetVisible: visible, acquisitionStarted: acquisition.current.started,
        acquisitionCompleted: acquisition.current.completed, globalFallback: !resolvedPoint, searchPhase,
        globalSearchRevolutions: GLOBAL_SEARCH_REVOLUTIONS, globalSearchRotationDeg: 720,
        globalSearchSpinCompleted: globalSearch.current.completed,
        spin2CompletedAt: timing.current.spin2CompletedAt, targetSteeringStartedAt: timing.current.targetSteeringStartedAt,
        targetSteeringCompletedAt: timing.current.targetSteeringCompletedAt,
        targetLocalDirection: resolvedPoint?.clone().normalize().toArray(), targetWorldDirection: targetWorldDirection?.toArray(),
        cameraFacingDirection: cameraFacingDirection?.toArray(), targetFrontDot, targetScreenNdcX, targetScreenNdcY,
        targetDistanceFromGlobeScreenCenter, globeYaw: globe.current.rotation.y, globePitch: globe.current.rotation.x,
        projectionRect,
        globeCanvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
        globeStageRect: stageRect ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height } : undefined,
        globeScreenRect,
        projectionOverlapGlobe: overlaps(projectionRect, globeScreenRect),
        projectionToGlobeGapPx: rectGap(projectionRect, globeScreenRect),
        projectionOverlapMainConsole: overlaps(projectionRect, compositionRects.current.console), projectionClippedByCanvas: clipped(projectionRect),
        labelRect: labelRect ? { left: labelRect.left, top: labelRect.top, width: labelRect.width, height: labelRect.height } : undefined,
        countryLabelViewportRect: labelRect ? { left: labelRect.left, top: labelRect.top, width: labelRect.width, height: labelRect.height } : undefined,
        countryLabelViewportCenterX: labelRect ? labelRect.left + labelRect.width / 2 : undefined,
        countryLabelMapCenterDeltaX: labelRect && primaryMapViewportRect ? (labelRect.left + labelRect.width / 2) - (primaryMapViewportRect.left + primaryMapViewportRect.width / 2) : undefined,
        countryLabelToMapGapPx: labelRect && primaryMapViewportRect ? primaryMapViewportRect.top - labelRect.bottom : undefined,
        labelOverlapMainConsole: overlaps(labelRect, compositionRects.current.console), labelClippedByCanvas: clipped(labelRect),
        combinedCalloutRect, combinedCalloutInsideCanvas: !clipped(combinedCalloutRect), combinedCalloutOverlapMainConsole: overlaps(combinedCalloutRect, compositionRects.current.console),
        calloutFitsCanvas: !clipped(combinedCalloutRect),
        availablePixelsAboveGlobe: globeScreenRect.top - canvasRect.top,
        // The compensated canvas uses the original stage center and diameter
        // as the explicit visual baseline; these values make drift observable.
        visibleGlobeScreenRectBefore: stageRect ? { left: globeScreenRect.left, top: stageRect.top + (stageRect.height - globeScreenRect.height) / 2, width: globeScreenRect.width, height: globeScreenRect.height } : undefined,
        visibleGlobeScreenRectAfter: globeScreenRect,
        visibleGlobePositionDeltaPx: stageRect ? Math.hypot((globeScreenRect.left + globeScreenRect.width / 2) - (stageRect.left + stageRect.width / 2), (globeScreenRect.top + globeScreenRect.height / 2) - (stageRect.top + stageRect.height / 2)) : undefined,
        surfaceAreaCueVisible: false, areaAcquisitionReticleVisible: false,
        labelOpacity: labelRect ? Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".hero-globe-stage__location-label") ?? document.documentElement).opacity) : 0,
        guideRayCount: boundary?.available ? 2 : 0, guideRayFinalOpacity: boundaryVisual.current.projectionReady ? .1 : .24,
        globalScanVisualActive: Boolean(scan.current?.visible), localAreaScanActive: Boolean(locationLocked && resolvedPoint),
      };
      (window as Window & { __BV01_GLOBE_LOCATION_QA__?: typeof locationQa }).__BV01_GLOBE_LOCATION_QA__ = locationQa;
    }
    if (searchActive && !reducedMotion && !interaction.active && !globalSearch.current.completed) {
      const sequence = globalSearch.current;
      const nowMs = frameState.clock.elapsedTime * 1_000;
      if (!sequence.started) {
        sequence.started = true;
        sequence.startAtMs = nowMs;
        sequence.startY = globe.current.rotation.y;
      }
      const progress = Math.min(1, (nowMs - sequence.startAtMs) / GLOBAL_SEARCH_SPIN_DURATION_MS);
      globe.current.rotation.y = sequence.startY + GLOBAL_SEARCH_ROTATION_RAD * globalSearchProgress(progress);
      if (progress >= 1) {
        sequence.completed = true;
        timing.current.spin2CompletedAt = nowMs;
      }
      return;
    }
    if (searchActive && reducedMotion && !globalSearch.current.completed) globalSearch.current.completed = true;
    if (resolvedPoint && searchActive && !interaction.active) {
      const center = globe.current.getWorldPosition(new Vector3());
      const targetLocalDirection = resolvedPoint.clone().normalize();
      const cameraWorldDirection = frameState.camera.position.clone().sub(center).normalize();
      const parentQuaternion = globe.current.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
      const cameraDirectionInParent = cameraWorldDirection.clone().applyQuaternion(parentQuaternion.invert());
      const targetQuaternion = new Quaternion().setFromUnitVectors(targetLocalDirection, cameraDirectionInParent);
      const quaternionAngle = globe.current.quaternion.angleTo(targetQuaternion);
      if (reducedMotion) {
        if (!acquisition.current.reducedMotionAligned) {
          globe.current.quaternion.copy(targetQuaternion);
          acquisition.current = { started: true, completed: true, reducedMotionAligned: true };
          timing.current.targetSteeringStartedAt = frameState.clock.elapsedTime * 1_000;
          timing.current.targetSteeringCompletedAt = timing.current.targetSteeringStartedAt;
          lockLocation();
        }
      } else if (quaternionAngle > .012) {
        if (!acquisition.current.started) {
          timing.current.targetSteeringStartedAt = frameState.clock.elapsedTime * 1_000;
        }
        acquisition.current.started = true;
        globe.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-4.8 * delta));
        return;
      } else {
        acquisition.current.completed = true;
        timing.current.targetSteeringCompletedAt ||= frameState.clock.elapsedTime * 1_000;
        lockLocation();
      }
    }
    if (resolvedPoint && searchActive && acquisition.current.completed) return;
    if (!canAutoRotate(reducedMotion, interaction.active, frameState.clock.elapsedTime * 1_000, interaction.resumeAt)) return;
    interaction.autoBlend = Math.min(1, interaction.autoBlend + delta * 1.25);
    globe.current.rotation.y += delta * rotationSpeed.current * interaction.autoBlend;
  });

  const releasePointer = (event: ThreeEvent<PointerEvent>) => {
    const interaction = drag.current;
    if (!interaction.active) return;
    interaction.active = false;
    interaction.resumeAt = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS;
    interaction.autoBlend = 0;
    (event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void }).releasePointerCapture?.(event.pointerId);
    onInteractionChange?.("hover");
  };

  const rotateFromPointer = (event: ThreeEvent<PointerEvent>) => {
    const interaction = drag.current;
    if (!interaction.active || !globe.current) return;
    globe.current.rotation.y += (event.clientX - interaction.lastX) * 0.008;
    globe.current.rotation.x = clampGlobePitch(globe.current.rotation.x + (event.clientY - interaction.lastY) * 0.006);
    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;
    event.stopPropagation();
  };

  return <group ref={globe} position={position} scale={scale} onPointerOver={() => onInteractionChange?.("hover")} onPointerOut={() => { if (!drag.current.active) onInteractionChange?.("idle"); }} onPointerDown={(event) => {
    event.stopPropagation();
    drag.current.active = true;
    drag.current.lastX = event.clientX;
    drag.current.lastY = event.clientY;
    drag.current.autoBlend = 0;
    (event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void }).setPointerCapture?.(event.pointerId);
    onInteractionChange?.("drag");
  }} onPointerMove={rotateFromPointer} onPointerUp={releasePointer} onPointerCancel={releasePointer}>
    <mesh><sphereGeometry args={[0.52, 24, 16]} /><meshBasicMaterial color="#167da5" transparent opacity={.12 + visual.globeOpacity * .32} depthWrite={false} /></mesh>
    <mesh><sphereGeometry args={[0.54, 16, 12]} /><meshBasicMaterial color={visual.primary} transparent opacity={visual.globeOpacity * .055} wireframe depthWrite={false} /></mesh>
    <mesh rotation={[0, EARTH_TEXTURE_Y_OFFSET, 0]}><sphereGeometry args={[0.551, 32, 20]} /><meshBasicMaterial map={earthTexture} transparent opacity={Math.min(.78, .48 + visual.globeOpacity)} depthWrite={false} toneMapped={false} /></mesh>
    <mesh rotation={[0, EARTH_TEXTURE_Y_OFFSET, 0]}><sphereGeometry args={[0.557, 32, 20]} /><meshBasicMaterial map={coastTexture} transparent opacity={Math.min(.9, .52 + visual.globeOpacity * 1.1)} depthWrite={false} toneMapped={false} /></mesh>
    <mesh><sphereGeometry args={[0.565, 32, 20]} /><meshBasicMaterial ref={atmosphere} color="#a7f4ff" transparent opacity={.045} side={BackSide} blending={AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    {searchActive ? <group ref={scan}>
      <mesh rotation={[Math.PI / 2.65, 0, .5]}><torusGeometry args={[.575, .0018, 5, 32, Math.PI * .72]} /><meshBasicMaterial color="#d8fbff" transparent opacity={.3} blending={AdditiveBlending} depthWrite={false} /></mesh>
      <mesh position={[.33, .23, .44]}><sphereGeometry args={[.012, 8, 8]} /><meshBasicMaterial color="#dfffff" transparent opacity={.9} blending={AdditiveBlending} depthWrite={false} /></mesh>
      <mesh position={[-.43, -.13, .34]}><sphereGeometry args={[.009, 8, 8]} /><meshBasicMaterial color="#78e7ff" transparent opacity={.8} blending={AdditiveBlending} depthWrite={false} /></mesh>
    </group> : null}
    {resolvedPoint && locationLocked && targetVisible && boundary?.available && boundary.geometry ? <BoundaryHologram boundary={boundary} anchor={resolvedPoint} country={location?.locationType === "country"} visible={targetVisible} reducedMotion={reducedMotion} visual={boundaryVisual} /> : null}
    {resolvedPoint && locationLocked && !boundary?.available ? <AreaAcquisition position={resolvedPoint} visible={targetVisible} country={location?.locationType === "country"} active={searchActive} /> : null}
    {showGeoCalibration ? <GeographicCalibrationMarkers /> : null}
    <pointLight color={visual.primary} intensity={visual.globeLight} distance={2.5} />
  </group>;
}

function GeographicCalibrationMarkers() {
  const markers = [
    { name: "A Coruña", latitude: 43.36, longitude: -8.41 },
    { name: "London", latitude: 51.51, longitude: -.13 },
    { name: "New York", latitude: 40.71, longitude: -74.01 },
    { name: "Tokyo", latitude: 35.68, longitude: 139.69 },
    { name: "Sydney", latitude: -33.87, longitude: 151.21 },
  ];
  return <group>{markers.map((marker) => <mesh key={marker.name} position={geoToGlobeLocal(marker.latitude, marker.longitude, .583)}><sphereGeometry args={[.012, 8, 8]} /><meshBasicMaterial color="#ffdf78" transparent opacity={.96} depthWrite={false} /></mesh>)}</group>;
}

type BoundaryLine = { line: Line; geometry: BufferGeometry; count: number; componentIndex?: number; primary?: boolean };

function polygonComponents(geometry: NonNullable<GlobeBoundary["geometry"]>) {
  return geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][];
}

function polygonArea(polygon: number[][][]) {
  return Math.abs((polygon[0] ?? []).reduce((area, point, index, ring) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    return area + (point[0] * next[1] - next[0] * point[1]);
  }, 0) / 2);
}

function boundaryLineBounds(lines: BoundaryLine[]) {
  const points = lines.flatMap(({ geometry }) => {
    const position = geometry.getAttribute("position");
    return Array.from({ length: position.count }, (_, index) => new Vector3(position.getX(index), position.getY(index), position.getZ(index)));
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function recenterBoundaryLines(lines: BoundaryLine[], centerX: number, centerY: number) {
  lines.forEach(({ geometry }) => geometry.translate(-centerX, -centerY, 0));
}

function createLine(points: Vector3[], color: string, opacity: number, componentIndex?: number, primary?: boolean): BoundaryLine | undefined {
  if (points.length < 2) return undefined;
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points.flatMap((point) => point.toArray()), 3));
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  return { line, geometry, count: points.length, componentIndex, primary };
}

function projectionLinesForPolygon(polygon: number[][][], radius: number, offset: Vector3, color: string, opacity: number, componentIndex: number, primary: boolean) {
  const vertices = polygon.flat();
  const minLongitude = Math.min(...vertices.map(([longitude]) => longitude));
  const maxLongitude = Math.max(...vertices.map(([longitude]) => longitude));
  const minLatitude = Math.min(...vertices.map(([, latitude]) => latitude));
  const maxLatitude = Math.max(...vertices.map(([, latitude]) => latitude));
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const extent = Math.max(.0001, (maxLongitude - minLongitude) * Math.cos(centerLatitude * Math.PI / 180), maxLatitude - minLatitude);
  return polygon.flatMap((ring) => {
    const points = ring.map(([longitude, latitude]) => new Vector3(
      ((longitude - centerLongitude) * Math.cos(centerLatitude * Math.PI / 180) / extent) * radius + offset.x,
      ((latitude - centerLatitude) / extent) * radius + offset.y,
      offset.z,
    ));
    const line = createLine(points, color, opacity, componentIndex, primary);
    return line ? [line] : [];
  });
}

function createCountryProjectionLayout(boundary: GlobeBoundary, radius: number) {
  if (!boundary.geometry) return { lines: [] as BoundaryLine[], glowLines: [] as BoundaryLine[], primaryIndex: -1, components: [] as { index: number; vertexCount: number; area: number }[], secondaryTotal: 0, secondaryRendered: 0 };
  const polygons = polygonComponents(boundary.geometry);
  const components = polygons.map((polygon, index) => ({ index, vertexCount: polygon.flat().length, area: polygonArea(polygon) }));
  const primaryIndex = components.reduce((best, component) => component.area > (components[best]?.area ?? -1) ? component.index : best, 0);
  const primaryArea = components[primaryIndex]?.area ?? 1;
  const lines: BoundaryLine[] = [];
  const glowLines: BoundaryLine[] = [];
  // The floating callout is a single country-reading aid. Detached overseas
  // components remain fully present on the Earth surface and in source/QA,
  // but do not become a cartographic legend beside the hero silhouette.
  const rankedSecondary: number[] = [];
  polygons.forEach((polygon, index) => {
    const primary = index === primaryIndex;
    const ratio = components[index].area / primaryArea;
    if (!primary && !rankedSecondary.includes(index)) return; // retained on Earth/source data; omitted only from the readable callout.
    const insetIndex = rankedSecondary.indexOf(index);
    const insetColumn = insetIndex % 2;
    const insetRow = Math.floor(insetIndex / 2);
    const offset = primary ? new Vector3() : new Vector3(.18 + insetColumn * .095, -.2 - insetRow * .09, 0);
    const componentRadius = primary ? radius : MathUtils.clamp(radius * (.13 + Math.sqrt(ratio) * .18), .035, .09);
    lines.push(...projectionLinesForPolygon(polygon, componentRadius, offset, "#d9fbff", primary ? .96 : .56, index, primary));
    glowLines.push(...projectionLinesForPolygon(polygon, componentRadius, offset.clone().setZ(-.003), "#46dfff", primary ? .32 : .16, index, primary));
  });
  return { lines, glowLines, primaryIndex, components, secondaryTotal: components.length - 1, secondaryRendered: rankedSecondary.length };
}

function createSurfaceLines(boundary: GlobeBoundary) {
  if (!boundary.geometry) return [];
  return boundaryRings(boundary.geometry).flatMap((ring) => {
    const line = createLine(ring.map(([longitude, latitude]) => geoToGlobeLocal(latitude, longitude).multiplyScalar(1.012)), "#aaf5ff", .9);
    return line ? [line] : [];
  });
}

function createProjectionLines(boundary: GlobeBoundary, radius: number) {
  if (!boundary.geometry) return [];
  const rings = boundaryRings(boundary.geometry);
  const vertices = rings.flat();
  const minLongitude = Math.min(...vertices.map(([longitude]) => longitude));
  const maxLongitude = Math.max(...vertices.map(([longitude]) => longitude));
  const minLatitude = Math.min(...vertices.map(([, latitude]) => latitude));
  const maxLatitude = Math.max(...vertices.map(([, latitude]) => latitude));
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const width = Math.max(.0001, (maxLongitude - minLongitude) * Math.cos(centerLatitude * Math.PI / 180));
  const height = Math.max(.0001, maxLatitude - minLatitude);
  const extent = Math.max(width, height);
  return rings.flatMap((ring) => {
    const line = createLine(ring.map(([longitude, latitude]) => new Vector3(((longitude - centerLongitude) * Math.cos(centerLatitude * Math.PI / 180) / extent) * radius, ((latitude - centerLatitude) / extent) * radius, 0)), "#d9fbff", .96);
    return line ? [line] : [];
  });
}

function createProjectionGlowLines(boundary: GlobeBoundary, radius: number) {
  if (!boundary.geometry) return [];
  const rings = boundaryRings(boundary.geometry);
  const vertices = rings.flat();
  const minLongitude = Math.min(...vertices.map(([longitude]) => longitude));
  const maxLongitude = Math.max(...vertices.map(([longitude]) => longitude));
  const minLatitude = Math.min(...vertices.map(([, latitude]) => latitude));
  const maxLatitude = Math.max(...vertices.map(([, latitude]) => latitude));
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const extent = Math.max(.0001, (maxLongitude - minLongitude) * Math.cos(centerLatitude * Math.PI / 180), maxLatitude - minLatitude);
  return rings.flatMap((ring) => {
    const line = createLine(ring.map(([longitude, latitude]) => new Vector3(((longitude - centerLongitude) * Math.cos(centerLatitude * Math.PI / 180) / extent) * radius, ((latitude - centerLatitude) / extent) * radius, -.003)), "#46dfff", .32);
    return line ? [line] : [];
  });
}

function BoundaryHologram({ boundary, anchor, country, visible, reducedMotion, visual }: { boundary: GlobeBoundary; anchor: Vector3; country: boolean; visible: boolean; reducedMotion: boolean; visual: MutableRefObject<BoundaryVisualStatus> }) {
  const startAt = useRef<number | undefined>(undefined);
  const projection = useRef<Group>(null);
  const labelElement = useRef<HTMLElement | null>(null);
  const normalizedScreenScale = useRef(1);
  const screenNormalized = useRef(false);
  const finalScreenSize = useRef({ width: 0, height: 0 });
  const desiredCalloutScreen = useRef({ x: 0, y: 0 });
  const surfaceLines = useMemo(() => createSurfaceLines(boundary), [boundary]);
  const projectionRadius = useMemo(() => {
    if (!boundary.geometry) return .2;
    const vertices = boundaryRings(boundary.geometry).flat();
    const longitudes = vertices.map(([longitude]) => longitude);
    const latitudes = vertices.map(([, latitude]) => latitude);
    const latitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
    const extent = Math.max((Math.max(...longitudes) - Math.min(...longitudes)) * Math.cos(latitude * Math.PI / 180), Math.max(...latitudes) - Math.min(...latitudes));
    return MathUtils.clamp(.35 - Math.min(.075, Math.log10(extent + 1) * .065), .275, .35);
  }, [boundary]);
  const countryLayout = useMemo(() => country ? createCountryProjectionLayout(boundary, projectionRadius) : undefined, [boundary, country, projectionRadius]);
  const { projectionLines, projectionGlowLines, localBoundsBefore, localBoundsAfter } = useMemo(() => {
    const lines = countryLayout?.lines ?? createProjectionLines(boundary, projectionRadius);
    const glowLines = countryLayout?.glowLines ?? createProjectionGlowLines(boundary, projectionRadius);
    const before = boundaryLineBounds(lines);
    if (!countryLayout) {
      recenterBoundaryLines(lines, before.centerX, before.centerY);
      recenterBoundaryLines(glowLines, before.centerX, before.centerY);
    }
    return { projectionLines: lines, projectionGlowLines: glowLines, localBoundsBefore: before, localBoundsAfter: boundaryLineBounds(lines) };
  }, [boundary, countryLayout, projectionRadius]);
  const debugProjection = process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bvgeodebug");
  const projectionVertices = useMemo(() => projectionLines.flatMap(({ geometry }) => {
    const attribute = geometry.getAttribute("position");
    return Array.from({ length: attribute.count }, (_, index) => new Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index)));
  }), [projectionLines]);
  const primaryProjectionVertices = useMemo(() => projectionLines.filter(({ primary }) => primary).flatMap(({ geometry }) => {
    const attribute = geometry.getAttribute("position");
    return Array.from({ length: attribute.count }, (_, index) => new Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index)));
  }), [projectionLines]);
  const debugBoundsLines = useMemo(() => {
    if (!debugProjection || !projectionVertices.length) return [];
    const minX = Math.min(...projectionVertices.map((point) => point.x));
    const maxX = Math.max(...projectionVertices.map((point) => point.x));
    const minY = Math.min(...projectionVertices.map((point) => point.y));
    const maxY = Math.max(...projectionVertices.map((point) => point.y));
    const rectangle = createLine([new Vector3(minX, minY, .004), new Vector3(maxX, minY, .004), new Vector3(maxX, maxY, .004), new Vector3(minX, maxY, .004), new Vector3(minX, minY, .004)], "#ff5eea", 1);
    const cross = createLine([new Vector3((minX + maxX) / 2 - .018, (minY + maxY) / 2, .005), new Vector3((minX + maxX) / 2 + .018, (minY + maxY) / 2, .005), new Vector3((minX + maxX) / 2, (minY + maxY) / 2 - .018, .005), new Vector3((minX + maxX) / 2, (minY + maxY) / 2 + .018, .005)], "#ffd35e", 1);
    return [rectangle, cross].filter((line): line is BoundaryLine => Boolean(line));
  }, [debugProjection, projectionVertices]);
  const normal = useMemo(() => anchor.clone().normalize(), [anchor]);
  const projectionQuaternion = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal), [normal]);
  const guideLines = useMemo(() => {
    const side = new Vector3(0, 1, 0).cross(normal).normalize();
    const offsets = [-.026, .026];
    return offsets.flatMap((offset) => {
      const guide = createLine([normal.clone().multiplyScalar(.59).addScaledVector(side, offset), normal.clone().multiplyScalar(1.12).addScaledVector(side, offset * 1.6)], "#8eecff", .24);
      return guide ? [guide] : [];
    });
  }, [normal]);

  useEffect(() => () => {
    [...surfaceLines, ...projectionLines, ...projectionGlowLines, ...guideLines, ...debugBoundsLines].forEach(({ geometry, line }) => {
      geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
    });
  }, [debugBoundsLines, guideLines, projectionGlowLines, projectionLines, surfaceLines]);

  useEffect(() => {
    labelElement.current = document.querySelector<HTMLElement>(".hero-globe-stage__location-label");
    if (labelElement.current) {
      labelElement.current.style.transition = "opacity 180ms ease";
      labelElement.current.style.opacity = "0";
    }
    return () => {
      if (labelElement.current) {
        labelElement.current.style.removeProperty("opacity");
        labelElement.current.style.removeProperty("transition");
      }
    };
  }, []);

  useEffect(() => {
    // The callout is an intentional holographic overlay, not a surface line.
    // It must remain legible after moving outside the Earth silhouette.
    [...projectionLines, ...projectionGlowLines].forEach(({ line }) => {
      const material = line.material as LineBasicMaterial;
      line.userData.baseOpacity ??= material.opacity;
      material.depthTest = false;
      material.depthWrite = false;
      material.opacity = debugProjection ? 1 : line.userData.baseOpacity ?? material.opacity;
      if (debugProjection) material.color.set("#ffffff");
      line.renderOrder = debugProjection ? 100 : 20;
    });
  }, [debugProjection, projectionGlowLines, projectionLines]);

  useFrame((frameState) => {
    const now = frameState.clock.elapsedTime * 1_000;
    startAt.current ??= now;
    const traceProgress = reducedMotion ? 1 : Math.min(1, (now - startAt.current) / 460);
    const projectionProgress = reducedMotion ? 1 : Math.max(0, Math.min(1, (traceProgress - .38) / .62));
    labelElement.current ??= frameState.gl.domElement.closest(".hero-globe-stage")?.querySelector<HTMLElement>(".hero-globe-stage__location-label") ?? null;
    if (labelElement.current) labelElement.current.style.opacity = String(MathUtils.clamp((projectionProgress - .65) / .35, 0, 1));
    surfaceLines.forEach(({ geometry, count }) => geometry.setDrawRange(0, Math.max(2, Math.floor(count * traceProgress))));
    const secondaryProgress = countryLayout ? MathUtils.clamp((now - startAt.current - 580) / 180, 0, 1) : projectionProgress;
    projectionLines.forEach(({ geometry, count, primary }) => geometry.setDrawRange(0, Math.max(2, Math.floor(count * (primary === false ? secondaryProgress : projectionProgress)))));
    projectionGlowLines.forEach(({ geometry, count, primary }) => geometry.setDrawRange(0, Math.max(2, Math.floor(count * (primary === false ? secondaryProgress : projectionProgress)))));
    guideLines.forEach(({ geometry, count }) => geometry.setDrawRange(0, Math.max(2, Math.floor(count * projectionProgress))));
    const canvasRect = frameState.gl.domElement.getBoundingClientRect();
    if (projection.current) {
      const parent = projection.current.parent;
      if (parent) {
        const parentQuaternion = parent.getWorldQuaternion(new Quaternion()).invert();
        projection.current.quaternion.copy(parentQuaternion.multiply(frameState.camera.quaternion));
        const originLocal = normal.clone().multiplyScalar(.64);
        const globeCenter = parent.getWorldPosition(new Vector3());
        const cameraToGlobe = globeCenter.clone().sub(frameState.camera.position).normalize();
        const globeScale = parent.getWorldScale(new Vector3()).x;
        // A screen-safe callout plane sits beyond the front atmosphere, not at
        // the selected surface point's depth where the Earth can occlude it.
        const calloutPlanePoint = globeCenter.clone().addScaledVector(cameraToGlobe, -(.575 * globeScale + .18));
        const cameraUp = new Vector3(0, 1, 0).applyQuaternion(frameState.camera.quaternion);
        const globeTopNdc = globeCenter.clone().addScaledVector(cameraUp, .575 * globeScale).project(frameState.camera);
        const globeTopScreenY = (1 - globeTopNdc.y) * canvasRect.height / 2;
        const mapHeight = finalScreenSize.current.height || (country ? 120 : 100);
        const desiredScreenY = globeTopScreenY - 28 - mapHeight / 2;
        desiredCalloutScreen.current = { x: canvasRect.width / 2, y: desiredScreenY };
        const desiredNdc = new Vector3(0, 1 - desiredScreenY * 2 / canvasRect.height, .5);
        const rayPoint = desiredNdc.clone().unproject(frameState.camera);
        const rayDirection = rayPoint.sub(frameState.camera.position).normalize();
        const denominator = rayDirection.dot(cameraToGlobe);
        const planeDistance = Math.abs(denominator) > .0001 ? calloutPlanePoint.clone().sub(frameState.camera.position).dot(cameraToGlobe) / denominator : 0;
        const safeTargetWorld = frameState.camera.position.clone().addScaledVector(rayDirection, planeDistance);
        const safeTargetLocal = parent.worldToLocal(safeTargetWorld);
        projection.current.position.copy(originLocal.lerp(safeTargetLocal, projectionProgress));
        // The guides are a short Earth-to-map explanation, never an orbit.
        guideLines.forEach(({ line, geometry }, index) => {
          (line.material as LineBasicMaterial).opacity = projectionProgress >= 1 ? .1 : .24;
          const side = new Vector3(0, 1, 0).cross(normal).normalize().multiplyScalar(index === 0 ? -.018 : .018);
          const start = normal.clone().multiplyScalar(.59).add(side);
          const end = projection.current!.position.clone().add(side.multiplyScalar(.45));
          const attribute = geometry.getAttribute("position");
          attribute.setXYZ(0, start.x, start.y, start.z);
          attribute.setXYZ(1, end.x, end.y, end.z);
          attribute.needsUpdate = true;
        });
      }
      const extractionScale = .3 + projectionProgress * .7;
      projection.current.scale.setScalar(extractionScale * normalizedScreenScale.current);
      projection.current.visible = projectionProgress > 0;
      projection.current.updateWorldMatrix(true, false);
    }
    const center = projection.current?.getWorldPosition(new Vector3());
    const projectedVertices = projection.current ? projectionVertices.map((point) => projection.current!.localToWorld(point.clone()).project(frameState.camera)) : [];
    const primaryProjectedVertices = projection.current ? primaryProjectionVertices.map((point) => projection.current!.localToWorld(point.clone()).project(frameState.camera)) : [];
    const minX = projectedVertices.length ? Math.min(...projectedVertices.map((point) => point.x)) : 0;
    const maxX = projectedVertices.length ? Math.max(...projectedVertices.map((point) => point.x)) : 0;
    const minY = projectedVertices.length ? Math.min(...projectedVertices.map((point) => point.y)) : 0;
    const maxY = projectedVertices.length ? Math.max(...projectedVertices.map((point) => point.y)) : 0;
    const measuredWidth = (maxX - minX) * canvasRect.width / 2;
    const measuredHeight = (maxY - minY) * canvasRect.height / 2;
    const measuredLongest = Math.max(measuredWidth, measuredHeight);
    const primaryMinX = primaryProjectedVertices.length ? Math.min(...primaryProjectedVertices.map((point) => point.x)) : minX;
    const primaryMaxX = primaryProjectedVertices.length ? Math.max(...primaryProjectedVertices.map((point) => point.x)) : maxX;
    const primaryMinY = primaryProjectedVertices.length ? Math.min(...primaryProjectedVertices.map((point) => point.y)) : minY;
    const primaryMaxY = primaryProjectedVertices.length ? Math.max(...primaryProjectedVertices.map((point) => point.y)) : maxY;
    const primaryWidth = (primaryMaxX - primaryMinX) * canvasRect.width / 2;
    const primaryHeight = (primaryMaxY - primaryMinY) * canvasRect.height / 2;
    const primaryLongest = Math.max(primaryWidth, primaryHeight);
    const primaryCenterX = (primaryMinX + primaryMaxX) * canvasRect.width / 4 + canvasRect.width / 2;
    const primaryCenterY = -(primaryMinY + primaryMaxY) * canvasRect.height / 4 + canvasRect.height / 2;
    if (!screenNormalized.current && projectionProgress >= .98 && measuredLongest > 1) {
      normalizedScreenScale.current *= MathUtils.clamp((country ? 135 : 125) / (country && primaryProjectionVertices.length ? primaryLongest : measuredLongest), .05, 2);
      screenNormalized.current = true;
    }
    if (screenNormalized.current) finalScreenSize.current = { width: measuredWidth, height: measuredHeight };
    const projectionNormal = projection.current ? new Vector3(0, 0, 1).applyQuaternion(projection.current.getWorldQuaternion(new Quaternion())).normalize() : new Vector3();
    const projectionFacingDot = center ? projectionNormal.dot(frameState.camera.position.clone().sub(center).normalize()) : 0;
    const desiredScreenX = desiredCalloutScreen.current.x || canvasRect.width / 2;
    const desiredScreenY = desiredCalloutScreen.current.y || canvasRect.height * .09;
    const actualScreenX = (minX + maxX) * canvasRect.width / 4 + canvasRect.width / 2;
    const actualScreenY = -(minY + maxY) * canvasRect.height / 4 + canvasRect.height / 2;
    const roundTripError = Math.hypot(actualScreenX - desiredScreenX, actualScreenY - desiredScreenY);
    if (labelElement.current && projectionProgress >= .65) {
      const stage = frameState.gl.domElement.closest(".hero-globe-stage");
      const stageRect = stage?.getBoundingClientRect();
      const labelHeight = labelElement.current.getBoundingClientRect().height;
      if (stageRect) {
        labelElement.current.style.left = `${canvasRect.left + primaryCenterX - stageRect.left}px`;
        labelElement.current.style.top = `${canvasRect.top + primaryCenterY - primaryHeight / 2 - labelHeight - 10 - stageRect.top}px`;
      }
    }
    const cameraSpaceCenter = center?.clone().applyMatrix4(frameState.camera.matrixWorldInverse);
    const globeCenter = projection.current?.parent?.getWorldPosition(new Vector3());
    const globeScale = projection.current?.parent?.getWorldScale(new Vector3()).x ?? 1;
    const globeFront = globeCenter?.addScaledVector(frameState.camera.getWorldDirection(new Vector3()), -(.575 * globeScale)).applyMatrix4(frameState.camera.matrixWorldInverse);
    const projectionDepth = cameraSpaceCenter?.z ?? 0;
    const globeFrontDepth = globeFront?.z ?? 0;
    const primaryMaterial = projectionLines[0]?.line.material as LineBasicMaterial | undefined;
    const parentVisible = projection.current?.parent?.visible ?? false;
    const renderVisible = Boolean(visible && projection.current?.visible && parentVisible && projectionProgress >= 1 && screenNormalized.current && measuredLongest >= (country ? 120 : 100) && projectionFacingDot > .7 && roundTripError < 12);
    visual.current = {
      surfaceReady: traceProgress >= 1,
      surfaceVisible: visible,
      traceProgress,
      projectionVisible: visible && projectionProgress > 0,
      projectionReady: projectionProgress >= 1 && screenNormalized.current,
      projectionRenderVisible: renderVisible,
      projectionHumanVisible: renderVisible && measuredLongest <= (country ? 180 : 150),
      projectionObjectVisible: projection.current?.visible ?? false,
      projectionParentVisible: parentVisible,
      projectionScale: projectionRadius * normalizedScreenScale.current,
      projectionWorldScale: projection.current?.getWorldScale(new Vector3()).toArray() ?? [],
      projectionScreenWidth: measuredWidth,
      projectionScreenHeight: measuredHeight,
      primaryScreenWidth: primaryWidth,
      primaryScreenHeight: primaryHeight,
      primaryScreenCenterX: primaryCenterX,
      primaryScreenCenterY: primaryCenterY,
      primaryLongestDimension: primaryLongest,
      secondaryRendered: countryLayout?.secondaryRendered ?? 0,
      secondaryTotal: countryLayout?.secondaryTotal ?? 0,
      projectionOffsetScreenX: ((minX + maxX) / 2) * canvasRect.width / 2,
      projectionOffsetScreenY: -((minY + maxY) / 2) * canvasRect.height / 2,
      desiredProjectionScreenX: desiredScreenX,
      desiredProjectionScreenY: desiredScreenY,
      projectionRoundTripErrorPx: roundTripError,
      projectionExtractionProgress: projectionProgress,
      floatingProjectionDrawProgress: projectionProgress >= 1 ? 1 : projectionProgress,
      projectionWorldPosition: center?.toArray() ?? [],
      projectionOpacity: (primaryMaterial?.opacity ?? 0) * projectionProgress,
      projectionFacingDot,
      projectionCameraSpaceDepth: projectionDepth,
      globeFrontCameraSpaceDepth: globeFrontDepth,
      projectionInFrontOfGlobe: projectionDepth > globeFrontDepth,
      projectionGeometryVertexCount: projectionVertices.length,
      primaryOutlineEffectiveOpacity: primaryMaterial?.opacity ?? 0,
      primaryOutlineScreenWidthPx: 1.25,
      projectionDepthTest: primaryMaterial?.depthTest ?? false,
      projectionDepthWrite: primaryMaterial?.depthWrite ?? false,
      projectionFrustumCulled: projectionLines.some(({ line }) => line.frustumCulled),
      localBoundsCenterBefore: [localBoundsBefore.centerX, localBoundsBefore.centerY],
      localBoundsCenterAfter: [localBoundsAfter.centerX, localBoundsAfter.centerY],
      projectionRootToGeometryCenterErrorPx: [actualScreenX - desiredScreenX, actualScreenY - desiredScreenY],
    };
  });

  return <group visible={visible}>
    {surfaceLines.map(({ line }, index) => <primitive key={`surface-${index}`} object={line} />)}
    {guideLines.map(({ line }, index) => <primitive key={`guide-${index}`} object={line} />)}
    <group ref={projection} position={normal.clone().multiplyScalar(.96)} quaternion={projectionQuaternion} visible={false}>
      <mesh position={[0, 0, -.006]}><planeGeometry args={[projectionRadius * 1.55, .002]} /><meshBasicMaterial color="#a4f5ff" transparent opacity={.2} blending={AdditiveBlending} depthWrite={false} /></mesh>
      <mesh position={[0, projectionRadius * .32, -.006]}><planeGeometry args={[projectionRadius * 1.35, .0015]} /><meshBasicMaterial color="#6ee8ff" transparent opacity={.13} blending={AdditiveBlending} depthWrite={false} /></mesh>
      {projectionGlowLines.map(({ line }, index) => <primitive key={`projection-glow-${index}`} object={line} />)}
      {projectionLines.map(({ line }, index) => <primitive key={`projection-${index}`} object={line} />)}
      {debugBoundsLines.map(({ line }, index) => <primitive key={`debug-bound-${index}`} object={line} />)}
    </group>
  </group>;
}

function AreaAcquisition({ position, visible, country, active }: { position: Vector3; visible: boolean; country: boolean; active: boolean }) {
  const acquisition = useRef<Group>(null);
  useFrame((frameState) => {
    if (!acquisition.current) return;
    const pulse = active ? 1 + Math.sin(frameState.clock.elapsedTime * 4.5) * .12 : 1;
    acquisition.current.scale.setScalar(visible ? pulse : .001);
  });
  const outerRadius = country ? .18 : .115;
  return <group ref={acquisition} position={position} visible={visible}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[outerRadius * .68, outerRadius, 40, 1, .22, Math.PI * 1.55]} /><meshBasicMaterial color="#83ecff" transparent opacity={.46} blending={AdditiveBlending} side={BackSide} depthWrite={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, .6]}><torusGeometry args={[outerRadius, .0025, 5, 42, Math.PI * 1.5]} /><meshBasicMaterial color="#d8fbff" transparent opacity={.8} blending={AdditiveBlending} depthWrite={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, -.75]} scale={.72}><torusGeometry args={[outerRadius, .002, 5, 42, Math.PI * 1.35]} /><meshBasicMaterial color="#5bdfff" transparent opacity={.54} blending={AdditiveBlending} depthWrite={false} /></mesh>
  </group>;
}
