import { describe, expect, it } from "vitest";

import { searchIntent } from "@/lib/intent-first";

const enabled = process.env.RUN_LOCAL_CATALOG_SEARCH === "1";

function localSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return false;
  const host = new URL(value).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

describe("developer-only local catalog search", () => {
  it.skipIf(!enabled)("reads public opportunities only from the local persistent catalog", async () => {
    expect(localSupabaseUrl(), "RUN_LOCAL_CATALOG_SEARCH only permits local Supabase.").toBe(true);
    const { searchPublicOpportunities } = await import("@/lib/job-sources/public-opportunities.server");
    for (const role of ["Frontend", "Mozo de almacén", "Enfermera"]) {
      const result = await searchPublicOpportunities(searchIntent({ role, location: "A Coruña", workMode: "ANY" }));
      expect(result.catalogOffersLoaded).toBeGreaterThan(0);
      console.info("LOCAL_CATALOG_SEARCH", JSON.stringify({
        role,
        catalog_offers_loaded: result.catalogOffersLoaded,
        offers_evaluated: result.offersEvaluated,
        offers_final: result.opportunities.length,
        catalog_query_ms: result.catalogQueryMs,
        relevance_ms: result.relevanceMs,
        ranking_ms: result.rankingMs,
        total_ms: result.durationMs,
        titles: result.opportunities.slice(0, 10).map((opportunity) => opportunity.title),
      }));
    }
  }, 30_000);
});
