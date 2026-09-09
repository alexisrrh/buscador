import type { CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import { ingestCareerSourceRegistry } from "@/lib/job-sources/career-source-ingestion";
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

interface RunPublicJobSearchInput {
  userId: string;
  searchProfileId: string;
  sources: CompanyCareerSourceConfig[];
  jobOfferRepository: JobOfferRepository & CompanyCareerSourceCheckRecorder;
  matchingRepository: MatchingRepository;
  createAdapter: (source: CompanyCareerSourceConfig) => JobSourceAdapter<unknown>;
  generateMatches?: typeof generateMatchesForSearchProfile;
}

export async function runPublicJobSearch(input: RunPublicJobSearchInput) {
  const totalStartedAt = performance.now();
  const ingestion = await ingestCareerSourceRegistry({
    sources: input.sources,
    jobOfferRepository: input.jobOfferRepository,
    createAdapter: input.createAdapter,
  });

  const generate = input.generateMatches ?? generateMatchesForSearchProfile;
  const matching: GenerateMatchesReport = await generate(
    input.matchingRepository,
    input.userId,
    input.searchProfileId,
    {
      limit: 5_000,
      recentDays: 45,
      changedJobOfferIds: ingestion.changedJobOfferIds,
    },
  );
  return {
    sources_attempted: ingestion.sourcesAttempted,
    sources_succeeded: ingestion.sourcesSucceeded,
    sources_failed: ingestion.sourcesFailed,
    offers_received: ingestion.offersReceived,
    offers_created: ingestion.offersCreated,
    offers_updated: ingestion.offersUpdated,
    offers_unchanged: ingestion.offersUnchanged,
    duplicates: ingestion.duplicates,
    matches_generated: matching.matchesCreated + matching.matchesUpdated,
    matches_skipped: matching.matchesSkipped,
    high_compatibility: matching.highCompatibility,
    skipped_sources: ["INFOJOBS"],
    errors: ingestion.errors,
    provider_summary: Object.fromEntries(Object.entries(ingestion.providerSummary).map(([provider, stats]) => [
      provider,
      { ...stats, offers_received: stats.offersReceived },
    ])),
    fetch_ms: ingestion.fetchMs,
    persist_offers_ms: ingestion.persistOffersMs,
    matching_ms: matching.matchingMs,
    persist_matches_ms: matching.persistMatchesMs,
    total_ms: performance.now() - totalStartedAt,
  } satisfies PublicJobSearchReport;
}
