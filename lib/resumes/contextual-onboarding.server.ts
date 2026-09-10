import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ContextualProfile = { id: string; name: string };
export type ContextualResume = {
  id: string;
  candidate_profile_id: string;
  original_filename: string;
  status: "READY" | "APPROVED";
  created_at: string;
};
export type ContextualOnboardingState = "NO_RESUME" | "READY_RESUME" | "APPROVED_RESUME" | "AMBIGUOUS";
export type ContextualOnboarding = {
  state: ContextualOnboardingState;
  profile: ContextualProfile | null;
  resume: ContextualResume | null;
  resumes: ContextualResume[];
  profileChoices: ContextualProfile[];
};

export function resolveContextualOnboarding(
  profiles: ContextualProfile[],
  resumes: ContextualResume[],
  selectedResumeId: string | null,
): ContextualOnboarding {
  const activeProfileIds = new Set(profiles.map((profile) => profile.id));
  const usable = resumes.filter((resume) => activeProfileIds.has(resume.candidate_profile_id));
  const selected = selectedResumeId ? usable.find((resume) => resume.id === selectedResumeId) ?? null : null;
  const byProfile = new Map(profiles.map((profile) => [profile.id, profile]));
  if (selected) {
    return { state: selected.status === "APPROVED" ? "APPROVED_RESUME" : "READY_RESUME", profile: byProfile.get(selected.candidate_profile_id) ?? null, resume: selected, resumes: [selected], profileChoices: [] };
  }

  const approved = usable.filter((resume) => resume.status === "APPROVED");
  if (approved.length === 1) {
    const resume = approved[0];
    return { state: "APPROVED_RESUME", profile: byProfile.get(resume.candidate_profile_id) ?? null, resume, resumes: [resume], profileChoices: [] };
  }
  if (approved.length > 1) return { state: "AMBIGUOUS", profile: null, resume: null, resumes: approved, profileChoices: [] };

  const ready = usable.filter((resume) => resume.status === "READY");
  if (ready.length === 1) {
    const resume = ready[0];
    return { state: "READY_RESUME", profile: byProfile.get(resume.candidate_profile_id) ?? null, resume, resumes: [resume], profileChoices: [] };
  }
  if (ready.length > 1) return { state: "AMBIGUOUS", profile: null, resume: null, resumes: ready, profileChoices: [] };

  if (profiles.length === 1) return { state: "NO_RESUME", profile: profiles[0], resume: null, resumes: [], profileChoices: [] };
  return { state: profiles.length ? "AMBIGUOUS" : "NO_RESUME", profile: null, resume: null, resumes: [], profileChoices: profiles };
}

export async function loadContextualOnboarding(
  client: SupabaseClient,
  userId: string,
  selectedResumeId: string | null,
) {
  const { data: profileData, error: profileError } = await client
    .from("candidate_profiles")
    .select("id,name")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (profileError) throw new Error("No se pudieron cargar tus CV.");
  const profiles = (profileData ?? []) as ContextualProfile[];
  if (!profiles.length) return resolveContextualOnboarding([], [], selectedResumeId);

  const { data: resumeData, error: resumeError } = await client
    .from("resumes")
    .select("id,candidate_profile_id,original_filename,status,created_at")
    .eq("user_id", userId)
    .in("candidate_profile_id", profiles.map((profile) => profile.id))
    .in("status", ["READY", "APPROVED"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (resumeError) throw new Error("No se pudieron cargar tus CV.");
  return resolveContextualOnboarding(profiles, (resumeData ?? []) as ContextualResume[], selectedResumeId);
}
