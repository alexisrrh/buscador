import { describe, expect, it } from "vitest";

import { searchIntent } from "@/lib/intent-first";

const enabled = process.env.RUN_LOCAL_JOBGETHER_CATALOG_SEARCH === "1";

function localSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return false;
  return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
}

describe("developer-only local Jobgether catalog search", () => {
  it.skipIf(!enabled)("searches the persistent catalog without calling Jobgether", async () => {
    expect(localSupabaseUrl(), "RUN_LOCAL_JOBGETHER_CATALOG_SEARCH only permits local Supabase.").toBe(true);
    const { searchPublicOpportunities } = await import("@/lib/job-sources/public-opportunities.server");
    const searches = [
      ["Frontend Developer", "A Coruña", "ANY"], ["Full Stack Developer", "España", "REMOTE"],
      ["Backend Developer", "España", "REMOTE"], ["IT Support", "España", "ANY"],
    ] as const;
    for (const [role, location, workMode] of searches) {
      const result = await searchPublicOpportunities(searchIntent({ role, location, workMode }));
      console.info("LOCAL_JOBGETHER_CATALOG_SEARCH", JSON.stringify({ role, location, workMode, catalog_offers_loaded: result.catalogOffersLoaded, offers_final: result.opportunities.length, catalog_query_ms: Math.round(result.catalogQueryMs), relevance_ms: Math.round(result.relevanceMs), total_ms: Math.round(result.durationMs), opportunities: result.opportunities.slice(0, 10).map((item) => ({ title: item.title, source: item.sourceName })) }));
      expect(result.catalogOffersLoaded).toBeGreaterThan(0);
    }
  }, 30_000);
});
