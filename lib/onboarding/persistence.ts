import type { IntentWorkMode } from "@/lib/intent-first";
import type { OnboardingPreferenceState } from "@/lib/onboarding/state";

export type OnboardingSignalInput =
  | { signal: "ROLE"; value: unknown }
  | { signal: "MODE"; value: unknown }
  | { signal: "LOCATION"; value: unknown }
  | { signal: "SALARY"; value: unknown };

export type CanonicalSearch = {
  id: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | null;
  name: string;
  frequencyType: "INTERVAL" | "DAILY" | "WEEKDAYS";
  frequencyValue: Record<string, unknown>;
  timezone: string;
  notificationMinScore: number;
  semiAutoMinScore: number;
  autoApplyMinScore: number;
  dailyApplicationLimit: number;
};
export type CanonicalPreferences = {
  keywords: string[];
  targetTitles: string[];
  excludedTitles: string[];
  locations: Array<{ label?: string; country?: string; city?: string }>;
  workModes: Array<Exclude<IntentWorkMode, "ANY">>;
  minimumSalary: number | null;
  currency: string | null;
  acceptedSeniorities: string[];
  minimumExperienceYears: number | null;
  maximumExperienceYears: number | null;
  requiredTechnologies: string[];
  excludedTechnologies: string[];
  languages: Array<Record<string, unknown>>;
  contractTypes: string[];
  locationPreferenceState: OnboardingPreferenceState;
  workModePreferenceState: OnboardingPreferenceState;
  salaryPreferenceState: OnboardingPreferenceState;
};
export type OnboardingPatchError = "INVALID_SIGNAL" | "INVALID_ROLE" | "ROLE_REQUIRED" | "INVALID_MODE" | "INVALID_LOCATION" | "INVALID_SALARY";

const MODES = new Set(["REMOTE", "HYBRID", "ONSITE"]);
const CURRENCIES = new Set(["EUR", "USD", "GBP"]);
const MAX_SALARY = 1_000_000;

export function defaultCanonicalSearch(role = ""): CanonicalSearch {
  return { id: null, status: null, name: role, frequencyType: "DAILY", frequencyValue: { time: "09:00" }, timezone: "Europe/Madrid", notificationMinScore: 70, semiAutoMinScore: 80, autoApplyMinScore: 90, dailyApplicationLimit: 0 };
}
export function defaultCanonicalPreferences(): CanonicalPreferences {
  return { keywords: [], targetTitles: [], excludedTitles: [], locations: [], workModes: [], minimumSalary: null, currency: null, acceptedSeniorities: [], minimumExperienceYears: null, maximumExperienceYears: null, requiredTechnologies: [], excludedTechnologies: [], languages: [], contractTypes: [], locationPreferenceState: "UNKNOWN", workModePreferenceState: "UNKNOWN", salaryPreferenceState: "UNKNOWN" };
}

export function applyOnboardingSignal(search: CanonicalSearch, preferences: CanonicalPreferences, input: OnboardingSignalInput): { ok: true; search: CanonicalSearch; preferences: CanonicalPreferences } | { ok: false; code: OnboardingPatchError } {
  const nextSearch = { ...search };
  const nextPreferences = { ...preferences };
  if (input.signal === "ROLE") {
    const role = text(input.value, 120);
    if (!role) return { ok: false, code: "INVALID_ROLE" };
    nextSearch.name = role;
    nextPreferences.targetTitles = unique([role, ...preferences.targetTitles.filter((title) => normalized(title) !== normalized(role))]);
    return { ok: true, search: nextSearch, preferences: nextPreferences };
  }
  if (!text(search.name, 120)) return { ok: false, code: "ROLE_REQUIRED" };
  if (input.signal === "MODE") {
    if (input.value === "UNRESTRICTED") return { ok: true, search: nextSearch, preferences: { ...nextPreferences, workModes: [], workModePreferenceState: "UNRESTRICTED" } };
    if (typeof input.value !== "string" || !MODES.has(input.value)) return { ok: false, code: "INVALID_MODE" };
    return { ok: true, search: nextSearch, preferences: { ...nextPreferences, workModes: [input.value as Exclude<IntentWorkMode, "ANY">], workModePreferenceState: "SPECIFIED" } };
  }
  if (input.signal === "LOCATION") {
    if (input.value === "UNRESTRICTED") return { ok: true, search: nextSearch, preferences: { ...nextPreferences, locations: [], locationPreferenceState: "UNRESTRICTED" } };
    const location = text(input.value, 120);
    if (!location) return { ok: false, code: "INVALID_LOCATION" };
    return { ok: true, search: nextSearch, preferences: { ...nextPreferences, locations: [{ label: location }], locationPreferenceState: "SPECIFIED" } };
  }
  if (input.signal === "SALARY") {
    if (input.value === "UNRESTRICTED") return { ok: true, search: nextSearch, preferences: { ...nextPreferences, minimumSalary: null, currency: null, salaryPreferenceState: "UNRESTRICTED" } };
    if (!isSalaryValue(input.value)) return { ok: false, code: "INVALID_SALARY" };
    return { ok: true, search: nextSearch, preferences: { ...nextPreferences, minimumSalary: input.value.minimum, currency: input.value.currency, salaryPreferenceState: "SPECIFIED" } };
  }
  return { ok: false, code: "INVALID_SIGNAL" };
}

export function searchPayload(search: CanonicalSearch) {
  return { name: search.name, frequency_type: search.frequencyType, frequency_value: search.frequencyValue, timezone: search.timezone, notification_min_score: search.notificationMinScore, semi_auto_min_score: search.semiAutoMinScore, auto_apply_min_score: search.autoApplyMinScore, daily_application_limit: search.dailyApplicationLimit };
}
export function preferencesPayload(preferences: CanonicalPreferences) {
  return { keywords: preferences.keywords, target_titles: preferences.targetTitles, excluded_titles: preferences.excludedTitles, locations: preferences.locations, work_modes: preferences.workModes, minimum_salary: preferences.minimumSalary, currency: preferences.currency, accepted_seniorities: preferences.acceptedSeniorities, minimum_experience_years: preferences.minimumExperienceYears, maximum_experience_years: preferences.maximumExperienceYears, required_technologies: preferences.requiredTechnologies, excluded_technologies: preferences.excludedTechnologies, languages: preferences.languages, contract_types: preferences.contractTypes, location_preference_state: preferences.locationPreferenceState, work_mode_preference_state: preferences.workModePreferenceState, salary_preference_state: preferences.salaryPreferenceState };
}
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function normalized(value: string) { return value.trim().toLocaleLowerCase("es"); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function isSalaryValue(value: unknown): value is { minimum: number; currency: "EUR" | "USD" | "GBP" } {
  return typeof value === "object" && value !== null && "minimum" in value && "currency" in value && typeof value.minimum === "number" && Number.isFinite(value.minimum) && value.minimum > 0 && value.minimum <= MAX_SALARY && typeof value.currency === "string" && CURRENCIES.has(value.currency);
}
