import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadSnapshot: vi.fn() }));

vi.mock("@/lib/onboarding/state.server", () => ({
  loadOnboardingSnapshot: mocks.loadSnapshot,
}));

import { persistOnboardingSignal } from "@/lib/onboarding/persistence.server";

const snapshot = {
  state: "SEARCH_READY" as const,
  nextSignal: null,
  optionalSignals: ["LOCATION", "SALARY"] as const,
  candidateProfile: { state: "RESOLVED" as const, id: "profile-1" },
  role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" as const },
  location: { value: null, source: "UNKNOWN" as const, preferenceState: "UNKNOWN" as const },
  modality: { value: "REMOTE" as const, source: "PERSISTED_PREFERENCE" as const, preferenceState: "SPECIFIED" as const, explicitlyUnrestricted: false },
  salary: { minimum: null, currency: null, source: "UNKNOWN" as const, preferenceState: "UNKNOWN" as const },
  approvedResume: { state: "NONE" as const, id: null },
  searchReady: true,
  preparationReady: false,
};

function listQuery(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

function singleQuery(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

function client({ workMode = "HYBRID" }: { workMode?: "REMOTE" | "HYBRID" } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "ensure_contextual_candidate_profile") return { data: [{ candidate_profile_id: "profile-1", resolution: "REUSED" }], error: null };
    if (name === "save_search_profile") return { data: { id: "search-1" }, error: null };
    if (name === "transition_search_profile_status") return { data: null, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const search = listQuery([{ id: "search-1", name: "Frontend Developer", status: "ACTIVE", version: 3, frequency_type: "DAILY", frequency_value: { time: "09:00" }, timezone: "Europe/Madrid", notification_min_score: 70, semi_auto_min_score: 80, auto_apply_min_score: 90, daily_application_limit: 0 }]);
  const preferences = singleQuery({
    keywords: ["frontend"], target_titles: ["Frontend Developer"], excluded_titles: ["Intern"], locations: [{ label: "Madrid" }], work_modes: [workMode], minimum_salary: 25000, currency: "EUR", accepted_seniorities: ["MID"], minimum_experience_years: 2, maximum_experience_years: 8, required_technologies: ["React"], excluded_technologies: ["PHP"], languages: [{ code: "en" }], contract_types: ["INDEFINITE"], location_preference_state: "SPECIFIED", work_mode_preference_state: "SPECIFIED", salary_preference_state: "SPECIFIED",
  });
  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "search_profiles") return search;
      if (table === "job_preferences") return preferences;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("server-side onboarding persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSnapshot.mockResolvedValue(snapshot);
  });

  it("saves a single server-side mode patch while preserving hidden preferences", async () => {
    const supabase = client();
    const result = await persistOnboardingSignal({ client: supabase as never, userId: "user-a", signal: { signal: "MODE", value: "REMOTE" } });

    expect(result).toEqual({ ok: true, snapshot, nextSignal: null });
    expect(supabase.rpc).toHaveBeenCalledWith("save_search_profile", expect.objectContaining({
      p_search_profile_id: "search-1",
      p_candidate_profile_id: "profile-1",
      p_preferences: expect.objectContaining({
        work_modes: ["REMOTE"],
        work_mode_preference_state: "SPECIFIED",
        keywords: ["frontend"],
        required_technologies: ["React"],
        languages: [{ code: "en" }],
        contract_types: ["INDEFINITE"],
        minimum_salary: 25000,
        location_preference_state: "SPECIFIED",
        salary_preference_state: "SPECIFIED",
      }),
    }));
    expect(mocks.loadSnapshot).toHaveBeenCalledWith({ client: supabase, userId: "user-a", intent: null });
  });

  it("does not write a new preference version for the same confirmed signal", async () => {
    const supabase = client({ workMode: "REMOTE" });
    const result = await persistOnboardingSignal({ client: supabase as never, userId: "user-a", signal: { signal: "MODE", value: "REMOTE" } });

    expect(result).toEqual({ ok: true, snapshot, nextSignal: null });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("ensure_contextual_candidate_profile");
    expect(supabase.rpc).not.toHaveBeenCalledWith("save_search_profile", expect.anything());
  });
});
