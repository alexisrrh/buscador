import { describe, expect, it } from "vitest";
import { resolveOnboardingState, type OnboardingStateInput } from "@/lib/onboarding/state";

function input(overrides: Partial<OnboardingStateInput> = {}): OnboardingStateInput {
  return { authenticated: true, intent: null, profiles: [{ id: "profile-1", headline: null, jobFamily: null }], searches: [], preferences: [], resumes: [], ...overrides };
}
function readyInput(overrides: Partial<OnboardingStateInput> = {}): OnboardingStateInput {
  return input({ intent: { role: "Frontend Developer", location: "", workMode: "REMOTE" }, searches: [{ id: "search-1", candidateProfileId: "profile-1", name: "Frontend Developer", status: "ACTIVE", version: 1 }], preferences: [{ searchProfileId: "search-1", searchProfileVersion: 1, locations: [], workModes: ["REMOTE"], minimumSalary: null, currency: "EUR" }], ...overrides });
}

describe("deterministic onboarding state", () => {
  it("requires a role when no source knows it", () => {
    expect(resolveOnboardingState(input()).state).toBe("ROLE_REQUIRED");
  });
  it("asks for modality after a known role when no modality is known", () => {
    const snapshot = resolveOnboardingState(input({ profiles: [{ id: "profile-1", headline: "Frontend Developer", jobFamily: null }] }));
    expect(snapshot.state).toBe("MODE_DECISION");
    expect(snapshot.nextSignal).toBe("MODALITY");
  });
  it("is ready to search without optional location or salary", () => {
    const snapshot = resolveOnboardingState(readyInput());
    expect(snapshot.state).toBe("SEARCH_READY");
    expect(snapshot.searchReady).toBe(true);
    expect(snapshot.optionalSignals).toEqual(["LOCATION", "SALARY"]);
  });
  it("does not ask for optional signals already persisted", () => {
    const snapshot = resolveOnboardingState(readyInput({ preferences: [{ searchProfileId: "search-1", searchProfileVersion: 1, locations: [{ label: "Madrid" }], workModes: ["REMOTE"], minimumSalary: 30000, currency: "EUR" }] }));
    expect(snapshot.location).toMatchObject({ value: "Madrid", source: "PERSISTED_PREFERENCE" });
    expect(snapshot.salary).toMatchObject({ minimum: 30000, source: "PERSISTED_PREFERENCE" });
    expect(snapshot.optionalSignals).toEqual([]);
  });
  it("allows search without a CV but requires it for preparation", () => {
    expect(resolveOnboardingState(readyInput()).state).toBe("SEARCH_READY");
    expect(resolveOnboardingState(readyInput({ preparingApplication: true }))).toMatchObject({ state: "CV_REQUIRED_FOR_PREPARATION", preparationReady: false });
  });
  it("is ready for preparation with one approved CV", () => {
    const snapshot = resolveOnboardingState(readyInput({ preparingApplication: true, resumes: [{ id: "resume-1", candidateProfileId: "profile-1", status: "APPROVED" }] }));
    expect(snapshot).toMatchObject({ state: "PREPARATION_READY", preparationReady: true, approvedResume: { state: "SINGLE_APPROVED", id: "resume-1" } });
  });
  it("never chooses between multiple profiles or approved CVs", () => {
    expect(resolveOnboardingState(readyInput({ profiles: [{ id: "profile-1", headline: null, jobFamily: null }, { id: "profile-2", headline: null, jobFamily: null }] }))).toMatchObject({ state: "AMBIGUOUS_PROFILE", nextSignal: "PROFILE" });
    expect(resolveOnboardingState(readyInput({ preparingApplication: true, resumes: [{ id: "resume-1", candidateProfileId: "profile-1", status: "APPROVED" }, { id: "resume-2", candidateProfileId: "profile-1", status: "APPROVED" }] }))).toMatchObject({ state: "CV_SELECTION_REQUIRED", approvedResume: { state: "AMBIGUOUS" } });
  });
  it("does not let query intent overwrite persisted preferences", () => {
    const snapshot = resolveOnboardingState(readyInput({ intent: { role: "Backend Developer", location: "Barcelona", workMode: "ONSITE" }, preferences: [{ searchProfileId: "search-1", searchProfileVersion: 1, locations: [{ label: "Madrid" }], workModes: ["REMOTE"], minimumSalary: null, currency: "EUR" }] }));
    expect(snapshot.role).toMatchObject({ value: "Frontend Developer", source: "PERSISTED_PREFERENCE" });
    expect(snapshot.location).toMatchObject({ value: "Madrid", source: "PERSISTED_PREFERENCE" });
    expect(snapshot.modality).toMatchObject({ value: "REMOTE", source: "PERSISTED_PREFERENCE" });
  });
  it("returns the same result for the same input", () => {
    const value = readyInput();
    expect(resolveOnboardingState(value)).toEqual(resolveOnboardingState(value));
  });
});
