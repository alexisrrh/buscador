import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  SupabaseJobOfferRepository,
  type JobOfferRpcClient,
} from "@/lib/job-sources/supabase-repository";

export function createSupabaseJobOfferRepositoryFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Server-side Supabase ingestion credentials are not configured.");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return new SupabaseJobOfferRepository(client as unknown as JobOfferRpcClient);
}
