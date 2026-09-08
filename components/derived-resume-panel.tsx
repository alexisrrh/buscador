import { generateAdaptedResume, chooseAdaptedResume } from "@/app/actions/derived-resumes";
import { requireUser } from "@/lib/supabase/server";
import { previewDerivedResume } from "@/lib/derived-resumes/service.server";
import type { DerivedResume, ResumeContent } from "@/lib/derived-resumes/content";

export async function DerivedResumePanel({ draftId, sourceResumeId, approved, offerTitle }: {
  draftId: string; sourceResumeId: string; approved: boolean; offerTitle: string;
}) {
  const { user, supabase } = await requireUser();
  if (!user) return null;
  const [{ data: records }, { data: source }, { data: application }] = await Promise.all([
    supabase.from("derived_resumes").select("*").eq("application_draft_id", draftId).order("created_at", { ascending: false }),
    supabase.from("resumes").select("version").eq("id", sourceResumeId).maybeSingle(),
    supabase.from("applications").select("id,derived_resume_id").eq("application_draft_id", draftId).maybeSingle(),
  ]);
  const versions = (records ?? []) as DerivedResume[];
  let preview: ResumeContent | null = null;
  let previewFailed = false;
  if (approved) {
    try { preview = await previewDerivedResume({ authClient: supabase, userId: user.id, draftId }); }
    catch { previewFailed = true; }
  }
  return <article className="card full">
    <h2>Archivo CV adaptado</h2>
    <p>Basado en: CV aprobado v{source?.version ?? "—"} · Oferta: {offerTitle} · Renderer: v1</p>
    {preview && <details><summary>Revisar contenido antes de generar</summary><ContentPreview content={preview} /></details>}
    {previewFailed && <p role="alert">No se pudo validar el contenido del CV aprobado. La generación volverá a comprobarlo.</p>}
    {approved ? <form action={generateAdaptedResume}><input type="hidden" name="application_draft_id" value={draftId} /><button type="submit">{versions.some(v => v.status === "READY") ? "Regenerar" : "Generar CV adaptado"}</button></form> : <p>Aprueba el borrador para generar el CV.</p>}
    {versions.map(version => <div key={version.id}>
      <h3>{version.status === "READY" ? "CV adaptado listo" : version.status}</h3>
      <p>Generado: {new Date(version.created_at).toLocaleString("es-ES")} · {version.generation_version} · {version.size_bytes ?? 0} bytes · {version.pages ?? "—"} páginas</p>
      {version.failure_code && <p role="alert">No se pudo generar: {version.failure_code}</p>}
      {version.content_snapshot && <details><summary>Revisar contenido de esta versión</summary><ContentPreview content={version.content_snapshot} /></details>}
      {(version.status === "READY" || version.status === "ARCHIVED") && <div className="actions">
        <a href={`/api/derived-resumes/${version.id}`} target="_blank" rel="noreferrer">Ver PDF</a>
        <a href={`/api/derived-resumes/${version.id}?download=1`}>Descargar PDF</a>
        {application && version.status === "READY" && <form action={chooseAdaptedResume}>
          <input type="hidden" name="application_draft_id" value={draftId} /><input type="hidden" name="derived_resume_id" value={version.id} />
          <button type="submit" disabled={application.derived_resume_id === version.id}>{application.derived_resume_id === version.id ? "CV elegido" : "Usar en esta postulación"}</button>
        </form>}
      </div>}
    </div>)}
  </article>;
}

function ContentPreview({ content }: { content: ResumeContent }) {
  return <div><h3>{content.name}</h3><p>{content.title}</p><p>{content.contact.join(" | ")}</p><p>Candidatura: {content.target}</p>
    {content.sections.map(section => <section key={section.heading}><h4>{section.heading}</h4>{section.lines.map((line, index) => <p key={index}>{line}</p>)}</section>)}
  </div>;
}
