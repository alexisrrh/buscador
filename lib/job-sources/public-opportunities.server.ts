import "server-only";

import { createCompanyCareerAdapter, type CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import { loadPublicSourceRegistry, type PublicSourceRegistry } from "@/lib/job-sources/source-registry.server";
import type { JobSourceAdapter, NormalizedJobOffer } from "@/lib/job-sources/types";
import type { SearchIntent } from "@/lib/intent-first";
import { evaluatePublicSearchIntent, expandPublicRoleTargets } from "@/lib/matching/engine";

const SOURCE_TIMEOUT_MS = 8_000;
const SOURCE_CONCURRENCY = 4;
const MAX_OFFERS_PER_SOURCE = 35;
const MAX_RESULTS = 60;

export type PublicOpportunity = Pick<
  NormalizedJobOffer,
  "title" | "description" | "locationText" | "workMode" | "publishedAt" | "sourceUrl" | "canonicalUrl"
> & { companyName: string | null; sourceName: string; intentScore: number };

export type PublicOpportunitiesResult = {
  opportunities: PublicOpportunity[];
  offersReceivedRaw: number;
  discardedRole: number;
  discardedSeniority: number;
  discardedLocationMode: number;
  discardedThreshold: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  providersLoaded: number;
  boardsLoaded: number;
  boardsSkippedDisabled: number;
  usedDevelopmentFallback: boolean;
  registryEmpty: boolean;
  durationMs: number;
};

export type PublicOpportunitySource = CompanyCareerSourceConfig & { companyName: string | null };

function summary(description: string | null) {
  if (!description) return null;
  const clean = description.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 300) return clean || null;
  const boundary = clean.lastIndexOf(" ", 300);
  return `${clean.slice(0, boundary > 120 ? boundary : 300).trim()}…`;
}

function withTimeout<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("SOURCE_TIMEOUT")), SOURCE_TIMEOUT_MS);
  });
  return Promise.race([promise, timedOut]).finally(() => clearTimeout(timeout));
}

function publicErrorCode(error: unknown) {
  if (error instanceof Error && error.message === "SOURCE_TIMEOUT") return "SOURCE_TIMEOUT";
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  return "UNEXPECTED_ERROR";
}

function registryForProvidedSources(sources: PublicOpportunitySource[]): PublicSourceRegistry {
  const registeredSources = sources.map((source) => ({
    ...source,
    enabled: true,
    status: "UNKNOWN" as const,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastErrorCode: null,
  }));
  return {
    sources: registeredSources,
    allSources: registeredSources,
    boardsLoaded: sources.length,
    boardsSkippedDisabled: 0,
    providersLoaded: new Set(sources.map((source) => source.platform)).size,
    usedDevelopmentFallback: false,
    recordCheck: async () => undefined,
  };
}

export async function searchPublicOpportunities(
  intent: SearchIntent,
  dependencies: {
    sources?: PublicOpportunitySource[];
    createAdapter?: (source: PublicOpportunitySource) => JobSourceAdapter<unknown>;
    loadRegistry?: () => Promise<PublicSourceRegistry>;
  } = {},
): Promise<PublicOpportunitiesResult> {
  const startedAt = performance.now();
  const registry = dependencies.sources
    ? registryForProvidedSources(dependencies.sources)
    : await (dependencies.loadRegistry ?? loadPublicSourceRegistry)();
  const sources = registry.sources;
  const opportunities: PublicOpportunity[] = [];
  let offersReceivedRaw = 0;
  let discardedRole = 0;
  let discardedSeniority = 0;
  let discardedLocationMode = 0;
  let discardedThreshold = 0;
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < sources.length) {
      const source = sources[nextIndex++];
      try {
        const adapter = dependencies.createAdapter?.(source) ?? createCompanyCareerAdapter(source);
        const queryRole = expandPublicRoleTargets(intent.role).find((target) => target !== intent.role) ?? intent.role;
        const result = await withTimeout(adapter.search(
          { keywords: queryRole, city: intent.location || undefined },
          { maxPages: 1, maxOffers: MAX_OFFERS_PER_SOURCE },
        ));
        offersReceivedRaw += result.offers.length;
        const normalized = result.offers.map((offer) => adapter.normalize(offer));
        for (const offer of normalized) {
          if (offer.status !== "ACTIVE") continue;
          const evaluation = evaluatePublicSearchIntent(intent, {
            id: offer.externalJobId ?? offer.canonicalSourceUrl,
            status: offer.status, title: offer.title, description: offer.description,
            locationText: offer.locationText, countryCode: offer.countryCode, region: offer.region,
            city: offer.city, workMode: offer.workMode, seniority: offer.seniority,
            employmentType: offer.employmentType, salaryMin: offer.salaryMin, salaryMax: offer.salaryMax,
            salaryCurrency: offer.salaryCurrency,
          });
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
          companyName: offer.company?.name ?? source.companyName,
          sourceName: adapter.sourceName,
          intentScore: evaluation.score,
        });
        }
        sourcesSucceeded += 1;
        try {
          await registry.recordCheck(source.id, { success: true, errorCode: null, checkedAt: new Date() });
        } catch {
          console.warn("public_opportunity_source_health_update_failed", { source_id: source.id });
        }
      } catch (error) {
        sourcesFailed += 1;
        try {
          await registry.recordCheck(source.id, {
            success: false,
            errorCode: publicErrorCode(error),
            checkedAt: new Date(),
          });
        } catch {
          console.warn("public_opportunity_source_health_update_failed", { source_id: source.id });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, sources.length) }, worker));
  const unique = new Map<string, PublicOpportunity>();
  for (const opportunity of opportunities) {
    unique.set(opportunity.canonicalUrl ?? opportunity.sourceUrl, opportunity);
  }

  const output = {
    opportunities: [...unique.values()]
      .sort((left, right) => right.intentScore - left.intentScore || Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
      .slice(0, MAX_RESULTS),
    offersReceivedRaw,
    discardedRole,
    discardedSeniority,
    discardedLocationMode,
    discardedThreshold,
    sourcesAttempted: sources.length,
    sourcesSucceeded,
    sourcesFailed,
    providersLoaded: registry.providersLoaded,
    boardsLoaded: registry.boardsLoaded,
    boardsSkippedDisabled: registry.boardsSkippedDisabled,
    usedDevelopmentFallback: registry.usedDevelopmentFallback,
    registryEmpty: sources.length === 0,
    durationMs: Math.round(performance.now() - startedAt),
  };
  console.info("public_opportunity_search_completed", JSON.stringify({
    offers_received_raw: output.offersReceivedRaw,
    discarded_role: output.discardedRole,
    discarded_seniority: output.discardedSeniority,
    discarded_location_mode: output.discardedLocationMode,
    discarded_threshold: output.discardedThreshold,
    offers_final: output.opportunities.length,
    providers_loaded: output.providersLoaded,
    boards_loaded: output.boardsLoaded,
    boards_skipped_disabled: output.boardsSkippedDisabled,
    sources_attempted: output.sourcesAttempted,
    sources_succeeded: output.sourcesSucceeded,
    sources_failed: output.sourcesFailed,
    duration_ms: output.durationMs,
    titles: output.opportunities.slice(0, 10).map((opportunity) => opportunity.title),
  }));
  return output;
}
