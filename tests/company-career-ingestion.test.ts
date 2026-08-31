import { describe, expect, it, vi } from "vitest";
import ashbyBoard from "@/tests/fixtures/ashby/job-board.json";
import greenhouseJobs from "@/tests/fixtures/greenhouse/jobs.json";
import smartPageOne from "@/tests/fixtures/smartrecruiters/postings-page-1.json";
import smartDetails from "@/tests/fixtures/smartrecruiters/posting-detail.json";
import { AshbyAdapter } from "@/lib/job-sources/ashby/adapter";
import { GreenhouseAdapter } from "@/lib/job-sources/greenhouse/adapter";
import { SmartRecruitersAdapter } from "@/lib/job-sources/smartrecruiters/adapter";
import { ingestCompanyCareerSource } from "@/lib/job-sources/company-careers";
import type {
  CompanyCareerSourceCheckRecorder,
  ExistingJobOffer,
  JobOfferRepository,
  NormalizedJobOffer,
} from "@/lib/job-sources/types";

class MemoryCareerRepository
  implements JobOfferRepository, CompanyCareerSourceCheckRecorder
{
  readonly offersByCanonicalUrl = new Map<string, string>();
  readonly sources = new Map<string, { id: string; offerId: string }>();
  readonly checks: Array<{
    id: string;
    success: boolean;
    errorCode: string | null;
  }> = [];
  readonly officialIds: Array<string | null | undefined> = [];

  async findExisting(sourceCode: string, offer: NormalizedJobOffer) {
    const source = this.sources.get(`${sourceCode}:${offer.externalJobId}`);
    if (source) {
      return {
        jobOfferId: source.offerId,
        jobOfferSourceId: source.id,
        matchedBy: "external_job_id",
      } satisfies ExistingJobOffer;
    }
    const offerId = offer.canonicalUrl
      ? this.offersByCanonicalUrl.get(offer.canonicalUrl)
      : undefined;
    return offerId
      ? {
          jobOfferId: offerId,
          jobOfferSourceId: null,
          matchedBy: "canonical_url" as const,
        }
      : null;
  }

  async persist(
    source: {
      code: string;
      companyCareerSourceId?: string | null;
    },
    offer: NormalizedJobOffer,
  ) {
    this.officialIds.push(source.companyCareerSourceId);
    const sourceKey = `${source.code}:${offer.externalJobId}`;
    const existingSource = this.sources.get(sourceKey);
    if (existingSource) {
      return {
        jobOfferId: existingSource.offerId,
        jobOfferSourceId: existingSource.id,
        offerCreated: false,
        sourceCreated: false,
      };
    }

    const existingOfferId = offer.canonicalUrl
      ? this.offersByCanonicalUrl.get(offer.canonicalUrl)
      : undefined;
    const offerId = existingOfferId ?? `offer-${this.offersByCanonicalUrl.size + 1}`;
    if (offer.canonicalUrl) this.offersByCanonicalUrl.set(offer.canonicalUrl, offerId);
    const storedSource = { id: `source-${this.sources.size + 1}`, offerId };
    this.sources.set(sourceKey, storedSource);
    return {
      jobOfferId: offerId,
      jobOfferSourceId: storedSource.id,
      offerCreated: !existingOfferId,
      sourceCreated: true,
    };
  }

  async recordCompanyCareerSourceCheck(
    companyCareerSourceId: string,
    result: { success: boolean; errorCode: string | null },
  ) {
    this.checks.push({ id: companyCareerSourceId, ...result });
  }
}

describe("company career ingestion", () => {
  it("deduplicates repeated ATS fixtures across two executions and marks official source", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify(ashbyBoard), { status: 200 }),
    );
    const adapter = new AshbyAdapter({
      jobBoardName: "synthetic-board",
      fetchImplementation: fetchMock,
      requestIntervalMs: 0,
    });
    const repository = new MemoryCareerRepository();
    const source = {
      id: "synthetic-career-source-id",
      platform: "ASHBY" as const,
      identifier: "synthetic-board",
      careersUrl: "https://jobs.ashbyhq.com/synthetic-board",
    };

    const first = await ingestCompanyCareerSource(source, adapter, repository);
    const second = await ingestCompanyCareerSource(source, adapter, repository);

    expect(first).toMatchObject({
      offers_received: 3,
      offers_created: 2,
      offers_updated: 1,
      duplicates: 1,
      errors: 0,
    });
    expect(second).toMatchObject({
      offers_created: 0,
      offers_updated: 3,
      duplicates: 3,
      errors: 0,
    });
    expect(repository.offersByCanonicalUrl).toHaveLength(2);
    expect(repository.sources).toHaveLength(2);
    expect(repository.officialIds).toEqual(
      Array(6).fill("synthetic-career-source-id"),
    );
    expect(repository.checks).toMatchObject([
      { id: "synthetic-career-source-id", success: true, errorCode: null },
      { id: "synthetic-career-source-id", success: true, errorCode: null },
    ]);
  });

  it("keeps Greenhouse ingestion idempotent across repeated board data", async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: "synthetic",
      fetchImplementation: vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(greenhouseJobs))),
      requestIntervalMs: 0,
    });
    const repository = new MemoryCareerRepository();
    const source = { id: "greenhouse-source", platform: "GREENHOUSE" as const, identifier: "synthetic", careersUrl: "https://job-boards.greenhouse.io/synthetic" };
    const first = await ingestCompanyCareerSource(source, adapter, repository);
    const second = await ingestCompanyCareerSource(source, adapter, repository);
    expect(first).toMatchObject({ offers_created: 2, offers_updated: 0, duplicates: 0 });
    expect(second).toMatchObject({ offers_created: 0, offers_updated: 2, duplicates: 2 });
    expect(repository.sources).toHaveLength(2);
  });

  it("fetches SmartRecruiters details only before dedupe and remains idempotent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      new Response(JSON.stringify(String(input).includes("smart-67001") ? smartDetails : smartPageOne)),
    );
    const adapter = new SmartRecruitersAdapter({ companyIdentifier: "synthetic", fetchImplementation: fetchMock, requestIntervalMs: 0 });
    const repository = new MemoryCareerRepository();
    const source = { id: "smart-source", platform: "SMARTRECRUITERS" as const, identifier: "synthetic", careersUrl: "https://careers.smartrecruiters.com/synthetic" };
    const first = await ingestCompanyCareerSource(source, adapter, repository);
    const second = await ingestCompanyCareerSource(source, adapter, repository);
    expect(first).toMatchObject({ offers_created: 1, details_requested: 1 });
    expect(second).toMatchObject({ offers_created: 0, offers_updated: 1, duplicates: 1, details_requested: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
