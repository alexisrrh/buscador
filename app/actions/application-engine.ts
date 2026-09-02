"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApplicationEngineError, prepareSubmission } from "@/lib/application-engine/service.server";
import { requireUser } from "@/lib/supabase/server";

function uuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

export async function prepareApplicationSubmission(formData: FormData) {
  const draftId = uuid(formData.get("application_draft_id"));
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  if (!draftId) redirect("/jobs?error=Borrador%20no%20v%C3%A1lido");
  let applicationId: string;
  try {
    applicationId = (await prepareSubmission({
      authClient: supabase,
      userId: user.id,
      applicationDraftId: draftId,
    })).id;
  } catch (error) {
    const message = error instanceof ApplicationEngineError ? error.message : "No se pudo preparar la postulación.";
    redirect(`/applications/drafts/${draftId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/applications/${applicationId}`);
}

export async function confirmApplicationAnswer(formData: FormData) {
  const applicationId = uuid(formData.get("application_id"));
  const answerId = uuid(formData.get("application_answer_id"));
  const value = String(formData.get("answer_value") ?? "").trim();
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  if (!applicationId || !answerId || !value) redirect(`/applications/${applicationId}?error=Respuesta%20no%20v%C3%A1lida`);
  const { error } = await supabase.rpc("confirm_application_answer", {
    p_application_answer_id: answerId,
    p_answer_value: value,
  });
  if (error) redirect(`/applications/${applicationId}?error=No%20se%20pudo%20confirmar%20la%20respuesta`);
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}?message=Respuesta%20confirmada`);
}
