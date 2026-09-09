import { ingestCompanyCareerSource, type CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import type {
  CompanyCareerSourceCheckRecorder,
  JobOfferRepository,
  JobSourceAdapter,
} from "@/lib/job-sources/types";

const SOURCE_CONCURRENCY = 4;

export interface CareerSourceIngestionReport {
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  offersReceived: number;
  offersCreated: number;
  offersUpdated: number;
  offersUnchanged: number;
  duplicates: number;
  changedJobOfferIds: string[];
  providerSummary: Record<string, {
    attempted: number;
    succeeded: number;
    failed: number;
    offersReceived: number;
  }>;
  errors: Array<{ source: string; code: string }>;
  fetchMs: number;
  persistOffersMs: number;
  totalMs: number;
}

function safeErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  return "SOURCE_ERROR";
}

export async function ingestCareerSourceRegistry(input: {
  sources: CompanyCareerSourceConfig[];
  jobOfferRepository: JobOfferRepository & CompanyCareerSourceCheckRecorder;
  createAdapter: (source: CompanyCareerSourceConfig) => JobSourceAdapter<unknown>;
}) {
  const startedAt = performance.now();
  const report: CareerSourceIngestionReport = {
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    offersReceived: 0,
    offersCreated: 0,
    offersUpdated: 0,
    offersUnchanged: 0,
    duplicates: 0,
    changedJobOfferIds: [],
    providerSummary: {},
    errors: [],
    fetchMs: 0,
    persistOffersMs: 0,
    totalMs: 0,
  };
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < input.sources.length) {
      const source = input.sources[nextIndex++];
      const provider = report.providerSummary[source.platform] ??= {
        attempted: 0, succeeded: 0, failed: 0, offersReceived: 0,
      };
      provider.attempted += 1;
      report.sourcesAttempted += 1;
      try {
        const maxOffers = source.platform === "GREENHOUSE" ? 400 : source.platform === "JOBGETHER" ? 75 : source.platform === "JOBICY" ? 200 : 100;
        const stats = await ingestCompanyCareerSource(
          source,
          input.createAdapter(source),
          input.jobOfferRepository,
          {},
          { maxPages: 3, maxOffers },
        );
        report.offersReceived += stats.offers_received;
        provider.offersReceived += stats.offers_received;
        report.offersCreated += stats.offers_created;
        report.offersUpdated += stats.offers_updated;
        report.offersUnchanged += stats.offers_unchanged;
        report.duplicates += stats.duplicates;
        report.fetchMs += stats.fetch_ms;
        report.persistOffersMs += stats.persist_ms;
        report.changedJobOfferIds.push(...stats.matching_job_offer_ids);
        if (stats.errors === 0) {
          report.sourcesSucceeded += 1;
          provider.succeeded += 1;
        } else {
          report.sourcesFailed += 1;
          provider.failed += 1;
          report.errors.push({ source: source.platform, code: "OFFER_INGESTION_ERRORS" });
        }
      } catch (error) {
        report.sourcesFailed += 1;
        provider.failed += 1;
        report.errors.push({ source: source.platform, code: safeErrorCode(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, input.sources.length) }, worker));
  report.totalMs = performance.now() - startedAt;
  report.changedJobOfferIds = [...new Set(report.changedJobOfferIds)];
  return report;
}
