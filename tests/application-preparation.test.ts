import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyzeGaps, analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildCoverLetter, EvidenceBasedApplicationGenerator } from "@/lib/applications/generator";
import { ApplicationPreparationError, requireApprovedResume } from "@/lib/applications/service.server";
import type { CandidateApplicationGenerator } from "@/lib/applications/types";
import { UnsupportedApplicationClaimError, validateGeneratedApplication } from "@/lib/applications/validation";

const migration = readFileSync("supabase/migrations/20260902000100_phase7_application_drafts.sql", "utf8");
const jobsPage = readFileSync("app/(private)/jobs/page.tsx", "utf8");
const draftPage = readFileSync("app/(private)/applications/drafts/[id]/page.tsx", "utf8");

function scenario(description = "Required: React and Angular. Build web interfaces with TypeScript.") {
  const job = analyzeJobOffer({
    title: "Frontend Developer", description, location_text: "Spain", work_mode: "REMOTE",
    employment_type: "FULL_TIME", salary_min: null, salary_max: null, salary_currency: null,
    companies: { name: "Synthetic Company" },
  });
  const resume = structureResumeText("EXPERIENCE\nFrontend Developer — Synthetic Studio — 2022–2024\nBuilt React interfaces with TypeScript.\nEDUCATION\nSynthetic University — 2021");
  const evidence = buildCandidateEvidence({ name: "Synthetic Candidate", headline: "Frontend Developer", job_family: "FRONTEND", seniority: "MID" }, resume, job);
  return { job, evidence, gaps: analyzeGaps(job, evidence) };
}

describe("Phase 7 application preparation", () => {
  it("blocks preparation without an approved resume", () => {
    expect(() => requireApprovedResume(null)).toThrowError(ApplicationPreparationError);
  });

  it("marks Angular missing and only highlights verified React", async () => {
    const input = scenario();
    const output = await new EvidenceBasedApplicationGenerator().generate(input);
    expect(input.gaps.strong_matches).toContain("React");
    expect(input.gaps.missing_requirements).toContain("Angular");
    expect(output.resume_adaptation.prioritized_skills).toContain("React");
    expect(output.resume_adaptation.prioritized_skills).not.toContain("Angular");
    expect(output.resume_adaptation.excluded_requested_skills).toContain("Angular");
  });

  it("preserves original employer and dates instead of rewriting evidence", async () => {
    const input = scenario();
    const output = await new EvidenceBasedApplicationGenerator().generate(input);
    expect(output.resume_adaptation.experience_sections).toContain("Frontend Developer — Synthetic Studio — 2022–2024");
  });

  it("rejects unsupported skills returned by any generator provider", async () => {
    const input = scenario("Required: React.");
    const invalidGenerator: CandidateApplicationGenerator = {
      provider: "fake-llm",
      async generate() {
        return {
          resume_adaptation: {
            professional_summary: "Frontend Developer", prioritized_skills: ["Angular"],
            experience_sections: [], project_sections: [], education: [], ats_keywords: ["Angular"],
            excluded_requested_skills: [],
          },
          recruiter_message: "Tengo experiencia profesional con Angular.", cover_letter: null,
        };
      },
    };
    const output = await invalidGenerator.generate(input);
    expect(() => validateGeneratedApplication(output, input.evidence)).toThrowError(UnsupportedApplicationClaimError);
  });

  it("keeps recruiter claims evidence-based", async () => {
    const input = scenario();
    const output = validateGeneratedApplication(await new EvidenceBasedApplicationGenerator().generate(input), input.evidence);
    expect(output.recruiter_message).toContain("React");
    expect(output.recruiter_message).not.toContain("Angular");
    expect(output.recruiter_message!.trim().split(/\s+/).length).toBeGreaterThanOrEqual(80);
    expect(output.recruiter_message!.trim().split(/\s+/).length).toBeLessThanOrEqual(150);
  });

  it("creates the optional cover letter only on explicit request", () => {
    const input = scenario();
    const letter = buildCoverLetter(input);
    expect(letter.trim().split(/\s+/).length).toBeGreaterThanOrEqual(200);
    expect(letter.trim().split(/\s+/).length).toBeLessThanOrEqual(300);
    expect(letter).not.toContain("Angular");
  });

  it("exposes preparation only for useful matches and never sends an application", () => {
    expect(jobsPage).toContain("prepareApplication");
    expect(jobsPage).toContain('match.eligibility_status === "ELIGIBLE"');
    expect(draftPage).toContain("Aprobar este borrador no envía una candidatura");
    expect(migration).not.toMatch(/create table public\.applications\b/i);
  });

  it("keeps service-role credentials outside client UI", () => {
    expect(jobsPage).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(draftPage).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).toContain("application_drafts_select_own");
    expect(migration).toContain("force row level security");
  });
});
