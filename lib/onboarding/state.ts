import type { IntentWorkMode, SearchIntent } from "@/lib/intent-first";

export type OnboardingValueSource = "PERSISTED_PREFERENCE" | "CURRENT_INTENT" | "PROFILE" | "UNKNOWN";
export type OnboardingPreferenceState = "UNKNOWN" | "UNRESTRICTED" | "SPECIFIED";
export type CandidateProfileState = "NONE" | "RESOLVED" | "AMBIGUOUS";
export type ApprovedResumeState = "NONE" | "SINGLE_APPROVED" | "AMBIGUOUS";
export type OnboardingState =
  | "AUTH_REQUIRED"
  | "AMBIGUOUS_PROFILE"
  | "ROLE_REQUIRED"
  | "MODE_DECISION"
  | "SEARCH_PROFILE_REQUIRED"
  | "SEARCH_READY"
  | "CV_REQUIRED_FOR_PREPARATION"
  | "CV_SELECTION_REQUIRED"
  | "PREPARATION_READY";
export type OnboardingSignal = "ROLE" | "MODALITY" | "LOCATION" | "SALARY" | "CV" | "PROFILE";

export type OnboardingCandidateProfile = {
  id: string;
  headline: string | null;
  jobFamily: string | null;
};
export type OnboardingSearchProfile = {
  id: string;
  candidateProfileId: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  version: number;
};
export type OnboardingPreferences = {
  searchProfileId: string;
  searchProfileVersion: number;
  locations: Array<{ label?: string | null }>;
  workModes: IntentWorkMode[];
  minimumSalary: number | null;
  currency: string | null;
  locationPreferenceState: OnboardingPreferenceState;
  workModePreferenceState: OnboardingPreferenceState;
  salaryPreferenceState: OnboardingPreferenceState;
};
export type OnboardingResume = { id: string; candidateProfileId: string; status: "READY" | "APPROVED" };

export type OnboardingStateInput = {
  authenticated: boolean;
  intent: SearchIntent | null;
  profiles: OnboardingCandidateProfile[];
  searches: OnboardingSearchProfile[];
  preferences: OnboardingPreferences[];
  resumes: OnboardingResume[];
  selectedResumeId?: string | null;
  preparingApplication?: boolean;
};

export type OnboardingSnapshot = {
  state: OnboardingState;
  nextSignal: OnboardingSignal | null;
  optionalSignals: OnboardingSignal[];
  candidateProfile: { state: CandidateProfileState; id: string | null };
  role: { value: string | null; source: OnboardingValueSource };
  location: { value: string | null; source: OnboardingValueSource; preferenceState: OnboardingPreferenceState };
  modality: { value: IntentWorkMode | null; source: OnboardingValueSource; preferenceState: OnboardingPreferenceState; explicitlyUnrestricted: boolean };
  salary: { minimum: number | null; currency: string | null; source: OnboardingValueSource; preferenceState: OnboardingPreferenceState };
  approvedResume: { state: ApprovedResumeState; id: string | null };
  searchReady: boolean;
  preparationReady: boolean;
};

export function resolveOnboardingState(input: OnboardingStateInput): OnboardingSnapshot {
  if (!input.authenticated) return emptySnapshot("AUTH_REQUIRED", null);

  const profiles = uniqueById(input.profiles);
  if (profiles.length > 1) return emptySnapshot("AMBIGUOUS_PROFILE", "PROFILE", "AMBIGUOUS");
  const profile = profiles[0] ?? null;
  const candidateProfile = { state: profile ? "RESOLVED" as const : "NONE" as const, id: profile?.id ?? null };

  const activeForProfile = profile
    ? input.searches.filter((search) => search.candidateProfileId === profile.id && search.status === "ACTIVE")
    : [];
  const persistedSearch = activeForProfile[0] ?? null;
  const persistedPreferences = persistedSearch
    ? input.preferences.find((preferences) => preferences.searchProfileId === persistedSearch.id && preferences.searchProfileVersion === persistedSearch.version) ?? null
    : null;

  const role = firstKnown([
    [persistedSearch?.name, "PERSISTED_PREFERENCE"],
    [input.intent?.role, "CURRENT_INTENT"],
    [profile?.headline, "PROFILE"],
    [profile?.jobFamily, "PROFILE"],
  ]);
  const location = resolveLocation(persistedPreferences, input.intent);
  const modality = resolveMode(persistedPreferences, input.intent);
  const salary = resolveSalary(persistedPreferences);
  const approvedResume = resolveApprovedResume(input.resumes, profile?.id ?? null, input.selectedResumeId ?? null);
  const searchReady = Boolean(profile && role.value && modality.value && persistedSearch && normalized(persistedSearch.name) === normalized(role.value));
  const preparingApplication = input.preparingApplication === true;
  const preparationReady = searchReady && approvedResume.state === "SINGLE_APPROVED";
  const optionalSignals: OnboardingSignal[] = [
    ...(location.preferenceState === "UNKNOWN" ? ["LOCATION" as const] : []),
    ...(salary.preferenceState === "UNKNOWN" ? ["SALARY" as const] : []),
  ];

  if (!role.value) return snapshot({ state: "ROLE_REQUIRED", nextSignal: "ROLE", optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  if (!modality.value) return snapshot({ state: "MODE_DECISION", nextSignal: "MODALITY", optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  if (!searchReady) return snapshot({ state: "SEARCH_PROFILE_REQUIRED", nextSignal: null, optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  if (!preparingApplication) return snapshot({ state: "SEARCH_READY", nextSignal: null, optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  if (approvedResume.state === "AMBIGUOUS") return snapshot({ state: "CV_SELECTION_REQUIRED", nextSignal: "CV", optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  if (!preparationReady) return snapshot({ state: "CV_REQUIRED_FOR_PREPARATION", nextSignal: "CV", optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
  return snapshot({ state: "PREPARATION_READY", nextSignal: null, optionalSignals, candidateProfile, role, location, modality, salary, approvedResume, searchReady, preparationReady });
}

function emptySnapshot(state: OnboardingState, nextSignal: OnboardingSignal | null, candidateState: CandidateProfileState = "NONE"): OnboardingSnapshot {
  return snapshot({ state, nextSignal, optionalSignals: [], candidateProfile: { state: candidateState, id: null }, role: unknownText(), location: { ...unknownText(), preferenceState: "UNKNOWN" }, modality: { value: null, source: "UNKNOWN", preferenceState: "UNKNOWN", explicitlyUnrestricted: false }, salary: { minimum: null, currency: null, source: "UNKNOWN", preferenceState: "UNKNOWN" }, approvedResume: { state: "NONE", id: null }, searchReady: false, preparationReady: false });
}
function snapshot(value: OnboardingSnapshot): OnboardingSnapshot { return value; }
function unknownText() { return { value: null, source: "UNKNOWN" as const }; }
function normalized(value: string) { return value.trim().toLocaleLowerCase("es"); }
function firstKnown(values: Array<[string | null | undefined, OnboardingValueSource]>): { value: string | null; source: OnboardingValueSource } {
  for (const [value, source] of values) if (value?.trim()) return { value: value.trim(), source };
  return unknownText();
}
function resolveLocation(preferences: OnboardingPreferences | null, intent: SearchIntent | null) {
  if (preferences?.locationPreferenceState === "SPECIFIED") return { value: preferences.locations.map((location) => location.label?.trim() ?? "").find(Boolean) ?? null, source: "PERSISTED_PREFERENCE" as const, preferenceState: "SPECIFIED" as const };
  if (preferences?.locationPreferenceState === "UNRESTRICTED") return { value: null, source: "PERSISTED_PREFERENCE" as const, preferenceState: "UNRESTRICTED" as const };
  if (intent?.location) return { value: intent.location, source: "CURRENT_INTENT" as const, preferenceState: "SPECIFIED" as const };
  return { value: null, source: "UNKNOWN" as const, preferenceState: "UNKNOWN" as const };
}
function resolveMode(preferences: OnboardingPreferences | null, intent: SearchIntent | null) {
  if (preferences?.workModePreferenceState === "SPECIFIED") return { value: preferences.workModes[0] ?? null, source: "PERSISTED_PREFERENCE" as const, preferenceState: "SPECIFIED" as const, explicitlyUnrestricted: false };
  if (preferences?.workModePreferenceState === "UNRESTRICTED") return { value: "ANY" as const, source: "PERSISTED_PREFERENCE" as const, preferenceState: "UNRESTRICTED" as const, explicitlyUnrestricted: true };
  if (intent?.workMode) return { value: intent.workMode, source: "CURRENT_INTENT" as const, preferenceState: intent.workMode === "ANY" ? "UNRESTRICTED" as const : "SPECIFIED" as const, explicitlyUnrestricted: intent.workMode === "ANY" };
  return { value: null, source: "UNKNOWN" as const, preferenceState: "UNKNOWN" as const, explicitlyUnrestricted: false };
}
function resolveSalary(preferences: OnboardingPreferences | null) {
  if (preferences?.salaryPreferenceState === "SPECIFIED") return { minimum: preferences.minimumSalary, currency: preferences.currency, source: "PERSISTED_PREFERENCE" as const, preferenceState: "SPECIFIED" as const };
  if (preferences?.salaryPreferenceState === "UNRESTRICTED") return { minimum: null, currency: null, source: "PERSISTED_PREFERENCE" as const, preferenceState: "UNRESTRICTED" as const };
  return { minimum: null, currency: null, source: "UNKNOWN" as const, preferenceState: "UNKNOWN" as const };
}
function uniqueById<T extends { id: string }>(values: T[]) { return [...new Map(values.map((value) => [value.id, value])).values()]; }
function resolveApprovedResume(resumes: OnboardingResume[], candidateProfileId: string | null, selectedResumeId: string | null): { state: ApprovedResumeState; id: string | null } {
  if (!candidateProfileId) return { state: "NONE", id: null };
  const approved = resumes.filter((resume) => resume.candidateProfileId === candidateProfileId && resume.status === "APPROVED");
  if (selectedResumeId) {
    const selected = approved.find((resume) => resume.id === selectedResumeId);
    if (selected) return { state: "SINGLE_APPROVED", id: selected.id };
  }
  if (approved.length === 1) return { state: "SINGLE_APPROVED", id: approved[0].id };
  return approved.length > 1 ? { state: "AMBIGUOUS", id: null } : { state: "NONE", id: null };
}
