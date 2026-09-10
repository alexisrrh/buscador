import { describe, expect, it } from "vitest";

import { resolveContextualOnboarding } from "@/lib/resumes/contextual-onboarding.server";

const profileA = { id: "00000000-0000-4000-8000-000000000001", name: "Perfil principal" };
const profileB = { id: "00000000-0000-4000-8000-000000000002", name: "Soporte" };
const ready = { id: "10000000-0000-4000-8000-000000000001", candidate_profile_id: profileA.id, original_filename: "ready.pdf", status: "READY" as const, created_at: "2026-09-10T00:00:00Z" };
const approved = { ...ready, id: "20000000-0000-4000-8000-000000000001", original_filename: "approved.pdf", status: "APPROVED" as const };

describe("contextual CV onboarding resolver", () => {
  it("keeps a new user ready for an internal profile only when upload starts", () => {
    expect(resolveContextualOnboarding([], [], null)).toMatchObject({ state: "NO_RESUME", profile: null, profileChoices: [] });
  });

  it("reuses one profile with no CV without exposing a selection", () => {
    expect(resolveContextualOnboarding([profileA], [], null)).toMatchObject({ state: "NO_RESUME", profile: profileA });
  });

  it("reuses a unique approved CV automatically", () => {
    expect(resolveContextualOnboarding([profileA], [approved], null)).toMatchObject({ state: "APPROVED_RESUME", resume: approved });
  });

  it("requires confirmation for a READY CV", () => {
    expect(resolveContextualOnboarding([profileA], [ready], null)).toMatchObject({ state: "READY_RESUME", resume: ready });
  });

  it("does not choose among multiple plausible CVs unless the user selected one", () => {
    const second = { ...ready, id: "30000000-0000-4000-8000-000000000001", candidate_profile_id: profileB.id, original_filename: "other.pdf" };
    expect(resolveContextualOnboarding([profileA, profileB], [approved, second], null)).toMatchObject({ state: "APPROVED_RESUME", resume: approved });
    expect(resolveContextualOnboarding([profileA, profileB], [approved, { ...approved, id: second.id, candidate_profile_id: profileB.id }], null)).toMatchObject({ state: "AMBIGUOUS" });
    expect(resolveContextualOnboarding([profileA, profileB], [approved, { ...approved, id: second.id, candidate_profile_id: profileB.id }], second.id)).toMatchObject({ state: "APPROVED_RESUME", resume: expect.objectContaining({ id: second.id }) });
  });

  it("does not choose an internal profile when several have no CV", () => {
    expect(resolveContextualOnboarding([profileA, profileB], [], null)).toMatchObject({ state: "AMBIGUOUS", profileChoices: [profileA, profileB] });
  });
});
