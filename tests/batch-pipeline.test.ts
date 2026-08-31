import { describe, expect, it, vi } from "vitest";

import { SupabaseJobOfferRepository, type JobOfferRpcClient } from "@/lib/job-sources/supabase-repository";
import { runPublicJobSearch } from "@/lib/job-sources/run-public-search";
import type { JobOfferRepository, JobSourceAdapter, NormalizedJobOffer } from "@/lib/job-sources/types";
import { generateMatchesForSearchProfile, type MatchingRepository } from "@/lib/matching/service";
import type { MatchJobOffer } from "@/lib/matching/types";

function offer(index: number): NormalizedJobOffer {
  return {
    externalJobId: `external-${index}`,
    title: `Frontend Engineer ${index}`,
    normalizedTitle: `frontend engineer ${index}`,
    company: null,
    description: "React TypeScript web role with 3 years experience.",
    locationText: "Spain",
    countryCode: "ES",
    region: null,
    city: null,
    workMode: "REMOTE",
    seniority: "MID",
    employmentType: "FULL_TIME",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    publishedAt: null,
    canonicalUrl: `https://example.invalid/jobs/${index}`,
    canonicalUrlIsReliable: true,
    sourceUrl: `https://example.invalid/jobs/${index}`,
    canonicalSourceUrl: `https://example.invalid/jobs/${index}`,
    status: "ACTIVE",
  };
}

describe("batch offer repository", () => {
  it("persists a batch of 200 offers with one RPC", async () => {
    const rpc = vi.fn(async (_name: string, parameters: Record<string, unknown>) => {
      const payload = parameters.p_offers as Array<{ batch_index: number }>;
      return {
        data: {
          results: payload.map((item) => ({
            batch_index: item.batch_index,
            job_offer_id: `offer-${item.batch_index}`,
            job_offer_source_id: `source-${item.batch_index}`,
            outcome: "CREATED",
            source_created: true,
            matched_existing: false,
          })),
          created: payload.length,
          updated: 0,
          unchanged: 0,
        },
        error: null,
      };
    });
    const repository = new SupabaseJobOfferRepository({ rpc } as JobOfferRpcClient);
    const items = Array.from({ length: 200 }, (_, index) => ({
      offer: offer(index),
      rawPayload: { index },
    }));

    const result = await repository.persistBatch(
      {
        code: "GREENHOUSE",
        name: "Greenhouse",
        baseUrl: "https://boards-api.greenhouse.io",
        companyCareerSourceId: "source-config",
      },
      items,
      new Date("2026-08-31T10:00:00Z"),
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ errors: 0 });
    expect(result.results).toHaveLength(200);
  });

  it("continues after one chunk fails without returning partial rows from it", async () => {
    let calls = 0;
    const rpc = vi.fn(async (_name: string, parameters: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) return { data: null, error: { message: "synthetic", code: "XX001" } };
      const payload = parameters.p_offers as Array<{ batch_index: number }>;
      return {
        data: {
          results: payload.map((item) => ({
            batch_index: item.batch_index,
            job_offer_id: `offer-${item.batch_index}`,
            job_offer_source_id: `source-${item.batch_index}`,
            outcome: "UNCHANGED",
            source_created: false,
            matched_existing: true,
          })),
        },
        error: null,
      };
    });
    const repository = new SupabaseJobOfferRepository({ rpc } as JobOfferRpcClient, 2);
    const result = await repository.persistBatch(
      { code: "ASHBY", name: "Ashby", baseUrl: "https://api.ashbyhq.com", companyCareerSourceId: "source" },
      Array.from({ length: 3 }, (_, index) => ({ offer: offer(index), rawPayload: null })),
      new Date(),
    );

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.errors).toBe(2);
    expect(result.results).toHaveLength(1);
  });
});

const matchOffer: MatchJobOffer = {
  id: "offer-1",
  status: "ACTIVE",
  title: "Frontend Engineer",
  description: "React TypeScript web role with 3 years experience.",
  locationText: "Spain",
  countryCode: "ES",
  region: null,
  city: null,
  workMode: "REMOTE",
  seniority: "MID",
  employmentType: "FULL_TIME",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

function matchingRepository(existing: Set<string>) {
  const upsertMatches = vi.fn(async (inputs) => ({ created: inputs.length, updated: 0 }));
  const repository: MatchingRepository = {
    loadSearchContext: async () => ({
      candidate: { id: "candidate", userId: "user", seniority: "MID", jobFamily: "Frontend" },
      search: {
        id: "search", userId: "user", candidateProfileId: "candidate", version: 1,
        status: "ACTIVE", name: "Frontend Developer", notificationMinScore: 70,
      },
      preferences: {
        keywords: ["web"], targetTitles: ["Frontend Developer"], excludedTitles: [],
        locations: [{ label: "Spain", country: "ES" }], workModes: ["REMOTE"],
        minimumSalary: null, currency: null, acceptedSeniorities: ["MID"],
        minimumExperienceYears: null, maximumExperienceYears: 5,
        requiredTechnologies: ["React"], excludedTechnologies: [], contractTypes: [],
      },
    }),
    loadRecentActiveOffers: async () => [matchOffer],
    loadExistingMatchOfferIds: async () => existing,
    upsertMatches,
    upsertMatch: async () => ({ created: true }),
  };
  return { repository, upsertMatches };
}

describe("selective batch matching", () => {
  it("skips an unchanged offer that already has deterministic-v2", async () => {
    const { repository, upsertMatches } = matchingRepository(new Set([matchOffer.id]));
    const report = await generateMatchesForSearchProfile(repository, "user", "search", {
      changedJobOfferIds: [],
    });
    expect(report).toMatchObject({ offersProcessed: 0, matchesSkipped: 1 });
    expect(upsertMatches).toHaveBeenCalledWith([]);
  });

  it("recalculates a changed offer and persists it in one batch", async () => {
    const { repository, upsertMatches } = matchingRepository(new Set([matchOffer.id]));
    const report = await generateMatchesForSearchProfile(repository, "user", "search", {
      changedJobOfferIds: [matchOffer.id],
    });
    expect(report).toMatchObject({ offersProcessed: 1, matchesSkipped: 0, matchesCreated: 1 });
    expect(upsertMatches).toHaveBeenCalledTimes(1);
  });

  it("matches an unchanged offer when the scoring/profile identity has no valid match", async () => {
    const { repository } = matchingRepository(new Set());
    const report = await generateMatchesForSearchProfile(repository, "user", "search", {
      changedJobOfferIds: [],
    });
    expect(report.offersProcessed).toBe(1);
  });
});

describe("limited source concurrency", () => {
  it("runs multiple sources concurrently but never more than four", async () => {
    let active = 0;
    let maximumActive = 0;
    const adapter: JobSourceAdapter<never> = {
      sourceCode: "ASHBY",
      sourceName: "Ashby",
      sourceBaseUrl: "https://api.ashbyhq.com",
      async search() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { offers: [], stats: { pagesRequested: 1, offersReceived: 0 } };
      },
      normalize() {
        throw new Error("No offers expected");
      },
    };
    const jobOfferRepository: JobOfferRepository & {
      recordCompanyCareerSourceCheck: () => Promise<void>;
    } = {
      findExisting: async () => null,
      persist: async () => {
        throw new Error("No offers expected");
      },
      recordCompanyCareerSourceCheck: async () => undefined,
    };
    const { repository: matching } = matchingRepository(new Set());

    await runPublicJobSearch({
      userId: "user",
      searchProfileId: "search",
      sources: Array.from({ length: 8 }, (_, index) => ({
        id: `source-${index}`,
        platform: "ASHBY" as const,
        identifier: `board-${index}`,
        careersUrl: `https://jobs.ashbyhq.com/board-${index}`,
      })),
      jobOfferRepository,
      matchingRepository: { ...matching, loadRecentActiveOffers: async () => [] },
      createAdapter: () => adapter,
    });

    expect(maximumActive).toBe(4);
  });
});
