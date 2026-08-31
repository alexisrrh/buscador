import type {
  BatchPersistJobOfferInput,
  BatchPersistJobOfferResult,
  BatchPersistedJobOffer,
  CompanyCareerSourceCheckRecorder,
  ExistingJobOffer,
  JobOfferRepository,
  NormalizedJobOffer,
  PersistedJobOffer,
} from "@/lib/job-sources/types";

const DEFAULT_BATCH_SIZE = 200;

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

export class SupabaseJobOfferRepository
  implements JobOfferRepository, CompanyCareerSourceCheckRecorder
{
  constructor(
    private readonly client: JobOfferRpcClient,
    private readonly batchSize = DEFAULT_BATCH_SIZE,
  ) {}

  private batchOfferPayload(
    source: {
      code: string;
      name: string;
      baseUrl: string;
      companyCareerSourceId?: string | null;
    },
    item: BatchPersistJobOfferInput,
    inputIndex: number,
  ) {
    const { offer, rawPayload } = item;
    return {
      batch_index: inputIndex,
      source_code: source.code,
      source_name: source.name,
      source_base_url: source.baseUrl,
      company_career_source_id: source.companyCareerSourceId ?? null,
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
    };
  }

  async findExistingBatch(sourceCode: string, offers: NormalizedJobOffer[]) {
    const results: Array<ExistingJobOffer | null> = Array.from(
      { length: offers.length },
      () => null,
    );
    for (let offset = 0; offset < offers.length; offset += this.batchSize) {
      const chunk = offers.slice(offset, offset + this.batchSize);
      const { data, error } = await this.client.rpc("find_existing_job_offers_batch", {
        p_source_code: sourceCode,
        p_offers: chunk.map((offer, index) => ({
          batch_index: offset + index,
          external_job_id: offer.externalJobId,
          canonical_source_url: offer.canonicalSourceUrl,
          canonical_url: offer.canonicalUrl,
          canonical_url_is_reliable: offer.canonicalUrlIsReliable,
        })),
      });
      if (error) throw new Error(`Job offer batch lookup failed (${error.code ?? "unknown"}).`);
      if (!Array.isArray(data)) throw new Error("Job offer batch lookup returned an invalid response.");
      for (const item of data) {
        if (!isRecord(item) || typeof item.batch_index !== "number") {
          throw new Error("Job offer batch lookup returned an invalid item.");
        }
        if (typeof item.job_offer_id !== "string") continue;
        const matchedBy = item.matched_by;
        if (matchedBy !== "external_job_id" && matchedBy !== "canonical_source_url" && matchedBy !== "canonical_url") {
          throw new Error("Job offer batch lookup returned an invalid match type.");
        }
        results[item.batch_index] = {
          jobOfferId: item.job_offer_id,
          jobOfferSourceId: nullableString(item.job_offer_source_id),
          matchedBy,
        };
      }
    }
    return results;
  }

  async persistBatch(
    source: {
      code: string;
      name: string;
      baseUrl: string;
      companyCareerSourceId?: string | null;
    },
    items: BatchPersistJobOfferInput[],
    observedAt: Date,
  ): Promise<BatchPersistJobOfferResult> {
    const results: BatchPersistedJobOffer[] = [];
    let errors = 0;
    for (let offset = 0; offset < items.length; offset += this.batchSize) {
      const chunk = items.slice(offset, offset + this.batchSize);
      const payload = chunk.map((item, index) => this.batchOfferPayload(
        source,
        item,
        offset + index,
      ));
      const { data, error } = await this.client.rpc(
        "ingest_company_career_job_offers_batch",
        { p_offers: payload, p_observed_at: observedAt.toISOString() },
      );
      if (error) {
        errors += chunk.length;
        continue;
      }
      if (!isRecord(data) || !Array.isArray(data.results)) {
        errors += chunk.length;
        continue;
      }
      for (const item of data.results) {
        if (
          !isRecord(item) ||
          typeof item.batch_index !== "number" ||
          typeof item.job_offer_id !== "string" ||
          typeof item.job_offer_source_id !== "string" ||
          (item.outcome !== "CREATED" && item.outcome !== "UPDATED" && item.outcome !== "UNCHANGED")
        ) {
          errors += 1;
          continue;
        }
        results.push({
          inputIndex: item.batch_index,
          jobOfferId: item.job_offer_id,
          jobOfferSourceId: item.job_offer_source_id,
          offerCreated: item.outcome === "CREATED",
          sourceCreated: item.source_created === true,
          outcome: item.outcome,
          matchedExisting: item.matched_existing === true,
        });
      }
    }
    return { results, errors };
  }

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
    source: {
      code: string;
      name: string;
      baseUrl: string;
      companyCareerSourceId?: string | null;
    },
    offer: NormalizedJobOffer,
    rawPayload: unknown,
    observedAt: Date,
  ) {
    const rpcName = source.companyCareerSourceId
      ? "ingest_company_career_job_offer"
      : "ingest_job_offer";
    const { data, error } = await this.client.rpc(rpcName, {
      p_offer: {
        source_code: source.code,
        source_name: source.name,
        source_base_url: source.baseUrl,
        company_career_source_id: source.companyCareerSourceId ?? null,
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

  async recordCompanyCareerSourceCheck(
    companyCareerSourceId: string,
    result: { success: boolean; errorCode: string | null; checkedAt: Date },
  ) {
    const { error } = await this.client.rpc("record_company_career_source_check", {
      p_company_career_source_id: companyCareerSourceId,
      p_success: result.success,
      p_error_code: result.errorCode,
      p_checked_at: result.checkedAt.toISOString(),
    });
    if (error) {
      throw new Error(`Career source check update failed (${error.code ?? "unknown"}).`);
    }
  }
}
