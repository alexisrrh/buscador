import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeGaps, analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildResumeContent, DerivedResumeError } from "@/lib/derived-resumes/content";

const offer = (description: string) => analyzeJobOffer({ title: "Developer", description, companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });

describe("explicit non-requirements and adaptation diagnostics", () => {
  it.each([
    "No prior AI product experience required.",
    "No background in building AI products required.",
    "No experience required.",
    "Prior AI experience is not required.",
    "No previous platform experience necessary.",
  ])("excludes explicit non-requirements: %s", description => {
    const job = offer(description);
    const evidence = buildCandidateEvidence({ name: "Ana", headline: "Developer", job_family: null, seniority: null }, structureResumeText("Ana\nEXPERIENCIA\nDeveloper"), job);
    const gaps = analyzeGaps(job, evidence);
    expect(job.mandatory_requirements).toEqual([]);
    expect(gaps.unknown_requirements).toEqual([]);
    expect(gaps.requirement_resolution?.some(item => item.status === "CONFIRMABLE")).toBe(false);
  });

  it("keeps positive verified React as a fit highlight", () => {
    const job = offer("Required: React.");
    const evidence = buildCandidateEvidence({ name: "Ana", headline: "Developer", job_family: null, seniority: null }, structureResumeText("Ana\nPROYECTOS\nPortal React"), job);
    expect(analyzeGaps(job, evidence).strong_matches).toContain("React");
  });

  it("preserves a safe internal subcode while retaining the public INVALID_ADAPTATION code", () => {
    const source = structureResumeText("Ana Ejemplo\nana@example.test\nEXPERIENCIA\nDeveloper TypeScript\nEDUCACIÓN\nCentro 2024");
    const job = offer("Required: TypeScript.");
    const evidence = buildCandidateEvidence({ name: "Ana", headline: "Developer", job_family: null, seniority: null }, source, job);
    try { buildResumeContent({ professional_summary: "Developer", prioritized_skills: ["AWS"], ats_keywords: [], experience_sections: [], project_sections: [], education: [], excluded_requested_skills: [] }, evidence, source, job); }
    catch (error) {
      expect(error).toBeInstanceOf(DerivedResumeError);
      expect(error).toMatchObject({ code: "INVALID_ADAPTATION", diagnostic: "INVALID_EVIDENCE_SELECTION" });
    }
  });

  it("keeps draft, match and adapted-resume validation semantics separate", () => {
    const draftPage = readFileSync("app/(private)/applications/drafts/[id]/page.tsx", "utf8");
    const panel = readFileSync("components/derived-resume-panel.tsx", "utf8");
    expect(draftPage).toContain('"Borrador aprobado"');
    expect(draftPage).toContain("Match:");
    expect(panel).toContain("CV adaptado: error de validación");
    expect(panel).not.toContain("Candidatura aprobada");
  });
});
