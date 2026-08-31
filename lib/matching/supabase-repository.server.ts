import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DeterministicMatchResult } from "./types";
import type { MatchingRepository, SearchMatchingContext } from "./service";

function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service credentials are not configured on the server.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class SupabaseMatchingRepository implements MatchingRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = createServiceClient()) {
    this.client = client;
  }

  async loadSearchContext(searchProfileId: string, userId: string): Promise<SearchMatchingContext> {
    const { data: search, error: searchError } = await this.client
      .from("search_profiles")
      .select("id,user_id,candidate_profile_id,name,status,version,notification_min_score")
      .eq("id", searchProfileId)
      .eq("user_id", userId)
      .single();
    if (searchError || !search) throw new Error("Search profile not found.");
    if (search.status !== "ACTIVE") throw new Error("Search profile must be active.");

    const [{ data: candidate, error: candidateError }, { data: preferences, error: preferencesError }] =
      await Promise.all([
        this.client
          .from("candidate_profiles")
          .select("id,user_id,seniority,job_family")
          .eq("id", search.candidate_profile_id)
          .eq("user_id", userId)
          .single(),
        this.client
          .from("job_preferences")
          .select(
            "keywords,target_titles,excluded_titles,locations,work_modes,minimum_salary,currency,accepted_seniorities,minimum_experience_years,maximum_experience_years,required_technologies,excluded_technologies,contract_types",
          )
          .eq("user_id", userId)
          .eq("search_profile_id", search.id)
          .eq("search_profile_version", search.version)
          .single(),
      ]);

    if (candidateError || !candidate) throw new Error("Candidate profile not found.");
    if (preferencesError || !preferences) throw new Error("Current job preferences not found.");

    return {
      candidate: {
        id: candidate.id,
        userId,
        seniority: candidate.seniority,
        jobFamily: candidate.job_family,
      },
      search: {
        id: search.id,
        userId,
        candidateProfileId: search.candidate_profile_id,
        status: search.status,
        name: search.name,
        version: search.version,
        notificationMinScore: search.notification_min_score,
      },
      preferences: {
        keywords: preferences.keywords ?? [],
        targetTitles: preferences.target_titles ?? [],
        excludedTitles: preferences.excluded_titles ?? [],
        locations: preferences.locations ?? [],
        workModes: preferences.work_modes ?? [],
        minimumSalary: preferences.minimum_salary,
        currency: preferences.currency,
        acceptedSeniorities: preferences.accepted_seniorities ?? [],
        minimumExperienceYears: preferences.minimum_experience_years,
        maximumExperienceYears: preferences.maximum_experience_years,
        requiredTechnologies: preferences.required_technologies ?? [],
        excludedTechnologies: preferences.excluded_technologies ?? [],
        contractTypes: preferences.contract_types ?? [],
      },
    };
  }

  async loadRecentActiveOffers(options: { limit: number; seenAfter: string }) {
    const { data, error } = await this.client
      .from("job_offers")
      .select(
        "id,title,description,location_text,country_code,region,city,work_mode,seniority,employment_type,salary_min,salary_max,salary_currency,published_at,last_seen_at,status",
      )
      .eq("status", "ACTIVE")
      .gte("last_seen_at", options.seenAfter)
      .order("last_seen_at", { ascending: false })
      .limit(options.limit);
    if (error) throw new Error(`Could not load job offers: ${error.message}`);

    return (data ?? []).map((offer) => ({
      id: offer.id,
      title: offer.title,
      description: offer.description,
      locationText: offer.location_text,
      countryCode: offer.country_code,
      region: offer.region,
      city: offer.city,
      workMode: offer.work_mode,
      seniority: offer.seniority,
      employmentType: offer.employment_type,
      salaryMin: offer.salary_min,
      salaryMax: offer.salary_max,
      salaryCurrency: offer.salary_currency,
      status: offer.status,
    }));
  }

  async upsertMatch(input: {
    searchProfileId: string;
    jobOfferId: string;
    result: DeterministicMatchResult;
  }): Promise<{ created: boolean }> {
    const { data, error } = await this.client.rpc("upsert_job_match", {
      p_search_profile_id: input.searchProfileId,
      p_job_offer_id: input.jobOfferId,
      p_score: input.result.score,
      p_eligibility_status: input.result.eligibility,
      p_score_components: input.result.components,
      p_hard_gates: input.result.hardGates,
      p_reasons: input.result.reasons,
      p_scoring_version: input.result.scoringVersion,
    });
    if (error) throw new Error(`Could not persist job match: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return { created: Boolean(row?.created) };
  }
}
