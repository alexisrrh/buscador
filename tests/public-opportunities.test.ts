import { describe, expect, it, vi } from "vitest";

import { searchIntent } from "@/lib/intent-first";
import { searchPublicOpportunities } from "@/lib/job-sources/public-opportunities.server";
import type { PublicCatalogOffer } from "@/lib/job-sources/public-catalog.server";

const offer: PublicCatalogOffer = {
  id: "catalog-offer-1", title: "Frontend Developer", description: "Build user-facing experiences with TypeScript and React.",
  locationText: "A Coruña, Spain", countryCode: "ES", region: "Galicia", city: "A Coruña", workMode: "REMOTE",
  seniority: null, employmentType: null, salaryMin: null, salaryMax: null, salaryCurrency: null, status: "ACTIVE",
  companyName: "Catalog Company", sourceName: "Ashby", sourceUrl: "https://jobs.example.test/frontend",
  canonicalUrl: "https://jobs.example.test/frontend", publishedAt: "2026-09-01T00:00:00.000Z",
};

function publicOffer(title: string, locationText: string, workMode: PublicCatalogOffer["workMode"], status: PublicCatalogOffer["status"] = "ACTIVE"): PublicCatalogOffer {
  return {
    ...offer, id: title, title, locationText, city: null, region: null, countryCode: null, workMode, status,
    canonicalUrl: `https://jobs.example.test/${encodeURIComponent(title)}`,
    sourceUrl: `https://jobs.example.test/${encodeURIComponent(title)}`,
  };
}

function catalog(offers: PublicCatalogOffer[]) {
  return vi.fn(async () => ({ offers, catalogQueryMs: 3 }));
}

describe("public opportunities from the persistent catalog", () => {
  it("searches catalog offers without a user, profile, CV, match, or live adapter", async () => {
    const loadCatalog = catalog([offer]);
    const result = await searchPublicOpportunities(searchIntent({ role: "Frontend Developer", workMode: "REMOTE" }), { loadCatalog });

    expect(loadCatalog).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ catalogOffersLoaded: 1, offersEvaluated: 1, catalogQueryMs: 3 });
    expect(result.opportunities).toEqual([expect.objectContaining({ title: "Frontend Developer", companyName: "Catalog Company", salaryMin: null, salaryMax: null, salaryCurrency: null })]);
    expect(JSON.stringify(result)).not.toMatch(/compatibility|candidate_profile|search_profile|raw_payload|source_id/i);
  });

  it("returns a safe no-results state instead of inventing opportunities", async () => {
    const result = await searchPublicOpportunities(searchIntent({ role: "Enfermera", workMode: "ANY" }), { loadCatalog: catalog([offer]) });
    expect(result.catalogOffersLoaded).toBe(1);
    expect(result.opportunities).toEqual([]);
  });

  it("keeps only role, junior, France-eligible remote offers for a Spanish full-stack intent", async () => {
    const fixture = [
      publicOffer("Junior Full Stack Developer", "France Remote", "REMOTE"),
      publicOffer("Full Stack Developer", "Remote Europe", "REMOTE"),
      publicOffer("Business Development Representative", "Remote Germany", "REMOTE"),
      publicOffer("Mid Market Account Executive", "France", "ONSITE"),
      publicOffer("Director Customer Success", "Remote France", "REMOTE"),
      publicOffer("Senior Full Stack Engineer", "France", "REMOTE"),
    ];
    const result = await searchPublicOpportunities(
      searchIntent({ role: "desarrollador full stack junior", location: "Francia", workMode: "REMOTE" }),
      { loadCatalog: catalog(fixture) },
    );

    expect(result.opportunities.map((item) => item.title)).toEqual(["Junior Full Stack Developer", "Full Stack Developer"]);
    expect(result).toMatchObject({ catalogOffersLoaded: 6, discardedRole: 3, discardedSeniority: 1, discardedLocationMode: 0 });
  });
});
