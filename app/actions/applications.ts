"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildCoverLetter } from "@/lib/applications/generator";
import { prepareApplicationDraft, ApplicationPreparationError } from "@/lib/applications/service.server";
import type { CandidateEvidence, GapAnalysis, JobAnalysis } from "@/lib/applications/types";
import { requireUser } from "@/lib/supabase/server";

function uuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

export async function prepareApplication(formData: FormData) {
  const matchId = uuid(formData.get("job_match_id"));
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  if (!matchId) redirect("/jobs?error=Oferta%20no%20v%C3%A1lida");
  let draftId: string;
  try {
    const draft = await prepareApplicationDraft({ authClient: supabase, userId: user.id, jobMatchId: matchId });
    draftId = draft.id;
  } catch (error) {
    const message = publicPreparationError(error);
    const resumeRequired = error instanceof ApplicationPreparationError && error.code === "APPROVED_RESUME_REQUIRED";
    redirect(`/jobs?error=${encodeURIComponent(message)}${resumeRequired ? "&resume_required=1" : ""}`);
  }
  redirect(`/applications/drafts/${draftId}`);
}

export async function regenerateApplication(formData: FormData) {
  const draftId = uuid(formData.get("application_draft_id"));
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("application_drafts").select("match_summary").eq("id", draftId).maybeSingle();
  const summary = data?.match_summary as { job_match_id?: string } | null;
  if (!summary?.job_match_id) redirect(`/applications/drafts/${draftId}?error=Borrador%20no%20v%C3%A1lido`);
  try {
    await prepareApplicationDraft({
      authClient: supabase,
      userId: user.id,
      jobMatchId: summary.job_match_id,
      regenerate: true,
    });
  } catch (error) {
    redirect(`/applications/drafts/${draftId}?error=${encodeURIComponent(publicPreparationError(error))}`);
  }
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(`/applications/drafts/${draftId}?message=Candidatura%20regenerada`);
}

export async function saveApplicationText(formData: FormData) {
  const draftId = uuid(formData.get("application_draft_id"));
  const recruiterMessage = String(formData.get("recruiter_message") ?? "").slice(0, 4000);
  const coverLetter = String(formData.get("cover_letter") ?? "").slice(0, 12000);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("update_application_draft_text", {
    p_application_draft_id: draftId,
    p_recruiter_message: recruiterMessage,
    p_cover_letter: coverLetter,
  });
  if (error) redirect(`/applications/drafts/${draftId}?error=No%20se%20pudo%20guardar%20el%20borrador`);
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(`/applications/drafts/${draftId}?message=Borrador%20guardado`);
}

export async function generateApplicationCoverLetter(formData: FormData) {
  const draftId = uuid(formData.get("application_draft_id"));
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("application_drafts")
    .select("job_analysis,profile_analysis,match_summary,recruiter_message")
    .eq("id", draftId).maybeSingle();
  if (!data) redirect(`/applications/drafts/${draftId}?error=Borrador%20no%20encontrado`);
  const job = data.job_analysis as JobAnalysis;
  const evidence = { ...(data.profile_analysis as Omit<CandidateEvidence, "source_text">), source_text: "" };
  const gaps = ((data.match_summary as { gaps?: GapAnalysis }).gaps ?? {
    strong_matches: [], partial_matches: [], missing_requirements: [], unknown_requirements: [],
  });
  const coverLetter = buildCoverLetter({ job, evidence, gaps });
  const { error } = await supabase.rpc("update_application_draft_text", {
    p_application_draft_id: draftId,
    p_recruiter_message: data.recruiter_message ?? "",
    p_cover_letter: coverLetter,
  });
  if (error) redirect(`/applications/drafts/${draftId}?error=No%20se%20pudo%20generar%20la%20carta`);
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(`/applications/drafts/${draftId}?message=Carta%20preparada`);
}

export async function approveApplicationDraft(formData: FormData) {
  const draftId = uuid(formData.get("application_draft_id"));
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("set_application_draft_status", {
    p_application_draft_id: draftId,
    p_status: "APPROVED",
  });
  if (error) redirect(`/applications/drafts/${draftId}?error=No%20se%20pudo%20aprobar%20el%20borrador`);
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(`/applications/drafts/${draftId}?message=Candidatura%20aprobada%20sin%20enviar`);
}

function publicPreparationError(error: unknown) {
  if (error instanceof ApplicationPreparationError) {
    if (error.code === "APPROVED_RESUME_REQUIRED") return "Necesitas aprobar un CV antes de preparar una candidatura.";
    if (error.code === "GENERATION_NOT_CONFIGURED") return "GENERATION_NOT_CONFIGURED";
    return error.message;
  }
  return "No se pudo preparar la candidatura.";
}
