import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_CATALOG_FRESHNESS_DAYS, PUBLIC_CATALOG_PAGE_SIZE, publicCatalogOffersFromRows, type CatalogRow } from "./public-catalog";
export { PUBLIC_CATALOG_FRESHNESS_DAYS, PUBLIC_CATALOG_PAGE_SIZE, publicCatalogOffersFromRows } from "./public-catalog";
export type { PublicCatalogOffer, CatalogRow } from "./public-catalog";

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
