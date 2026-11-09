import "server-only";
import { canonicalizeJobUrl } from "@/lib/job-offers/canonicalization";
import type { CompanyCareerPlatform } from "@/lib/job-sources/company-careers";
import type { RegisteredCareerSource } from "@/lib/job-sources/source-registry.server";
import type { CatalogUnitOfWork } from "./catalog-unit-of-work";

export class PostgresSourceRegistry {
  private readonly work: CatalogUnitOfWork;
  constructor(work: CatalogUnitOfWork) {
    if (work.role !== "bv_ingest") throw new Error("INGESTION_ROLE_REQUIRED");
    this.work = work;
  }
  async register(input: { companyName: string; platform: CompanyCareerPlatform; identifier: string; careersUrl: string }) {
    if (!input.companyName.trim() || !input.identifier.trim()) throw new Error("INVALID_SOURCE_REGISTRATION");
    const url = canonicalizeJobUrl(input.careersUrl);
    return this.work.run(async tx => {
      const company = await tx.query<{ id: string }>(`INSERT INTO public.companies(name) VALUES($1)
        ON CONFLICT(normalized_name) DO UPDATE SET name=public.companies.name RETURNING id`,[input.companyName.trim()]);
      const result = await tx.query<{ id: string }>(`INSERT INTO public.company_career_sources(company_id,platform,identifier,careers_url)
        VALUES($1,$2,$3,$4) ON CONFLICT(company_id,platform,identifier) DO UPDATE SET careers_url=EXCLUDED.careers_url RETURNING id`,
      [company.rows[0].id,input.platform,input.identifier.trim(),url]);
      return result.rows[0].id;
    });
  }
  /** Read-only listing through ingestion credentials; never seeds boards implicitly. */
  async list(): Promise<RegisteredCareerSource[]> {
    const result = await this.work.run(tx => tx.query<RegisteredCareerSource>(`SELECT s.id,s.platform,s.identifier,s.careers_url AS "careersUrl",
      c.name AS "companyName",s.enabled,s.status,s.last_checked_at::text AS "lastCheckedAt",s.last_success_at::text AS "lastSuccessAt",
      s.last_error_code AS "lastErrorCode" FROM public.company_career_sources s JOIN public.companies c ON c.id=s.company_id ORDER BY s.created_at,s.id`));
    return result.rows;
  }
}
