import {
  canonicalizeJobUrl,
  normalizeJobTitle,
} from "@/lib/job-offers/canonicalization";
import {
  PublicJobSourceError,
  PublicJsonClient,
  type PublicJsonClientConfig,
} from "@/lib/job-sources/public-json-client";
import type {
  JobSearchOptions,
  JobSearchQuery,
  JobSearchResult,
  JobSourceAdapter,
  NeutralWorkMode,
  NormalizedJobOffer,
} from "@/lib/job-sources/types";
import type {
  AshbyAddress,
  AshbyJob,
  AshbyJobBoardResponse,
} from "@/lib/job-sources/ashby/types";

export interface AshbyAdapterConfig extends PublicJsonClientConfig {
  jobBoardName: string;
  includeCompensation?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAshbyJob(value: unknown): value is AshbyJob {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.jobUrl === "string" &&
    value.jobUrl.length > 0
  );
}

export function parseAshbyJobBoard(value: unknown): AshbyJobBoardResponse {
  if (
    !isRecord(value) ||
    typeof value.apiVersion !== "string" ||
    !Array.isArray(value.jobs) ||
    !value.jobs.every(isAshbyJob)
  ) {
    throw new PublicJobSourceError(
      "INVALID_RESPONSE",
      "Unexpected Ashby job board response.",
    );
  }
  return { apiVersion: value.apiVersion, jobs: value.jobs };
}

function optionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function workMode(value: string | undefined): NeutralWorkMode {
  switch (value?.toLowerCase()) {
    case "remote":
      return "REMOTE";
    case "hybrid":
      return "HYBRID";
    case "onsite":
      return "ONSITE";
    default:
      return "UNKNOWN";
  }
}

function countryCode(address: AshbyAddress | undefined) {
  const value = optionalText(address?.addressCountry);
  if (!value) return null;
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  const known: Record<string, string> = {
    USA: "US",
    "United States": "US",
    Spain: "ES",
    España: "ES",
    GBR: "GB",
    "United Kingdom": "GB",
  };
  return known[value] ?? null;
}

function safeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export class AshbyAdapter implements JobSourceAdapter<AshbyJob> {
  readonly sourceCode = "ASHBY";
  readonly sourceName = "Ashby";
  readonly sourceBaseUrl = "https://api.ashbyhq.com";
  readonly jobBoardName: string;
  private readonly includeCompensation: boolean;
  private readonly client: PublicJsonClient;

  constructor(config: AshbyAdapterConfig) {
    this.jobBoardName = config.jobBoardName.trim();
    if (!this.jobBoardName) throw new Error("Ashby job board name is required.");
    this.includeCompensation = config.includeCompensation ?? true;
    this.client = new PublicJsonClient(config);
  }

  async search(
    _query: JobSearchQuery,
    options: JobSearchOptions = {},
  ): Promise<JobSearchResult<AshbyJob>> {
    const maxOffers = Math.max(1, options.maxOffers ?? 75);
    const url = new URL(
      `/posting-api/job-board/${encodeURIComponent(this.jobBoardName)}`,
      this.sourceBaseUrl,
    );
    url.searchParams.set("includeCompensation", String(this.includeCompensation));
    const response = parseAshbyJobBoard(await this.client.get(url));
    const offers = response.jobs.slice(0, maxOffers);
    return {
      offers,
      stats: { pagesRequested: 1, offersReceived: offers.length },
    };
  }

  needsDetails() {
    return false;
  }

  normalize(raw: AshbyJob): NormalizedJobOffer {
    if (!isAshbyJob(raw)) {
      throw new PublicJobSourceError(
        "INVALID_RESPONSE",
        "Unexpected Ashby job response.",
      );
    }
    const address = raw.address?.postalAddress;
    const sourceUrl = raw.jobUrl.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const salary = raw.compensation?.summaryComponents?.find(
      (component) => component.compensationType === "Salary",
    );
    const salaryMin = typeof salary?.minValue === "number" ? salary.minValue : null;
    const salaryMax = typeof salary?.maxValue === "number" ? salary.maxValue : null;
    const currency = optionalText(salary?.currencyCode ?? undefined)?.toUpperCase() ?? null;
    const locations = [
      optionalText(raw.location),
      ...(raw.secondaryLocations ?? []).map((item) => optionalText(item.location)),
    ].filter((value): value is string => value !== null);

    return {
      externalJobId: raw.id,
      title: raw.title.trim(),
      normalizedTitle: normalizeJobTitle(raw.title),
      company: null,
      description: optionalText(raw.descriptionPlain),
      locationText: locations.length > 0 ? [...new Set(locations)].join(" | ") : null,
      countryCode: countryCode(address),
      region: optionalText(address?.addressRegion),
      city: optionalText(address?.addressLocality),
      workMode: workMode(raw.workplaceType),
      seniority: null,
      employmentType: optionalText(raw.employmentType),
      salaryMin,
      salaryMax,
      salaryCurrency:
        currency && /^[A-Z]{3}$/.test(currency) &&
        (salaryMin !== null || salaryMax !== null)
          ? currency
          : null,
      publishedAt: safeDate(raw.publishedAt),
      canonicalUrl: canonicalSourceUrl,
      canonicalUrlIsReliable: true,
      sourceUrl,
      canonicalSourceUrl,
      status: "ACTIVE",
    };
  }
}
