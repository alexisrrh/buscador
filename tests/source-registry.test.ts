import { describe, expect, it, vi } from "vitest";

import { loadPublicSourceRegistry } from "@/lib/job-sources/source-registry.server";

const enabledRows = [
  {
    id: "ashby-active", platform: "ASHBY" as const, identifier: "acme", careers_url: "https://jobs.ashbyhq.com/acme",
    enabled: true, status: "ACTIVE" as const, last_checked_at: "2026-09-09T09:00:00.000Z", last_success_at: "2026-09-09T09:00:00.000Z", last_error_code: null, companies: { name: "Acme" },
  },
  {
    id: "greenhouse-degraded", platform: "GREENHOUSE" as const, identifier: "beta", careers_url: "https://job-boards.greenhouse.io/beta",
    enabled: true, status: "DEGRADED" as const, last_checked_at: "2026-09-09T09:00:00.000Z", last_success_at: null, last_error_code: "SOURCE_TIMEOUT", companies: { name: "Beta" },
  },
  {
    id: "lever-disabled", platform: "LEVER" as const, identifier: "hidden", careers_url: "https://jobs.lever.co/hidden",
    enabled: false, status: "DISABLED" as const, last_checked_at: null, last_success_at: null, last_error_code: null, companies: { name: "Hidden" },
  },
];

function client() {
  return { rpc: vi.fn().mockResolvedValue({ error: null }) };
}

describe("public source registry", () => {
  it("loads enabled boards across providers and omits disabled boards", async () => {
    const registry = await loadPublicSourceRegistry({
      client: client() as never,
      readSources: async () => enabledRows,
    });

    expect(registry.sources.map((source) => source.id)).toEqual(["ashby-active", "greenhouse-degraded"]);
    expect(registry.allSources).toHaveLength(3);
    expect(registry.sources[1]).toMatchObject({ status: "DEGRADED", lastErrorCode: "SOURCE_TIMEOUT" });
    expect(registry).toMatchObject({ boardsLoaded: 2, boardsSkippedDisabled: 1, providersLoaded: 2 });
  });

  it("uses the development seed only when a local registry is empty", async () => {
    const db = client();
    let rows: typeof enabledRows = [];
    const seed = vi.fn(async () => { rows = [enabledRows[0]]; });
    const readSources = vi.fn(async () => rows);

    const first = await loadPublicSourceRegistry({
      client: db as never,
      ensureDevelopmentSources: seed as never,
      readSources,
    });
    const second = await loadPublicSourceRegistry({
      client: db as never,
      ensureDevelopmentSources: seed as never,
      readSources,
    });

    expect(first).toMatchObject({ usedDevelopmentFallback: true, boardsLoaded: 1 });
    expect(second).toMatchObject({ usedDevelopmentFallback: false, boardsLoaded: 1 });
    expect(seed).toHaveBeenCalledTimes(1);
    expect(readSources).toHaveBeenCalledTimes(3);
  });

  it("records safe per-board health through the service-side RPC", async () => {
    const db = client();
    const registry = await loadPublicSourceRegistry({
      client: db as never,
      readSources: async () => [enabledRows[0]],
    });
    const checkedAt = new Date("2026-09-09T10:00:00.000Z");

    await registry.recordCheck("ashby-active", { success: false, errorCode: "SOURCE_TIMEOUT", checkedAt });

    expect(db.rpc).toHaveBeenCalledWith("record_company_career_source_check", {
      p_company_career_source_id: "ashby-active",
      p_success: false,
      p_error_code: "SOURCE_TIMEOUT",
      p_checked_at: checkedAt.toISOString(),
    });
  });
});
