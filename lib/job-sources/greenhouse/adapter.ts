import { canonicalizeJobUrl, normalizeJobTitle } from "@/lib/job-offers/canonicalization";
import { PublicJobSourceError, PublicJsonClient, type PublicJsonClientConfig } from "@/lib/job-sources/public-json-client";
import type { JobSearchOptions, JobSearchQuery, JobSearchResult, JobSourceAdapter, NeutralWorkMode, NormalizedJobOffer } from "@/lib/job-sources/types";
import type { GreenhouseJob, GreenhouseJobsResponse } from "@/lib/job-sources/greenhouse/types";

export interface GreenhouseAdapterConfig extends PublicJsonClientConfig {
  boardToken: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJob(value: unknown): value is GreenhouseJob {
  return isRecord(value) && (typeof value.id === "number" || typeof value.id === "string") &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    typeof value.absolute_url === "string" && value.absolute_url.length > 0;
}

export function parseGreenhouseJobs(value: unknown): GreenhouseJobsResponse {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !value.jobs.every(isJob)) {
    throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Greenhouse jobs response.");
  }
  return { jobs: value.jobs, meta: isRecord(value.meta) ? value.meta : undefined } as GreenhouseJobsResponse;
}

function optionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function plainText(value: string | undefined) {
  if (!value) return null;
  const decoded = value
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#x27;|&#39;/gi, "'").replace(/&#xa0;|&nbsp;/gi, " ");
  return optionalText(decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function safeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function workMode(location: string | null): NeutralWorkMode {
  const value = location?.toLowerCase() ?? "";
  if (/remote|home based|worldwide/.test(value)) return "REMOTE";
  if (/hybrid/.test(value)) return "HYBRID";
  return "UNKNOWN";
}

function countryCode(location: string | null) {
  const value = location?.toLowerCase() ?? "";
  const known: Array<[string, RegExp]> = [
    ["ES", /\bspain|españa\b/], ["PT", /\bportugal\b/], ["DE", /\bgermany\b/],
    ["FR", /\bfrance\b/], ["IE", /\bireland\b/], ["GB", /\buk|united kingdom|england\b/],
    ["US", /\busa|united states\b/], ["CA", /\bcanada\b/],
  ];
  return known.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

export class GreenhouseAdapter implements JobSourceAdapter<GreenhouseJob> {
  readonly sourceCode = "GREENHOUSE";
  readonly sourceName = "Greenhouse";
  readonly sourceBaseUrl = "https://boards-api.greenhouse.io";
  readonly boardToken: string;
  private readonly client: PublicJsonClient;

  constructor(config: GreenhouseAdapterConfig) {
    this.boardToken = config.boardToken.trim();
    if (!this.boardToken) throw new Error("Greenhouse board token is required.");
    this.client = new PublicJsonClient(config);
  }

  async search(_query: JobSearchQuery, options: JobSearchOptions = {}): Promise<JobSearchResult<GreenhouseJob>> {
    const maxOffers = Math.max(1, options.maxOffers ?? 75);
    const url = new URL(`/v1/boards/${encodeURIComponent(this.boardToken)}/jobs`, this.sourceBaseUrl);
    url.searchParams.set("content", "true");
    const response = parseGreenhouseJobs(await this.client.get(url));
    const offers = response.jobs.slice(0, maxOffers);
    return { offers, stats: { pagesRequested: 1, offersReceived: offers.length } };
  }

  needsDetails() { return false; }

  normalize(raw: GreenhouseJob): NormalizedJobOffer {
    if (!isJob(raw)) throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Greenhouse job response.");
    const sourceUrl = raw.absolute_url.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const location = optionalText(raw.location?.name);
    return {
      externalJobId: String(raw.id), title: raw.title.trim(), normalizedTitle: normalizeJobTitle(raw.title),
      company: null, description: plainText(raw.content), locationText: location,
      countryCode: countryCode(location), region: null, city: null, workMode: workMode(location),
      seniority: null, employmentType: null, salaryMin: null, salaryMax: null, salaryCurrency: null,
      publishedAt: safeDate(raw.first_published ?? raw.updated_at), canonicalUrl: canonicalSourceUrl,
      canonicalUrlIsReliable: true, sourceUrl, canonicalSourceUrl, status: "ACTIVE",
    };
  }
}
