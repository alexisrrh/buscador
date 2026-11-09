"use client";

import { useEffect, useState } from "react";

export type SearchVisualPhase = "idle" | "analyzing" | "preferences" | "consulting" | "comparing" | "prioritizing";
export type HologramContact = "none" | "profile" | "filters" | "main-primary" | "main-final";

const phases: Array<{ phase: Exclude<SearchVisualPhase, "idle">; label: string }> = [
  { phase: "analyzing", label: "Analizando perfil" },
  { phase: "preferences", label: "Aplicando preferencias" },
  { phase: "consulting", label: "Consultando oportunidades" },
  { phase: "comparing", label: "Comparando requisitos" },
  { phase: "prioritizing", label: "Priorizando coincidencias" },
];

export function panelInteractPhase(normalizedTime: number): SearchVisualPhase {
  if (normalizedTime < .31) return "analyzing";
  if (normalizedTime < .50) return "preferences";
  if (normalizedTime < .72) return "consulting";
  if (normalizedTime < .82) return "comparing";
  return "prioritizing";
}

export function panelInteractContact(normalizedTime: number): HologramContact {
  if (normalizedTime >= .24 && normalizedTime <= .31) return "profile";
  if (normalizedTime >= .42 && normalizedTime <= .49) return "filters";
  if (normalizedTime >= .62 && normalizedTime <= .70) return "main-primary";
  if (normalizedTime >= .82 && normalizedTime <= .89) return "main-final";
  return "none";
}

// Kept only for the direct/deep-link loading fallback. The normal landing
// sequence receives its phases from BV01_PANEL_INTERACT's actual action time.
export function useSearchVisualPhase(active: boolean) {
  const [sequence, setSequence] = useState<{ active: boolean; phase: SearchVisualPhase }>({ active, phase: active ? "analyzing" : "idle" });
  if (sequence.active !== active) {
    setSequence({ active, phase: active ? "analyzing" : "idle" });
  }
  useEffect(() => {
    if (!active) return;
    const setPhase = (phase: SearchVisualPhase) => setSequence({ active: true, phase });
    const timers = [
      window.setTimeout(() => setPhase("preferences"), 650),
      window.setTimeout(() => setPhase("consulting"), 1_050),
      window.setTimeout(() => setPhase("comparing"), 1_500),
      window.setTimeout(() => setPhase("prioritizing"), 1_900),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [active]);
  return active ? sequence.active ? sequence.phase : "analyzing" : "idle";
}

export function searchVisualLabel(phase: SearchVisualPhase) {
  return phases.find((item) => item.phase === phase)?.label ?? "Esperando una preferencia";
}

export function SearchVisualPipeline({ phase }: { phase: SearchVisualPhase }) {
  if (phase === "idle") return null;
  const activeIndex = phases.findIndex((item) => item.phase === phase);
  const operations = ["PERFIL", "FILTROS", "CONSULTANDO", "MATCHING", "PRIORIZANDO"];
  return <div className="search-visual-pipeline" data-phase={phase} aria-label={`Proceso de búsqueda: ${searchVisualLabel(phase)}`}>
    <div className="search-visual-pipeline__operations">
      {operations.map((operation, index) => <div key={operation} data-active={index <= activeIndex} data-complete={index < activeIndex}><span>{operation}</span><i aria-hidden="true">{index < activeIndex ? "✓" : index === activeIndex ? "…" : "·"}</i></div>)}
    </div>
  </div>;
}
