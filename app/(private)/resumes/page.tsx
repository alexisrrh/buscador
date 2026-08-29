import { approveResume, setResumeStatus } from "@/app/actions/resumes";
import { Feedback, StatusBadge } from "@/components/feedback";
import { ResumeUploader } from "@/components/resume-uploader";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile, Resume } from "@/lib/types";

export default async function ResumesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const query = await searchParams; const { supabase } = await requireUser();
  const [{ data: profileData }, { data: resumeData }] = await Promise.all([
    supabase.from("candidate_profiles").select("*").is("deleted_at", null).order("name"),
    supabase.from("resumes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const profiles = (profileData ?? []) as CandidateProfile[]; const resumes = (resumeData ?? []) as Resume[];
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return <><div className="page-header"><div><h1>CV privados</h1><p>Versiones aisladas por perfil en el bucket privado.</p></div></div><Feedback error={query.error} message={query.message} />{profiles.length ? <ResumeUploader profiles={profiles} /> : <div className="card empty">Crea un perfil antes de subir un CV.</div>}<h2 className="section-title">Versiones</h2><section className="list">{resumes.length ? resumes.map((resume) => <article className="card list-item" key={resume.id}><div><h3>{resume.original_filename} · v{resume.version}</h3><p>{profileNames.get(resume.candidate_profile_id) ?? "Perfil archivado"} · {(resume.file_size_bytes / 1024).toFixed(0)} KiB</p></div><div className="actions"><StatusBadge status={resume.status} />{["READY", "ARCHIVED"].includes(resume.status) && <form action={approveResume}><input type="hidden" name="id" value={resume.id} /><button className="small" type="submit">Aprobar</button></form>}{resume.status !== "ARCHIVED" && <ResumeAction id={resume.id} intent="archive" label="Archivar" />}<ResumeAction id={resume.id} intent="delete" label="Eliminar" danger /></div></article>) : <div className="card empty">No hay CV almacenados.</div>}</section></>;
}

function ResumeAction({ id, intent, label, danger }: { id: string; intent: string; label: string; danger?: boolean }) {
  return <form action={setResumeStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value={intent} /><button className={`${danger ? "danger" : "secondary"} small`} type="submit">{label}</button></form>;
}
