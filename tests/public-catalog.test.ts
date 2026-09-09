import { describe, expect, it } from "vitest";

import { searchIntent } from "@/lib/intent-first";
import { searchPublicOpportunities } from "@/lib/job-sources/public-opportunities.server";
import { PUBLIC_CATALOG_FRESHNESS_DAYS, loadPublicOpportunityCatalog, publicCatalogOffersFromRows, type CatalogRow } from "@/lib/job-sources/public-catalog.server";

const now = new Date("2026-09-09T12:00:00.000Z");
const seenAfter = new Date(now.valueOf() - PUBLIC_CATALOG_FRESHNESS_DAYS * 86_400_000).toISOString();

function row(id: string, status: CatalogRow["status"], lastSeenAt: string): CatalogRow {
  return {
    id, title: "Frontend Developer", description: "Catalog description", location_text: "A Coruña", country_code: "ES",
    region: "Galicia", city: "A Coruña", work_mode: "REMOTE", seniority: null, employment_type: null,
    salary_min: null, salary_max: null, salary_currency: null, published_at: null, canonical_url: `https://jobs.example.test/${id}`,
    status, last_seen_at: lastSeenAt, companies: { name: "Catalog Company" },
    job_offer_sources: [
      { source_url: `https://jobs.example.test/${id}`, job_sources: { name: "Ashby" } },
      { source_url: `https://mirror.example.test/${id}`, job_sources: { name: "Greenhouse" } },
    ],
  };
}

function pagedCatalogClient(rows: CatalogRow[], ranges: Array<[number, number]>) {
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { from: () => query };
}

describe("public opportunity catalog", () => {
  it("includes only fresh ACTIVE offers and emits one result for multiple source references", () => {
    const fresh = row("fresh", "ACTIVE", now.toISOString());
    const expired = row("expired", "EXPIRED", now.toISOString());
    const removed = row("removed", "REMOVED", now.toISOString());
    const stale = row("stale", "ACTIVE", "2026-07-01T00:00:00.000Z");

    const offers = publicCatalogOffersFromRows([fresh, expired, removed, stale], seenAfter);

    expect(offers).toEqual([expect.objectContaining({ id: "fresh", sourceUrl: "https://jobs.example.test/fresh" })]);
    expect(JSON.stringify(offers)).not.toMatch(/raw_payload|last_seen_at|job_source_id/i);
  });

  it("loads a relevant offer after the first 1,000-row catalog page", async () => {
    const noise = Array.from({ length: 1_000 }, (_, index) => ({
      ...row(`noise-${index}`, "ACTIVE", now.toISOString()),
      title: "Account Executive",
    }));
    const target = row("after-page-one", "ACTIVE", now.toISOString());
    const ranges: Array<[number, number]> = [];
    const catalog = await loadPublicOpportunityCatalog({
      client: pagedCatalogClient([...noise, target], ranges) as never,
      now,
    });
    const result = await searchPublicOpportunities(
      searchIntent({ role: "Frontend Developer", location: "A Coruña", workMode: "REMOTE" }),
      { loadCatalog: async () => catalog },
    );

    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(result.catalogOffersLoaded).toBe(1_001);
    expect(result.opportunities).toEqual([expect.objectContaining({ title: "Frontend Developer" })]);
  });
});
