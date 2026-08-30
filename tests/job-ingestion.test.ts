import { describe, expect, it, vi } from "vitest";
import pageOne from "@/tests/fixtures/infojobs/search-page-1.json";
import offerDetail from "@/tests/fixtures/infojobs/offer-detail.json";
import { InfoJobsAdapter } from "@/lib/job-sources/infojobs/adapter";
import { ingestJobSearchResults } from "@/lib/job-sources/ingestion";
import type {
  ExistingJobOffer,
  JobOfferRepository,
  NormalizedJobOffer,
} from "@/lib/job-sources/types";

class MemoryJobOfferRepository implements JobOfferRepository {
  readonly offers = new Map<string, { id: string; firstSeenAt: Date; lastSeenAt: Date }>();
  readonly sources = new Map<string, { id: string; offerId: string }>();
  readonly canonicalOffers = new Map<string, string>();

  async findExisting(sourceCode: string, offer: NormalizedJobOffer) {
    const key = `${sourceCode}:${offer.externalJobId ?? offer.canonicalSourceUrl}`;
    const source = this.sources.get(key);
    if (!source) return null;
    return {
      jobOfferId: source.offerId,
      jobOfferSourceId: source.id,
      matchedBy: offer.externalJobId
        ? "external_job_id"
        : "canonical_source_url",
    } satisfies ExistingJobOffer;
  }

  async persist(
    source: { code: string },
    offer: NormalizedJobOffer,
    _rawPayload: unknown,
    observedAt: Date,
  ) {
    const sourceKey = `${source.code}:${offer.externalJobId ?? offer.canonicalSourceUrl}`;
    const existingSource = this.sources.get(sourceKey);
    if (existingSource) {
      this.offers.get(existingSource.offerId)!.lastSeenAt = observedAt;
      return {
        jobOfferId: existingSource.offerId,
        jobOfferSourceId: existingSource.id,
        offerCreated: false,
        sourceCreated: false,
      };
    }

    const canonicalKey = offer.canonicalUrlIsReliable ? offer.canonicalUrl : null;
    const existingOfferId = canonicalKey
      ? this.canonicalOffers.get(canonicalKey)
      : undefined;
    let storedOffer = existingOfferId ? this.offers.get(existingOfferId) : undefined;
    const offerCreated = !storedOffer;
    if (!storedOffer) {
      storedOffer = {
        id: `offer-${this.offers.size + 1}`,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      };
      this.offers.set(storedOffer.id, storedOffer);
      if (canonicalKey) this.canonicalOffers.set(canonicalKey, storedOffer.id);
    }

    const storedSource = {
      id: `source-${this.sources.size + 1}`,
      offerId: storedOffer.id,
    };
    this.sources.set(sourceKey, storedSource);
    return {
      jobOfferId: storedOffer.id,
      jobOfferSourceId: storedSource.id,
      offerCreated,
      sourceCreated: true,
    };
  }
}

function duplicateSearchResponse() {
  return {
    ...pageOne,
    totalResults: 2,
    currentResults: 2,
    totalPages: 1,
    offers: [pageOne.offers[0], pageOne.offers[0]],
  };
}

describe("ingestJobSearchResults", () => {
  it("deduplicates repeated external IDs and reports safe execution stats", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const payload = String(input).includes("/api/7/offer/")
          ? offerDetail
          : duplicateSearchResponse();
        return new Response(JSON.stringify(payload), { status: 200 });
      });
    const adapter = new InfoJobsAdapter({
      clientId: "synthetic-client",
      clientSecret: "synthetic-secret",
      fetchImplementation: fetchMock,
      requestIntervalMs: 0,
    });
    const repository = new MemoryJobOfferRepository();

    const first = await ingestJobSearchResults(
      adapter,
      repository,
      { keywords: "synthetic" },
      {
        maxPages: 1,
        maxOffers: 10,
        observedAt: new Date("2026-08-30T08:00:00Z"),
      },
    );
    const second = await ingestJobSearchResults(
      adapter,
      repository,
      { keywords: "synthetic" },
      {
        maxPages: 1,
        maxOffers: 10,
        observedAt: new Date("2026-08-30T09:00:00Z"),
      },
    );

    expect(first).toMatchObject({
      source: "INFOJOBS",
      pages_requested: 1,
      offers_received: 2,
      offers_normalized: 2,
      offers_created: 1,
      offers_updated: 1,
      duplicates: 1,
      details_requested: 1,
      errors: 0,
    });
    expect(second).toMatchObject({
      offers_created: 0,
      offers_updated: 2,
      duplicates: 2,
      details_requested: 0,
      errors: 0,
    });
    expect(repository.offers).toHaveLength(1);
    expect(repository.sources).toHaveLength(1);
    expect([...repository.offers.values()][0].firstSeenAt.toISOString()).toBe(
      "2026-08-30T08:00:00.000Z",
    );
    expect([...repository.offers.values()][0].lastSeenAt.toISOString()).toBe(
      "2026-08-30T09:00:00.000Z",
    );
  });
});
