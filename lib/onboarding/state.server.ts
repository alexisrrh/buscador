import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntentWorkMode, SearchIntent } from "@/lib/intent-first";
import { resolveOnboardingState, type OnboardingSnapshot, type OnboardingStateInput } from "@/lib/onboarding/state";
import { resolveContextualOnboarding, type ContextualProfile, type ContextualResume } from "@/lib/resumes/contextual-onboarding.server";

export async function loadOnboardingSnapshot(input: { client: SupabaseClient; userId: string; intent: SearchIntent | null; preparingApplication?: boolean; selectedResumeId?: string | null }): Promise<OnboardingSnapshot> {
  const { client, userId } = input;
  const [{ data: profileData, error: profileError }, { data: searchData, error: searchError }, { data: preferenceData, error: preferenceError }] = await Promise.all([
    client.from("candidate_profiles").select("id,headline,job_family").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: true }).order("id", { ascending: true }),
    client.from("search_profiles").select("id,candidate_profile_id,name,status,version").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: true }),
    client.from("job_preferences").select("search_profile_id,search_profile_version,locations,work_modes,minimum_salary,currency,location_preference_state,work_mode_preference_state,salary_preference_state").eq("user_id", userId),
  ]);
  if (profileError || searchError || preferenceError) throw new Error("No se pudo cargar el estado de onboarding.");

  const profiles = (profileData ?? []).map((profile) => ({ id: profile.id, headline: profile.headline, jobFamily: profile.job_family }));
  const profileIds = profiles.map((profile) => profile.id);
  const { data: resumeData, error: resumeError } = profileIds.length
    ? await client.from("resumes").select("id,candidate_profile_id,status,original_filename,created_at").eq("user_id", userId).in("candidate_profile_id", profileIds).in("status", ["READY", "APPROVED"]).is("deleted_at", null).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (resumeError) throw new Error("No se pudo cargar el estado de onboarding.");

  // Keep CV ambiguity rules aligned with the contextual resume flow.
  const contextualProfiles: ContextualProfile[] = profiles.map((profile) => ({ id: profile.id, name: profile.headline ?? profile.jobFamily ?? "Perfil" }));
  const contextualResumes = (resumeData ?? []) as ContextualResume[];
  const contextual = resolveContextualOnboarding(contextualProfiles, contextualResumes, input.selectedResumeId ?? null);
  const stateInput: OnboardingStateInput = {
    authenticated: true,
    intent: input.intent,
    profiles,
    searches: (searchData ?? []).map((search) => ({ id: search.id, candidateProfileId: search.candidate_profile_id, name: search.name, status: search.status, version: search.version })),
    preferences: (preferenceData ?? []).map((preferences) => ({ searchProfileId: preferences.search_profile_id, searchProfileVersion: preferences.search_profile_version, locations: preferences.locations as Array<{ label?: string | null }>, workModes: preferences.work_modes as IntentWorkMode[], minimumSalary: preferences.minimum_salary, currency: preferences.currency, locationPreferenceState: preferences.location_preference_state, workModePreferenceState: preferences.work_mode_preference_state, salaryPreferenceState: preferences.salary_preference_state })),
    resumes: contextual.resumes.length ? contextual.resumes.map((resume) => ({ id: resume.id, candidateProfileId: resume.candidate_profile_id, status: resume.status })) : (resumeData ?? []).map((resume) => ({ id: resume.id, candidateProfileId: resume.candidate_profile_id, status: resume.status as "READY" | "APPROVED" })),
    selectedResumeId: input.selectedResumeId,
    preparingApplication: input.preparingApplication,
  };
  return resolveOnboardingState(stateInput);
}
