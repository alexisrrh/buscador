import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }));
vi.mock("next/navigation", () => ({ redirect }));

import ProfilesPage from "@/app/(private)/profiles/page";
import NewProfilePage from "@/app/(private)/profiles/new/page";
import EditProfilePage from "@/app/(private)/profiles/[id]/page";

describe("legacy profile redirects", () => {
  it.each([
    ["/profiles", () => ProfilesPage({ searchParams: Promise.resolve({}) })],
    ["/profiles/new", () => NewProfilePage({ searchParams: Promise.resolve({}) })],
    ["/profiles/[id]", () => EditProfilePage({ params: Promise.resolve({ id: "internal-id" }), searchParams: Promise.resolve({}) })],
  ])("redirects %s to onboarding without rendering legacy UI", async (_route, render) => {
    await expect(render()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("preserves only supported public intent when redirecting", async () => {
    await expect(ProfilesPage({ searchParams: Promise.resolve({
      intent_role: "Frontend Developer",
      intent_location: "A Coruña",
      intent_mode: "REMOTE",
      candidate_profile_id: "do-not-forward",
    }) })).rejects.toThrow("REDIRECT:/onboarding?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=A+Coru%C3%B1a");
  });

  it("does not retain the Evidence Bank bootstrap side effect in the profile route", async () => {
    const page = await import("node:fs/promises").then(({ readFile }) => readFile("app/(private)/profiles/[id]/page.tsx", "utf8"));
    expect(page).not.toContain("bootstrapApprovedResumeEvidence");
    expect(page).not.toContain("candidate_profile_id");
  });
});
