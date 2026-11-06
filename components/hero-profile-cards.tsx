import type { SearchIntent } from "@/lib/intent-first";
import type { BV01VisualState } from "@/lib/bv01-visual-state";
import { displayIntentLocation, displayIntentRole, displayIntentWorkMode } from "@/lib/intent-display";

export function HeroProfileCards({ intent, state, compactDisplay = false }: { intent: SearchIntent | null; state: BV01VisualState; compactDisplay?: boolean }) {
  const cards = [
    ["TU PERFIL", intent?.role ? (compactDisplay ? displayIntentRole(intent.role) : intent.role) : "Por definir"],
    ["UBICACIÓN", intent?.location ? (compactDisplay ? displayIntentLocation(intent.location) : intent.location) : "No indicada"],
    ["MODALIDAD", intent ? displayIntentWorkMode(intent.workMode) : "Sin preferencia"],
  ];

  return <aside className="hero-profile-cards" data-state={state.toLowerCase()} aria-label="Preferencias de búsqueda">
    {cards.map(([label, value]) => <div className="hero-profile-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </aside>;
}
