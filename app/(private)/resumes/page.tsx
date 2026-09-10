import { approveResume, setResumeStatus } from "@/app/actions/resumes";
import { Feedback, StatusBadge } from "@/components/feedback";
import { OfferPreparationContextCard } from "@/components/offer-preparation-context";
import { ResumeUploader } from "@/components/resume-uploader";
import { offerPreparationContextFromQuery, offerPreparationDestination } from "@/lib/intent-first";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile, Resume } from "@/lib/types";

type ResumesParams = {
  error?: string; message?: string; intent_role?: string; intent_location?: string; intent_mode?: string;
  offer_title?: string; offer_url?: string; action?: string; return_to?: string;
};

export default async function ResumesPage({ searchParams }: { searchParams: Promise<ResumesParams> }) {
  const query = await searchParams; const context = offerPreparationContextFromQuery(query); const returnTo = context ? offerPreparationDestination(context) : "/resumes"; const { supabase } = await requireUser();
  const [{ data: profileData }, { data: resumeData }] = await Promise.all([
    supabase.from("candidate_profiles").select("*").is("deleted_at", null).order("name"),
    supabase.from("resumes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const profiles = (profileData ?? []) as CandidateProfile[]; const resumes = (resumeData ?? []) as Resume[];
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return <><OfferPreparationContextCard context={context} /><div className="page-header"><div><p className="eyebrow">Paso 3 de 3</p><h1>Tus currículums</h1><p>Sube un CV para cada perfil y elige cuál quieres usar actualmente.</p></div></div><Feedback error={query.error} message={query.message} />{profiles.length ? <ResumeUploader profiles={profiles} /> : <div className="card empty">Primero crea tu perfil profesional y después podrás subir un CV.</div>}<h2 className="section-title">CV guardados</h2><section className="list">{resumes.length ? resumes.map((resume) => <article className="card list-item" key={resume.id}><div><h3>{resume.original_filename} · Versión {resume.version}</h3><p>{profileNames.get(resume.candidate_profile_id) ?? "Perfil archivado"} · {(resume.file_size_bytes / 1024).toFixed(0)} KB</p></div><div className="actions"><StatusBadge status={resume.status} />{resume.status === "READY" && <form action={approveResume}><input type="hidden" name="id" value={resume.id} /><input type="hidden" name="return_to" value={returnTo} /><button className="small" type="submit">Usar este CV</button></form>}{["READY", "APPROVED"].includes(resume.status) && <ResumeAction id={resume.id} intent="archive" label="Guardar como anterior" returnTo={returnTo} />}<ResumeAction id={resume.id} intent="delete" label="Eliminar" danger returnTo={returnTo} /></div></article>) : <div className="card empty">Todavía no has guardado ningún CV.</div>}</section></>;
}

function ResumeAction({ id, intent, label, danger, returnTo }: { id: string; intent: string; label: string; danger?: boolean; returnTo: string }) {
  return <form action={setResumeStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value={intent} /><input type="hidden" name="return_to" value={returnTo} /><button className={`${danger ? "danger" : "secondary"} small`} type="submit">{label}</button></form>;
}
