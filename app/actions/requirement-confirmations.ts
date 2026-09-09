"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { skillsInText } from "@/lib/applications/analysis";
import { createApplicationServiceClient } from "@/lib/applications/repository.server";
import { prepareApplicationDraft } from "@/lib/applications/service.server";
import type { RequirementResolution } from "@/lib/applications/types";
import { requireUser } from "@/lib/supabase/server";
import { trimmed } from "@/lib/validation";

const id = (value: FormDataEntryValue | null) => trimmed(value, 36);
const path = (draftId: string, value: string, error = false) => `/applications/drafts/${draftId}?${error ? "error" : "message"}=${encodeURIComponent(value)}`;
const key = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function confirmableRequirement(summary: Record<string, unknown>, requirement: string) {
  const gaps = summary.gaps as { requirement_resolution?: RequirementResolution[] } | undefined;
  return gaps?.requirement_resolution?.find(item => item.requirement === requirement && item.status === "CONFIRMABLE");
}

async function updateDecision(input: { draftId: string; userId: string; summary: Record<string, unknown>; decisions: Record<string, string> }) {
  const { data, error } = await createApplicationServiceClient().from("application_drafts")
    .update({ match_summary: { ...input.summary, confirmation_decisions: input.decisions } })
    .eq("id", input.draftId).eq("user_id", input.userId).in("status", ["DRAFT", "READY_FOR_REVIEW"])
    .select("id").maybeSingle();
  if (error || !data) throw new Error("Este borrador ya no admite cambios de evidencia.");
}

async function ownedDraft(draftId: string) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("application_drafts").select("id,status,candidate_profile_id,match_summary").eq("id", draftId).eq("user_id", user.id).maybeSingle();
  if (!data || data.status === "APPROVED") throw new Error("Este borrador ya no admite cambios de evidencia.");
  return { supabase, userId: user.id, draft: data };
}

export async function declineRequirementConfirmation(formData: FormData) {
  const draftId = id(formData.get("application_draft_id"));
  const requirement = trimmed(formData.get("requirement"), 160);
  try {
    const { userId, draft } = await ownedDraft(draftId);
    const summary = (draft.match_summary ?? {}) as Record<string, unknown>;
    if (!requirement || !confirmableRequirement(summary, requirement)) throw new Error("Esta confirmación ya no está disponible.");
    const decisions = { ...(summary.confirmation_decisions as Record<string, string> | undefined), [key(requirement)]: "DECLINED" };
    await updateDecision({ draftId: draft.id, userId, summary, decisions });
  } catch (error) { redirect(path(draftId, error instanceof Error ? error.message : "No se pudo guardar tu respuesta.", true)); }
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(path(draftId, "Marcado como no confirmado para esta candidatura."));
}

export async function confirmRequirementExperience(formData: FormData) {
  const draftId = id(formData.get("application_draft_id"));
  const requirement = trimmed(formData.get("requirement"), 160);
  const profileId = id(formData.get("evidence_profile_id"));
  const context = trimmed(formData.get("context"), 300);
  const claim = trimmed(formData.get("claim"), 1200);
  try {
    if (!requirement || !profileId || context.length < 8 || claim.length < 12) throw new Error("Indica dónde lo utilizaste y qué hiciste antes de confirmar.");
    if (!skillsInText(claim).includes(requirement)) throw new Error(`El contexto debe explicar tu uso real de ${requirement}.`);
    const { supabase, userId, draft } = await ownedDraft(draftId);
    const summary = (draft.match_summary ?? {}) as Record<string, unknown>;
    if (!confirmableRequirement(summary, requirement)) throw new Error("Esta confirmación ya no está disponible.");
    const { data: subject } = await supabase.from("professional_evidence_profiles").select("id").eq("id", profileId).eq("user_id", userId).eq("candidate_profile_id", draft.candidate_profile_id).maybeSingle();
    if (!subject) throw new Error("Selecciona un proyecto o experiencia de tu perfil.");
    const { data: existing } = await supabase.from("professional_evidence_items").select("id").eq("user_id", userId).eq("candidate_profile_id", draft.candidate_profile_id).eq("profile_id", profileId).eq("source_type", "USER_CONFIRMED").eq("exact_claim", claim).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("professional_evidence_items").insert({ user_id: userId, candidate_profile_id: draft.candidate_profile_id, profile_id: profileId, category: "TECHNOLOGY", exact_claim: claim, source_type: "USER_CONFIRMED", source_reference: context, verification_status: "VERIFIED", confirmed_at: new Date().toISOString(), relevance_tags: [requirement] });
      if (error) throw new Error(error.message);
    }
    const decisions = { ...(summary.confirmation_decisions as Record<string, string> | undefined) };
    delete decisions[key(requirement)];
    await updateDecision({ draftId: draft.id, userId, summary, decisions });
    const jobMatchId = String(summary.job_match_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jobMatchId)) throw new Error("No se pudo actualizar la candidatura.");
    await prepareApplicationDraft({ authClient: supabase, userId, jobMatchId, regenerate: true });
  } catch (error) { redirect(path(draftId, error instanceof Error ? error.message : "No se pudo confirmar tu experiencia.", true)); }
  revalidatePath(`/applications/drafts/${draftId}`);
  redirect(path(draftId, "Experiencia confirmada y candidatura actualizada."));
}
