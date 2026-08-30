import type {
  ExistingJobOffer,
  JobOfferRepository,
  NormalizedJobOffer,
  PersistedJobOffer,
} from "@/lib/job-sources/types";

interface RpcError {
  message: string;
  code?: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface JobOfferRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export class SupabaseJobOfferRepository implements JobOfferRepository {
  constructor(private readonly client: JobOfferRpcClient) {}

  async findExisting(sourceCode: string, offer: NormalizedJobOffer) {
    const { data, error } = await this.client.rpc("find_existing_job_offer", {
      p_source_code: sourceCode,
      p_external_job_id: offer.externalJobId,
      p_canonical_source_url: offer.canonicalSourceUrl,
      p_canonical_url: offer.canonicalUrl,
      p_canonical_url_is_reliable: offer.canonicalUrlIsReliable,
    });

    if (error) throw new Error(`Job offer lookup failed (${error.code ?? "unknown"}).`);
    if (data === null) return null;
    if (!isRecord(data) || typeof data.job_offer_id !== "string") {
      throw new Error("Job offer lookup returned an invalid response.");
    }

    const matchedBy = data.matched_by;
    if (
      matchedBy !== "external_job_id" &&
      matchedBy !== "canonical_source_url" &&
      matchedBy !== "canonical_url"
    ) {
      throw new Error("Job offer lookup returned an invalid match type.");
    }

    return {
      jobOfferId: data.job_offer_id,
      jobOfferSourceId: nullableString(data.job_offer_source_id),
      matchedBy,
    } satisfies ExistingJobOffer;
  }

  async persist(
    source: { code: string; name: string; baseUrl: string },
    offer: NormalizedJobOffer,
    rawPayload: unknown,
    observedAt: Date,
  ) {
    const { data, error } = await this.client.rpc("ingest_job_offer", {
      p_offer: {
        source_code: source.code,
        source_name: source.name,
        source_base_url: source.baseUrl,
        external_job_id: offer.externalJobId,
        source_url: offer.sourceUrl,
        canonical_source_url: offer.canonicalSourceUrl,
        company_name: offer.company?.name ?? null,
        company_website_url: offer.company?.websiteUrl ?? null,
        title: offer.title,
        description: offer.description,
        location_text: offer.locationText,
        country_code: offer.countryCode,
        region: offer.region,
        city: offer.city,
        work_mode: offer.workMode,
        seniority: offer.seniority,
        employment_type: offer.employmentType,
        salary_min: offer.salaryMin,
        salary_max: offer.salaryMax,
        salary_currency: offer.salaryCurrency,
        published_at: offer.publishedAt,
        canonical_url: offer.canonicalUrl,
        canonical_url_is_reliable: offer.canonicalUrlIsReliable,
        status: offer.status,
        raw_payload: rawPayload,
      },
      p_observed_at: observedAt.toISOString(),
    });

    if (error) throw new Error(`Job offer persistence failed (${error.code ?? "unknown"}).`);
    if (
      !isRecord(data) ||
      typeof data.job_offer_id !== "string" ||
      typeof data.job_offer_source_id !== "string" ||
      typeof data.offer_created !== "boolean" ||
      typeof data.source_created !== "boolean"
    ) {
      throw new Error("Job offer persistence returned an invalid response.");
    }

    return {
      jobOfferId: data.job_offer_id,
      jobOfferSourceId: data.job_offer_source_id,
      offerCreated: data.offer_created,
      sourceCreated: data.source_created,
    } satisfies PersistedJobOffer;
  }
}
