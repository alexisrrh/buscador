import { canonicalizeJobUrl, normalizeCompanyName, normalizeJobTitle } from "@/lib/job-offers/canonicalization";
import { PublicJobSourceError, PublicJsonClient, type PublicJsonClientConfig } from "@/lib/job-sources/public-json-client";
import type { JobSearchOptions, JobSearchQuery, JobSearchResult, JobSourceAdapter, NeutralWorkMode, NormalizedJobOffer } from "@/lib/job-sources/types";
import type { SmartRecruitersPosting, SmartRecruitersPostingsResponse } from "@/lib/job-sources/smartrecruiters/types";

export interface SmartRecruitersAdapterConfig extends PublicJsonClientConfig {
  companyIdentifier: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosting(value: unknown): value is SmartRecruitersPosting {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0;
}

export function parseSmartRecruitersPostings(value: unknown): SmartRecruitersPostingsResponse {
  if (!isRecord(value) || !Array.isArray(value.content) || !value.content.every(isPosting) ||
      typeof value.totalFound !== "number" || typeof value.offset !== "number" || typeof value.limit !== "number") {
    throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected SmartRecruiters postings response.");
  }
  return value as unknown as SmartRecruitersPostingsResponse;
}

function optionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function plainText(value: string | undefined) {
  if (!value) return null;
  return optionalText(value.replace(/&amp;/gi, "&").replace(/&#xa0;|&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function safeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function workMode(posting: SmartRecruitersPosting): NeutralWorkMode {
  if (posting.location?.remote) return "REMOTE";
  if (posting.location?.hybrid) return "HYBRID";
  return posting.location ? "ONSITE" : "UNKNOWN";
}

export class SmartRecruitersAdapter implements JobSourceAdapter<SmartRecruitersPosting> {
  readonly sourceCode = "SMARTRECRUITERS";
  readonly sourceName = "SmartRecruiters";
  readonly sourceBaseUrl = "https://api.smartrecruiters.com";
  readonly companyIdentifier: string;
  private readonly client: PublicJsonClient;

  constructor(config: SmartRecruitersAdapterConfig) {
    this.companyIdentifier = config.companyIdentifier.trim();
    if (!this.companyIdentifier) throw new Error("SmartRecruiters company identifier is required.");
    this.client = new PublicJsonClient(config);
  }

  async search(query: JobSearchQuery, options: JobSearchOptions = {}): Promise<JobSearchResult<SmartRecruitersPosting>> {
    const maxPages = Math.max(1, options.maxPages ?? 3);
    const maxOffers = Math.max(1, options.maxOffers ?? 75);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    let offset = Math.max(0, ((query.page ?? 1) - 1) * pageSize);
    let pagesRequested = 0;
    const offers: SmartRecruitersPosting[] = [];
    while (pagesRequested < maxPages && offers.length < maxOffers) {
      const url = new URL(`/v1/companies/${encodeURIComponent(this.companyIdentifier)}/postings`, this.sourceBaseUrl);
      url.searchParams.set("destination", "PUBLIC");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(offset));
      if (query.keywords?.trim()) url.searchParams.set("q", query.keywords.trim());
      if (query.city?.trim()) url.searchParams.set("city", query.city.trim());
      else if (query.province?.trim()) url.searchParams.set("region", query.province.trim());
      const page = parseSmartRecruitersPostings(await this.client.get(url));
      pagesRequested += 1;
      offers.push(...page.content.slice(0, maxOffers - offers.length));
      offset += page.content.length;
      if (page.content.length < pageSize || offset >= page.totalFound) break;
    }
    return { offers, stats: { pagesRequested, offersReceived: offers.length } };
  }

  async getOfferDetails(externalId: string) {
    const url = new URL(`/v1/companies/${encodeURIComponent(this.companyIdentifier)}/postings/${encodeURIComponent(externalId)}`, this.sourceBaseUrl);
    const value = await this.client.get(url);
    if (!isPosting(value)) throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected SmartRecruiters posting response.");
    return value;
  }

  needsDetails(raw: SmartRecruitersPosting) { return !raw.jobAd; }

  normalize(raw: SmartRecruitersPosting): NormalizedJobOffer {
    if (!isPosting(raw)) throw new PublicJobSourceError("INVALID_RESPONSE", "Unexpected SmartRecruiters posting response.");
    const fallbackUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(raw.company?.identifier ?? this.companyIdentifier)}/${encodeURIComponent(raw.id)}`;
    const sourceUrl = optionalText(raw.postingUrl) ?? optionalText(raw.applyUrl) ?? fallbackUrl;
    const canonicalSourceUrl = canonicalizeJobUrl(sourceUrl);
    const description = raw.jobAd?.sections
      ? plainText(Object.values(raw.jobAd.sections).map((section) => section.text ?? "").join(" "))
      : null;
    const companyName = optionalText(raw.company?.name);
    const country = optionalText(raw.location?.country)?.toUpperCase() ?? null;
    return {
      externalJobId: raw.id, title: raw.name.trim(), normalizedTitle: normalizeJobTitle(raw.name),
      company: companyName ? { name: companyName, normalizedName: normalizeCompanyName(companyName), websiteUrl: null } : null,
      description, locationText: optionalText(raw.location?.fullLocation) ?? optionalText([raw.location?.city, raw.location?.region, raw.location?.country].filter(Boolean).join(", ")),
      countryCode: country && /^[A-Z]{2}$/.test(country) ? country : null,
      region: optionalText(raw.location?.region), city: optionalText(raw.location?.city), workMode: workMode(raw),
      seniority: optionalText(raw.experienceLevel?.label), employmentType: optionalText(raw.typeOfEmployment?.label),
      salaryMin: null, salaryMax: null, salaryCurrency: null, publishedAt: safeDate(raw.releasedDate),
      canonicalUrl: canonicalSourceUrl, canonicalUrlIsReliable: true, sourceUrl, canonicalSourceUrl, status: "ACTIVE",
    };
  }
}
