import { canonicalizeJobUrl, normalizeCompanyName, normalizeJobTitle } from "@/lib/job-offers/canonicalization";
import { PublicJobSourceError, PublicJsonClient, type PublicJsonClientConfig } from "@/lib/job-sources/public-json-client";
import type { JobSearchOptions, JobSearchQuery, JobSearchResult, JobSourceAdapter, NeutralWorkMode, NormalizedJobOffer } from "@/lib/job-sources/types";
import type { JobgetherJob, JobgetherJobsResponse } from "@/lib/job-sources/jobgether/types";

const PAGE_SIZE = 25;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isJob(value: unknown): value is JobgetherJob {
  return isRecord(value) && typeof value.id === "string" && value.id.trim() !== "" && typeof value.title === "string" && value.title.trim() !== "" && typeof value.url === "string" && value.url.trim() !== "";
}

export function parseJobgetherJobs(value: unknown): JobgetherJobsResponse {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !value.jobs.every(isJob) || !isRecord(value.pagination) || typeof value.pagination.page !== "number" || typeof value.pagination.limit !== "number" || typeof value.pagination.hasMore !== "boolean") {
    throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Jobgether jobs response.");
  }
  return value as unknown as JobgetherJobsResponse;
}

function workMode(value: string | null): NeutralWorkMode {
  const normalized = value?.toLowerCase();
  if (normalized === "full remote" || normalized === "remote") return "REMOTE";
  if (normalized === "hybrid") return "HYBRID";
  if (normalized === "onsite" || normalized === "on-site") return "ONSITE";
  return "UNKNOWN";
}
function countryCode(location: string | null) {
  if (!location) return null;
  const countries: Record<string, string> = { spain: "ES", españa: "ES", france: "FR", germany: "DE", portugal: "PT", italy: "IT" };
  return countries[location.trim().toLowerCase()] ?? null;
}
function safeDate(value: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null; }

export class JobgetherAdapter implements JobSourceAdapter<JobgetherJob> {
  readonly sourceCode = "JOBGETHER";
  readonly sourceName = "Jobgether";
  readonly sourceBaseUrl = "https://jobgether.com";
  private readonly client: PublicJsonClient;
  private readonly defaultLocations: string | null;
  constructor(config: PublicJsonClientConfig & { defaultLocations?: string | null } = {}) {
    this.defaultLocations = optionalText(config.defaultLocations);
    this.client = new PublicJsonClient({ ...config, requestIntervalMs: config.requestIntervalMs ?? 500 });
  }

  async search(query: JobSearchQuery, options: JobSearchOptions = {}): Promise<JobSearchResult<JobgetherJob>> {
    const maxPages = Math.max(1, options.maxPages ?? 3);
    const maxOffers = Math.max(1, options.maxOffers ?? 75);
    const offers: JobgetherJob[] = [];
    let page = Math.max(1, query.page ?? 1);
    let pagesRequested = 0;
    let hasMore = true;
    while (pagesRequested < maxPages && offers.length < maxOffers && hasMore) {
      const url = new URL("/api/v1/jobs", this.sourceBaseUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(Math.min(PAGE_SIZE, maxOffers - offers.length)));
      if (query.keywords?.trim()) url.searchParams.set("keyword", query.keywords.trim());
      const locations = query.city?.trim() ?? this.defaultLocations;
      if (locations) url.searchParams.set("locations", locations.toLowerCase());
      const response = parseJobgetherJobs(await this.client.get(url));
      pagesRequested += 1;
      offers.push(...response.jobs.slice(0, maxOffers - offers.length));
      hasMore = response.pagination.hasMore && response.jobs.length > 0;
      page += 1;
    }
    return { offers, stats: { pagesRequested, offersReceived: offers.length } };
  }

  normalize(raw: JobgetherJob): NormalizedJobOffer {
    if (!isJob(raw)) throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Jobgether job.");
    const title = raw.title.trim();
    const companyName = optionalText(raw.company);
    const locationText = optionalText(raw.location);
    const sourceUrl = raw.url.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    return {
      externalJobId: raw.id.trim(), title, normalizedTitle: normalizeJobTitle(title),
      company: companyName ? { name: companyName, normalizedName: normalizeCompanyName(companyName), websiteUrl: null } : null,
      description: null, locationText, countryCode: countryCode(locationText), region: null, city: null,
      workMode: workMode(optionalText(raw.remote)), seniority: optionalText(raw.experience), employmentType: optionalText(raw.contractType),
      salaryMin: null, salaryMax: null, salaryCurrency: null, publishedAt: safeDate(optionalText(raw.postedAt)),
      canonicalUrl: canonicalSourceUrl, canonicalUrlIsReliable: true, sourceUrl, canonicalSourceUrl, status: "ACTIVE",
    };
  }
}
