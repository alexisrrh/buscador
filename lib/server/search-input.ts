import type { CanonicalPreferences, CanonicalSearch } from "@/lib/onboarding/persistence";
import type { SearchStatus } from "@/lib/types";

export type SearchSettings = Omit<CanonicalSearch, "id" | "status">;
export type SaveSearchInput = {
  candidateProfileId: string;
  searchId?: string;
  expectedVersion?: number;
  search: SearchSettings;
  preferences: CanonicalPreferences;
};
export class SearchInputError extends Error {
  constructor() { super("INVALID_SEARCH_INPUT"); }
}
const states = new Set(["UNKNOWN", "UNRESTRICTED", "SPECIFIED"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

export function validateSearchInput(input: SaveSearchInput): void {
  const { search: s, preferences: p } = input;
  const fail = () => { throw new SearchInputError(); };
  if (!uuid.test(input.candidateProfileId) || (input.searchId !== undefined && !uuid.test(input.searchId))) fail();
  if (input.searchId ? !integer(input.expectedVersion!, 1, 2_147_483_646) : input.expectedVersion !== undefined) fail();
  if (typeof s.name !== "string" || s.name.trim().length < 2 || s.name.trim().length > 120) fail();
  if (!["INTERVAL", "DAILY", "WEEKDAYS"].includes(s.frequencyType) || !s.frequencyValue || typeof s.frequencyValue !== "object" || Array.isArray(s.frequencyValue)) fail();
  if (s.frequencyType === "INTERVAL") {
    if (!integer(s.frequencyValue.minutes as number, 1, 2_147_483_647)) fail();
  } else if (s.frequencyValue.time !== undefined &&
      (typeof s.frequencyValue.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s.frequencyValue.time))) fail();
  try { new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format(); }
  catch { fail(); }
  if (typeof s.timezone !== "string" || !s.timezone) fail();
  if (![s.notificationMinScore, s.semiAutoMinScore, s.autoApplyMinScore].every(n => integer(n, 0, 100)) ||
      s.notificationMinScore > s.semiAutoMinScore || s.semiAutoMinScore > s.autoApplyMinScore ||
      !integer(s.dailyApplicationLimit, 0, 2_147_483_647)) fail();
  for (const list of [p.keywords, p.targetTitles, p.excludedTitles, p.workModes, p.acceptedSeniorities,
    p.requiredTechnologies, p.excludedTechnologies, p.contractTypes]) {
    if (!Array.isArray(list) || !list.every(x => typeof x === "string")) fail();
  }
  if (!p.workModes.every(x => ["REMOTE", "HYBRID", "ONSITE"].includes(x))) fail();
  if (!Array.isArray(p.locations) || !p.locations.every(x => x !== null && typeof x === "object" && !Array.isArray(x) &&
      Object.values(x).every(v => typeof v === "string")) ||
      !Array.isArray(p.languages) || !p.languages.every(x => x !== null && typeof x === "object" && !Array.isArray(x))) fail();
  if (p.minimumSalary !== null && (!Number.isFinite(p.minimumSalary) || p.minimumSalary < 0 || p.minimumSalary > 999_999_999_999.99)) fail();
  if (p.currency !== null && (typeof p.currency !== "string" || !/^[A-Z]{3}$/.test(p.currency))) fail();
  for (const n of [p.minimumExperienceYears, p.maximumExperienceYears]) if (n !== null && !integer(n, 0, 32_767)) fail();
  if (p.minimumExperienceYears !== null && p.maximumExperienceYears !== null && p.minimumExperienceYears > p.maximumExperienceYears) fail();
  if (![p.locationPreferenceState, p.workModePreferenceState, p.salaryPreferenceState].every(x => states.has(x))) fail();
  if ((p.locationPreferenceState === "UNRESTRICTED" && p.locations.length > 0) ||
      (p.locationPreferenceState === "SPECIFIED" && p.locations.length === 0) ||
      (p.workModePreferenceState === "UNRESTRICTED" && p.workModes.length > 0) ||
      (p.workModePreferenceState === "SPECIFIED" && p.workModes.length === 0) ||
      (p.salaryPreferenceState === "UNRESTRICTED" && (p.minimumSalary !== null || p.currency !== null)) ||
      (p.salaryPreferenceState === "SPECIFIED" && (p.minimumSalary === null || p.minimumSalary <= 0 || p.currency === null))) fail();
}

export function canTransitionSearch(from: SearchStatus, to: SearchStatus): boolean {
  return (from === "DRAFT" && ["ACTIVE", "ARCHIVED"].includes(to)) ||
    (from === "ACTIVE" && ["PAUSED", "ARCHIVED"].includes(to)) ||
    (from === "PAUSED" && ["ACTIVE", "ARCHIVED"].includes(to));
}
