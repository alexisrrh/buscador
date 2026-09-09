import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createCompanyCareerAdapter } from "@/lib/job-sources/company-careers";
import { ingestCareerSourceRegistry } from "@/lib/job-sources/career-source-ingestion";
import { loadPublicSourceRegistry, type PublicSourceRegistry } from "@/lib/job-sources/source-registry.server";
import { SupabaseJobOfferRepository, type JobOfferRpcClient } from "@/lib/job-sources/supabase-repository";
import type { CompanyCareerSourceCheckRecorder, JobOfferRepository, JobSourceAdapter } from "@/lib/job-sources/types";
import type { CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Server-side catalog ingestion is not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Internal-only entrypoint for a future scheduler and controlled local runs.
 * It intentionally has no route, server action, user input or candidate work.
 */
export async function ingestRegisteredOpportunityCatalog(
  dependencies: {
    client?: SupabaseClient;
    loadRegistry?: () => Promise<PublicSourceRegistry>;
    jobOfferRepository?: JobOfferRepository & CompanyCareerSourceCheckRecorder;
    createAdapter?: (source: CompanyCareerSourceConfig) => JobSourceAdapter<unknown>;
  } = {},
) {
  let client = dependencies.client;
  const registry = await (dependencies.loadRegistry ?? (() => {
    client ??= createServiceClient();
    return loadPublicSourceRegistry({ client });
  }))();
  const repository = dependencies.jobOfferRepository ?? new SupabaseJobOfferRepository(
    (client ??= createServiceClient()) as unknown as JobOfferRpcClient,
  );
  const report = await ingestCareerSourceRegistry({
    sources: registry.sources,
    jobOfferRepository: repository,
    createAdapter: dependencies.createAdapter ?? createCompanyCareerAdapter,
  });

  console.info("global_opportunity_catalog_ingestion_completed", JSON.stringify({
    providers_loaded: registry.providersLoaded,
    boards_loaded: registry.boardsLoaded,
    boards_skipped_disabled: registry.boardsSkippedDisabled,
    sources_attempted: report.sourcesAttempted,
    sources_succeeded: report.sourcesSucceeded,
    sources_failed: report.sourcesFailed,
    offers_received: report.offersReceived,
    offers_created: report.offersCreated,
    offers_updated: report.offersUpdated,
    total_ms: Math.round(report.totalMs),
  }));
  return { ...report, registry };
}
