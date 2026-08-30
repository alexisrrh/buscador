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
import type { LeverPosting } from "@/lib/job-sources/lever/types";

export type LeverInstance = "GLOBAL" | "EU";

export interface LeverAdapterConfig extends PublicJsonClientConfig {
  site: string;
  instance?: LeverInstance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeverPosting(value: unknown): value is LeverPosting {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    typeof value.hostedUrl === "string" &&
    value.hostedUrl.length > 0
  );
}

export function parseLeverPostings(value: unknown) {
  if (!Array.isArray(value) || !value.every(isLeverPosting)) {
    throw new PublicJobSourceError(
      "INVALID_RESPONSE",
      "Unexpected Lever postings response.",
    );
  }
  return value;
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
    case "on-site":
      return "ONSITE";
    default:
      return "UNKNOWN";
  }
}

export class LeverAdapter implements JobSourceAdapter<LeverPosting> {
  readonly sourceCode = "LEVER";
  readonly sourceName = "Lever";
  readonly sourceBaseUrl: string;
  readonly site: string;
  private readonly client: PublicJsonClient;

  constructor(config: LeverAdapterConfig) {
    this.site = config.site.trim();
    if (!this.site) throw new Error("Lever site is required.");
    this.sourceBaseUrl =
      config.instance === "EU"
        ? "https://api.eu.lever.co"
        : "https://api.lever.co";
    this.client = new PublicJsonClient(config);
  }

  async search(
    query: JobSearchQuery,
    options: JobSearchOptions = {},
  ): Promise<JobSearchResult<LeverPosting>> {
    const maxPages = Math.max(1, options.maxPages ?? 3);
    const maxOffers = Math.max(1, options.maxOffers ?? 75);
    const pageSize = Math.max(1, query.pageSize ?? 25);
    let page = Math.max(1, query.page ?? 1);
    let pagesRequested = 0;
    const offers: LeverPosting[] = [];

    while (pagesRequested < maxPages && offers.length < maxOffers) {
      const url = new URL(
        `/v0/postings/${encodeURIComponent(this.site)}`,
        this.sourceBaseUrl,
      );
      url.searchParams.set("mode", "json");
      url.searchParams.set("skip", String((page - 1) * pageSize));
      url.searchParams.set("limit", String(pageSize));
      const location = query.city?.trim() || query.province?.trim();
      if (location) url.searchParams.set("location", location);

      const pageOffers = parseLeverPostings(await this.client.get(url));
      pagesRequested += 1;
      offers.push(...pageOffers.slice(0, maxOffers - offers.length));
      if (pageOffers.length < pageSize) break;
      page += 1;
    }

    return {
      offers,
      stats: { pagesRequested, offersReceived: offers.length },
    };
  }

  async getOfferDetails(externalId: string) {
    const url = new URL(
      `/v0/postings/${encodeURIComponent(this.site)}/${encodeURIComponent(externalId)}`,
      this.sourceBaseUrl,
    );
    return this.parsePosting(await this.client.get(url));
  }

  needsDetails() {
    return false;
  }

  normalize(raw: LeverPosting): NormalizedJobOffer {
    const posting = this.parsePosting(raw);
    const sourceUrl = posting.hostedUrl.trim();
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const salaryMin =
      typeof posting.salaryRange?.min === "number" ? posting.salaryRange.min : null;
    const salaryMax =
      typeof posting.salaryRange?.max === "number" ? posting.salaryRange.max : null;
    const currency = optionalText(posting.salaryRange?.currency)?.toUpperCase() ?? null;

    return {
      externalJobId: posting.id,
      title: posting.text.trim(),
      normalizedTitle: normalizeJobTitle(posting.text),
      company: null,
      description:
        optionalText(posting.descriptionPlain) ?? optionalText(posting.openingPlain),
      locationText: optionalText(posting.categories?.location),
      countryCode:
        posting.country && /^[a-z]{2}$/i.test(posting.country)
          ? posting.country.toUpperCase()
          : null,
      region: null,
      city: null,
      workMode: workMode(posting.workplaceType),
      seniority: null,
      employmentType: optionalText(posting.categories?.commitment),
      salaryMin,
      salaryMax,
      salaryCurrency:
        currency && /^[A-Z]{3}$/.test(currency) &&
        (salaryMin !== null || salaryMax !== null)
          ? currency
          : null,
      publishedAt: null,
      canonicalUrl: canonicalSourceUrl,
      canonicalUrlIsReliable: true,
      sourceUrl,
      canonicalSourceUrl,
      status: "ACTIVE",
    };
  }

  private parsePosting(value: unknown) {
    if (!isLeverPosting(value)) {
      throw new PublicJobSourceError(
        "INVALID_RESPONSE",
        "Unexpected Lever posting response.",
      );
    }
    return value;
  }
}
