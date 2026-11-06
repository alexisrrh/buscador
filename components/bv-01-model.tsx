"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Vector3 } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BV01_MODEL_URL } from "@/lib/bv01-model-asset";
import { markBV01Load, markBV01LoadAt, measureBV01Load } from "@/lib/bv01-load-metrics";

export { BV01_MODEL_URL } from "@/lib/bv01-model-asset";

// This shares R3F's suspense cache with useLoader below; it does not create a
// second GLB request when the stage mounts.
markBV01Load("gltf-cache-preload");
useLoader.preload(GLTFLoader, BV01_MODEL_URL);

/** Runtime-only presentation of the approved, unmodified BV-01 asset. */
export type BV01FrameSample = {
  frame: number; timestamp: number; canvasWidth: number; canvasHeight: number;
  stageWidth: number; stageHeight: number; cameraAspect: number; cameraFov: number;
  modelPosition: [number, number, number]; modelScale: [number, number, number];
  top: number; bottom: number; left: number; right: number; centerX: number; centerY: number; height: number;
  stableFrames: number; stableMs: number;
  phase: "PREWARM" | "STABLE_CANDIDATE" | "REVEAL_START" | "REVEAL_END";
};

export function BV01Model({ onFrameSample }: { onFrameSample?: (sample: BV01FrameSample) => void }) {
  const gltf = useLoader(GLTFLoader, BV01_MODEL_URL) as GLTF;
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const frame = useRef(0);
  markBV01Load("gltf-parse-complete");
  useFrame(({ camera, gl, clock }) => {
    frame.current += 1;
    if (frame.current === 1) {
      const entries = performance.getEntriesByName(BV01_MODEL_URL, "resource");
      const resource = entries.at(-1) as PerformanceResourceTiming | undefined;
      if (resource) {
        markBV01LoadAt("gltf-request-start", resource.startTime);
        markBV01LoadAt("gltf-response-complete", resource.responseEnd);
        measureBV01Load("gltf-network", "gltf-request-start", "gltf-response-complete");
        measureBV01Load("gltf-parse", "gltf-response-complete", "gltf-parse-complete");
      }
    }

    const box = new Box3().setFromObject(scene);
    const canvas = gl.domElement.getBoundingClientRect();
    const stage = gl.domElement.parentElement?.getBoundingClientRect() ?? canvas;
    const corners = [
      new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.min.z), new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.min.z), new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z),
    ].map((corner) => corner.project(camera));
    const x = corners.map((corner) => canvas.left + ((corner.x + 1) * canvas.width) / 2);
    const y = corners.map((corner) => canvas.top + ((1 - corner.y) * canvas.height) / 2);
    const modelPosition = scene.getWorldPosition(new Vector3());
    const modelScale = scene.getWorldScale(new Vector3());
    const top = Math.min(...y);
    const bottom = Math.max(...y);
    const sample: BV01FrameSample = {
      frame: frame.current, timestamp: clock.getElapsedTime(), canvasWidth: canvas.width, canvasHeight: canvas.height,
      stageWidth: stage.width, stageHeight: stage.height, cameraAspect: "aspect" in camera ? camera.aspect : 0, cameraFov: "fov" in camera ? camera.fov : 0,
      modelPosition: [modelPosition.x, modelPosition.y, modelPosition.z], modelScale: [modelScale.x, modelScale.y, modelScale.z],
      top, bottom, left: Math.min(...x), right: Math.max(...x), centerX: (Math.min(...x) + Math.max(...x)) / 2, centerY: (top + bottom) / 2, height: bottom - top,
      stableFrames: 0, stableMs: 0, phase: "PREWARM",
    };
    onFrameSample?.(sample);
  });
  return <primitive object={scene} scale={3} position={[0.05, 0, 0]} dispose={null} />;
}
