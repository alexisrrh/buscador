import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approveApplicationDraft,
  generateApplicationCoverLetter,
  regenerateApplication,
  saveApplicationText,
} from "@/app/actions/applications";
import { Feedback, StatusBadge } from "@/components/feedback";
import type { CandidateEvidence, GapAnalysis, JobAnalysis, ResumeAdaptation } from "@/lib/applications/types";
import { requireUser } from "@/lib/supabase/server";

export default async function ApplicationDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase } = await requireUser();
  const { data: draft } = await supabase.from("application_drafts").select("*").eq("id", id).maybeSingle();
  if (!draft) notFound();
  const [{ data: offer }, { data: sources }] = await Promise.all([
    supabase.from("job_offers").select("title,location_text,work_mode,canonical_url,companies(name)").eq("id", draft.job_offer_id).maybeSingle(),
    supabase.from("job_offer_sources").select("source_url,job_sources(name,code)").eq("job_offer_id", draft.job_offer_id).limit(5),
  ]);
  const job = draft.job_analysis as JobAnalysis;
  const evidence = draft.profile_analysis as Omit<CandidateEvidence, "source_text">;
  const summary = draft.match_summary as { score?: number; eligibility?: string; gaps?: GapAnalysis };
  const gaps = summary.gaps ?? { strong_matches: [], partial_matches: [], missing_requirements: [], unknown_requirements: [] };
  const adaptation = draft.resume_adaptation as ResumeAdaptation;
  const sourceUrl = sources?.[0]?.source_url ?? offer?.canonical_url;
  const sourceName = relationName(sources?.[0]?.job_sources) ?? "Fuente no informada";

  return <>
    <div className="page-header">
      <div>
        <p className="eyebrow">Candidatura preparada · no enviada</p>
        <h1>{offer?.title ?? job.job_title}</h1>
        <p>{companyName(offer?.companies) ?? job.company ?? "Empresa no informada"} · Score {summary.score ?? "—"} · {sourceName}</p>
      </div>
      <div className="actions"><StatusBadge status={draft.status} />{summary.eligibility && <StatusBadge status={summary.eligibility} />}</div>
    </div>
    <Feedback message={query.message} error={query.error} />
    <section className="application-grid">
      <article className="card"><h2>Por qué encajas</h2><ItemList values={[...gaps.strong_matches, ...gaps.partial_matches]} empty="No se encontró evidencia directa para destacar." /></article>
      <article className="card"><h2>Lo que te falta</h2><ItemList values={[...gaps.missing_requirements, ...gaps.unknown_requirements]} empty="No se detectaron gaps explícitos." /></article>
      <article className="card full"><h2>CV adaptado</h2><h3>Resumen profesional</h3><p>{adaptation.professional_summary || "Sin resumen verificable."}</p><h3>Skills priorizadas</h3><ItemList values={adaptation.prioritized_skills} empty="Sin skills verificadas coincidentes." /><h3>Experiencia priorizada</h3><ItemList values={adaptation.experience_sections} empty="El extractor no identificó una sección de experiencia." /><h3>Skills solicitadas no acreditadas</h3><ItemList values={adaptation.excluded_requested_skills} empty="Ninguna." /></article>
      <article className="card full"><h2>Editar textos</h2><form className="stack" action={saveApplicationText}><input type="hidden" name="application_draft_id" value={draft.id} /><div className="field"><label htmlFor="recruiter-message">Mensaje al recruiter</label><textarea id="recruiter-message" name="recruiter_message" defaultValue={draft.recruiter_message ?? ""} /></div><div className="field"><label htmlFor="cover-letter">Carta</label><textarea id="cover-letter" name="cover_letter" defaultValue={draft.cover_letter ?? ""} rows={10} /></div>{draft.status !== "APPROVED" && <button type="submit">Guardar cambios</button>}</form>{!draft.cover_letter && draft.status !== "APPROVED" && <form className="actions" action={generateApplicationCoverLetter}><input type="hidden" name="application_draft_id" value={draft.id} /><button className="secondary" type="submit">Preparar carta opcional</button></form>}</article>
    </section>
    <div className="card application-actions">
      {draft.status !== "APPROVED" && <><form action={regenerateApplication}><input type="hidden" name="application_draft_id" value={draft.id} /><button className="secondary" type="submit">Regenerar</button></form><form action={approveApplicationDraft}><input type="hidden" name="application_draft_id" value={draft.id} /><button type="submit">Aprobar candidatura</button></form></>}
      {sourceUrl && <a className="button secondary" href={sourceUrl} target="_blank" rel="noreferrer">Abrir oferta</a>}
      <Link className="button secondary" href="/jobs">Volver a ofertas</Link>
    </div>
    <p className="hint">Aprobar este borrador no envía una candidatura ni modifica el CV original. Evidencia usada: {evidence.verified_skills.length} skills verificadas.</p>
  </>;
}

function ItemList({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="muted">{empty}</p>;
}

function companyName(value: unknown) {
  const company = Array.isArray(value) ? value[0] : value;
  return company && typeof company === "object" && "name" in company
    ? String(company.name)
    : null;
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return null;
  if ("name" in relation && relation.name) return String(relation.name);
  return "code" in relation && relation.code ? String(relation.code) : null;
}
