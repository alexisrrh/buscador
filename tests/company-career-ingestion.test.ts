import { describe, expect, it, vi } from "vitest";
import ashbyBoard from "@/tests/fixtures/ashby/job-board.json";
import { AshbyAdapter } from "@/lib/job-sources/ashby/adapter";
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
});
