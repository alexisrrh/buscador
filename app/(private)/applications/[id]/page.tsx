import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmApplicationAnswer } from "@/app/actions/application-engine";
import { Feedback, StatusBadge } from "@/components/feedback";
import { requireUser } from "@/lib/supabase/server";

type Checklist = Record<string, "PASS" | "FAIL" | "UNKNOWN">;

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: application }, { data: answers }, { data: events }] = await Promise.all([
    supabase.from("applications").select("*").eq("id", id).maybeSingle(),
    supabase.from("application_answers").select("*").eq("application_id", id).order("created_at"),
    supabase.from("application_events").select("event_type,created_at").eq("application_id", id).order("created_at"),
  ]);
  if (!application) notFound();
  const [{ data: offer }, { data: draft }] = await Promise.all([
    supabase.from("job_offers").select("title,companies(name)").eq("id", application.job_offer_id).maybeSingle(),
    supabase.from("application_drafts").select("recruiter_message,cover_letter").eq("id", application.application_draft_id).maybeSingle(),
  ]);
  const pending = (answers ?? []).filter((answer) => answer.requires_confirmation || answer.answer_value === null);
  const checklist = application.safety_checklist as Checklist;
  const reasons = application.decision_reasons as string[];

  return <>
    <div className="page-header">
      <div><p className="eyebrow">Motor de candidatura · ningún envío automático</p><h1>{offer?.title ?? "Candidatura preparada"}</h1><p>{companyName(offer?.companies)} · Modo recomendado: {modeLabel(application.apply_mode)}</p></div>
      <div className="actions"><StatusBadge status={application.status} /><span className="badge">{application.apply_mode}</span></div>
    </div>
    <Feedback message={query.message} error={query.error} />
    {pending.length > 0 && <div className="alert">Necesitamos confirmar {pending.length} {pending.length === 1 ? "respuesta" : "respuestas"} antes de postular.</div>}
    <section className="application-grid">
      <article className="card"><h2>Checklist de seguridad</h2><ul className="checklist">{Object.entries(checklist).map(([key, value]) => <li key={key}><strong>{gateIcon(value)}</strong> {checkLabel(key)} <span className={`badge ${value}`}>{value}</span></li>)}</ul></article>
      <article className="card"><h2>Decisión</h2><p><strong>{modeLabel(application.apply_mode)}</strong></p><ul>{reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul></article>
      <article className="card full"><h2>Respuestas</h2>{answers?.length ? <div className="stack">{answers.map((answer) => <div className="answer-row" key={answer.id}><div><strong>{answer.question_text}</strong><p className="muted">{answer.classification} · {answer.source}</p></div>{answer.requires_confirmation || answer.answer_value === null ? <form action={confirmApplicationAnswer}><input type="hidden" name="application_id" value={application.id} /><input type="hidden" name="application_answer_id" value={answer.id} /><input aria-label={`Respuesta: ${answer.question_text}`} name="answer_value" required /><button type="submit">Confirmar</button></form> : <code>{displayAnswer(answer.answer_value)}</code>}</div>)}</div> : <p className="muted">La fuente no expuso preguntas estructuradas. Se mantiene en modo manual.</p>}</article>
      <article className="card full"><h2>Material preparado</h2><h3>Mensaje</h3><p>{draft?.recruiter_message ?? "No preparado"}</p><h3>Carta</h3><p className="pre-wrap">{draft?.cover_letter ?? "No solicitada"}</p></article>
      <article className="card full"><h2>Auditoría</h2><ul>{events?.map((event) => <li key={`${event.event_type}-${event.created_at}`}>{event.event_type} · {new Date(event.created_at).toLocaleString("es-ES")}</li>)}</ul></article>
    </section>
    <div className="card application-actions"><a className="button secondary" href={application.target_url} target="_blank" rel="noreferrer">Abrir candidatura</a><Link className="button secondary" href={`/applications/drafts/${application.application_draft_id}`}>Volver al borrador</Link></div>
    <p className="hint">BuscaVacante no ha enviado esta candidatura. No existe ninguna acción de envío en esta pantalla.</p>
  </>;
}

function companyName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation ? String(relation.name) : "Empresa no informada";
}
function displayAnswer(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value); }
function gateIcon(value: string) { return value === "PASS" ? "✓" : value === "FAIL" ? "✕" : "?"; }
function modeLabel(value: string) { return { AUTO: "AUTOMÁTICA", REVIEW: "REVISIÓN", MANUAL: "MANUAL" }[value] ?? value; }
function checkLabel(value: string) { return ({ draft: "Borrador aprobado", resume: "CV aprobado", offer: "Oferta activa", score: "Score mínimo", requirements: "Requisitos", answers: "Respuestas", source: "Fuente", daily_limit: "Límite diario" } as Record<string, string>)[value] ?? value; }
function reasonLabel(value: string) { return value.replaceAll("_", " ").toLocaleLowerCase("es"); }
