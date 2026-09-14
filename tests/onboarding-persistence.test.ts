import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOnboardingSignal,
  defaultCanonicalPreferences,
  defaultCanonicalSearch,
} from "@/lib/onboarding/persistence";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  persistOnboardingSignal: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/onboarding/persistence.server", () => ({
  persistOnboardingSignal: mocks.persistOnboardingSignal,
}));

import { confirmOnboardingSignal } from "@/app/actions/onboarding";

function canonical() {
  return {
    search: defaultCanonicalSearch("Frontend Developer"),
    preferences: {
      ...defaultCanonicalPreferences(),
      keywords: ["frontend"],
      requiredTechnologies: ["React"],
      languages: [{ code: "en" }],
      contractTypes: ["INDEFINITE"],
      minimumExperienceYears: 2,
    },
  };
}

describe("onboarding signal patches", () => {
  it("persists a role without dropping hidden preferences", () => {
    const { search, preferences } = canonical();
    const result = applyOnboardingSignal(search, preferences, { signal: "ROLE", value: "  Frontend Engineer  " });

    expect(result).toMatchObject({
      ok: true,
      search: { name: "Frontend Engineer" },
      preferences: {
        targetTitles: ["Frontend Engineer"],
        keywords: ["frontend"],
        requiredTechnologies: ["React"],
        languages: [{ code: "en" }],
        contractTypes: ["INDEFINITE"],
        minimumExperienceYears: 2,
      },
    });
  });

  it("records a specified or unrestricted work mode explicitly", () => {
    const { search, preferences } = canonical();
    expect(applyOnboardingSignal(search, preferences, { signal: "MODE", value: "REMOTE" })).toMatchObject({
      ok: true,
      preferences: { workModes: ["REMOTE"], workModePreferenceState: "SPECIFIED" },
    });
    expect(applyOnboardingSignal(search, preferences, { signal: "MODE", value: "UNRESTRICTED" })).toMatchObject({
      ok: true,
      preferences: { workModes: [], workModePreferenceState: "UNRESTRICTED" },
    });
  });

  it("records a specified or unrestricted location explicitly", () => {
    const { search, preferences } = canonical();
    expect(applyOnboardingSignal(search, preferences, { signal: "LOCATION", value: "A Coruña" })).toMatchObject({
      ok: true,
      preferences: { locations: [{ label: "A Coruña" }], locationPreferenceState: "SPECIFIED" },
    });
    expect(applyOnboardingSignal(search, preferences, { signal: "LOCATION", value: "UNRESTRICTED" })).toMatchObject({
      ok: true,
      preferences: { locations: [], locationPreferenceState: "UNRESTRICTED" },
    });
  });

  it("records a specified or unrestricted salary explicitly", () => {
    const { search, preferences } = canonical();
    expect(applyOnboardingSignal(search, preferences, { signal: "SALARY", value: { minimum: 30000, currency: "EUR" } })).toMatchObject({
      ok: true,
      preferences: { minimumSalary: 30000, currency: "EUR", salaryPreferenceState: "SPECIFIED" },
    });
    expect(applyOnboardingSignal(search, preferences, { signal: "SALARY", value: "UNRESTRICTED" })).toMatchObject({
      ok: true,
      preferences: { minimumSalary: null, currency: null, salaryPreferenceState: "UNRESTRICTED" },
    });
  });

  it("rejects invalid values without producing a patch", () => {
    const { search, preferences } = canonical();
    expect(applyOnboardingSignal(search, preferences, { signal: "ROLE", value: "   " })).toEqual({ ok: false, code: "INVALID_ROLE" });
    expect(applyOnboardingSignal(search, preferences, { signal: "MODE", value: "FLEXIBLE" })).toEqual({ ok: false, code: "INVALID_MODE" });
    expect(applyOnboardingSignal(search, preferences, { signal: "LOCATION", value: "" })).toEqual({ ok: false, code: "INVALID_LOCATION" });
    expect(applyOnboardingSignal(search, preferences, { signal: "SALARY", value: { minimum: 0, currency: "EUR" } })).toEqual({ ok: false, code: "INVALID_SALARY" });
  });

  it("produces an equivalent patch for the same confirmed signal", () => {
    const { search, preferences } = canonical();
    const once = applyOnboardingSignal(search, preferences, { signal: "MODE", value: "REMOTE" });
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = applyOnboardingSignal(once.search, once.preferences, { signal: "MODE", value: "REMOTE" });
    expect(twice).toEqual(once);
  });

  it("requires a role before accepting another signal for a new search", () => {
    expect(applyOnboardingSignal(defaultCanonicalSearch(), defaultCanonicalPreferences(), { signal: "MODE", value: "REMOTE" })).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });
});

describe("confirmOnboardingSignal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not persist for an anonymous user", async () => {
    mocks.requireUser.mockResolvedValue({ supabase: {}, user: null });

    await expect(confirmOnboardingSignal({ signal: "ROLE", value: "Frontend Developer" })).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
    expect(mocks.persistOnboardingSignal).not.toHaveBeenCalled();
  });

  it("derives ownership from the authenticated user and returns the canonical result", async () => {
    const result = { ok: true as const, snapshot: { nextSignal: "MODALITY" }, nextSignal: "MODALITY" as const };
    mocks.requireUser.mockResolvedValue({ supabase: { rpc: vi.fn() }, user: { id: "user-a" } });
    mocks.persistOnboardingSignal.mockResolvedValue(result);

    await expect(confirmOnboardingSignal({ signal: "ROLE", value: "Frontend Developer" })).resolves.toEqual(result);
    expect(mocks.persistOnboardingSignal).toHaveBeenCalledWith({
      client: expect.any(Object),
      userId: "user-a",
      signal: { signal: "ROLE", value: "Frontend Developer" },
    });
  });
});
