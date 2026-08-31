import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobSearchSummary } from "@/components/job-search-summary";
import { JobsEmptyState, JobsSearchControls } from "@/components/jobs-search-state";
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
        candidate: { id: "candidate", userId: "user", seniority: "MID", jobFamily: "Software Engineering" },
        search: {
          id: "search", userId: "user", candidateProfileId: "candidate",
          version: 1, status: "ACTIVE", name: "Frontend Developer", notificationMinScore: 70,
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
      provider_summary: {
        ASHBY: { attempted: 1, succeeded: 1, failed: 0, offers_received: 1 },
        LEVER: { attempted: 1, succeeded: 0, failed: 1, offers_received: 0 },
      },
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
  it("shows Buscar ofertas for an active profile even with zero configured sources", () => {
    const searches = [{
      id: "61110000-0000-0000-0000-000000000001",
      name: "Frontend real",
      status: "ACTIVE",
      notification_min_score: 70,
    }];
    render(JobsSearchControls({ searches, selectedSearchId: searches[0].id }));
    expect(screen.getByRole("option", { name: "Frontend real" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar ofertas" })).toBeInTheDocument();

    render(JobsEmptyState({ searches, configuredSourceCount: 0 }));
    expect(screen.getByText(/No hay fuentes de empresas configuradas/)).toBeInTheDocument();
    expect(screen.getByText(/pulsa “Buscar ofertas”/)).toBeInTheDocument();
  });

  it("shows paused searches for activation without exposing the search button", () => {
    const searches = [{
      id: "61110000-0000-0000-0000-000000000001",
      name: "Frontend pausada",
      status: "PAUSED",
      notification_min_score: 70,
    }];
    render(JobsSearchControls({ searches }));
    render(JobsEmptyState({ searches, configuredSourceCount: 0 }));
    expect(screen.queryByRole("button", { name: "Buscar ofertas" })).not.toBeInTheDocument();
    expect(screen.getByText("No tienes ninguna búsqueda activa.")).toBeInTheDocument();
    expect(screen.getByText("En pausa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Frontend pausada/ })).toHaveAttribute(
      "href",
      `/searches/${searches[0].id}`,
    );
  });

  it("renders newly generated matches and source results", () => {
    render(JobSearchSummary({ summary: {
      sources: 2, succeeded: 1, failed: 1, received: 20, created: 12,
      updated: 8, duplicates: 8, matches: 18, high: 6, infoJobsSkipped: true,
      providers: { GREENHOUSE: { attempted: 3, succeeded: 2, failed: 1, offers_received: 120 } },
    } }));
    expect(screen.getByText("Matches generados").nextSibling).toHaveTextContent("18");
    expect(screen.getByText(/SKIPPED_SOURCE/)).toBeInTheDocument();
    expect(screen.getByText(/GREENHOUSE: 2\/3 fuentes/)).toBeInTheDocument();
  });
});
