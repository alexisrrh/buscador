import type {
  JobIngestionStats,
  JobOfferRepository,
  JobSearchOptions,
  JobSearchQuery,
  JobSourceAdapter,
} from "@/lib/job-sources/types";

export interface IngestJobSearchOptions extends JobSearchOptions {
  fetchDetails?: boolean;
  observedAt?: Date;
  companyCareerSourceId?: string | null;
}

export async function ingestJobSearchResults<TRawOffer, TRawDetails>(
  adapter: JobSourceAdapter<TRawOffer, TRawDetails>,
  repository: JobOfferRepository,
  query: JobSearchQuery,
  options: IngestJobSearchOptions = {},
): Promise<JobIngestionStats> {
  const searchResult = await adapter.search(query, options);
  const observedAt = options.observedAt ?? new Date();
  const stats: JobIngestionStats = {
    source: adapter.sourceCode,
    query,
    pages_requested: searchResult.stats.pagesRequested,
    offers_received: searchResult.stats.offersReceived,
    offers_normalized: 0,
    offers_created: 0,
    offers_updated: 0,
    duplicates: 0,
    details_requested: 0,
    errors: 0,
  };

  for (const rawOffer of searchResult.offers) {
    try {
      let normalized = adapter.normalize(rawOffer);
      const existing = await repository.findExisting(adapter.sourceCode, normalized);
      if (existing) stats.duplicates += 1;

      let rawPayload: unknown = rawOffer;
      const shouldFetchDetails =
        options.fetchDetails !== false &&
        !existing &&
        normalized.externalJobId !== null &&
        adapter.getOfferDetails !== undefined &&
        (adapter.needsDetails?.(rawOffer, normalized) ?? false);

      if (shouldFetchDetails && adapter.getOfferDetails) {
        stats.details_requested += 1;
        const details = await adapter.getOfferDetails(normalized.externalJobId!);
        normalized = adapter.normalize(details);
        rawPayload = details;
      }

      const persisted = await repository.persist(
        {
          code: adapter.sourceCode,
          name: adapter.sourceName,
          baseUrl: adapter.sourceBaseUrl,
          companyCareerSourceId: options.companyCareerSourceId,
        },
        normalized,
        rawPayload,
        observedAt,
      );

      stats.offers_normalized += 1;
      if (persisted.offerCreated) stats.offers_created += 1;
      else stats.offers_updated += 1;
      if (!existing && !persisted.sourceCreated) stats.duplicates += 1;
    } catch {
      stats.errors += 1;
    }
  }

  return stats;
}
