import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobSearchSummary } from "@/components/job-search-summary";
import { PublicJobSourceError } from "@/lib/job-sources/public-json-client";
import { runPublicJobSearch } from "@/lib/job-sources/run-public-search";
import type {
  CompanyCareerSourceCheckRecorder,
  JobOfferRepository,
  JobSourceAdapter,
  NormalizedJobOffer,
} from "@/lib/job-sources/types";
import type { MatchingRepository } from "@/lib/matching/service";

const sourceOffer: NormalizedJobOffer = {
  externalJobId: "real-shaped-1",
  title: "Frontend Engineer",
  normalizedTitle: "frontend engineer",
  company: null,
  description: "React TypeScript web role requiring 2 years experience.",
  locationText: "Remote",
  countryCode: null,
  region: null,
  city: null,
  workMode: "REMOTE",
  seniority: "MID",
  employmentType: "FULL_TIME",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  publishedAt: null,
  canonicalUrl: "https://jobs.example.invalid/frontend",
  canonicalUrlIsReliable: true,
  sourceUrl: "https://jobs.example.invalid/frontend",
  canonicalSourceUrl: "https://jobs.example.invalid/frontend",
  status: "ACTIVE",
};

class MemoryRepository implements JobOfferRepository, CompanyCareerSourceCheckRecorder {
  readonly sources = new Map<string, string>();
  readonly offers = new Set<string>();
  readonly checks: boolean[] = [];

  async findExisting(sourceCode: string, offer: NormalizedJobOffer) {
    const id = this.sources.get(`${sourceCode}:${offer.externalJobId}`);
    return id
      ? { jobOfferId: id, jobOfferSourceId: id, matchedBy: "external_job_id" as const }
      : null;
  }

  async persist(source: { code: string }, offer: NormalizedJobOffer) {
    const key = `${source.code}:${offer.externalJobId}`;
    const existing = this.sources.get(key);
    if (existing) {
      return { jobOfferId: existing, jobOfferSourceId: existing, offerCreated: false, sourceCreated: false };
    }
    const id = `offer-${this.offers.size + 1}`;
    this.offers.add(id);
    this.sources.set(key, id);
    return { jobOfferId: id, jobOfferSourceId: id, offerCreated: true, sourceCreated: true };
  }

  async recordCompanyCareerSourceCheck(_id: string, result: { success: boolean }) {
    this.checks.push(result.success);
  }
}

function adapter(fails = false): JobSourceAdapter<unknown> {
  return {
    sourceCode: "ASHBY",
    sourceName: "Ashby",
    sourceBaseUrl: "https://api.ashbyhq.com",
    async search() {
      if (fails) throw new PublicJobSourceError("NOT_FOUND", "Synthetic missing board.");
      return { offers: [{}], stats: { pagesRequested: 1, offersReceived: 1 } };
    },
    normalize() {
      return sourceOffer;
    },
  };
}

function matchingRepository(): MatchingRepository & { matchIds: Set<string> } {
  const matchIds = new Set<string>();
  return {
    matchIds,
    async loadSearchContext() {
      return {
        candidate: { id: "candidate", userId: "user", seniority: "MID" },
        search: {
          id: "search", userId: "user", candidateProfileId: "candidate",
          version: 1, status: "ACTIVE", notificationMinScore: 70,
        },
        preferences: {
          keywords: ["frontend"], targetTitles: ["Frontend Developer"], excludedTitles: [],
          locations: [], workModes: ["REMOTE"], minimumSalary: null, currency: null,
          acceptedSeniorities: ["MID"], minimumExperienceYears: null,
          maximumExperienceYears: 5, requiredTechnologies: ["React", "TypeScript"],
          excludedTechnologies: [], contractTypes: ["FULL_TIME"],
        },
      };
    },
    async loadRecentActiveOffers() {
      return [{
        id: "offer-1", status: "ACTIVE", title: sourceOffer.title,
        description: sourceOffer.description, locationText: sourceOffer.locationText,
        countryCode: null, region: null, city: null, workMode: sourceOffer.workMode,
        seniority: sourceOffer.seniority, employmentType: sourceOffer.employmentType,
        salaryMin: null, salaryMax: null, salaryCurrency: null,
      }];
    },
    async upsertMatch(input) {
      const key = `${input.searchProfileId}:${input.jobOfferId}:${input.result.scoringVersion}`;
      const created = !matchIds.has(key);
      matchIds.add(key);
      return { created };
    },
  };
}

const sources = [
  { id: "good", platform: "ASHBY" as const, identifier: "good", careersUrl: "https://jobs.ashbyhq.com/good" },
  { id: "bad", platform: "LEVER" as const, identifier: "bad", careersUrl: "https://jobs.lever.co/bad" },
];

describe("public job search orchestration", () => {
  it("continues after one source fails and reports InfoJobs as skipped", async () => {
    const repository = new MemoryRepository();
    const matches = matchingRepository();
    const report = await runPublicJobSearch({
      userId: "user",
      searchProfileId: "search",
      sources,
      jobOfferRepository: repository,
      matchingRepository: matches,
      createAdapter: (source) => adapter(source.id === "bad"),
    });

    expect(report).toMatchObject({
      sources_attempted: 2,
      sources_succeeded: 1,
      sources_failed: 1,
      offers_received: 1,
      offers_created: 1,
      matches_generated: 1,
      high_compatibility: 1,
      skipped_sources: ["INFOJOBS"],
    });
  });

  it("does not duplicate offers or matches across two searches", async () => {
    const repository = new MemoryRepository();
    const matches = matchingRepository();
    const input = {
      userId: "user",
      searchProfileId: "search",
      sources: sources.slice(0, 1),
      jobOfferRepository: repository,
      matchingRepository: matches,
      createAdapter: () => adapter(),
    };
    const first = await runPublicJobSearch(input);
    const second = await runPublicJobSearch(input);

    expect(first).toMatchObject({ offers_created: 1, offers_updated: 0, duplicates: 0 });
    expect(second).toMatchObject({ offers_created: 0, offers_updated: 1, duplicates: 1 });
    expect(repository.offers).toHaveLength(1);
    expect(matches.matchIds).toHaveLength(1);
  });
});

describe("jobs dashboard execution summary", () => {
  it("renders newly generated matches and source results", () => {
    render(JobSearchSummary({ summary: {
      sources: 2, succeeded: 1, failed: 1, received: 20, created: 12,
      updated: 8, duplicates: 8, matches: 18, high: 6, infoJobsSkipped: true,
    } }));
    expect(screen.getByText("Matches generados").nextSibling).toHaveTextContent("18");
    expect(screen.getByText(/SKIPPED_SOURCE/)).toBeInTheDocument();
  });
});
