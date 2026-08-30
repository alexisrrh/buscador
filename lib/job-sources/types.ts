export interface JobSearchQuery {
  keywords?: string;
  province?: string;
  city?: string;
  publishedSince?: Date;
  page?: number;
  pageSize?: number;
}

export interface JobSearchOptions {
  maxPages?: number;
  maxOffers?: number;
}

export interface JobSearchStats {
  pagesRequested: number;
  offersReceived: number;
}

export interface JobSearchResult<TRawOffer> {
  offers: TRawOffer[];
  stats: JobSearchStats;
}

export type NeutralWorkMode = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type NeutralJobStatus = "ACTIVE" | "EXPIRED" | "REMOVED";

export interface NormalizedJobOffer {
  externalJobId: string | null;
  title: string;
  normalizedTitle: string;
  company: {
    name: string;
    normalizedName: string;
    websiteUrl: string | null;
  } | null;
  description: string | null;
  locationText: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  workMode: NeutralWorkMode;
  seniority: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  canonicalUrlIsReliable: boolean;
  sourceUrl: string;
  canonicalSourceUrl: string;
  status: NeutralJobStatus;
}

export interface JobSourceAdapter<TRawOffer, TRawDetails = TRawOffer> {
  readonly sourceCode: string;
  readonly sourceName: string;
  readonly sourceBaseUrl: string;
  search(
    query: JobSearchQuery,
    options?: JobSearchOptions,
  ): Promise<JobSearchResult<TRawOffer>>;
  getOfferDetails?(externalId: string): Promise<TRawDetails>;
  needsDetails?(rawOffer: TRawOffer, normalized: NormalizedJobOffer): boolean;
  normalize(rawOffer: TRawOffer | TRawDetails): NormalizedJobOffer;
}

export interface ExistingJobOffer {
  jobOfferId: string;
  jobOfferSourceId: string | null;
  matchedBy: "external_job_id" | "canonical_source_url" | "canonical_url";
}

export interface PersistedJobOffer {
  jobOfferId: string;
  jobOfferSourceId: string;
  offerCreated: boolean;
  sourceCreated: boolean;
}

export interface JobOfferRepository {
  findExisting(
    sourceCode: string,
    offer: NormalizedJobOffer,
  ): Promise<ExistingJobOffer | null>;
  persist(
    source: { code: string; name: string; baseUrl: string },
    offer: NormalizedJobOffer,
    rawPayload: unknown,
    observedAt: Date,
  ): Promise<PersistedJobOffer>;
}

export interface JobIngestionStats {
  source: string;
  query: JobSearchQuery;
  pages_requested: number;
  offers_received: number;
  offers_normalized: number;
  offers_created: number;
  offers_updated: number;
  duplicates: number;
  details_requested: number;
  errors: number;
}
