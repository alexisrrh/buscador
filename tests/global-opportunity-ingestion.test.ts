import { describe, expect, it } from "vitest";

import { ingestRegisteredOpportunityCatalog } from "@/lib/job-sources/global-ingestion.server";
import { searchIntent } from "@/lib/intent-first";
import { searchPublicOpportunities } from "@/lib/job-sources/public-opportunities.server";
import type { PublicCatalogOffer } from "@/lib/job-sources/public-catalog.server";
import type { PublicSourceRegistry } from "@/lib/job-sources/source-registry.server";
import type { CompanyCareerSourceCheckRecorder, JobOfferRepository, JobSourceAdapter, NormalizedJobOffer } from "@/lib/job-sources/types";

const normalized: NormalizedJobOffer = {
  externalJobId: "offer-1", title: "Frontend Developer", normalizedTitle: "frontend developer",
  company: { name: "Catalog Company", normalizedName: "catalog company", websiteUrl: null },
  description: "Build user-facing experiences with React.", locationText: "A Coruña, Spain", countryCode: "ES", region: "Galicia", city: "A Coruña",
  workMode: "REMOTE", seniority: null, employmentType: null, salaryMin: null, salaryMax: null, salaryCurrency: null,
  publishedAt: "2026-09-09T00:00:00.000Z", canonicalUrl: "https://jobs.example.test/frontend", canonicalUrlIsReliable: true,
  sourceUrl: "https://jobs.example.test/frontend", canonicalSourceUrl: "https://jobs.example.test/frontend", status: "ACTIVE",
};

class MemoryCatalogRepository implements JobOfferRepository, CompanyCareerSourceCheckRecorder {
  readonly offers = new Map<string, PublicCatalogOffer>();
  readonly checks: Array<{ id: string; success: boolean }> = [];

  async findExisting() { return null; }
  async persist(source: { name: string }, offer: NormalizedJobOffer) {
    const id = offer.externalJobId!;
    this.offers.set(id, {
      id, title: offer.title, description: offer.description, locationText: offer.locationText, countryCode: offer.countryCode,
      region: offer.region, city: offer.city, workMode: offer.workMode, seniority: offer.seniority,
      employmentType: offer.employmentType, salaryMin: offer.salaryMin, salaryMax: offer.salaryMax, salaryCurrency: offer.salaryCurrency,
      status: offer.status, companyName: offer.company?.name ?? null, sourceName: source.name, sourceUrl: offer.sourceUrl,
      canonicalUrl: offer.canonicalUrl, publishedAt: offer.publishedAt,
    });
    return { jobOfferId: id, jobOfferSourceId: `source-${id}`, offerCreated: true, sourceCreated: true };
  }
  async recordCompanyCareerSourceCheck(id: string, result: { success: boolean }) { this.checks.push({ id, success: result.success }); }
}

const sources = [
  { id: "enabled", platform: "ASHBY" as const, identifier: "enabled", careersUrl: "https://jobs.ashbyhq.com/enabled", companyName: "Catalog Company", enabled: true, status: "UNKNOWN" as const, lastCheckedAt: null, lastSuccessAt: null, lastErrorCode: null },
];

const registry: PublicSourceRegistry = {
  sources,
  allSources: [...sources, { ...sources[0], id: "disabled", enabled: false, status: "DISABLED" }],
  boardsLoaded: 1,
  boardsSkippedDisabled: 1,
  providersLoaded: 1,
  usedDevelopmentFallback: false,
  async recordCheck() {},
};

describe("global ingestion to public catalog vertical slice", () => {
  it("ingests enabled boards globally, then searches persisted offers without auth or a live adapter", async () => {
    const repository = new MemoryCatalogRepository();
    let adapterCalls = 0;
    const report = await ingestRegisteredOpportunityCatalog({
      loadRegistry: async () => registry,
      jobOfferRepository: repository,
      createAdapter: () => ({
        sourceCode: "ASHBY", sourceName: "Ashby", sourceBaseUrl: "https://api.ashbyhq.com",
        async search() { adapterCalls += 1; return { offers: [{}], stats: { pagesRequested: 1, offersReceived: 1 } }; },
        normalize() { return normalized; },
      } satisfies JobSourceAdapter<unknown>),
    });
    const callsAfterIngestion = adapterCalls;
    const result = await searchPublicOpportunities(
      searchIntent({ role: "Frontend Developer", workMode: "REMOTE" }),
      { loadCatalog: async () => ({ offers: [...repository.offers.values()], catalogQueryMs: 1 }) },
    );

    expect(report).toMatchObject({ sourcesAttempted: 1, sourcesSucceeded: 1, sourcesFailed: 0, offersCreated: 1 });
    expect(registry.boardsSkippedDisabled).toBe(1);
    expect(repository.checks).toEqual([{ id: "enabled", success: true }]);
    expect(result.opportunities).toEqual([expect.objectContaining({ title: "Frontend Developer" })]);
    expect(adapterCalls).toBe(callsAfterIngestion);
    expect(JSON.stringify(result)).not.toMatch(/candidate|search_profile|job_match|raw_payload|source_id/i);
  });

  it("keeps a successful board when another board fails", async () => {
    const repository = new MemoryCatalogRepository();
    const twoSources = [...sources, { ...sources[0], id: "broken-jobicy", platform: "JOBICY" as const, identifier: "europe-engineering" }];
    const report = await ingestRegisteredOpportunityCatalog({
      loadRegistry: async () => ({ ...registry, sources: twoSources, allSources: twoSources, boardsLoaded: 2, boardsSkippedDisabled: 0 }),
      jobOfferRepository: repository,
      createAdapter: (source) => ({
        sourceCode: "ASHBY", sourceName: "Ashby", sourceBaseUrl: "https://api.ashbyhq.com",
        async search() { if (source.id === "broken-jobicy") throw new Error("BOARD_FAILED"); return { offers: [{}], stats: { pagesRequested: 1, offersReceived: 1 } }; },
        normalize() { return normalized; },
      }),
    });

    expect(report).toMatchObject({ sourcesAttempted: 2, sourcesSucceeded: 1, sourcesFailed: 1, offersCreated: 1 });
  });
});
