import {
  canonicalizeJobUrl,
  normalizeCompanyName,
  normalizeJobTitle,
} from "@/lib/job-offers/canonicalization";
import type {
  JobSearchOptions,
  JobSearchQuery,
  JobSearchResult,
  JobSourceAdapter,
  NeutralJobStatus,
  NormalizedJobOffer,
} from "@/lib/job-sources/types";
import { InfoJobsError } from "@/lib/job-sources/infojobs/errors";
import type {
  InfoJobsCompany,
  InfoJobsOffer,
  InfoJobsSearchResponse,
} from "@/lib/job-sources/infojobs/types";

const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_OFFERS = 75;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;
const DEFAULT_REQUEST_INTERVAL_MS = 200;

type FetchImplementation = typeof fetch;

export interface InfoJobsAdapterConfig {
  clientId: string;
  clientSecret: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOffer(value: unknown): value is InfoJobsOffer {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.link === "string" &&
    value.link.length > 0
  );
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InfoJobsError("INVALID_RESPONSE", `Invalid InfoJobs ${field}.`);
  }
  return value;
}

export function parseInfoJobsSearchResponse(value: unknown): InfoJobsSearchResponse {
  if (!isRecord(value) || !Array.isArray(value.offers) || !value.offers.every(isOffer)) {
    throw new InfoJobsError("INVALID_RESPONSE", "Unexpected InfoJobs search response.");
  }

  return {
    offers: value.offers,
    totalResults: requiredNumber(value.totalResults, "totalResults"),
    currentResults: requiredNumber(value.currentResults, "currentResults"),
    totalPages: requiredNumber(value.totalPages, "totalPages"),
    currentPage: requiredNumber(value.currentPage, "currentPage"),
    pageSize: requiredNumber(value.pageSize, "pageSize"),
  };
}

export function parseInfoJobsOfferDetails(value: unknown): InfoJobsOffer {
  if (!isOffer(value)) {
    throw new InfoJobsError("INVALID_RESPONSE", "Unexpected InfoJobs offer response.");
  }
  return value;
}

export function buildInfoJobsSearchUrl(
  query: JobSearchQuery,
  page = query.page ?? 1,
  pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE,
) {
  const url = new URL("https://api.infojobs.net/api/1/offer");
  if (query.keywords?.trim()) url.searchParams.set("q", query.keywords.trim());
  if (query.province?.trim()) url.searchParams.set("province", query.province.trim());
  if (query.city?.trim()) url.searchParams.set("city", query.city.trim());
  if (query.publishedSince) {
    url.searchParams.set("publishedMin", query.publishedSince.toISOString());
  }
  url.searchParams.set("page", String(page));
  url.searchParams.set("maxResults", String(pageSize));
  return url;
}

function safeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function nonEmpty(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function companyFromOffer(raw: InfoJobsOffer) {
  const company: InfoJobsCompany | undefined = raw.profile ?? raw.author;
  const name = nonEmpty(company?.name);
  if (!name || company?.hidden) return null;

  const websiteUrl = nonEmpty(company?.websiteUrl) ?? nonEmpty(company?.web);
  return {
    name,
    normalizedName: normalizeCompanyName(name),
    websiteUrl,
  };
}

function countryCode(raw: InfoJobsOffer) {
  const key = nonEmpty(raw.country?.key);
  if (key && /^[a-z]{2}$/i.test(key)) return key.toUpperCase();

  const value = normalizeCompanyName(raw.country?.value ?? "");
  if (value === "españa" || value === "spain") return "ES";
  return null;
}

function offerStatus(raw: InfoJobsOffer): NeutralJobStatus {
  if (raw.deleted) return "REMOVED";
  if (raw.archived || raw.active === false) return "EXPIRED";
  return "ACTIVE";
}

function payAmount(value: InfoJobsOffer["minPay"]) {
  return typeof value?.amount === "number" && value.amount >= 0 ? value.amount : null;
}

function locationText(city: string | null, region: string | null) {
  const values = [...new Set([city, region].filter((value): value is string => Boolean(value)))];
  return values.length > 0 ? values.join(", ") : null;
}

export class InfoJobsAdapter
  implements JobSourceAdapter<InfoJobsOffer, InfoJobsOffer>
{
  readonly sourceCode = "INFOJOBS";
  readonly sourceName = "InfoJobs";
  readonly sourceBaseUrl = "https://www.infojobs.net";

  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly requestIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = 0;
  private readonly authorization: string;

  constructor(config: InfoJobsAdapterConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new InfoJobsError(
        "AUTHENTICATION_FAILED",
        "InfoJobs application credentials are not configured.",
      );
    }

    this.fetchImplementation = config.fetchImplementation ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.requestIntervalMs =
      config.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS;
    this.sleep =
      config.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = config.now ?? Date.now;
    this.authorization = `Basic ${Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64")}`;
  }

  async search(
    query: JobSearchQuery,
    options: JobSearchOptions = {},
  ): Promise<JobSearchResult<InfoJobsOffer>> {
    const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
    const maxOffers = Math.max(1, options.maxOffers ?? DEFAULT_MAX_OFFERS);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    let page = Math.max(1, query.page ?? 1);
    let pagesRequested = 0;
    const offers: InfoJobsOffer[] = [];

    while (pagesRequested < maxPages && offers.length < maxOffers) {
      const response = parseInfoJobsSearchResponse(
        await this.request(buildInfoJobsSearchUrl(query, page, pageSize)),
      );
      pagesRequested += 1;
      offers.push(...response.offers.slice(0, maxOffers - offers.length));

      if (
        response.offers.length === 0 ||
        response.currentResults === 0 ||
        page >= response.totalPages
      ) {
        break;
      }
      page += 1;
    }

    return {
      offers,
      stats: { pagesRequested, offersReceived: offers.length },
    };
  }

  async getOfferDetails(externalId: string) {
    const url = new URL(
      `/api/7/offer/${encodeURIComponent(externalId)}`,
      "https://api.infojobs.net",
    );
    return parseInfoJobsOfferDetails(await this.request(url));
  }

  needsDetails(_rawOffer: InfoJobsOffer, normalized: NormalizedJobOffer) {
    return normalized.description === null;
  }

  normalize(raw: InfoJobsOffer): NormalizedJobOffer {
    if (!isOffer(raw)) {
      throw new InfoJobsError("INVALID_RESPONSE", "Cannot normalize an invalid offer.");
    }

    const sourceUrl = raw.link.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const city = nonEmpty(raw.city);
    const region = nonEmpty(raw.province?.value);
    const salaryMin = raw.showPay === false ? null : payAmount(raw.minPay);
    const salaryMax = raw.showPay === false ? null : payAmount(raw.maxPay);

    return {
      externalJobId: raw.id,
      title: raw.title.trim(),
      normalizedTitle: normalizeJobTitle(raw.title),
      company: companyFromOffer(raw),
      description: nonEmpty(raw.description),
      locationText: locationText(city, region),
      countryCode: countryCode(raw),
      region,
      city,
      workMode: "UNKNOWN",
      seniority: nonEmpty(raw.jobLevel?.value),
      employmentType: nonEmpty(raw.contractType?.value),
      salaryMin,
      salaryMax,
      salaryCurrency: salaryMin !== null || salaryMax !== null ? "EUR" : null,
      publishedAt: safeDate(raw.published ?? raw.creationDate),
      canonicalUrl: canonicalSourceUrl,
      canonicalUrlIsReliable: true,
      sourceUrl,
      canonicalSourceUrl,
      status: offerStatus(raw),
    };
  }

  private async throttle() {
    const waitMilliseconds = this.lastRequestAt + this.requestIntervalMs - this.now();
    if (waitMilliseconds > 0) await this.sleep(waitMilliseconds);
    this.lastRequestAt = this.now();
  }

  private async request(url: URL): Promise<unknown> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.throttle();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImplementation(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: this.authorization,
          },
          signal: controller.signal,
        });

        if (response.status === 401) {
          throw new InfoJobsError(
            "AUTHENTICATION_FAILED",
            "InfoJobs rejected the application credentials.",
            401,
          );
        }

        if (response.status === 429 || response.status >= 500) {
          const code =
            response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_SERVER_ERROR";
          if (attempt < this.maxRetries) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfter) && retryAfter >= 0
              ? retryAfter * 1_000
              : this.backoffMs * 2 ** attempt;
            await this.sleep(delay);
            continue;
          }
          throw new InfoJobsError(
            code,
            response.status === 429
              ? "InfoJobs rate limit exceeded."
              : "InfoJobs service is temporarily unavailable.",
            response.status,
          );
        }

        if (!response.ok) {
          throw new InfoJobsError(
            "INVALID_RESPONSE",
            `InfoJobs request failed with status ${response.status}.`,
            response.status,
          );
        }

        try {
          return JSON.parse(await response.text()) as unknown;
        } catch {
          throw new InfoJobsError(
            "INVALID_RESPONSE",
            "InfoJobs returned invalid JSON.",
            response.status,
          );
        }
      } catch (error) {
        if (error instanceof InfoJobsError) throw error;
        if (controller.signal.aborted) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoffMs * 2 ** attempt);
            continue;
          }
          throw new InfoJobsError("REQUEST_TIMEOUT", "InfoJobs request timed out.");
        }
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        throw new InfoJobsError("NETWORK_ERROR", "InfoJobs network request failed.");
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new InfoJobsError("NETWORK_ERROR", "InfoJobs request failed.");
  }
}
