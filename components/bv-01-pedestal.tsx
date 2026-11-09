"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";

export function BV01Pedestal({ state, reducedMotion }: { state: BV01VisualState; reducedMotion: boolean }) {
  const rings = useRef<Group>(null);
  const visual = bv01VisualStateMap[state];

  useFrame((state, delta) => {
    if (!reducedMotion && rings.current) {
      rings.current.rotation.y += delta * visual.rotationSpeed;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * visual.pulseSpeed) * visual.pulseAmount;
      rings.current.scale.setScalar(pulse);
    }
  });

  return <group position={[0.05, -2.86, -0.15]}>
    <mesh position={[0, -0.035, 0]}><cylinderGeometry args={[1.5, 1.72, 0.07, 48, 1, true]} /><meshBasicMaterial color={visual.primary} transparent opacity={0.1} depthWrite={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[1.7, 48]} /><meshBasicMaterial color={visual.primary} transparent opacity={0.09} depthWrite={false} /></mesh>
    <mesh position={[0, 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.15, 1.72, 48]} /><meshBasicMaterial color={visual.primary} transparent opacity={visual.ringOpacity * 0.42} depthWrite={false} /></mesh>
    <group ref={rings}>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.58, 0.021, 6, 56]} /><meshBasicMaterial color={visual.primary} transparent opacity={visual.ringOpacity} depthWrite={false} /></mesh>
      <mesh position={[0, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.16, 0.015, 6, 48]} /><meshBasicMaterial color={visual.accent} transparent opacity={visual.ringOpacity * 0.5} depthWrite={false} /></mesh>
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.78, 0.011, 6, 40]} /><meshBasicMaterial color={visual.primary} transparent opacity={visual.ringOpacity * 0.76} depthWrite={false} /></mesh>
    </group>
    <pointLight position={[0, 0.42, 0.8]} color={visual.primary} intensity={visual.lightIntensity} distance={3.9} />
  </group>;
}
