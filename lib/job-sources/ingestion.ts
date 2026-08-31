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
  let timer = performance.now();
  const searchResult = await adapter.search(query, options);
  const initialFetchMs = performance.now() - timer;
  const observedAt = options.observedAt ?? new Date();
  const stats: JobIngestionStats = {
    source: adapter.sourceCode,
    query,
    pages_requested: searchResult.stats.pagesRequested,
    offers_received: searchResult.stats.offersReceived,
    offers_normalized: 0,
    offers_created: 0,
    offers_updated: 0,
    offers_unchanged: 0,
    duplicates: 0,
    details_requested: 0,
    errors: 0,
    fetch_ms: initialFetchMs,
    normalize_ms: 0,
    persist_ms: 0,
    matching_job_offer_ids: [],
  };

  if (repository.persistBatch) {
    const normalizedItems: Array<{
      rawOffer: TRawOffer | TRawDetails;
      normalized: ReturnType<typeof adapter.normalize>;
      rawPayload: unknown;
    }> = [];
    for (const rawOffer of searchResult.offers) {
      try {
        timer = performance.now();
        const normalized = adapter.normalize(rawOffer);
        stats.normalize_ms += performance.now() - timer;
        normalizedItems.push({ rawOffer, normalized, rawPayload: rawOffer });
      } catch {
        stats.errors += 1;
      }
    }

    const existing = adapter.getOfferDetails && repository.findExistingBatch
      ? await repository.findExistingBatch(
        adapter.sourceCode,
        normalizedItems.map((item) => item.normalized),
      )
      : normalizedItems.map(() => null);

    const readyItems: typeof normalizedItems = [];
    for (const [index, item] of normalizedItems.entries()) {
      try {
        const shouldFetchDetails =
          options.fetchDetails !== false &&
          !existing[index] &&
          item.normalized.externalJobId !== null &&
          adapter.getOfferDetails !== undefined &&
          (adapter.needsDetails?.(item.rawOffer as TRawOffer, item.normalized) ?? false);
        if (shouldFetchDetails && adapter.getOfferDetails) {
          stats.details_requested += 1;
          timer = performance.now();
          const details = await adapter.getOfferDetails(item.normalized.externalJobId!);
          stats.fetch_ms += performance.now() - timer;
          timer = performance.now();
          item.normalized = adapter.normalize(details);
          stats.normalize_ms += performance.now() - timer;
          item.rawOffer = details;
          item.rawPayload = details;
        }
        readyItems.push(item);
      } catch {
        stats.errors += 1;
      }
    }

    timer = performance.now();
    const persisted = await repository.persistBatch(
      {
        code: adapter.sourceCode,
        name: adapter.sourceName,
        baseUrl: adapter.sourceBaseUrl,
        companyCareerSourceId: options.companyCareerSourceId,
      },
      readyItems.map((item) => ({ offer: item.normalized, rawPayload: item.rawPayload })),
      observedAt,
    );
    stats.persist_ms = performance.now() - timer;
    stats.errors += persisted.errors;
    stats.offers_normalized = persisted.results.length;
    for (const result of persisted.results) {
      if (result.outcome === "CREATED") stats.offers_created += 1;
      if (result.outcome === "UPDATED") stats.offers_updated += 1;
      if (result.outcome === "UNCHANGED") stats.offers_unchanged += 1;
      if (result.matchedExisting || !result.sourceCreated) stats.duplicates += 1;
      if (result.outcome !== "UNCHANGED") {
        stats.matching_job_offer_ids.push(result.jobOfferId);
      }
    }
    return stats;
  }

  for (const rawOffer of searchResult.offers) {
    try {
      timer = performance.now();
      let normalized = adapter.normalize(rawOffer);
      stats.normalize_ms += performance.now() - timer;
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
        timer = performance.now();
        const details = await adapter.getOfferDetails(normalized.externalJobId!);
        stats.fetch_ms += performance.now() - timer;
        timer = performance.now();
        normalized = adapter.normalize(details);
        stats.normalize_ms += performance.now() - timer;
        rawPayload = details;
      }

      timer = performance.now();
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
      stats.persist_ms += performance.now() - timer;

      stats.offers_normalized += 1;
      if (persisted.offerCreated) stats.offers_created += 1;
      else stats.offers_updated += 1;
      stats.matching_job_offer_ids.push(persisted.jobOfferId);
      if (!existing && !persisted.sourceCreated) stats.duplicates += 1;
    } catch {
      stats.errors += 1;
    }
  }

  return stats;
}
