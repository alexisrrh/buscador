import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";
import { searchVisualLabel, type SearchVisualPhase } from "@/components/search-visual-pipeline";

export function HeroActivityPanel({ state, error, searchPhase = "idle" }: { state: BV01VisualState; error?: string; searchPhase?: SearchVisualPhase }) {
  const visual = bv01VisualStateMap[state];
  const message = state === "ERROR" && error ? error : searchPhase !== "idle" ? searchVisualLabel(searchPhase) : visual.activity;
  return <aside className="hero-activity-panel" data-state={state.toLowerCase()} aria-label="Actividad de la sesión">
    <span>ACTIVIDAD</span><p>{message}</p>
  </aside>;
}
