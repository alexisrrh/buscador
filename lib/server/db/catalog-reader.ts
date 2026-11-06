import "server-only";
import { PUBLIC_CATALOG_FRESHNESS_DAYS, publicCatalogOffersFromRows, type CatalogRow } from "@/lib/job-sources/public-catalog";
import type { CatalogUnitOfWork } from "./catalog-unit-of-work";

export class PostgresCatalogReader {
  private readonly work: CatalogUnitOfWork;
  constructor(work: CatalogUnitOfWork) {
    if (work.role !== "bv_catalog") throw new Error("CATALOG_READER_ROLE_REQUIRED");
    this.work = work;
  }
  /** Bounded read; public search pagination/integration is a subsequent step. */
  async load(options: { now?: Date; limit?: number } = {}) {
    const now = options.now ?? new Date();
    const limit = options.limit ?? 200;
    if (!Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("INVALID_CATALOG_READ");
    const seenAfter = new Date(now.valueOf() - PUBLIC_CATALOG_FRESHNESS_DAYS * 86400000).toISOString();
    const result = await this.work.run(tx => tx.query<CatalogRow>(`SELECT o.id,o.title,o.description,o.location_text,o.country_code,o.region,o.city,
      o.work_mode,o.seniority,o.employment_type,o.salary_min::float8,o.salary_max::float8,o.salary_currency,
      o.published_at::text,o.canonical_url,o.status,to_char(o.last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen_at,
      jsonb_build_object('name',c.name) AS companies,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('source_url',s.source_url,'job_sources',jsonb_build_object('name',js.name)) ORDER BY s.id)
        FROM public.job_offer_sources s JOIN public.job_sources js ON js.id=s.job_source_id WHERE s.job_offer_id=o.id),'[]'::jsonb) AS job_offer_sources
      FROM public.job_offers o LEFT JOIN public.companies c ON c.id=o.company_id
      WHERE o.status='ACTIVE' AND o.last_seen_at >= $1 AND (o.expires_at IS NULL OR o.expires_at > $2)
      ORDER BY o.last_seen_at DESC,o.id LIMIT $3`, [seenAfter,now.toISOString(),limit]));
    return publicCatalogOffersFromRows(result.rows, seenAfter);
  }
}
