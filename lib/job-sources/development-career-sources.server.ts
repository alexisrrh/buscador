import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DevelopmentCareerSource {
  companyName: string;
  websiteUrl: string;
  platform: "LEVER" | "ASHBY";
  identifier: string;
  careersUrl: string;
}

// Development-only bootstrap. These public boards were live-checked on 2026-08-30.
// Edit or remove entries here; no real company is written by a permanent migration.
export const DEVELOPMENT_CAREER_SOURCES: DevelopmentCareerSource[] = [
  {
    companyName: "Element",
    websiteUrl: "https://element.us",
    platform: "LEVER",
    identifier: "elementsolutions",
    careersUrl: "https://jobs.lever.co/elementsolutions",
  },
  {
    companyName: "Ashby",
    websiteUrl: "https://www.ashbyhq.com",
    platform: "ASHBY",
    identifier: "ashby",
    careersUrl: "https://jobs.ashbyhq.com/ashby",
  },
];

function normalizedCompanyName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function ensureDevelopmentCareerSources(client: SupabaseClient) {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEVELOPMENT_CAREER_SOURCES === "0") {
    return;
  }

  for (const source of DEVELOPMENT_CAREER_SOURCES) {
    const normalizedName = normalizedCompanyName(source.companyName);
    const { data: existingCompany, error: companyError } = await client
      .from("companies")
      .select("id")
      .eq("normalized_name", normalizedName)
      .maybeSingle();

    if (companyError) throw new Error("Could not inspect development career company.");
    let company = existingCompany;
    if (!company) {
      const created = await client
        .from("companies")
        .insert({
          name: source.companyName,
          website_url: source.websiteUrl,
          careers_url: source.careersUrl,
        })
        .select("id")
        .single();
      if (created.error || !created.data) {
        throw new Error("Could not register development career company.");
      }
      company = created.data;
    }

    const { error } = await client
      .from("company_career_sources")
      .upsert(
        {
          company_id: company.id,
          platform: source.platform,
          identifier: source.identifier,
          careers_url: source.careersUrl,
          enabled: true,
          status: "UNKNOWN",
        },
        { onConflict: "company_id,platform,identifier" },
      );
    if (error) throw new Error("Could not register development career source.");
  }
}
