"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { beginSearchIntent, startPublicSearchIntent } from "@/app/actions/intent";
import { useFormStatus } from "react-dom";
import { IntentSubmitButton } from "@/components/intent-submit-button";
import { persistCurrentDevSearchQa } from "@/lib/dev-search-qa";
import type { IntentWorkMode, SearchIntent } from "@/lib/intent-first";

// The final interaction clip lasts 3.208s. This keeps a brief completed pose
// on screen without delaying the real server search.
const MIN_SEARCH_VISUAL_MS = 2_200;
const MAX_SEARCH_VISUAL_MS = 3_000;

type SearchTimingEvents = { searchClickT0?: number; backendStartT?: number; resultsReadyT?: number; minVisualCompleteT?: number; navigationT?: number; interactionStartT?: number; interactionCompleteT?: number };

function developmentSearchTimingEvents(reset = false) {
  if (process.env.NODE_ENV !== "development") return undefined;
  const timingWindow = window as Window & { __SEARCH_TIMING_EVENTS__?: SearchTimingEvents };
  if (reset || !timingWindow.__SEARCH_TIMING_EVENTS__) timingWindow.__SEARCH_TIMING_EVENTS__ = {};
  return timingWindow.__SEARCH_TIMING_EVENTS__;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

type IntentEntryProps = {
  intent?: SearchIntent | null;
  onRoleChange?: (value: string) => void;
  onLocationChange?: (value: string) => void;
  onWorkModeChange?: (value: IntentWorkMode) => void;
  onPendingChange?: (pending: boolean) => void;
  onSearchStarted?: () => void;
  onSearchComplete?: () => void;
  onSearchFinished?: () => void;
  onErrorChange?: (error?: string) => void;
  waitForInteractionComplete?: () => Promise<void>;
  clientControlled?: boolean;
  showSearchScope?: boolean;
};

export function IntentEntry({ intent, onRoleChange, onLocationChange, onWorkModeChange, onPendingChange, onSearchStarted, onSearchComplete, onSearchFinished, onErrorChange, waitForInteractionComplete, clientControlled = false, showSearchScope = false }: IntentEntryProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [role, setRole] = useState(intent?.role ?? "");
  const [location, setLocation] = useState(intent?.location ?? "");
  const [workMode, setWorkMode] = useState<IntentWorkMode>(intent?.workMode ?? "ANY");
  const [, startTransition] = useTransition();
  const developmentParams = process.env.NODE_ENV === "development" && typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;
  const baseAnimationOnly = Boolean(developmentParams?.has("bvbase"));
  // Full human-review mode: retains the real backend request and complete
  // procedural BV-01 pipeline, but deliberately holds this route afterward.
  const fullInteractionQaMode = Boolean(developmentParams?.has("bvqa"));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(event.currentTarget);
    const searchStartedAt = performance.now();
    const timing = developmentSearchTimingEvents(true);
    if (timing) timing.searchClickT0 = searchStartedAt;
    setSubmitting(true);
    onPendingChange?.(true);
    onErrorChange?.(undefined);
    onSearchStarted?.();

    if (timing) timing.backendStartT = performance.now();
    const result = await startPublicSearchIntent(formData);
    if (timing) timing.resultsReadyT = performance.now();
    if (!result.ok || !result.resultsReady) {
      setSubmitting(false);
      onPendingChange?.(false);
      onSearchFinished?.();
      onErrorChange?.(result.ok ? "La búsqueda no terminó correctamente." : result.error);
      return;
    }

    // Development proof mode: keep the landing mounted so the authored BV-01
    // interaction can be inspected without navigation or CCD involvement.
    if (baseAnimationOnly) return;

    if (fullInteractionQaMode) {
      await (waitForInteractionComplete?.() ?? Promise.resolve());
      if (timing) {
        timing.minVisualCompleteT = performance.now();
        const qa = {
          backendDurationMs: Number(((timing.resultsReadyT ?? performance.now()) - (timing.backendStartT ?? searchStartedAt)).toFixed(1)),
          resultsReadyMs: Number(((timing.resultsReadyT ?? performance.now()) - searchStartedAt).toFixed(1)),
          interactionDurationWallClockMs: timing.interactionStartT && timing.interactionCompleteT ? Number((timing.interactionCompleteT - timing.interactionStartT).toFixed(1)) : null,
          navigationDelayAfterResultsMs: null,
          totalLandingWaitMs: Number((performance.now() - searchStartedAt).toFixed(1)),
          navigationGate: "bvqa-hold" as const,
        };
        (window as Window & { __SEARCH_TIMING_QA__?: typeof qa }).__SEARCH_TIMING_QA__ = qa;
        persistCurrentDevSearchQa({ interactionFinished: true, navigationReason: "bvqa-hold" });
        console.debug("[SEARCH_TIMING_QA]", qa);
      }
      onSearchComplete?.();
      setSubmitting(false);
      onPendingChange?.(false);
      return;
    }

    const remainingVisualTime = MIN_SEARCH_VISUAL_MS - (performance.now() - searchStartedAt);
    if (remainingVisualTime > 0) await delay(remainingVisualTime);
    if (timing) timing.minVisualCompleteT = performance.now();
    const remainingMaximumVisualTime = Math.max(0, MAX_SEARCH_VISUAL_MS - (performance.now() - searchStartedAt));
    const interactionResult = await Promise.race([
      (waitForInteractionComplete?.() ?? Promise.resolve()).then(() => "interaction" as const),
      delay(remainingMaximumVisualTime).then(() => "maximum" as const),
    ]);
    // Navigation is intentionally deferred until the server action confirms
    // results are ready and the minimum visual duration has elapsed. A stalled
    // renderer cannot hold ready results past the visual UX deadline.
    if (timing) {
      timing.navigationT = performance.now();
      const qa = {
        backendDurationMs: Number(((timing.resultsReadyT ?? timing.navigationT) - (timing.backendStartT ?? searchStartedAt)).toFixed(1)),
        resultsReadyMs: Number(((timing.resultsReadyT ?? timing.navigationT) - searchStartedAt).toFixed(1)),
        interactionDurationWallClockMs: timing.interactionStartT && timing.interactionCompleteT ? Number((timing.interactionCompleteT - timing.interactionStartT).toFixed(1)) : null,
        navigationDelayAfterResultsMs: Number((timing.navigationT - (timing.resultsReadyT ?? timing.navigationT)).toFixed(1)),
        totalLandingWaitMs: Number((timing.navigationT - searchStartedAt).toFixed(1)),
        navigationGate: interactionResult,
      };
      (window as Window & { __SEARCH_TIMING_QA__?: typeof qa }).__SEARCH_TIMING_QA__ = qa;
      persistCurrentDevSearchQa({ interactionFinished: Boolean(timing.interactionCompleteT), navigationReason: interactionResult });
      console.debug("[SEARCH_TIMING_QA]", qa);
    }
    onSearchComplete?.();
    startTransition(() => router.push(landingResultsDestination(developmentProbeDestination(result.destination))));
  };

  return <form {...(clientControlled ? { onSubmit: submit } : { action: beginSearchIntent })} className={`intent-entry${submitting ? " intent-entry--active" : ""}`} aria-label="Empezar una búsqueda">
    <div className="intent-entry__projection" aria-hidden="true"><i /><i /><i /></div>
    <header className="intent-entry__header"><div><span className="intent-entry__kicker">BUSCAVACANTE // AI SEARCH CONSOLE</span><strong>INTERFAZ DE MATCHING ASISTIDO</strong></div><span className="intent-entry__status"><i />{submitting ? "BUSCANDO…" : "BV-01 ENLAZADO"}</span></header>
    {!showSearchScope ? <><input type="hidden" name="location" value={location} /><input type="hidden" name="work_mode" value={workMode} /></> : null}
    <div className="intent-field intent-field--role"><label htmlFor="intent-role"><span>OBJETIVO DE BÚSQUEDA</span><em>CMD-01</em></label><div className="intent-field__slot"><b aria-hidden="true">›</b><input aria-label="¿Qué trabajo buscas?" id="intent-role" name="role" value={role} onChange={(event) => { setRole(event.target.value); onRoleChange?.(event.target.value); }} required maxLength={120} autoFocus placeholder="Dime qué trabajo buscas..." /></div></div>
    {showSearchScope ? <div className="intent-entry__scope">
      <div className="intent-field"><label htmlFor="intent-location">¿Dónde quieres trabajar?</label><input id="intent-location" name="location" value={location} onChange={(event) => { setLocation(event.target.value); onLocationChange?.(event.target.value); }} maxLength={120} placeholder="Ciudad, provincia o país" /></div>
      <div className="intent-field"><label htmlFor="intent-work-mode">Modalidad</label><select id="intent-work-mode" name="work_mode" value={workMode} onChange={(event) => { const nextMode = event.target.value as IntentWorkMode; setWorkMode(nextMode); onWorkModeChange?.(nextMode); }}><option value="ANY">Sin preferencia</option><option value="ONSITE">Presencial</option><option value="HYBRID">Híbrido</option><option value="REMOTE">Remoto</option></select></div>
    </div> : null}
    {clientControlled ? <IntentSubmitButton pending={submitting} /> : <><IntentFormStatus onPendingChange={onPendingChange} /><IntentSubmitButton /></>}
  </form>;
}

function IntentFormStatus({ onPendingChange }: Pick<IntentEntryProps, "onPendingChange">) {
  const { pending } = useFormStatus();
  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  return null;
}

function developmentProbeDestination(destination: string) {
  if (process.env.NODE_ENV !== "development") return destination;
  const params = new URLSearchParams(window.location.search);
  const clip = params.get("bvclip");
  const composition = params.get("bvglobe")?.toUpperCase();
  if (clip !== "globe" && composition !== "A" && composition !== "B" && composition !== "C") return destination;
  const target = new URL(destination, window.location.origin);
  if (clip === "globe") target.searchParams.set("bvclip", "globe");
  if (composition === "A" || composition === "B" || composition === "C") target.searchParams.set("bvglobe", composition);
  return `${target.pathname}${target.search}${target.hash}`;
}

function landingResultsDestination(destination: string) {
  const target = new URL(destination, window.location.origin);
  // The server result is already ready at this point. Preserve the direct
  // landing-to-results handoff instead of mounting the route's deep-link
  // loading composition for a transient navigation.
  target.searchParams.set("landing_handoff", "1");
  return `${target.pathname}${target.search}${target.hash}`;
}
