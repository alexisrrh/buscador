import { ingestCompanyCareerSource, type CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import type {
  CompanyCareerSourceCheckRecorder,
  JobOfferRepository,
  JobSourceAdapter,
} from "@/lib/job-sources/types";
import {
  generateMatchesForSearchProfile,
  type GenerateMatchesReport,
  type MatchingRepository,
} from "@/lib/matching/service";

export interface PublicJobSearchReport {
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  offers_received: number;
  offers_created: number;
  offers_updated: number;
  offers_unchanged: number;
  duplicates: number;
  matches_generated: number;
  matches_skipped: number;
  high_compatibility: number;
  skipped_sources: string[];
  errors: Array<{ source: string; code: string }>;
  provider_summary: Record<string, {
    attempted: number;
    succeeded: number;
    failed: number;
    offers_received: number;
  }>;
  fetch_ms: number;
  persist_offers_ms: number;
  matching_ms: number;
  persist_matches_ms: number;
  total_ms: number;
}

const SOURCE_CONCURRENCY = 4;

async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
}

interface RunPublicJobSearchInput {
  userId: string;
  searchProfileId: string;
  sources: CompanyCareerSourceConfig[];
  jobOfferRepository: JobOfferRepository & CompanyCareerSourceCheckRecorder;
  matchingRepository: MatchingRepository;
  createAdapter: (source: CompanyCareerSourceConfig) => JobSourceAdapter<unknown>;
  generateMatches?: typeof generateMatchesForSearchProfile;
}

function safeErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return "SOURCE_ERROR";
}

export async function runPublicJobSearch(input: RunPublicJobSearchInput) {
  const totalStartedAt = performance.now();
  const changedJobOfferIds: string[] = [];
  const report: PublicJobSearchReport = {
    sources_attempted: 0,
    sources_succeeded: 0,
    sources_failed: 0,
    offers_received: 0,
    offers_created: 0,
    offers_updated: 0,
    offers_unchanged: 0,
    duplicates: 0,
    matches_generated: 0,
    matches_skipped: 0,
    high_compatibility: 0,
    skipped_sources: ["INFOJOBS"],
    errors: [],
    provider_summary: {},
    fetch_ms: 0,
    persist_offers_ms: 0,
    matching_ms: 0,
    persist_matches_ms: 0,
    total_ms: 0,
  };

  await withConcurrency(input.sources, SOURCE_CONCURRENCY, async (source) => {
    const provider = report.provider_summary[source.platform] ??= {
      attempted: 0, succeeded: 0, failed: 0, offers_received: 0,
    };
    provider.attempted += 1;
    report.sources_attempted += 1;
    try {
      // Greenhouse returns a complete board in one response. Some established
      // boards exceed 300 postings, so a portal-sized cap would discard jobs
      // near the end of the documented response before matching can inspect them.
      const maxOffers = source.platform === "GREENHOUSE" ? 400 : 100;
      const stats = await ingestCompanyCareerSource(
        source,
        input.createAdapter(source),
        input.jobOfferRepository,
        {},
        { maxPages: 3, maxOffers },
      );
      report.offers_received += stats.offers_received;
      provider.offers_received += stats.offers_received;
      report.offers_created += stats.offers_created;
      report.offers_updated += stats.offers_updated;
      report.offers_unchanged += stats.offers_unchanged;
      report.duplicates += stats.duplicates;
      report.fetch_ms += stats.fetch_ms;
      report.persist_offers_ms += stats.persist_ms;
      changedJobOfferIds.push(...stats.matching_job_offer_ids);
      if (stats.errors === 0) {
        report.sources_succeeded += 1;
        provider.succeeded += 1;
      } else {
        report.sources_failed += 1;
        provider.failed += 1;
        report.errors.push({ source: source.platform, code: "OFFER_INGESTION_ERRORS" });
      }
    } catch (error) {
      report.sources_failed += 1;
      provider.failed += 1;
      report.errors.push({ source: source.platform, code: safeErrorCode(error) });
    }
  });

  const generate = input.generateMatches ?? generateMatchesForSearchProfile;
  const matching: GenerateMatchesReport = await generate(
    input.matchingRepository,
    input.userId,
    input.searchProfileId,
    {
      limit: 5_000,
      recentDays: 45,
      changedJobOfferIds: [...new Set(changedJobOfferIds)],
    },
  );
  report.matches_generated = matching.matchesCreated + matching.matchesUpdated;
  report.matches_skipped = matching.matchesSkipped;
  report.high_compatibility = matching.highCompatibility;
  report.matching_ms = matching.matchingMs;
  report.persist_matches_ms = matching.persistMatchesMs;
  report.total_ms = performance.now() - totalStartedAt;

  return report;
}
