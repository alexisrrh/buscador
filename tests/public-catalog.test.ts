import { describe, expect, it } from "vitest";

import { PUBLIC_CATALOG_FRESHNESS_DAYS, publicCatalogOffersFromRows, type CatalogRow } from "@/lib/job-sources/public-catalog.server";

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
});
