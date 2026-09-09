import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_LOCAL_CATALOG_INGESTION === "1";

function localSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return false;
  const host = new URL(value).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

describe("developer-only local catalog ingestion", () => {
  it.skipIf(!enabled)("ingests the registered local catalog without a user or candidate", async () => {
    expect(localSupabaseUrl(), "RUN_LOCAL_CATALOG_INGESTION only permits local Supabase.").toBe(true);
    const { ingestRegisteredOpportunityCatalog } = await import("@/lib/job-sources/global-ingestion.server");
    const report = await ingestRegisteredOpportunityCatalog();

    expect(report.registry.boardsLoaded).toBeGreaterThan(0);
    expect(report.sourcesAttempted).toBe(report.registry.boardsLoaded);
  }, 120_000);
});
