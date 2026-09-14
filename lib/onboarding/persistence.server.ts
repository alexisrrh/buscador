import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOnboardingSnapshot } from "@/lib/onboarding/state.server";
import { applyOnboardingSignal, defaultCanonicalPreferences, defaultCanonicalSearch, preferencesPayload, searchPayload, type CanonicalPreferences, type CanonicalSearch, type OnboardingPatchError, type OnboardingSignalInput } from "@/lib/onboarding/persistence";
import type { OnboardingSnapshot } from "@/lib/onboarding/state";

export type ConfirmOnboardingResult = { ok: true; snapshot: OnboardingSnapshot; nextSignal: OnboardingSnapshot["nextSignal"] } | { ok: false; error: { code: OnboardingPatchError | "AUTH_REQUIRED" | "AMBIGUOUS_PROFILE" | "PERSISTENCE_FAILED"; message: string } };
type PublicErrorCode = OnboardingPatchError | "AUTH_REQUIRED" | "AMBIGUOUS_PROFILE" | "PERSISTENCE_FAILED";

export async function persistOnboardingSignal(input: { client: SupabaseClient; userId: string; signal: OnboardingSignalInput }): Promise<ConfirmOnboardingResult> {
  const { client, userId, signal } = input;
  const { data: resolved, error: profileError } = await client.rpc("ensure_contextual_candidate_profile");
  const profile = Array.isArray(resolved) ? resolved[0] : resolved;
  if (profileError || !profile?.candidate_profile_id) return failure(profile?.resolution === "AMBIGUOUS" ? "AMBIGUOUS_PROFILE" : "PERSISTENCE_FAILED");
  const profileId = String(profile.candidate_profile_id);
  const canonical = await loadCanonicalSearch(client, userId, profileId);
  const patched = applyOnboardingSignal(canonical.search, canonical.preferences, signal);
  if (!patched.ok) return failure(patched.code);

  // A repeated confirmation is safe: there is no additional SearchProfile or
  // preference version to create. Across tabs, the last confirmed write wins.
  if (sameCanonical(canonical.search, patched.search) && sameCanonical(canonical.preferences, patched.preferences)) {
    const snapshot = await loadOnboardingSnapshot({ client, userId, intent: null });
    return { ok: true, snapshot, nextSignal: snapshot.nextSignal };
  }

  if (signal.signal === "ROLE") {
    const { error } = await client.from("candidate_profiles").update({ name: patched.search.name, headline: patched.search.name, job_family: patched.search.name }).eq("id", profileId).eq("user_id", userId);
    if (error) return failure("PERSISTENCE_FAILED");
  }
  const { data: saved, error: saveError } = await client.rpc("save_search_profile", {
    p_search_profile_id: canonical.search.id,
    p_candidate_profile_id: profileId,
    p_search: searchPayload(patched.search),
    p_preferences: preferencesPayload(patched.preferences),
  });
  if (saveError || !saved) return failure("PERSISTENCE_FAILED");
  const searchId = String((saved as { id?: string }).id ?? "");
  if (!searchId) return failure("PERSISTENCE_FAILED");

  if (canonical.search.status === null || canonical.search.status === "DRAFT") {
    const { error } = await client.rpc("transition_search_profile_status", { p_search_profile_id: searchId, p_status: "ACTIVE" });
    if (error) return failure("PERSISTENCE_FAILED");
  }
  const snapshot = await loadOnboardingSnapshot({ client, userId, intent: null });
  return { ok: true, snapshot, nextSignal: snapshot.nextSignal };
}

async function loadCanonicalSearch(client: SupabaseClient, userId: string, profileId: string): Promise<{ search: CanonicalSearch; preferences: CanonicalPreferences }> {
  const { data: searchRows, error: searchError } = await client.from("search_profiles").select("id,name,status,version,frequency_type,frequency_value,timezone,notification_min_score,semi_auto_min_score,auto_apply_min_score,daily_application_limit").eq("user_id", userId).eq("candidate_profile_id", profileId).is("deleted_at", null).order("created_at", { ascending: true });
  if (searchError) throw new Error("canonical search unavailable");
  const rows = (searchRows ?? []) as Array<Record<string, unknown>>;
  const row = rows.find((item) => item.status === "ACTIVE") ?? rows.find((item) => item.status === "DRAFT") ?? rows[0] ?? null;
  if (!row) return { search: defaultCanonicalSearch(), preferences: defaultCanonicalPreferences() };
  const search: CanonicalSearch = { id: String(row.id), status: row.status as CanonicalSearch["status"], name: String(row.name ?? ""), frequencyType: row.frequency_type as CanonicalSearch["frequencyType"], frequencyValue: (row.frequency_value ?? {}) as Record<string, unknown>, timezone: String(row.timezone ?? "Europe/Madrid"), notificationMinScore: Number(row.notification_min_score ?? 70), semiAutoMinScore: Number(row.semi_auto_min_score ?? 80), autoApplyMinScore: Number(row.auto_apply_min_score ?? 90), dailyApplicationLimit: Number(row.daily_application_limit ?? 0) };
  const { data: preferenceRow, error: preferenceError } = await client.from("job_preferences").select("keywords,target_titles,excluded_titles,locations,work_modes,minimum_salary,currency,accepted_seniorities,minimum_experience_years,maximum_experience_years,required_technologies,excluded_technologies,languages,contract_types,location_preference_state,work_mode_preference_state,salary_preference_state").eq("user_id", userId).eq("search_profile_id", search.id).eq("search_profile_version", Number(row.version)).maybeSingle();
  if (preferenceError) throw new Error("canonical preferences unavailable");
  const preferences = preferenceRow as Record<string, unknown> | null;
  if (!preferences) return { search, preferences: defaultCanonicalPreferences() };
  return { search, preferences: { keywords: array(preferences.keywords), targetTitles: array(preferences.target_titles), excludedTitles: array(preferences.excluded_titles), locations: (preferences.locations as CanonicalPreferences["locations"]) ?? [], workModes: array(preferences.work_modes) as CanonicalPreferences["workModes"], minimumSalary: preferences.minimum_salary === null ? null : Number(preferences.minimum_salary), currency: typeof preferences.currency === "string" ? preferences.currency : null, acceptedSeniorities: array(preferences.accepted_seniorities), minimumExperienceYears: preferences.minimum_experience_years === null ? null : Number(preferences.minimum_experience_years), maximumExperienceYears: preferences.maximum_experience_years === null ? null : Number(preferences.maximum_experience_years), requiredTechnologies: array(preferences.required_technologies), excludedTechnologies: array(preferences.excluded_technologies), languages: (preferences.languages as CanonicalPreferences["languages"]) ?? [], contractTypes: array(preferences.contract_types), locationPreferenceState: state(preferences.location_preference_state), workModePreferenceState: state(preferences.work_mode_preference_state), salaryPreferenceState: state(preferences.salary_preference_state) } };
}
function array(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function state(value: unknown): "UNKNOWN" | "UNRESTRICTED" | "SPECIFIED" { return value === "UNRESTRICTED" || value === "SPECIFIED" ? value : "UNKNOWN"; }
function sameCanonical(left: CanonicalSearch | CanonicalPreferences, right: CanonicalSearch | CanonicalPreferences) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function failure(code: PublicErrorCode): ConfirmOnboardingResult {
  const message: Record<string, string> = { AUTH_REQUIRED: "Necesitas iniciar sesión para guardar esta información.", AMBIGUOUS_PROFILE: "Necesitamos que elijas una trayectoria antes de continuar.", INVALID_ROLE: "Indica el trabajo que buscas.", ROLE_REQUIRED: "Primero indica el trabajo que buscas.", INVALID_MODE: "Elige una modalidad válida.", INVALID_LOCATION: "Indica una ubicación válida o selecciona sin restricción.", INVALID_SALARY: "Indica un salario y moneda válidos o selecciona sin restricción.", INVALID_SIGNAL: "La información indicada no es válida.", PERSISTENCE_FAILED: "No se pudo guardar esta información. Inténtalo de nuevo." };
  return { ok: false, error: { code, message: message[code] } };
}
