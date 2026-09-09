import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CompanyCareerSourceConfig } from "@/lib/job-sources/company-careers";
import { ensureDevelopmentCareerSources } from "@/lib/job-sources/development-career-sources.server";

const SUPPORTED_PLATFORMS = ["LEVER", "ASHBY", "GREENHOUSE", "SMARTRECRUITERS"] as const;

export type RegisteredCareerSource = CompanyCareerSourceConfig & {
  companyName: string | null;
  enabled: boolean;
  status: "ACTIVE" | "DEGRADED" | "DISABLED" | "UNKNOWN";
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
};

export type PublicSourceRegistry = {
  sources: RegisteredCareerSource[];
  allSources: RegisteredCareerSource[];
  boardsLoaded: number;
  boardsSkippedDisabled: number;
  providersLoaded: number;
  usedDevelopmentFallback: boolean;
  recordCheck: (sourceId: string, result: SourceCheckResult) => Promise<void>;
};

export type SourceCheckResult = {
  success: boolean;
  errorCode: string | null;
  checkedAt: Date;
};

type RegistryRow = {
  id: string;
  platform: RegisteredCareerSource["platform"];
  identifier: string;
  careers_url: string;
  enabled: boolean;
  status: RegisteredCareerSource["status"];
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  companies: { name: string } | Array<{ name: string }> | null;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("La bÃºsqueda server-side no estÃ¡ configurada.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function companyName(companies: RegistryRow["companies"]) {
  if (Array.isArray(companies)) return companies[0]?.name ?? null;
  return companies?.name ?? null;
}

async function readCareerSources(client: SupabaseClient) {
  const { data, error } = await client
    .from("company_career_sources")
    .select("id,platform,identifier,careers_url,enabled,status,last_checked_at,last_success_at,last_error_code,companies(name)")
    .in("platform", [...SUPPORTED_PLATFORMS])
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar las fuentes de empresas.");
  return (data ?? []) as RegistryRow[];
}

function buildRegistry(
  client: SupabaseClient,
  rows: RegistryRow[],
  usedDevelopmentFallback: boolean,
): PublicSourceRegistry {
  const allSources = rows
    .map((source) => ({
      id: source.id,
      platform: source.platform,
      identifier: source.identifier,
      careersUrl: source.careers_url,
      companyName: companyName(source.companies),
      enabled: source.enabled,
      status: source.status,
      lastCheckedAt: source.last_checked_at,
      lastSuccessAt: source.last_success_at,
      lastErrorCode: source.last_error_code,
    }));
  const sources = allSources.filter((source) => source.enabled && source.status !== "DISABLED");

  return {
    sources,
    allSources,
    boardsLoaded: sources.length,
    boardsSkippedDisabled: rows.filter((source) => !source.enabled || source.status === "DISABLED").length,
    providersLoaded: new Set(sources.map((source) => source.platform)).size,
    usedDevelopmentFallback,
    async recordCheck(sourceId, result) {
      const { error } = await client.rpc("record_company_career_source_check", {
        p_company_career_source_id: sourceId,
        p_success: result.success,
        p_error_code: result.errorCode,
        p_checked_at: result.checkedAt.toISOString(),
      });
      if (error) throw new Error(`Career source check update failed (${error.code ?? "unknown"}).`);
    },
  };
}

export async function loadPublicSourceRegistry(
  dependencies: {
    client?: SupabaseClient;
    ensureDevelopmentSources?: (client: SupabaseClient) => Promise<void>;
    readSources?: (client: SupabaseClient) => Promise<RegistryRow[]>;
  } = {},
): Promise<PublicSourceRegistry> {
  const client = dependencies.client ?? createServiceClient();
  const ensureSources = dependencies.ensureDevelopmentSources ?? ensureDevelopmentCareerSources;
  const readSources = dependencies.readSources ?? readCareerSources;
  let rows = await readSources(client);
  let usedDevelopmentFallback = false;

  if (rows.length === 0 && process.env.NODE_ENV !== "production") {
    await ensureSources(client);
    rows = await readSources(client);
    usedDevelopmentFallback = rows.length > 0;
  }

  return buildRegistry(client, rows, usedDevelopmentFallback);
}
