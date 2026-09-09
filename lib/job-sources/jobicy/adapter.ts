import { canonicalizeJobUrl, normalizeCompanyName, normalizeJobTitle } from "@/lib/job-offers/canonicalization";
import { PublicJobSourceError, PublicJsonClient, type PublicJsonClientConfig } from "@/lib/job-sources/public-json-client";
import type { JobSearchOptions, JobSearchQuery, JobSearchResult, JobSourceAdapter, NormalizedJobOffer } from "@/lib/job-sources/types";
import type { JobicyJob, JobicyJobsResponse } from "@/lib/job-sources/jobicy/types";

const MAX_OFFERS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isJob(value: unknown): value is JobicyJob {
  return isRecord(value)
    && (typeof value.id === "string" || typeof value.id === "number")
    && String(value.id).trim() !== ""
    && typeof value.jobTitle === "string" && value.jobTitle.trim() !== ""
    && typeof value.url === "string" && value.url.trim() !== "";
}

export function parseJobicyJobs(value: unknown): JobicyJobsResponse {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !value.jobs.every(isJob)) {
    throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Jobicy jobs response.");
  }
  return value as unknown as JobicyJobsResponse;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** Converts Jobicy's HTML description into inert, ATS-readable plain text. */
export function sanitizeJobicyDescription(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = decodeHtml(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function countryCode(geo: string | null) {
  if (!geo) return null;
  const countries: Record<string, string> = {
    spain: "ES", españa: "ES", france: "FR", germany: "DE", portugal: "PT", italy: "IT",
  };
  return countries[geo.trim().toLowerCase()] ?? null;
}

function safeDate(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function listText(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()).join(", ") || null
    : null;
}

export class JobicyAdapter implements JobSourceAdapter<JobicyJob> {
  readonly sourceCode = "JOBICY";
  readonly sourceName = "Jobicy";
  readonly sourceBaseUrl = "https://jobicy.com";
  private readonly client: PublicJsonClient;

  constructor(config: PublicJsonClientConfig = {}) {
    this.client = new PublicJsonClient({ ...config, requestIntervalMs: config.requestIntervalMs ?? 500 });
  }

  async search(_query: JobSearchQuery, options: JobSearchOptions = {}): Promise<JobSearchResult<JobicyJob>> {
    const maxOffers = Math.min(MAX_OFFERS, Math.max(1, options.maxOffers ?? MAX_OFFERS));
    const url = new URL("/api/v2/remote-jobs", this.sourceBaseUrl);
    url.searchParams.set("count", String(maxOffers));
    url.searchParams.set("geo", "europe");
    url.searchParams.set("industry", "engineering");
    const response = parseJobicyJobs(await this.client.get(url));
    const offers = response.jobs.slice(0, maxOffers);
    return { offers, stats: { pagesRequested: 1, offersReceived: offers.length } };
  }

  normalize(raw: JobicyJob): NormalizedJobOffer {
    if (!isJob(raw)) throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected Jobicy job.");
    const title = raw.jobTitle.trim();
    const companyName = optionalText(raw.companyName);
    const locationText = optionalText(raw.jobGeo);
    const sourceUrl = raw.url.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const salaryMin = finiteNumber(raw.salaryMin);
    const salaryMax = finiteNumber(raw.salaryMax);
    return {
      externalJobId: String(raw.id).trim(),
      title,
      normalizedTitle: normalizeJobTitle(title),
      company: companyName ? { name: companyName, normalizedName: normalizeCompanyName(companyName), websiteUrl: null } : null,
      description: sanitizeJobicyDescription(raw.jobDescription),
      locationText,
      countryCode: countryCode(locationText),
      region: null,
      city: null,
      // The documented /remote-jobs API guarantees this field at source scope; no per-offer mode is inferred.
      workMode: "REMOTE",
      seniority: optionalText(raw.jobLevel),
      employmentType: listText(raw.jobType),
      salaryMin,
      salaryMax,
      salaryCurrency: salaryMin !== null || salaryMax !== null ? optionalText(raw.salaryCurrency) : null,
      publishedAt: safeDate(optionalText(raw.pubDate)),
      canonicalUrl: canonicalSourceUrl,
      canonicalUrlIsReliable: true,
      sourceUrl,
      canonicalSourceUrl,
      status: "ACTIVE",
    };
  }
}
