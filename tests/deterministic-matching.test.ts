import { describe, expect, it } from "vitest";

import { matchJobOfferToSearchProfile } from "@/lib/matching/engine";
import { generateMatchesForSearchProfile, type MatchingRepository } from "@/lib/matching/service";
import type {
  MatchCandidateProfile,
  MatchJobOffer,
  MatchJobPreferences,
  MatchSearchProfile,
} from "@/lib/matching/types";

const candidate: MatchCandidateProfile = {
  id: "candidate-a",
  userId: "user-a",
  seniority: "MID",
  jobFamily: "Software Engineering",
};

const search: MatchSearchProfile = {
  id: "search-a",
  userId: "user-a",
  candidateProfileId: candidate.id,
  version: 1,
  status: "ACTIVE",
  name: "Frontend Developer",
  notificationMinScore: 70,
};

const preferences: MatchJobPreferences = {
  keywords: ["frontend", "web"],
  targetTitles: ["Frontend Developer"],
  excludedTitles: ["WordPress"],
  locations: [{ label: "España", country: "ES" }],
  workModes: ["REMOTE", "HYBRID"],
  minimumSalary: 35_000,
  currency: "EUR",
  acceptedSeniorities: ["MID"],
  minimumExperienceYears: 1,
  maximumExperienceYears: 5,
  requiredTechnologies: ["React", "TypeScript"],
  excludedTechnologies: ["Cobol"],
  contractTypes: ["FULL_TIME"],
};

const compatibleOffer: MatchJobOffer = {
  id: "offer-a",
  status: "ACTIVE",
  title: "Frontend Engineer",
  description: "Build web products with React and TypeScript. 3 years experience.",
  locationText: "España",
  countryCode: "ES",
  region: null,
  city: null,
  workMode: "REMOTE",
  seniority: "MID",
  employmentType: "FULL_TIME",
  salaryMin: 40_000,
  salaryMax: 50_000,
  salaryCurrency: "EUR",
};

function run(
  offerPatch: Partial<MatchJobOffer> = {},
  preferencePatch: Partial<MatchJobPreferences> = {},
  searchPatch: Partial<MatchSearchProfile> = {},
) {
  return matchJobOfferToSearchProfile({
    offer: { ...compatibleOffer, ...offerPatch },
    candidate,
    search: { ...search, ...searchPatch },
    preferences: { ...preferences, ...preferencePatch },
  });
}

describe("deterministic matching", () => {
  it("scores a compatible frontend offer highly and explains it", () => {
    const result = run();
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.eligibility).toBe("ELIGIBLE");
    expect(result.reasons.join(" ")).toMatch(/Frontend Developer|React/);
  });

  it("gives an incompatible title a substantially lower score", () => {
    const result = run({ title: "Account Executive", description: "Commercial sales position using React APIs. 3 years experience." });
    expect(result.components.title).toBe(0);
    expect(result.components.technologies).toBe(0);
    expect(result.hardGates.roleFamily).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
    expect(result.score).toBeLessThan(50);
  });

  it("rejects a known incompatible location", () => {
    const result = run({ locationText: "Paris, France", countryCode: "FR", workMode: "ONSITE" }, { workModes: ["ONSITE"] });
    expect(result.hardGates.location).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
  });

  it("accepts unrestricted remote work despite a physical location preference", () => {
    const result = run({ locationText: "Anywhere", countryCode: null, workMode: "REMOTE" });
    expect(result.hardGates.location).toBe("PASS");
    expect(result.hardGates.workMode).toBe("PASS");
  });

  it("rejects clearly excessive seniority and experience", () => {
    const result = run({ seniority: "SENIOR", description: "React TypeScript web role requiring 8 years experience." });
    expect(result.hardGates.seniority).toBe("UNKNOWN");
    expect(result.hardGates.experience).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
  });

  it.each([
    "Frontend Developer",
    "Frontend Engineer",
    "React Developer",
  ])("treats %s as a strong frontend match", (title) => {
    const result = run({ title });
    expect(result.components.title).toBeGreaterThanOrEqual(31);
    expect(result.hardGates.roleFamily).toBe("PASS");
    expect(result.eligibility).toBe("ELIGIBLE");
  });

  it.each([
    ["Web Frontend Engineer - JS, CSS, React, Flutter", "Worldwide"],
    ["Web Developer", "Home based - EMEA"],
    ["Software Engineer II - Full Stack - Web Engineering", "Spain"],
  ])("marks a clearly compatible real-world role as eligible: %s", (title, locationText) => {
    const result = run(
      { title, locationText, countryCode: null, workMode: "UNKNOWN", seniority: null },
      { workModes: ["REMOTE", "HYBRID", "ONSITE"] },
    );
    expect(result.hardGates.roleFamily).toBe("PASS");
    expect(result.hardGates.location).toBe("PASS");
    expect(result.eligibility).toBe("ELIGIBLE");
  });

  it.each([
    "Accountant Trainee",
    "Entry-level Communications Specialist",
    "Senior Communications Specialist",
    "Python Engineer",
    "Microservices Engineer",
  ])("rejects OTHER without strong frontend title evidence: %s", (title) => {
    const result = run({
      title,
      description: "Our web platform uses React and TypeScript. 3 years experience.",
      locationText: "Spain",
    });
    expect(result.hardGates.roleFamily).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
  });

  it("does not use the notification score threshold as an eligibility gate", () => {
    const result = run(
      { title: "Web Developer", description: "Build web products. 3 years experience." },
      { requiredTechnologies: [], keywords: [], workModes: ["REMOTE", "HYBRID", "ONSITE"] },
      { notificationMinScore: 95 },
    );
    expect(result.score).toBeLessThan(95);
    expect(result.eligibility).toBe("ELIGIBLE");
  });

  it.each([
    ["Full Stack Developer", 24],
    ["Web Developer", 26],
  ])("treats %s as a related role", (title, minimumTitleScore) => {
    const result = run({ title });
    expect(result.components.title).toBeGreaterThanOrEqual(minimumTitleScore);
    expect(result.hardGates.roleFamily).toBe("PASS");
  });

  it.each([
    "Design Engineer",
    "Staff Design Engineer",
    "Staff Platform Engineer",
    "Engineering Manager",
    "Account Executive",
    "Customer Success Manager",
    "Sales Recruiter",
    "Marketing Manager",
    "Product Support Specialist",
  ])("rejects incompatible real-world title: %s", (title) => {
    const result = run({ title, description: "React TypeScript Git APIs. 3 years experience." });
    expect(result.hardGates.roleFamily).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
    expect(result.score).toBeLessThan(50);
  });

  it.each([
    ["Remote - EU, Spain", null, "PASS"],
    ["Spain - Remote", "ES", "PASS"],
    ["Remote - US only", "US", "FAIL"],
    ["Canada only", "CA", "FAIL"],
    ["Remote - APAC only", null, "FAIL"],
  ])("evaluates geography %s as %s", (locationText, countryCode, expected) => {
    const result = run({ locationText, countryCode, workMode: "REMOTE" });
    expect(result.hardGates.location).toBe(expected);
  });

  it.each([
    ["Junior Frontend Developer", "PASS"],
    ["Mid Frontend Developer", "PASS"],
    ["Senior Frontend Developer", "UNKNOWN"],
    ["Staff Frontend Engineer", "FAIL"],
    ["Principal Frontend Engineer", "FAIL"],
    ["Frontend Engineering Manager", "FAIL"],
  ])("evaluates seniority in %s as %s", (title, expected) => {
    const result = run({ title, seniority: null });
    expect(result.hardGates.seniority).toBe(expected);
    if (expected === "FAIL") expect(result.eligibility).toBe("REJECTED");
  });

  it("rewards present required technologies and penalizes absent ones", () => {
    const present = run();
    const absent = run({ description: "Frontend web position with 3 years experience." });
    expect(present.components.technologies).toBe(20);
    expect(absent.components.technologies).toBe(0);
    expect(present.score).toBeGreaterThan(absent.score);
  });

  it("rejects an excluded title", () => {
    const result = run({ title: "WordPress Frontend Developer" });
    expect(result.hardGates.excludedTitle).toBe("FAIL");
    expect(result.eligibility).toBe("REJECTED");
  });

  it("rewards compatible known salary", () => {
    expect(run().components.salary).toBe(2);
    expect(run({ salaryMax: 30_000 }).components.salary).toBe(0);
  });

  it("treats unknown salary as neutral instead of rejecting", () => {
    const result = run({ salaryMin: null, salaryMax: null, salaryCurrency: null });
    expect(result.components.salary).toBe(1);
    expect(result.eligibility).not.toBe("REJECTED");
    expect(result.reasons).toContain("Salario no informado");
  });

  it("can produce different scores for the same offer and two profiles", () => {
    const frontend = run();
    const sales = run({}, {
      targetTitles: ["Sales Manager"], keywords: ["sales"], requiredTechnologies: [],
    });
    expect(frontend.score).not.toBe(sales.score);
  });

  it("always clamps the score between zero and one hundred", () => {
    const results = [run(), run({ status: "REMOVED" }), run({ title: "Unrelated" }, { keywords: [], requiredTechnologies: [] })];
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("match generation service", () => {
  it("delegates idempotency to persistence and reports create versus update", async () => {
    let exists = false;
    const repository: MatchingRepository = {
      loadSearchContext: async () => ({ candidate, search, preferences }),
      loadRecentActiveOffers: async () => [compatibleOffer],
      upsertMatch: async () => {
        const created = !exists;
        exists = true;
        return { created };
      },
    };

    const first = await generateMatchesForSearchProfile(repository, "user-a", "search-a");
    const second = await generateMatchesForSearchProfile(repository, "user-a", "search-a");
    expect(first).toMatchObject({ matchesCreated: 1, matchesUpdated: 0, offersProcessed: 1 });
    expect(second).toMatchObject({ matchesCreated: 0, matchesUpdated: 1, offersProcessed: 1 });
  });
});
