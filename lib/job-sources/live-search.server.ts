import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createCompanyCareerAdapter } from "@/lib/job-sources/company-careers";
import { runPublicJobSearch } from "@/lib/job-sources/run-public-search";
import { assertActiveSearchProfile } from "@/lib/job-sources/search-profile-access";
import { loadPublicSourceRegistry } from "@/lib/job-sources/source-registry.server";
import { SupabaseJobOfferRepository, type JobOfferRpcClient } from "@/lib/job-sources/supabase-repository";
import { SupabaseMatchingRepository } from "@/lib/matching/supabase-repository.server";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("La búsqueda server-side no está configurada.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function executeLiveJobSearch(userId: string, searchProfileId: string) {
  const client = createServiceClient();
  await assertActiveSearchProfile(client, userId, searchProfileId);
  const registry = await loadPublicSourceRegistry({ client });
  const sources = registry.sources;
  if (sources.length === 0) {
    throw new Error("No hay fuentes de empresas configuradas todavía.");
  }

  const report = await runPublicJobSearch({
    userId,
    searchProfileId,
    sources,
    createAdapter: createCompanyCareerAdapter,
    jobOfferRepository: new SupabaseJobOfferRepository(
      client as unknown as JobOfferRpcClient,
    ),
    matchingRepository: new SupabaseMatchingRepository(client),
  });

  console.info("public_job_search_completed", {
    sources_attempted: report.sources_attempted,
    sources_succeeded: report.sources_succeeded,
    sources_failed: report.sources_failed,
    offers_received: report.offers_received,
    offers_created: report.offers_created,
    offers_updated: report.offers_updated,
    duplicates: report.duplicates,
    matches_generated: report.matches_generated,
    matches_skipped: report.matches_skipped,
    total_ms: Math.round(report.total_ms),
  });
  return report;
}
