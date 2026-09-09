import { describe, expect, it } from "vitest";
import { searchIntent } from "@/lib/intent-first";
import { searchPublicOpportunities, type PublicOpportunitySource } from "@/lib/job-sources/public-opportunities.server";
import type { PublicSourceRegistry } from "@/lib/job-sources/source-registry.server";
import type { JobSourceAdapter, NormalizedJobOffer } from "@/lib/job-sources/types";

const offer: NormalizedJobOffer = {
  externalJobId: "real-board-offer-1", title: "Frontend Developer", normalizedTitle: "frontend developer",
  company: { name: "Real Board Company", normalizedName: "real board company", websiteUrl: null },
  description: "Build user-facing experiences with TypeScript and React.", locationText: "A Coruña, Spain",
  countryCode: "ES", region: "Galicia", city: "A Coruña", workMode: "REMOTE", seniority: null,
  employmentType: null, salaryMin: null, salaryMax: null, salaryCurrency: null,
  publishedAt: "2026-09-01T00:00:00.000Z", canonicalUrl: "https://jobs.example.test/frontend",
  canonicalUrlIsReliable: true, sourceUrl: "https://jobs.example.test/frontend", canonicalSourceUrl: "https://jobs.example.test/frontend", status: "ACTIVE",
};

const sources: PublicOpportunitySource[] = [
  { id: "good", platform: "ASHBY", identifier: "good", careersUrl: "https://jobs.ashbyhq.com/good", companyName: "Board Company" },
  { id: "bad", platform: "LEVER", identifier: "bad", careersUrl: "https://jobs.lever.co/bad", companyName: "Broken Board" },
];

function adapter(fails = false, result = offer): JobSourceAdapter<unknown> {
  return {
    sourceCode: "ASHBY", sourceName: "Ashby", sourceBaseUrl: "https://api.ashbyhq.com",
    async search() { if (fails) throw new Error("SOURCE_ERROR"); return { offers: [{}], stats: { pagesRequested: 1, offersReceived: 1 } }; },
    normalize() { return result; },
  };
}

function publicOffer(title: string, locationText: string, workMode: NormalizedJobOffer["workMode"]): NormalizedJobOffer {
  return {
    ...offer, externalJobId: title, title, normalizedTitle: title.toLowerCase(), locationText,
    city: null, region: null, countryCode: null, workMode, canonicalUrl: `https://jobs.example.test/${encodeURIComponent(title)}`,
    sourceUrl: `https://jobs.example.test/${encodeURIComponent(title)}`, canonicalSourceUrl: `https://jobs.example.test/${encodeURIComponent(title)}`,
  };
}

describe("public opportunities", () => {
  it("searches normalized pipeline offers without a user, profile, CV, or match", async () => {
    const result = await searchPublicOpportunities(searchIntent({ role: "Frontend Developer", location: "A Coruña", workMode: "REMOTE" }), {
      sources: sources.slice(0, 1), createAdapter: () => adapter(),
    });
    expect(result).toMatchObject({ sourcesAttempted: 1, sourcesSucceeded: 1, sourcesFailed: 0 });
    expect(result.opportunities).toEqual([expect.objectContaining({ title: "Frontend Developer", companyName: "Real Board Company" })]);
    expect(JSON.stringify(result)).not.toMatch(/compatibility|candidate_profile|search_profile/i);
  });

  it("keeps successful source results when another public board fails", async () => {
    const result = await searchPublicOpportunities(searchIntent({ role: "Frontend", workMode: "ANY" }), {
      sources, createAdapter: (source) => adapter(source.id === "bad"),
    });
    expect(result).toMatchObject({ sourcesAttempted: 2, sourcesSucceeded: 1, sourcesFailed: 1 });
    expect(result.opportunities).toHaveLength(1);
  });

  it("records board health without letting a failed board block another board", async () => {
    const checks: Array<{ sourceId: string; success: boolean; errorCode: string | null }> = [];
    const registeredSources = sources.map((source) => ({
      ...source, enabled: true, status: "UNKNOWN" as const,
      lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null,
    }));
    const registry: PublicSourceRegistry = {
      sources: registeredSources,
      allSources: registeredSources,
      boardsLoaded: 2,
      boardsSkippedDisabled: 0,
      providersLoaded: 2,
      usedDevelopmentFallback: false,
      async recordCheck(sourceId, result) {
        checks.push({ sourceId, success: result.success, errorCode: result.errorCode });
      },
    };
    const result = await searchPublicOpportunities(searchIntent({ role: "Frontend", workMode: "ANY" }), {
      loadRegistry: async () => registry,
      createAdapter: (source) => adapter(source.id === "bad"),
    });

    expect(result).toMatchObject({ sourcesSucceeded: 1, sourcesFailed: 1, boardsLoaded: 2, providersLoaded: 2 });
    expect(checks).toEqual(expect.arrayContaining([
      { sourceId: "good", success: true, errorCode: null },
      { sourceId: "bad", success: false, errorCode: "UNEXPECTED_ERROR" },
    ]));
    expect(JSON.stringify(result)).not.toMatch(/source_id|UNEXPECTED_ERROR|last_error/i);
  });

  it("returns a safe no-results state instead of inventing opportunities", async () => {
    const result = await searchPublicOpportunities(searchIntent({ role: "Enfermera", workMode: "ANY" }), {
      sources: sources.slice(0, 1), createAdapter: () => adapter(),
    });
    expect(result.sourcesSucceeded).toBe(1);
    expect(result.opportunities).toEqual([]);
  });

  it("keeps only role, junior, France-eligible remote offers for a Spanish full-stack intent", async () => {
    const fixture = [
      publicOffer("Junior Full Stack Developer", "France Remote", "REMOTE"),
      publicOffer("Full Stack Developer", "Remote Europe", "REMOTE"),
      publicOffer("Business Development Representative", "Remote Germany", "REMOTE"),
      publicOffer("Mid Market Account Executive", "France", "ONSITE"),
      publicOffer("Director Customer Success", "Remote France", "REMOTE"),
      publicOffer("Senior Full Stack Engineer", "France", "REMOTE"),
    ];
    const result = await searchPublicOpportunities(
      searchIntent({ role: "desarrollador full stack junior", location: "Francia", workMode: "REMOTE" }),
      {
        sources: sources.slice(0, 1),
        createAdapter: () => ({
          sourceCode: "ASHBY", sourceName: "Ashby", sourceBaseUrl: "https://api.ashbyhq.com",
          async search() { return { offers: fixture, stats: { pagesRequested: 1, offersReceived: fixture.length } }; },
          normalize(raw) { return raw as NormalizedJobOffer; },
        }),
      },
    );

    expect(result.opportunities.map((item) => item.title)).toEqual([
      "Junior Full Stack Developer", "Full Stack Developer",
    ]);
    expect(result).toMatchObject({ offersReceivedRaw: 6, discardedRole: 3, discardedSeniority: 1, discardedLocationMode: 0 });
  });
});
