import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Git may check out SQL as CRLF on Windows; assertions concern SQL content.
const migration = readFileSync("supabase/migrations/20260914000100_onboarding_preference_states.sql", "utf8").replace(/\r\n/g, "\n");

describe("onboarding preference state migration", () => {
  it("adds explicit preference states with UNKNOWN defaults and no inferred backfill", () => {
    expect(migration).toContain("create type public.onboarding_preference_state");
    expect(migration).toContain("'UNKNOWN',");
    expect(migration).toContain("'UNRESTRICTED',");
    expect(migration).toContain("'SPECIFIED'");
    expect(migration.match(/default 'UNKNOWN'/g)).toHaveLength(3);
    expect(migration).not.toMatch(/update public\.job_preferences/i);
  });

  it("keeps the existing RPC signature while accepting state keys from its preference payload", () => {
    expect(migration).toContain("public.save_search_profile(\n  p_search_profile_id uuid,\n  p_candidate_profile_id uuid,\n  p_search jsonb,\n  p_preferences jsonb\n)");
    expect(migration).toContain("location_preference_state");
    expect(migration).toContain("work_mode_preference_state");
    expect(migration).toContain("salary_preference_state");
    expect(migration).toContain("coalesce(");
  });

  it("guards future unrestricted and specified values without constraining historical UNKNOWN data", () => {
    expect(migration).toContain("location_preference_state <> 'UNRESTRICTED' or locations = '[]'::jsonb");
    expect(migration).toContain("work_mode_preference_state <> 'UNRESTRICTED' or cardinality(work_modes) = 0");
    expect(migration).toContain("salary_preference_state <> 'UNRESTRICTED' or (minimum_salary is null and currency is null)");
    expect(migration).toContain("location_preference_state <> 'SPECIFIED' or jsonb_array_length(locations) > 0");
  });
});
