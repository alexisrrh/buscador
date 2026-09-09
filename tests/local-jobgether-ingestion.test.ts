import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_LOCAL_JOBGETHER_INGESTION === "1";

function localSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return false;
  return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
}

describe("developer-only local Jobgether ingestion", () => {
  it.skipIf(!enabled)("ingests only Jobgether into the local neutral catalog", async () => {
    expect(localSupabaseUrl(), "RUN_LOCAL_JOBGETHER_INGESTION only permits local Supabase.").toBe(true);
    const { ingestRegisteredOpportunityCatalog } = await import("@/lib/job-sources/global-ingestion.server");
    const { loadPublicSourceRegistry } = await import("@/lib/job-sources/source-registry.server");
    const report = await ingestRegisteredOpportunityCatalog({
      loadRegistry: async () => {
        const registry = await loadPublicSourceRegistry();
        const sources = registry.sources.filter((source) => source.platform === "JOBGETHER");
        return { ...registry, sources, allSources: sources, boardsLoaded: sources.length, boardsSkippedDisabled: 0, providersLoaded: sources.length };
      },
    });
    console.info("LOCAL_JOBGETHER_INGESTION", JSON.stringify({
      source_runs: report.sourcesAttempted,
      pages: report.providerSummary.JOBGETHER?.attempted ? Math.ceil(report.offersReceived / 25) : 0,
      api_requests: report.providerSummary.JOBGETHER?.attempted ? Math.ceil(report.offersReceived / 25) : 0,
      received: report.offersReceived, normalized: report.offersCreated + report.offersUpdated + report.offersUnchanged,
      created: report.offersCreated, updated: report.offersUpdated, duplicates: report.duplicates,
      rejected: report.offersReceived - (report.offersCreated + report.offersUpdated + report.offersUnchanged), failed: report.sourcesFailed,
      fetch_ms: Math.round(report.fetchMs), normalize_ms: Math.round(report.totalMs - report.fetchMs - report.persistOffersMs), persist_ms: Math.round(report.persistOffersMs), total_ms: Math.round(report.totalMs),
    }));
    expect(report.sourcesAttempted).toBe(1);
    expect(report.sourcesSucceeded).toBe(1);
    expect(report.offersReceived).toBeGreaterThan(0);
  }, 120_000);
});
