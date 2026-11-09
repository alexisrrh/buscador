import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";

export function HeroAgentStatus({ state }: { state: BV01VisualState }) {
  const visual = bv01VisualStateMap[state];
  return <aside className="hero-agent-status" data-state={state.toLowerCase()} aria-label={`Estado de BV-01: ${visual.status}`}>
    <span>BV-01</span><strong>{visual.status}</strong>
  </aside>;
}
