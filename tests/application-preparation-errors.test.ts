// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationPreparationError, logPreparationError, publicPreparationError } from "@/lib/applications/errors";
import { prepareApplicationDraft, resolveApplicationGenerator } from "@/lib/applications/service.server";
import { structureResumeText } from "@/lib/applications/analysis";
import { extractResume } from "@/lib/applications/resume-extractor.server";

vi.mock("@/lib/applications/resume-extractor.server", () => ({ RESUME_EXTRACTOR_VERSION: "text-v1", extractResume: vi.fn() }));
const structured = structureResumeText("EXPERIENCE\nDeveloper — Example Company — 2020–2024\nBuilt TypeScript applications.\nEDUCATION\nExample University — 2020");

function scenario(options: { missing?: string; extractionError?: boolean; writeError?: boolean; cacheError?: boolean; existing?: boolean } = {}) {
  const writes: string[] = [];
  const rows: Record<string, unknown> = {
    job_matches: { id: "match", candidate_profile_id: "profile", search_profile_id: "search", job_offer_id: "offer", score: 79, eligibility_status: "ELIGIBLE" },
    candidate_profiles: { id: "profile", name: "Synthetic", headline: "Developer", job_family: null, seniority: null },
    resumes: { id: "resume", status: "APPROVED", storage_bucket: "private-resumes", storage_path: "synthetic.pdf", mime_type: "application/pdf" },
    job_offers: { id: "offer", title: "Developer", description: "TypeScript required", companies: { name: "Synthetic Company" }, salary_min: null, salary_max: null },
    application_drafts: options.existing ? { id: "existing-draft", status: "READY_FOR_REVIEW" } : null,
    resume_extractions: null,
  };
  const from = vi.fn((table: string) => {
    let writing = false;
    const result = () => ({ data: writing ? { id: "new-draft" } : options.missing === table ? null : rows[table], error: (options.writeError && writing && table === "application_drafts") || (options.cacheError && table === "resume_extractions") ? { code: "42501", message: "sensitive database details" } : null });
    const query = {
      select: () => query, eq: () => query, in: () => query, is: () => query, neq: () => query,
      maybeSingle: async () => result(), single: async () => result(),
      insert: () => { writing = true; writes.push(table); return query; },
      update: () => { writing = true; writes.push(table); return query; },
      upsert: async () => { writes.push(table); return { error: null }; },
    };
    return query;
  });
  const download = vi.fn(async () => ({ data: new Blob(["%PDF-synthetic"]), error: null }));
  const client = { from, storage: { from: () => ({ download }) } } as unknown as SupabaseClient;
  vi.mocked(extractResume).mockImplementation(async () => {
    if (options.extractionError) throw new Error('Setting up fake worker failed: "Cannot find module pdf.worker.mjs".');
    return { text: structured.lines.join("\n"), structured };
  });
  return { input: { authClient: client, serviceClient: client, userId: "user", jobMatchId: "match" }, writes, download };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("preparation failure classification", () => {
  it("reports the PDF.js worker failure as RESUME_EXTRACTION_FAILED before any write", async () => {
    const { input, writes } = scenario({ extractionError: true });
    await expect(prepareApplicationDraft(input)).rejects.toMatchObject({ code: "RESUME_EXTRACTION_FAILED", stage: "resume-extraction", cause: expect.any(Error) });
    expect(writes).toEqual([]);
  });
  it.each([
    ["resumes", "NO_APPROVED_RESUME"], ["job_matches", "MISSING_JOB_MATCH"],
    ["job_offers", "MISSING_JOB_OFFER"], ["candidate_profiles", "MISSING_CANDIDATE_PROFILE"],
  ])("classifies missing %s", async (missing, code) => {
    const { input, writes } = scenario({ missing });
    await expect(prepareApplicationDraft(input)).rejects.toMatchObject({ code });
    expect(writes).toEqual([]);
  });
  it("classifies a draft insert error and a cache read error", async () => {
    await expect(prepareApplicationDraft(scenario({ writeError: true }).input)).rejects.toMatchObject({ code: "DRAFT_PERSISTENCE_FAILED", stage: "draft-write" });
    await expect(prepareApplicationDraft(scenario({ cacheError: true }).input)).rejects.toMatchObject({ code: "DRAFT_PERSISTENCE_FAILED", stage: "extraction-cache-read" });
  });
  it("does not need external generator keys and classifies invalid generation", async () => {
    vi.stubEnv("APPLICATION_GENERATOR_PROVIDER", "evidence-based");
    const generator = resolveApplicationGenerator();
    expect(generator.provider).toBe("evidence-based-v1");
    const original = generator.generate.bind(generator);
    vi.spyOn(generator, "generate").mockImplementation(async input => ({ ...await original(input), resume_adaptation: { ...(await original(input)).resume_adaptation, prioritized_skills: ["AWS"] } }));
    await expect(prepareApplicationDraft({ ...scenario().input, generator })).rejects.toMatchObject({ code: "INVALID_GENERATION" });
    vi.stubEnv("APPLICATION_GENERATOR_PROVIDER", "unknown-provider");
    expect(() => resolveApplicationGenerator()).toThrowError(expect.objectContaining({ code: "GENERATION_NOT_CONFIGURED" }));
  });
  it("persists a valid preparation and reuses an existing draft without extraction", async () => {
    const first = scenario();
    expect(await prepareApplicationDraft(first.input)).toEqual({ id: "new-draft", reused: false });
    expect(first.writes).toEqual(["resume_extractions", "application_drafts"]);
    const existing = scenario({ existing: true });
    expect(await prepareApplicationDraft(existing.input)).toEqual({ id: "existing-draft", reused: true });
    expect(existing.writes).toEqual([]);
    expect(existing.download).not.toHaveBeenCalled();
  });
  it("exposes distinct public codes while withholding raw causes from messages and logs", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["NO_APPROVED_RESUME", "RESUME_EXTRACTION_FAILED", "INVALID_GENERATION", "DRAFT_PERSISTENCE_FAILED", "MISSING_JOB_MATCH", "MISSING_JOB_OFFER", "GENERATION_NOT_CONFIGURED"]) {
      const error = new ApplicationPreparationError(code, "test", new Error("secret-token and private CV text"));
      expect(publicPreparationError(error)).toContain(`[${code}]`);
      expect(publicPreparationError(error)).not.toContain("secret-token");
      logPreparationError(error);
    }
    expect(JSON.stringify(logger.mock.calls)).not.toContain("secret-token");
    expect(publicPreparationError(new Error("private text"))).toContain("[PREPARATION_FAILED]");
  });
});
