import Link from "next/link";

import { approveResume } from "@/app/actions/resumes";
import { ResumeUploader } from "@/components/resume-uploader";
import { offerPreparationDestination, opportunitiesDestination, type OfferPreparationContext, type SearchIntent } from "@/lib/intent-first";
import type { ContextualOnboarding, ContextualResume } from "@/lib/resumes/contextual-onboarding.server";

type ResumeOnboardingProps = {
  context: OfferPreparationContext | null;
  intent: SearchIntent | null;
  onboarding: ContextualOnboarding;
};

export function ResumeOnboarding({ context, intent, onboarding }: ResumeOnboardingProps) {
  const contextual = Boolean(context);
  const uploadCopy = contextual
    ? "Sube tu CV. BuscaVacante utilizará tu experiencia real para ayudarte a preparar esta candidatura."
    : "Lo analizaremos para ayudarte a encontrar oportunidades compatibles con tu experiencia.";

  if (onboarding.state === "APPROVED_RESUME" && onboarding.resume) {
    return <section className="card stack resume-onboarding-result">
      <p className="eyebrow">CV listo</p>
      <h1>{contextual ? "Ya podemos continuar con esta oportunidad." : "Tu CV está listo para empezar."}</h1>
      {context ? <a className="button" href={context.offerUrl} target="_blank" rel="noreferrer">Continuar con la oferta</a>
        : <Link className="button" href={intent ? opportunitiesDestination(intent) : "/oportunidades"}>Ver oportunidades</Link>}
    </section>;
  }

  if (onboarding.state === "READY_RESUME" && onboarding.resume) {
    return <ResumeConfirmation context={context} intent={intent} resume={onboarding.resume} />;
  }

  if (onboarding.state === "AMBIGUOUS") {
    if (onboarding.resumes.length) return <ResumeChoice context={context} intent={intent} resumes={onboarding.resumes} />;
    return <section className="stack"><div className="page-header"><p className="eyebrow">Un paso más</p><h1>¿A qué trayectoria corresponde este CV?</h1><p>Elige solo porque tienes más de una trayectoria guardada.</p></div><ResumeUploader profiles={onboarding.profileChoices} contextual autoApproveFirst heading="Sube tu CV" description={uploadCopy} submitLabel="Subir mi CV" /></section>;
  }

  return <section className="stack"><div className="page-header"><p className="eyebrow">{contextual ? "Tu siguiente paso" : "Completa tu perfil"}</p><h1>{context ? `Prepara tu candidatura para ${context.offerTitle}` : "Sube tu CV"}</h1><p>{uploadCopy}</p>{context ? <a className="secondary-link" href={context.offerUrl} target="_blank" rel="noreferrer">Ver oferta original</a> : null}</div><ResumeUploader profiles={onboarding.profile ? [onboarding.profile] : []} contextual autoApproveFirst heading="Subir mi CV" description="PDF o Word · privado y protegido" submitLabel="Subir mi CV" /></section>;
}

function ResumeConfirmation({ context, intent, resume }: { context: OfferPreparationContext | null; intent: SearchIntent | null; resume: ContextualResume }) {
  return <section className="card stack resume-onboarding-result"><p className="eyebrow">CV subido correctamente</p><h1>¿Quieres usar este CV?</h1><p>{resume.original_filename}</p><p className="muted">Te pedimos confirmación porque hay más de un CV posible para continuar.</p><form action={approveResume}><input type="hidden" name="id" value={resume.id} /><input type="hidden" name="return_to" value={approvalDestination(context, intent, resume.id)} /><button type="submit">Usar este CV</button></form></section>;
}

function ResumeChoice({ context, intent, resumes }: { context: OfferPreparationContext | null; intent: SearchIntent | null; resumes: ContextualResume[] }) {
  return <section className="stack"><div className="page-header"><p className="eyebrow">Elige tu CV</p><h1>¿Cuál quieres usar?</h1><p>Te lo preguntamos porque hay más de un CV posible para continuar.</p></div>{resumes.map((resume) => resume.status === "READY"
    ? <ResumeConfirmation key={resume.id} context={context} intent={intent} resume={resume} />
    : <article className="card list-item" key={resume.id}><div><h2>{resume.original_filename}</h2><p>Listo para continuar.</p></div><Link className="button" href={approvalDestination(context, intent, resume.id)}>Usar este CV</Link></article>)}</section>;
}

function approvalDestination(context: OfferPreparationContext | null, intent: SearchIntent | null, resumeId: string) {
  if (context) return offerPreparationDestination({ ...context, resumeId });
  return intent ? opportunitiesDestination(intent) : "/resumes";
}
