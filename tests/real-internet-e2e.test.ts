import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const enabled = process.env.RUN_REAL_INTERNET_E2E === "1";

describe("real Internet to local database E2E", () => {
  it.skipIf(!enabled)("ingests Lever and Ashby, persists offers, and creates matches", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url, "NEXT_PUBLIC_SUPABASE_URL is required").toBeTruthy();
    expect(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required").toBeTruthy();
    const client = createClient(url!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `phase65-live-${Date.now()}@example.invalid`;
    const createdUser = await client.auth.admin.createUser({
      email,
      password: `Synthetic-${crypto.randomUUID()}-A1!`,
      email_confirm: true,
    });
    expect(createdUser.error).toBeNull();
    const userId = createdUser.data.user!.id;

    try {
      const candidate = await client
        .from("candidate_profiles")
        .insert({ user_id: userId, name: "Synthetic live E2E profile", seniority: "MID" })
        .select("id")
        .single();
      expect(candidate.error).toBeNull();

      const search = await client
        .from("search_profiles")
        .insert({
          user_id: userId,
          candidate_profile_id: candidate.data!.id,
          name: "Synthetic live engineering search",
          status: "ACTIVE",
          notification_min_score: 55,
          semi_auto_min_score: 80,
          auto_apply_min_score: 90,
        })
        .select("id,version")
        .single();
      expect(search.error).toBeNull();

      const preferences = await client.from("job_preferences").insert({
        user_id: userId,
        candidate_profile_id: candidate.data!.id,
        search_profile_id: search.data!.id,
        search_profile_version: search.data!.version,
        target_titles: ["Frontend Engineer", "Software Engineer", "Product Engineer", "Engineering Manager"],
        keywords: ["React", "TypeScript", "JavaScript", "Frontend"],
        locations: [],
        work_modes: [],
        required_technologies: ["React", "TypeScript"],
      });
      expect(preferences.error).toBeNull();

      const { executeLiveJobSearch } = await import("@/lib/job-sources/live-search.server");
      const report = await executeLiveJobSearch(userId, search.data!.id);
      const [{ count: matchCount }, { data: providerRows }] = await Promise.all([
        client.from("job_matches").select("id", { count: "exact", head: true }).eq("user_id", userId),
        client
          .from("job_offer_sources")
          .select("job_sources!inner(code)")
          .in("job_sources.code", ["LEVER", "ASHBY"]),
      ]);
      const providers = new Set(
        ((providerRows ?? []) as unknown as Array<{ job_sources: { code: string } }>).map(
          (row) => row.job_sources.code,
        ),
      );

      expect(report.sources_attempted).toBe(2);
      expect(report.sources_succeeded).toBe(2);
      expect(report.offers_received).toBeGreaterThan(0);
      expect(report.offers_created).toBeGreaterThan(0);
      expect(report.matches_generated).toBeGreaterThan(0);
      expect(matchCount).toBe(report.matches_generated);
      expect(providers).toEqual(new Set(["LEVER", "ASHBY"]));
      console.info("REAL_E2E_REPORT", JSON.stringify({ ...report, persisted_matches: matchCount }));
    } finally {
      await client.auth.admin.deleteUser(userId);
    }
  }, 120_000);
});
