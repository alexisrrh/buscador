"use client";

import { useBrowserSearch } from "@/lib/browser-signals";
import { BV01AnimatedPrototype } from "@/components/bv-01-animated-prototype";
import { HeroGlobeStage } from "@/components/hero-globe-stage";
import { HeroProfileCards } from "@/components/hero-profile-cards";
import { intentFromQuery } from "@/lib/intent-first";

function useLoadingIntent() {
  const search = useBrowserSearch();
  return intentFromQuery(Object.fromEntries(new URLSearchParams(search)));
}

/** Reads the same intent_* query used by the route's real server search. */
export function OpportunitiesSearchExperience() {
  const intent = useLoadingIntent();

  return <main className="opportunities-page opportunities-search" data-agent-state="searching">
    <div className="opportunities-search__scene" aria-hidden="true" />
    <HeroProfileCards intent={intent} state="SEARCHING" compactDisplay />

    <section className="opportunities-search__station" aria-label="Estado de la búsqueda">
      <div className="opportunities-search__agent"><BV01AnimatedPrototype state="SEARCHING" working /></div>
    </section>

    <section className="opportunities-search__panel" role="status" aria-live="polite">
      <p className="eyebrow">Búsqueda en curso</p>
      <h1>Buscando<br />oportunidades…</h1>
      <p>Estamos consultando oportunidades que coinciden con tu búsqueda.</p>
      {intent ? <p className="opportunities-search__context">Perfil listo para consultar.</p> : null}
      <div className="opportunities-search__pulse" aria-label="Búsqueda activa"><i /><i /><i /></div>
    </section>

    <aside className="opportunities-search__globe" aria-label="Scope de la búsqueda">
      <HeroGlobeStage state="SEARCHING" intent={intent} compactLocation searchActive />
    </aside>
  </main>;
}
