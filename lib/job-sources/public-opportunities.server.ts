import "server-only";

import { unstable_cache } from "next/cache";

import type { SearchIntent } from "@/lib/intent-first";
import { loadPublicOpportunityCatalog, type PublicCatalogOffer } from "@/lib/job-sources/public-catalog.server";
import { evaluatePublicSearchIntent } from "@/lib/matching/engine";

const MAX_RESULTS = 60;

export type PublicOpportunity = {
  title: string;
  description: string | null;
  locationText: string | null;
  workMode: PublicCatalogOffer["workMode"];
  publishedAt: string | null;
  sourceUrl: string;
  canonicalUrl: string | null;
  companyName: string | null;
  sourceName: string;
  intentScore: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
};

export type PublicOpportunitiesResult = {
  opportunities: PublicOpportunity[];
  catalogOffersLoaded: number;
  offersEvaluated: number;
  discardedRole: number;
  discardedSeniority: number;
  discardedLocationMode: number;
  discardedThreshold: number;
  catalogQueryMs: number;
  relevanceMs: number;
  rankingMs: number;
  durationMs: number;
};

function summary(description: string | null) {
  if (!description) return null;
  const clean = description.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 300) return clean || null;
  const boundary = clean.lastIndexOf(" ", 300);
  return `${clean.slice(0, boundary > 120 ? boundary : 300).trim()}…`;
}

export async function searchPublicOpportunities(
  intent: SearchIntent,
  dependencies: {
    loadCatalog?: () => Promise<{ offers: PublicCatalogOffer[]; catalogQueryMs: number }>;
  } = {},
): Promise<PublicOpportunitiesResult> {
  const startedAt = performance.now();
  const catalog = await (dependencies.loadCatalog ?? loadPublicOpportunityCatalog)();
  const relevanceStartedAt = performance.now();
  const opportunities: PublicOpportunity[] = [];
  let discardedRole = 0;
  let discardedSeniority = 0;
  let discardedLocationMode = 0;
  let discardedThreshold = 0;

  for (const offer of catalog.offers) {
    const evaluation = evaluatePublicSearchIntent(intent, offer);
    if (!evaluation.included) {
      if (evaluation.rejectedBy === "ROLE") discardedRole += 1;
      else if (evaluation.rejectedBy === "SENIORITY") discardedSeniority += 1;
      else if (evaluation.rejectedBy === "LOCATION_MODE") discardedLocationMode += 1;
      else discardedThreshold += 1;
      continue;
    }
    opportunities.push({
      title: offer.title,
      description: summary(offer.description),
      locationText: offer.locationText,
      workMode: offer.workMode,
      publishedAt: offer.publishedAt,
      sourceUrl: offer.sourceUrl,
      canonicalUrl: offer.canonicalUrl,
      companyName: offer.companyName,
      sourceName: offer.sourceName,
      intentScore: evaluation.score,
      salaryMin: offer.salaryMin,
      salaryMax: offer.salaryMax,
      salaryCurrency: offer.salaryCurrency,
    });
  }
  const relevanceMs = performance.now() - relevanceStartedAt;
  const rankingStartedAt = performance.now();
  const output = {
    opportunities: opportunities
      .sort((left, right) => right.intentScore - left.intentScore || Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
      .slice(0, MAX_RESULTS),
    catalogOffersLoaded: catalog.offers.length,
    offersEvaluated: catalog.offers.length,
    discardedRole,
    discardedSeniority,
    discardedLocationMode,
    discardedThreshold,
    catalogQueryMs: Math.round(catalog.catalogQueryMs),
    relevanceMs: Math.round(relevanceMs),
    rankingMs: Math.round(performance.now() - rankingStartedAt),
    durationMs: Math.round(performance.now() - startedAt),
  };
  console.info("public_opportunity_catalog_search_completed", JSON.stringify({
    catalog_offers_loaded: output.catalogOffersLoaded,
    offers_evaluated: output.offersEvaluated,
    discarded_role: output.discardedRole,
    discarded_seniority: output.discardedSeniority,
    discarded_location_mode: output.discardedLocationMode,
    discarded_threshold: output.discardedThreshold,
    offers_final: output.opportunities.length,
    catalog_query_ms: output.catalogQueryMs,
    relevance_ms: output.relevanceMs,
    ranking_ms: output.rankingMs,
    duration_ms: output.durationMs,
    titles: output.opportunities.slice(0, 10).map((opportunity) => opportunity.title),
  }));
  return output;
}

/**
 * Keeps the public landing handoff server-side. The action warms this exact
 * result and the destination route reads the same short-lived value instead
 * of performing a second catalog/matching pass during navigation.
 */
export function searchPublicOpportunitiesForIntent(intent: SearchIntent) {
  return unstable_cache(
    () => searchPublicOpportunities(intent),
    ["public-opportunities", intent.role, intent.location, intent.workMode],
    { revalidate: 30 },
  )();
}
