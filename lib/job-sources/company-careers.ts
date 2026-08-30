import { AshbyAdapter } from "@/lib/job-sources/ashby/adapter";
import { ingestJobSearchResults } from "@/lib/job-sources/ingestion";
import { LeverAdapter } from "@/lib/job-sources/lever/adapter";
import type { PublicJsonClientConfig } from "@/lib/job-sources/public-json-client";
import type {
  CompanyCareerSourceCheckRecorder,
  JobOfferRepository,
  JobSearchOptions,
  JobSearchQuery,
  JobSourceAdapter,
} from "@/lib/job-sources/types";

export type CompanyCareerPlatform = "LEVER" | "ASHBY";

export interface CompanyCareerSourceConfig {
  id: string;
  platform: CompanyCareerPlatform;
  identifier: string;
  careersUrl: string;
}

export function createCompanyCareerAdapter(
  source: CompanyCareerSourceConfig,
  httpConfig: PublicJsonClientConfig = {},
): JobSourceAdapter<unknown> {
  if (source.platform === "LEVER") {
    return new LeverAdapter({
      ...httpConfig,
      site: source.identifier,
      instance: new URL(source.careersUrl).hostname.includes(".eu.lever.co")
        ? "EU"
        : "GLOBAL",
    });
  }

  return new AshbyAdapter({
    ...httpConfig,
    jobBoardName: source.identifier,
    includeCompensation: true,
  });
}

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return "UNEXPECTED_ERROR";
}

export async function ingestCompanyCareerSource<TRawOffer, TRawDetails>(
  source: CompanyCareerSourceConfig,
  adapter: JobSourceAdapter<TRawOffer, TRawDetails>,
  repository: JobOfferRepository & CompanyCareerSourceCheckRecorder,
  query: JobSearchQuery = {},
  options: JobSearchOptions & { observedAt?: Date } = {},
) {
  const checkedAt = options.observedAt ?? new Date();

  try {
    const stats = await ingestJobSearchResults(adapter, repository, query, {
      ...options,
      observedAt: checkedAt,
      companyCareerSourceId: source.id,
    });
    await repository.recordCompanyCareerSourceCheck(source.id, {
      success: stats.errors === 0,
      errorCode: stats.errors === 0 ? null : "OFFER_INGESTION_ERRORS",
      checkedAt,
    });
    return stats;
  } catch (error) {
    await repository.recordCompanyCareerSourceCheck(source.id, {
      success: false,
      errorCode: errorCode(error),
      checkedAt,
    });
    throw error;
  }
}
