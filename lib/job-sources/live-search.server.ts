import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createCompanyCareerAdapter, type CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import { ensureDevelopmentCareerSources } from "@/lib/job-sources/development-career-sources.server";
import { runPublicJobSearch } from "@/lib/job-sources/run-public-search";
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

async function loadEnabledCareerSources(client: SupabaseClient) {
  const { data, error } = await client
    .from("company_career_sources")
    .select("id,platform,identifier,careers_url")
    .eq("enabled", true)
    .in("platform", ["LEVER", "ASHBY"])
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar las fuentes de empresas.");
  return (data ?? []).map((source) => ({
    id: source.id,
    platform: source.platform,
    identifier: source.identifier,
    careersUrl: source.careers_url,
  })) as CompanyCareerSourceConfig[];
}

export async function executeLiveJobSearch(userId: string, searchProfileId: string) {
  const client = createServiceClient();
  await ensureDevelopmentCareerSources(client);
  const sources = await loadEnabledCareerSources(client);
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
  });
  return report;
}
