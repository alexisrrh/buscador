"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BV01AnimatedPrototype, HolographicWorkPanels, type HologramContactPoint, type InteractionTouchId } from "@/components/bv-01-animated-prototype";
import { Feedback } from "@/components/feedback";
import { HeroGlobeStage } from "@/components/hero-globe-stage";
import { HeroProfileCards } from "@/components/hero-profile-cards";
import { IntentEntry } from "@/components/intent-entry";
import { SearchVisualPipeline, type HologramContact, type SearchVisualPhase } from "@/components/search-visual-pipeline";
import type { BV01VisualState } from "@/lib/bv01-visual-state";
import type { IntentWorkMode, SearchIntent } from "@/lib/intent-first";
import { globalGlobeLocation, isGlobalLocationQuery, normalizeLocationQuery, type GlobeBoundary, type GlobeLocation } from "@/lib/globe-location";

type LandingSearchVisualState = "idle" | "activating" | "searching" | "complete" | "error";

export function PublicIntentExperience({ intent, error }: { intent: SearchIntent | null; error?: string }) {
  const [typing, setTyping] = useState(Boolean(intent?.role));
  const [searchVisualState, setSearchVisualState] = useState<LandingSearchVisualState>("idle");
  const [searchError, setSearchError] = useState<string | undefined>();
  const [draftIntent, setDraftIntent] = useState<SearchIntent | null>(intent);
  const [workSignal, setWorkSignal] = useState(0);
  const [searchPhase, setSearchPhase] = useState<SearchVisualPhase>("idle");
  const [hologramContact, setHologramContact] = useState<HologramContact>("none");
  const [hologramContactPoint, setHologramContactPoint] = useState<HologramContactPoint>();
  const [hologramTouchId, setHologramTouchId] = useState<InteractionTouchId>();
  const [globeLocation, setGlobeLocation] = useState<GlobeLocation>(() => globalGlobeLocation(intent?.location ?? ""));
  const [boundaryResult, setBoundaryResult] = useState<{ id: string; value: GlobeBoundary }>();
  const boundaryId = globeLocation.resolved ? globeLocation.boundaryId : undefined;
  const globeBoundary = boundaryResult?.id === boundaryId ? boundaryResult?.value : undefined;
  const interactionComplete = useRef(false);
  const interactionWaiters = useRef<Array<() => void>>([]);
  const visibleError = error ?? searchError;
  const searchActive = searchVisualState === "activating" || searchVisualState === "searching" || searchVisualState === "complete";
  const state: BV01VisualState = visibleError || searchVisualState === "error" ? "ERROR" : searchActive ? "SAVING" : typing ? "LISTENING" : "IDLE";

  useEffect(() => {
    if (searchVisualState !== "activating") return;
    const timer = window.setTimeout(() => setSearchVisualState("searching"), 160);
    return () => window.clearTimeout(timer);
  }, [searchVisualState]);

  useEffect(() => {
    if (!boundaryId) return;
    let cancelled = false;
    void fetch(`/api/location-boundary?id=${encodeURIComponent(boundaryId)}`)
      .then((response) => response.ok ? response.json() as Promise<GlobeBoundary> : { available: false })
      .then((value) => { if (!cancelled) setBoundaryResult({ id: boundaryId, value }); })
      .catch(() => { if (!cancelled) setBoundaryResult({ id: boundaryId, value: { available: false } }); });
    return () => { cancelled = true; };
  }, [boundaryId]);

  const finishSearch = () => {
    setSearchVisualState("error");
    setSearchPhase("idle");
    setHologramContact("none");
    setHologramContactPoint(undefined);
    setHologramTouchId(undefined);
  };

  const updateDraft = (update: Partial<SearchIntent>) => setDraftIntent((current) => ({
    role: current?.role ?? intent?.role ?? "",
    location: current?.location ?? intent?.location ?? "",
    workMode: current?.workMode ?? intent?.workMode ?? "ANY",
    ...update,
  }));
  const waitForInteractionComplete = useCallback(() => interactionComplete.current ? Promise.resolve() : new Promise<void>((resolve) => interactionWaiters.current.push(resolve)), []);
  const markInteractionComplete = useCallback(() => {
    if (interactionComplete.current) return;
    interactionComplete.current = true;
    interactionWaiters.current.splice(0).forEach((resolve) => resolve());
  }, []);
  const resolveGlobeLocation = useCallback((location: string) => {
    const query = normalizeLocationQuery(location);
    if (isGlobalLocationQuery(query)) {
      setGlobeLocation(globalGlobeLocation(query));
      return;
    }
    setGlobeLocation({ query, resolved: false, locationType: "global" });
    void fetch(`/api/location-geocode?q=${encodeURIComponent(query)}`)
      .then((response) => response.ok ? response.json() as Promise<GlobeLocation> : globalGlobeLocation(query))
      .then((result) => setGlobeLocation(result))
      .catch(() => setGlobeLocation(globalGlobeLocation(query)));
  }, []);

  return <main className={`public-entry public-entry--${state.toLowerCase()}`} data-agent-state={state.toLowerCase()} data-search-visual-state={searchVisualState}>
    <header className="public-entry__brand"><span className="public-entry__mark" aria-hidden="true" />BuscaVacante</header>
    <section className="public-entry__scene" aria-label="Inicio de BuscaVacante">
      <div className="public-entry__workspace" aria-hidden="true"><i /><i /><i /></div>
      <div className="public-entry__agent"><BV01AnimatedPrototype state={state} working={searchActive} resultsReady={searchVisualState === "complete"} onWorkSignal={setWorkSignal} onSearchPhase={setSearchPhase} onHologramContact={(contact, point, touchId) => { setHologramContact(contact); setHologramContactPoint(point); if (touchId) setHologramTouchId(touchId); }} onInteractionComplete={markInteractionComplete} /></div>
      <div className="public-entry__hologram-overlay" aria-hidden="true"><HolographicWorkPanels visible active={searchActive} phase={searchPhase} signal={workSignal} contact={hologramContact} contactPoint={hologramContactPoint} touchId={hologramTouchId} intent={draftIntent} /></div>
      <HeroGlobeStage state={state} intent={draftIntent} compactLocation searchActive={searchActive} location={globeLocation} boundary={globeBoundary} searchPhase={searchPhase} />
      <HeroProfileCards intent={draftIntent} state={state} compactDisplay />
      <div className="public-entry__projection" data-mode={searchActive ? "searching" : "idle"}>
        <span className="public-entry__beam" aria-hidden="true" />
        <div className="public-entry__console-idle" aria-hidden={searchActive}>
          <h1>¿Qué trabajo quieres conseguir?</h1>
          <p>Solo dime qué buscas. Yo me encargo del resto.</p>
          <Feedback error={visibleError} />
          <IntentEntry intent={intent} clientControlled showSearchScope onRoleChange={(value) => { setTyping(Boolean(value.trim())); if (searchVisualState === "error") setSearchVisualState("idle"); updateDraft({ role: value }); }} onLocationChange={(value) => updateDraft({ location: value })} onWorkModeChange={(value: IntentWorkMode) => updateDraft({ workMode: value })} onSearchStarted={() => { interactionComplete.current = false; setSearchError(undefined); setSearchPhase("analyzing"); setHologramContact("none"); setHologramContactPoint(undefined); setHologramTouchId(undefined); resolveGlobeLocation(draftIntent?.location ?? ""); setSearchVisualState("activating"); }} onSearchComplete={() => setSearchVisualState("complete")} onSearchFinished={finishSearch} onErrorChange={setSearchError} waitForInteractionComplete={waitForInteractionComplete} />
        </div>
        <section className="public-entry__console-search" role="status" aria-live="polite" aria-hidden={!searchActive}>
          <p className="eyebrow">BÚSQUEDA EN CURSO</p>
          <h1>{searchVisualState === "activating" ? "Preparando búsqueda…" : "Buscando oportunidades…"}</h1>
          <p>{searchVisualState === "activating" ? "Activando la estación de búsqueda." : "BV-01 está operando la búsqueda."}</p>
          <SearchVisualPipeline phase={searchPhase} />
        </section>
      </div>
      {searchActive ? <span className="public-entry__command" aria-hidden="true" /> : null}
    </section>
  </main>;
}
