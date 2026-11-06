"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useRef, type ReactNode } from "react";
import { BV01Model, type BV01FrameSample } from "@/components/bv-01-model";
import { BV01Pedestal } from "@/components/bv-01-pedestal";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";

type StageProps = {
  state: BV01VisualState;
  reducedMotion: boolean;
  modelReady: boolean;
  capturePoster?: boolean;
  captureReady?: boolean;
  onModelError: () => void;
  onFrameSample: (sample: BV01FrameSample) => void;
};

export function BV01ThreeStage({ state, reducedMotion, modelReady, capturePoster = false, captureReady = false, onModelError, onFrameSample }: StageProps) {
  const visual = bv01VisualStateMap[state];
  return <div className="bv-01-three" data-testid="bv-01-three-stage" data-state={state.toLowerCase()} data-model-ready={modelReady}>
    <Canvas dpr={reducedMotion ? 1 : [1, 1.5]} frameloop={reducedMotion && modelReady ? "demand" : "always"} camera={{ position: [0, 0, 10.25], fov: 31 }} gl={{ antialias: true, powerPreference: "high-performance", alpha: true, preserveDrawingBuffer: capturePoster }}>
      <ambientLight intensity={0.52 * visual.ambient} color="#d8eaf5" />
      <directionalLight position={[-4, 5, 6]} intensity={3.4 * visual.key} color="#f2fbff" />
      <directionalLight position={[4, 2, 4]} intensity={1.6 * visual.fill} color="#b8e5ff" />
      <directionalLight position={[1, 4, -4]} intensity={2 * visual.rim} color={visual.accent} />
      <pointLight position={[-3, 2, 3]} intensity={7 * visual.fill} distance={7} color={visual.primary} />
      <pointLight position={[3, 2, 2]} intensity={4 * visual.rim} distance={7} color={visual.accent} />
      <BV01ModelBoundary onError={onModelError}><Suspense fallback={null}><BV01Model onFrameSample={onFrameSample} /><BV01Pedestal state={state} reducedMotion={reducedMotion} />{capturePoster && captureReady ? <BV01RuntimePosterCapture /> : null}</Suspense></BV01ModelBoundary>
    </Canvas>
  </div>;
}

/** Development-only exporter. It is enabled by ?bv01CapturePoster=1 and never
 * enables preserveDrawingBuffer in the normal production path. */
function BV01RuntimePosterCapture() {
  const captured = useRef(false);
  const { gl } = useThree();
  useFrame(() => {
    if (captured.current) return;
    captured.current = true;
    requestAnimationFrame(() => {
      gl.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "BV01_runtime_poster.webp";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }, "image/webp", 0.92);
    });
  });
  return null;
}

class BV01ModelBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
