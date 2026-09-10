import Link from "next/link";

import { approveResume, setResumeStatus } from "@/app/actions/resumes";
import { Feedback, StatusBadge } from "@/components/feedback";
import { OfferPreparationContextCard } from "@/components/offer-preparation-context";
import { ResumeUploader } from "@/components/resume-uploader";
import { offerPreparationContextFromQuery, offerPreparationDestination } from "@/lib/intent-first";
import { loadContextualOnboarding, type ContextualOnboarding, type ContextualResume } from "@/lib/resumes/contextual-onboarding.server";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile, Resume } from "@/lib/types";

type ResumesParams = {
  error?: string; message?: string; intent_role?: string; intent_location?: string; intent_mode?: string;
  offer_title?: string; offer_url?: string; action?: string; return_to?: string; resume_id?: string;
};

export default async function ResumesPage({ searchParams }: { searchParams: Promise<ResumesParams> }) {
  const query = await searchParams;
  const context = offerPreparationContextFromQuery(query);
  const { supabase, user } = await requireUser();

  if (context && user) {
    const onboarding = await loadContextualOnboarding(supabase, user.id, context.resumeId);
    return <>
      <OfferPreparationContextCard context={context} />
      <div className="page-header"><div><p className="eyebrow">Tu siguiente paso</p><h1>Prepara tu CV</h1><p>Usaremos un CV aprobado antes de continuar con esta oportunidad.</p></div></div>
      <Feedback error={query.error} message={query.message} />
      <ContextualResumeStep context={context} onboarding={onboarding} />
    </>;
  }

  const [{ data: profileData }, { data: resumeData }] = await Promise.all([
    supabase.from("candidate_profiles").select("*").is("deleted_at", null).order("name"),
    supabase.from("resumes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const profiles = (profileData ?? []) as CandidateProfile[];
  const resumes = (resumeData ?? []) as Resume[];
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return <><div className="page-header"><div><p className="eyebrow">Paso 3 de 3</p><h1>Tus currículums</h1><p>Sube un CV para cada perfil y elige cuál quieres usar actualmente.</p></div></div><Feedback error={query.error} message={query.message} />{profiles.length ? <ResumeUploader profiles={profiles} /> : <div className="card empty">Primero crea tu perfil profesional y después podrás subir un CV.</div>}<h2 className="section-title">CV guardados</h2><section className="list">{resumes.length ? resumes.map((resume) => <article className="card list-item" key={resume.id}><div><h3>{resume.original_filename} · Versión {resume.version}</h3><p>{profileNames.get(resume.candidate_profile_id) ?? "Perfil archivado"} · {(resume.file_size_bytes / 1024).toFixed(0)} KB</p></div><div className="actions"><StatusBadge status={resume.status} />{resume.status === "READY" && <form action={approveResume}><input type="hidden" name="id" value={resume.id} /><input type="hidden" name="return_to" value="/resumes" /><button className="small" type="submit">Usar este CV</button></form>}{["READY", "APPROVED"].includes(resume.status) && <ResumeAction id={resume.id} intent="archive" label="Guardar como anterior" returnTo="/resumes" />}<ResumeAction id={resume.id} intent="delete" label="Eliminar" danger returnTo="/resumes" /></div></article>) : <div className="card empty">Todavía no has guardado ningún CV.</div>}</section></>;
}

function ContextualResumeStep({ context, onboarding }: { context: NonNullable<ReturnType<typeof offerPreparationContextFromQuery>>; onboarding: ContextualOnboarding }) {
  if (onboarding.state === "APPROVED_RESUME" && onboarding.resume) {
    return <article className="card stack"><h2>✓ Tu CV está listo para continuar</h2><p>{onboarding.resume.original_filename}</p><p className="muted">Seguiremos usando este CV para esta oportunidad.</p></article>;
  }
  if (onboarding.state === "NO_RESUME") {
    return <section className="stack"><div><h2>Sube tu CV</h2><p className="muted">PDF o Word. Lo guardaremos de forma privada y podrás confirmarlo antes de usarlo.</p></div><ResumeUploader profiles={onboarding.profile ? [onboarding.profile] : []} contextual /></section>;
  }
  if (onboarding.state === "READY_RESUME" && onboarding.resume) {
    return <ResumeApprovalCard context={context} resume={onboarding.resume} />;
  }
  if (onboarding.resumes.length) {
    return <section className="stack"><div><h2>Elige el CV que quieres usar</h2><p className="muted">Hay más de un CV preparado para continuar. No elegiremos uno por ti.</p></div>{onboarding.resumes.map((resume) => resume.status === "READY"
      ? <ResumeApprovalCard key={resume.id} context={context} resume={resume} />
      : <article className="card list-item" key={resume.id}><div><h3>{resume.original_filename}</h3><p>CV aprobado</p></div><Link className="button" href={destinationForResume(context, resume.id)}>Usar este CV</Link></article>)}</section>;
  }
  return <section className="stack"><div><h2>¿Para qué trayectoria es este CV?</h2><p className="muted">Tienes varias trayectorias profesionales. Elige la que corresponde al documento para no mezclar información.</p></div><ResumeUploader profiles={onboarding.profileChoices} contextual /></section>;
}

function ResumeApprovalCard({ context, resume }: { context: NonNullable<ReturnType<typeof offerPreparationContextFromQuery>>; resume: ContextualResume }) {
  return <article className="card list-item"><div><h2>CV preparado correctamente</h2><p>{resume.original_filename}</p><p className="muted">Confirma que quieres usar este documento para esta oportunidad.</p></div><form action={approveResume}><input type="hidden" name="id" value={resume.id} /><input type="hidden" name="return_to" value={destinationForResume(context, resume.id)} /><button type="submit">Usar este CV</button></form></article>;
}

function destinationForResume(context: NonNullable<ReturnType<typeof offerPreparationContextFromQuery>>, resumeId: string) {
  return offerPreparationDestination({ ...context, resumeId });
}

function ResumeAction({ id, intent, label, danger, returnTo }: { id: string; intent: string; label: string; danger?: boolean; returnTo: string }) {
  return <form action={setResumeStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="intent" value={intent} /><input type="hidden" name="return_to" value={returnTo} /><button className={`${danger ? "danger" : "secondary"} small`} type="submit">{label}</button></form>;
}
