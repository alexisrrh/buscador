"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { confirmOnboardingSignal } from "@/app/actions/onboarding";
import { opportunitiesDestination, type IntentWorkMode } from "@/lib/intent-first";
import type { OnboardingSignal, OnboardingSnapshot } from "@/lib/onboarding/state";
import { BV01, type RobotState } from "@/components/bv-01";

type EditableSignal = "ROLE" | "MODALITY" | "LOCATION" | "SALARY";
const labels: Record<EditableSignal, string> = { ROLE: "Trabajo", MODALITY: "Modalidad", LOCATION: "Ubicación", SALARY: "Salario" };

export function OnboardingExperience({ initialSnapshot }: { initialSnapshot: OnboardingSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [manualSignal, setManualSignal] = useState<EditableSignal | null>(null);
  const [robotState, setRobotState] = useState<RobotState>(() => initialSnapshot.searchReady ? "SEARCH_READY" : initialSnapshot.nextSignal || initialSnapshot.state === "SEARCH_PROFILE_REQUIRED" ? "NEEDS_INPUT" : "IDLE");
  const [message, setMessage] = useState(() => openingMessage(initialSnapshot));
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ value: string; phase: "incoming" | "absorbed" | "returned" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeSignal = manualSignal ?? toEditableSignal(snapshot.nextSignal);
  const signalDefaultValue = activeSignal === "ROLE" ? snapshot.role.value ?? "" : activeSignal === "LOCATION" ? snapshot.location.value ?? "" : "";

  const opportunityHref = useMemo(() => snapshot.role.value && snapshot.modality.value
    ? opportunitiesDestination({ role: snapshot.role.value, location: snapshot.location.value ?? "", workMode: snapshot.modality.value as IntentWorkMode })
    : "/oportunidades", [snapshot]);

  function confirm(signal: "ROLE" | "MODE" | "LOCATION" | "SALARY", value: unknown) {
    setError(null);
    setToken({ value: tokenLabel(value), phase: "incoming" });
    setRobotState("SAVING");
    startTransition(async () => {
      const result = await confirmOnboardingSignal({ signal, value } as Parameters<typeof confirmOnboardingSignal>[0]);
      if (!result.ok) {
        setError("No pude guardar eso. Vamos a intentarlo otra vez.");
        setToken((current) => current ? { ...current, phase: "returned" } : current);
        setRobotState("ERROR");
        return;
      }
      setSnapshot(result.snapshot);
      setManualSignal(null);
      setToken((current) => current ? { ...current, phase: "absorbed" } : current);
      setRobotState("UNDERSTOOD");
      setMessage(responseFor(signal, value));
      window.setTimeout(() => {
        setToken(null);
        setRobotState(result.snapshot.searchReady ? "SEARCH_READY" : result.nextSignal ? "NEEDS_INPUT" : "IDLE");
      }, 480);
    });
  }

  return <main className="onboarding-page">
    <header className="onboarding-brand"><Link href="/">BuscaVacante</Link><span>BV-01</span></header>
    <div className={`onboarding-layout onboarding-layout--${robotState.toLowerCase()}`}>
      <section className="onboarding-stage" aria-label="Onboarding de BuscaVacante">
        <div className="onboarding-atmosphere" aria-hidden="true"><i /><i /><i /></div>
        <div className="onboarding-agent-zone">
          <Memory snapshot={snapshot} onEdit={(signal) => { setError(null); setManualSignal(signal); setRobotState("LISTENING"); }} />
          <BV01 state={robotState} />
          {token ? <span className={`onboarding-token onboarding-token--${token.phase}`} aria-live="polite">{token.value}</span> : null}
        </div>
        <div className={`onboarding-projection ${error ? "is-error" : ""}`}>
          <div className="onboarding-projection__beam" aria-hidden="true" />
          <div className="onboarding-projection__scan" aria-hidden="true" />
          <p className="onboarding-message" aria-live="polite">{error ?? message}</p>
          {manualSignal ? <SignalQuestion key={`manual-${manualSignal}`} signal={manualSignal} defaultValue={signalDefaultValue} pending={isPending} onListening={() => !isPending && setRobotState("LISTENING")} onConfirm={confirm} /> : snapshot.searchReady ? <ReadyPanel href={opportunityHref} optionalSignals={snapshot.optionalSignals} onEdit={setManualSignal} /> : snapshot.state === "SEARCH_PROFILE_REQUIRED" && snapshot.role.value ? <ObjectiveConfirmation role={snapshot.role.value} pending={isPending} onContinue={() => confirm("ROLE", snapshot.role.value!)} onChange={() => setManualSignal("ROLE")} /> : activeSignal ? <SignalQuestion key={`${snapshot.state}-${activeSignal}-${signalDefaultValue}`} signal={activeSignal} defaultValue={signalDefaultValue} pending={isPending} onListening={() => !isPending && setRobotState("LISTENING")} onConfirm={confirm} /> : null}
        </div>
      </section>
    </div>
  </main>;
}

function SignalQuestion({ signal, defaultValue, pending, onListening, onConfirm }: { signal: EditableSignal; defaultValue: string; pending: boolean; onListening: () => void; onConfirm: (signal: "ROLE" | "MODE" | "LOCATION" | "SALARY", value: unknown) => void }) {
  const [value, setValue] = useState(defaultValue);
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const question = { ROLE: "¿Qué trabajo quieres conseguir?", MODALITY: "¿Cómo prefieres trabajar?", LOCATION: "¿Quieres limitar la búsqueda a algún lugar?", SALARY: "¿Quieres marcar un salario mínimo?" }[signal];
  return <section className="onboarding-question" aria-label={`Pregunta: ${labels[signal]}`}>
    <h2>{question}</h2>
    {signal === "ROLE" || signal === "LOCATION" ? <form onSubmit={(event) => { event.preventDefault(); onConfirm(signal === "ROLE" ? "ROLE" : "LOCATION", value); }}>
      <label className="sr-only" htmlFor={`onboarding-${signal.toLowerCase()}`}>{labels[signal]}</label>
      <input id={`onboarding-${signal.toLowerCase()}`} value={value} onChange={(event) => { setValue(event.target.value); onListening(); }} placeholder={signal === "ROLE" ? "Dime qué trabajo buscas…" : "Por ejemplo, A Coruña"} disabled={pending} autoFocus />
      <div className="onboarding-answer-actions"><button type="submit" disabled={pending}>{pending ? "Guardando…" : "Confirmar"}</button>{signal === "LOCATION" ? <button className="secondary" type="button" disabled={pending} onClick={() => onConfirm("LOCATION", "UNRESTRICTED")}>Sin restricción</button> : null}</div>
    </form> : null}
    {signal === "MODALITY" ? <div className="onboarding-choices" role="group" aria-label="Modalidad preferida">
      {[["REMOTE", "Remoto"], ["HYBRID", "Híbrido"], ["ONSITE", "Presencial"], ["UNRESTRICTED", "Me da igual"]].map(([mode, label]) => <button key={mode} className="secondary" disabled={pending} onClick={() => onConfirm("MODE", mode)}>{label}</button>)}
    </div> : null}
    {signal === "SALARY" ? <form onSubmit={(event) => { event.preventDefault(); onConfirm("SALARY", { minimum: Number(salary), currency }); }}>
      <div className="onboarding-salary"><label className="sr-only" htmlFor="onboarding-salary">Salario mínimo anual</label><input id="onboarding-salary" inputMode="numeric" value={salary} onChange={(event) => { setSalary(event.target.value); onListening(); }} placeholder="24.000" disabled={pending} autoFocus /><label className="sr-only" htmlFor="onboarding-currency">Moneda</label><select id="onboarding-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={pending}><option>EUR</option><option>USD</option><option>GBP</option></select></div>
      <div className="onboarding-answer-actions"><button type="submit" disabled={pending}>{pending ? "Guardando…" : "Confirmar"}</button><button className="secondary" type="button" disabled={pending} onClick={() => onConfirm("SALARY", "UNRESTRICTED")}>Sin mínimo</button></div>
    </form> : null}
  </section>;
}

function ObjectiveConfirmation({ role, pending, onContinue, onChange }: { role: string; pending: boolean; onContinue: () => void; onChange: () => void }) {
  return <section className="onboarding-question onboarding-question--confirmation" aria-label="Confirmar objetivo conocido"><h2>Entiendo que buscas trabajo como <strong>{role}</strong>.</h2><p>¿Sigo con ese objetivo?</p><div className="onboarding-answer-actions"><button type="button" disabled={pending} onClick={onContinue}>{pending ? "Guardando…" : "Sí, continuar"}</button><button className="secondary" type="button" disabled={pending} onClick={onChange}>Cambiar</button></div></section>;
}

function ReadyPanel({ href, optionalSignals, onEdit }: { href: string; optionalSignals: OnboardingSignal[]; onEdit: (signal: EditableSignal) => void }) {
  return <section className="onboarding-ready"><h2>Ya tengo suficiente.</h2><p>Ahora déjamelo a mí.</p><Link className="button" href={href}>Empezar a buscar</Link>{optionalSignals.length ? <div><span>Si quieres, también puedo tener en cuenta tu ubicación o salario.</span>{optionalSignals.map((signal) => <button className="link-button" key={signal} onClick={() => onEdit(signal as EditableSignal)}>Añadir {labels[signal as EditableSignal].toLocaleLowerCase("es")}</button>)}</div> : null}</section>;
}

function Memory({ snapshot, onEdit }: { snapshot: OnboardingSnapshot; onEdit: (signal: EditableSignal) => void }) {
  const values: Array<{ signal: EditableSignal; label: string; value: string; known: boolean }> = [
    { signal: "ROLE", label: "Trabajo", value: snapshot.role.value ?? "Pendiente", known: Boolean(snapshot.role.value) },
    { signal: "MODALITY", label: "Modalidad", value: modeLabel(snapshot.modality.value), known: Boolean(snapshot.modality.value) },
    { signal: "LOCATION", label: "Ubicación", value: snapshot.location.preferenceState === "UNRESTRICTED" ? "Sin restricción" : snapshot.location.value ?? "Opcional", known: snapshot.location.preferenceState !== "UNKNOWN" },
    { signal: "SALARY", label: "Salario", value: salaryLabel(snapshot), known: snapshot.salary.preferenceState !== "UNKNOWN" },
  ];
  const known = values.filter((item) => item.known);
  if (snapshot.approvedResume.state === "SINGLE_APPROVED") known.push({ signal: "ROLE", label: "CV", value: "Conectado", known: true });
  if (!known.length) return null;
  return <aside className="onboarding-memory" aria-label="Memoria de BV-01"><p className="sr-only">BV-01 recuerda</p><ul>{known.map((item, index) => <li key={`${item.label}-${index}`} className="is-known"><span aria-hidden="true">✓</span><strong>{item.label === "CV" ? item.value : item.value}</strong>{item.label === "CV" ? <Link aria-label="Ver CV" href="/resumes">CV</Link> : <button className="memory-edit" aria-label={`Editar ${item.label}`} onClick={() => onEdit(item.signal)}>Editar</button>}</li>)}</ul></aside>;
}

function toEditableSignal(signal: OnboardingSignal | null): EditableSignal | null { return signal === "ROLE" ? "ROLE" : signal === "MODALITY" ? "MODALITY" : signal === "LOCATION" ? "LOCATION" : signal === "SALARY" ? "SALARY" : null; }
function modeLabel(value: IntentWorkMode | null) { return { REMOTE: "Remoto", HYBRID: "Híbrido", ONSITE: "Presencial", ANY: "Sin restricción" }[value ?? "ANY"]; }
function salaryLabel(snapshot: OnboardingSnapshot) { return snapshot.salary.preferenceState === "UNRESTRICTED" ? "Sin mínimo" : snapshot.salary.minimum && snapshot.salary.currency ? new Intl.NumberFormat("es-ES", { style: "currency", currency: snapshot.salary.currency, maximumFractionDigits: 0 }).format(snapshot.salary.minimum) : "Opcional"; }
function tokenLabel(value: unknown) { if (value === "UNRESTRICTED") return "Sin restricción"; if (typeof value === "string") return value; if (typeof value === "object" && value && "minimum" in value && "currency" in value) return `${String(value.minimum)} ${String(value.currency)}`; return "Señal confirmada"; }
function responseFor(signal: "ROLE" | "MODE" | "LOCATION" | "SALARY", value: unknown) { if (signal === "ROLE") return `Entendido. ${String(value).trim()} será tu objetivo principal.`; if (signal === "MODE") return value === "UNRESTRICTED" ? "Entendido. No limitaré la búsqueda por modalidad." : `Perfecto. Daré prioridad a oportunidades ${modeLabel(value as IntentWorkMode).toLocaleLowerCase("es")}.`; if (signal === "LOCATION") return value === "UNRESTRICTED" ? "Bien. Buscaré sin limitar por ubicación." : `Perfecto. Tendré ${String(value).trim()} en cuenta.`; return value === "UNRESTRICTED" ? "Entendido. El salario no limitará la búsqueda." : `Usaré ${new Intl.NumberFormat("es-ES", { style: "currency", currency: (value as { currency: string }).currency, maximumFractionDigits: 0 }).format((value as { minimum: number }).minimum)} como mínimo cuando la oferta publique salario.`; }
function openingMessage(snapshot: OnboardingSnapshot) { if (!snapshot.role.value) return "Hola. Yo me encargo de buscar por ti. Primero necesito saber una cosa."; if (!snapshot.modality.value) return "Ya entiendo tu objetivo. Ahora necesito una decisión para priorizar bien."; if (snapshot.state === "SEARCH_PROFILE_REQUIRED") return "He encontrado un objetivo que puedo preparar contigo."; return "Ya recuerdo lo que necesito de ti."; }
