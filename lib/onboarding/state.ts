import type { IntentWorkMode, SearchIntent } from "@/lib/intent-first";

export type OnboardingValueSource = "PERSISTED_PREFERENCE" | "CURRENT_INTENT" | "PROFILE" | "UNKNOWN";
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
  location: { value: string | null; source: OnboardingValueSource };
  modality: { value: IntentWorkMode | null; source: OnboardingValueSource; explicitlyUnrestricted: boolean };
  salary: { minimum: number | null; currency: string | null; source: OnboardingValueSource };
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
  const location = firstKnown([
    [firstLocation(persistedPreferences?.locations ?? []), "PERSISTED_PREFERENCE"],
    [input.intent?.location, "CURRENT_INTENT"],
  ]);
  const modality = firstMode([
    [persistedPreferences?.workModes?.[0], "PERSISTED_PREFERENCE"],
    [input.intent?.workMode, "CURRENT_INTENT"],
  ]);
  const salary = persistedPreferences?.minimumSalary !== null && persistedPreferences?.minimumSalary !== undefined
    ? { minimum: persistedPreferences.minimumSalary, currency: persistedPreferences.currency, source: "PERSISTED_PREFERENCE" as const }
    : { minimum: null, currency: null, source: "UNKNOWN" as const };
  const approvedResume = resolveApprovedResume(input.resumes, profile?.id ?? null, input.selectedResumeId ?? null);
  const searchReady = Boolean(profile && role.value && modality.value && persistedSearch && normalized(persistedSearch.name) === normalized(role.value));
  const preparingApplication = input.preparingApplication === true;
  const preparationReady = searchReady && approvedResume.state === "SINGLE_APPROVED";
  const optionalSignals: OnboardingSignal[] = [
    ...(location.value ? [] : ["LOCATION" as const]),
    ...(salary.minimum === null ? ["SALARY" as const] : []),
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
  return snapshot({ state, nextSignal, optionalSignals: [], candidateProfile: { state: candidateState, id: null }, role: unknownText(), location: unknownText(), modality: { value: null, source: "UNKNOWN", explicitlyUnrestricted: false }, salary: { minimum: null, currency: null, source: "UNKNOWN" }, approvedResume: { state: "NONE", id: null }, searchReady: false, preparationReady: false });
}
function snapshot(value: OnboardingSnapshot): OnboardingSnapshot { return value; }
function unknownText() { return { value: null, source: "UNKNOWN" as const }; }
function normalized(value: string) { return value.trim().toLocaleLowerCase("es"); }
function firstLocation(locations: Array<{ label?: string | null }>) { return locations.map((location) => location.label?.trim() ?? "").find(Boolean) ?? null; }
function firstKnown(values: Array<[string | null | undefined, OnboardingValueSource]>): { value: string | null; source: OnboardingValueSource } {
  for (const [value, source] of values) if (value?.trim()) return { value: value.trim(), source };
  return unknownText();
}
function firstMode(values: Array<[IntentWorkMode | null | undefined, OnboardingValueSource]>) {
  for (const [value, source] of values) if (value && ["ANY", "REMOTE", "HYBRID", "ONSITE"].includes(value)) return { value, source, explicitlyUnrestricted: value === "ANY" };
  return { value: null, source: "UNKNOWN" as const, explicitlyUnrestricted: false };
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
