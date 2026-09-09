import { describe, expect, it } from "vitest";

import { searchIntent } from "@/lib/intent-first";

const enabled = process.env.RUN_LOCAL_JOBICY_CATALOG_SEARCH === "1";

function localSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return value ? ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname) : false;
}

describe("developer-only local Jobicy catalog search", () => {
  it.skipIf(!enabled)("reads the eight public searches from the persistent catalog only", async () => {
    expect(localSupabaseUrl(), "RUN_LOCAL_JOBICY_CATALOG_SEARCH only permits local Supabase.").toBe(true);
    const { searchPublicOpportunities } = await import("@/lib/job-sources/public-opportunities.server");
    const { loadPublicOpportunityCatalog } = await import("@/lib/job-sources/public-catalog.server");
    const catalog = await loadPublicOpportunityCatalog();
    const catalogWithoutJobicy = {
      offers: catalog.offers.filter((offer) => offer.sourceName !== "Jobicy"),
      catalogQueryMs: catalog.catalogQueryMs,
    };
    const searches = [
      "Frontend Developer", "Full Stack Developer", "Backend Developer", "Junior Developer",
      "DevOps", "Data Engineer", "QA", "IT Support",
    ];
    for (const role of searches) {
      const intent = searchIntent({ role, location: "Espa\u00f1a", workMode: "REMOTE" });
      const before = await searchPublicOpportunities(intent, { loadCatalog: async () => catalogWithoutJobicy });
      const result = await searchPublicOpportunities(intent, { loadCatalog: async () => catalog });
      const existingUrls = new Set(before.opportunities.map((offer) => offer.sourceUrl));
      const jobicyMatches = result.opportunities.filter((offer) => offer.sourceName === "Jobicy");
      const incrementalMatches = result.opportunities.filter((offer) => !existingUrls.has(offer.sourceUrl));
      console.info("LOCAL_JOBICY_CATALOG_SEARCH", JSON.stringify({
        role, location: "Espa\u00f1a", workMode: "REMOTE", catalog_offers_loaded: result.catalogOffersLoaded,
        existing_matches: before.opportunities.length, matches_after_jobicy: result.opportunities.length,
        jobicy_matches: jobicyMatches.length, incremental_matches: incrementalMatches.length,
        offers_final: result.opportunities.length, catalog_query_ms: result.catalogQueryMs,
        relevance_ms: result.relevanceMs, total_ms: result.durationMs,
        opportunities: result.opportunities.slice(0, 10).map((item) => ({ title: item.title, source: item.sourceName })),
      }));
      expect(result.catalogOffersLoaded).toBeGreaterThan(0);
    }
  }, 60_000);
});
