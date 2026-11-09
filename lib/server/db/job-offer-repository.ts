import "server-only";
import { RpcJobOfferRepository, type JobOfferRpcClient } from "@/lib/job-sources/rpc-repository";
import type { CatalogUnitOfWork } from "./catalog-unit-of-work";

const calls = {
  find_existing_job_offer: { sql: "SELECT app.find_existing_job_offer($1,$2,$3,$4,$5) AS data", args: ["p_source_code","p_external_job_id","p_canonical_source_url","p_canonical_url","p_canonical_url_is_reliable"] },
  find_existing_job_offers_batch: { sql: "SELECT app.find_existing_job_offers_batch($1,$2) AS data", args: ["p_source_code","p_offers"] },
  ingest_job_offer: { sql: "SELECT app.ingest_job_offer($1,$2) AS data", args: ["p_offer","p_observed_at"] },
  ingest_company_career_job_offer: { sql: "SELECT app.ingest_company_career_job_offer($1,$2) AS data", args: ["p_offer","p_observed_at"] },
  ingest_company_career_job_offers_batch: { sql: "SELECT app.ingest_company_career_job_offers_batch($1,$2) AS data", args: ["p_offers","p_observed_at"] },
  record_company_career_source_check: { sql: "SELECT app.record_company_career_source_check($1,$2,$3,$4) AS data", args: ["p_company_career_source_id","p_success","p_error_code","p_checked_at"] },
} as const;

export function createPostgresJobOfferClient(work: CatalogUnitOfWork): JobOfferRpcClient {
  if (work.role !== "bv_ingest") throw new Error("INGESTION_ROLE_REQUIRED");
  return { async rpc(name, parameters) {
    if (!Object.hasOwn(calls,name)) return { data: null, error: { message: "UNSUPPORTED_CATALOG_OPERATION", code: "UNSUPPORTED_OPERATION" } };
    const call = calls[name as keyof typeof calls];
    try {
      const values = call.args.map(key => key === "p_offer" || key === "p_offers" ? JSON.stringify(parameters[key]) : parameters[key]);
      const result = await work.run(tx => tx.query<{ data: unknown }>(call.sql, values));
      return { data: result.rows[0]?.data ?? null, error: null };
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "DATABASE_ERROR";
      return { data: null, error: { message: "CATALOG_OPERATION_FAILED", code } };
    }
  } };
}

/** Reuses the existing payload, batching and response contracts, without an SDK. */
export class PostgresJobOfferRepository extends RpcJobOfferRepository {
  constructor(work: CatalogUnitOfWork, batchSize = 200) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("INVALID_BATCH_SIZE");
    super(createPostgresJobOfferClient(work), batchSize);
  }
}
