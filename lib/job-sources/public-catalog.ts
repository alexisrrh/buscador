import type { MatchJobOffer } from "@/lib/matching/types";

export const PUBLIC_CATALOG_FRESHNESS_DAYS = 45;
export const PUBLIC_CATALOG_PAGE_SIZE = 1_000;

export type PublicCatalogOffer = MatchJobOffer & {
  companyName: string | null;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
};

export type CatalogRow = {
  id: string;
  title: string;
  description: string | null;
  location_text: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  work_mode: MatchJobOffer["workMode"];
  seniority: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  published_at: string | null;
  canonical_url: string | null;
  status: MatchJobOffer["status"];
  last_seen_at: string;
  companies: { name: string } | Array<{ name: string }> | null;
  job_offer_sources: Array<{
    source_url: string;
    job_sources: { name: string } | null;
  }>;
};

export function publicCatalogOffersFromRows(rows: CatalogRow[], seenAfter: string): PublicCatalogOffer[] {
  return rows.flatMap((row) => {
    if (row.status !== "ACTIVE" || row.last_seen_at < seenAfter) return [];
    const source = row.job_offer_sources[0];
    if (!source?.source_url) return [];
    return [{
      id: row.id,
      title: row.title,
      description: row.description,
      locationText: row.location_text,
      countryCode: row.country_code,
      region: row.region,
      city: row.city,
      workMode: row.work_mode,
      seniority: row.seniority,
      employmentType: row.employment_type,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryCurrency: row.salary_currency,
      status: row.status,
      companyName: Array.isArray(row.companies) ? row.companies[0]?.name ?? null : row.companies?.name ?? null,
      sourceName: source.job_sources?.name ?? "Fuente de empleo",
      sourceUrl: source.source_url,
      canonicalUrl: row.canonical_url,
      publishedAt: row.published_at,
    } satisfies PublicCatalogOffer];
  });
}
