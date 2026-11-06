import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Server-side public catalog is not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadPublicOpportunityCatalog(
  dependencies: { client?: SupabaseClient; now?: Date } = {},
) {
  const startedAt = performance.now();
  const client = dependencies.client ?? createServiceClient();
  const now = dependencies.now ?? new Date();
  const seenAfter = new Date(now.valueOf() - PUBLIC_CATALOG_FRESHNESS_DAYS * 86_400_000).toISOString();
  const rows: CatalogRow[] = [];
  while (true) {
    const from = rows.length;
    const { data, error } = await client
      .from("job_offers")
      .select("id,title,description,location_text,country_code,region,city,work_mode,seniority,employment_type,salary_min,salary_max,salary_currency,published_at,canonical_url,status,last_seen_at,companies(name),job_offer_sources(source_url,job_sources(name))")
      .eq("status", "ACTIVE")
      .gte("last_seen_at", seenAfter)
      .order("last_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PUBLIC_CATALOG_PAGE_SIZE - 1);
    if (error) {
      console.error("[public-catalog] Supabase query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new Error("No se pudo consultar el catálogo de oportunidades.");
    }
    const page = (data ?? []) as unknown as CatalogRow[];
    rows.push(...page);
    if (page.length < PUBLIC_CATALOG_PAGE_SIZE) break;
  }

  const offers = publicCatalogOffersFromRows(rows, seenAfter);

  return { offers, catalogQueryMs: performance.now() - startedAt, seenAfter };
}
