import { describe, expect, it } from "vitest";
import { analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildPrioritizedAdaptation } from "@/lib/applications/evidence-priority";
import { evaluateApplicationReadiness, resolveRequirementEvidence } from "@/lib/applications/requirement-resolution";
import { buildResumeContent } from "@/lib/derived-resumes/content";

const profile = { name: "Synthetic Candidate", headline: "Web Developer", job_family: null, seniority: null };
const source = structureResumeText(`Synthetic Candidate
RESUMEN
Web Developer con React y Git.
PROYECTOS
Portal API
REST · Supabase
Implementé una integración REST con Supabase.
EXPERIENCIA
Empresa — Web Developer — 2024
React y Git.
EDUCACIÓN
Centro — Programa — 2024`);

describe("offer requirement evidence resolution", () => {
  it("finds verified skills in approved project evidence even when absent from the summary", () => {
    const job = analyzeJobOffer({ title: "Web Developer", description: "Required skills and experience\nReact, REST, Supabase and Git", companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const evidence = buildCandidateEvidence(profile, source, job);
    const resolution = resolveRequirementEvidence(job, evidence);
    for (const skill of ["React", "REST", "Supabase", "Git"]) expect(resolution.find(item => item.requirement === skill)).toMatchObject({ status: "VERIFIED" });
    expect(resolution.find(item => item.requirement === "Supabase")?.evidence_sources).toContain("VERIFIED_PROJECT");
    expect(buildPrioritizedAdaptation(evidence).prioritized_skills).toEqual(expect.arrayContaining(["REST", "Supabase"]));
  });

  it("keeps a confirmable skill out of ResumeContent until explicit contextual evidence exists", () => {
    const job = analyzeJobOffer({ title: "Web Developer", description: "Nice to have Docker", companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const evidence = buildCandidateEvidence(profile, source, job);
    const resolution = resolveRequirementEvidence(job, evidence);
    expect(resolution.find(item => item.requirement === "Docker")).toMatchObject({ status: "CONFIRMABLE", confirmation_prompt: { context_required: ["context", "scope", "confirmed_at"] } });
    const adaptation = buildPrioritizedAdaptation(evidence);
    expect(adaptation.prioritized_skills).not.toContain("Docker");
    expect(JSON.stringify(buildResumeContent(adaptation, evidence, source, job))).not.toContain("Docker");
    expect(evaluateApplicationReadiness({ requirements: resolution, derivedResumeValid: true, identityValid: true, requiredQuestionsComplete: true }).status).toBe("REVIEW_REQUIRED");
  });

  it("resolves a requirement after reusable USER_CONFIRMED evidence is merged", () => {
    const job = analyzeJobOffer({ title: "Web Developer", description: "Required skills and experience\nTypeScript", companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const before = buildCandidateEvidence(profile, source, job);
    expect(resolveRequirementEvidence(job, before).find(item => item.requirement === "TypeScript")?.status).toBe("CONFIRMABLE");
    const after = buildCandidateEvidence(profile, source, job, undefined, { items: [{ id: "confirmed-a", profile_id: "project-a", subject_type: "PROJECT", display_name: "Portal", category: "TECHNOLOGY", exact_claim: "Built TypeScript interfaces for Portal.", source_type: "USER_CONFIRMED", source_reference: "Portal UI", verification_status: "VERIFIED", confirmed_at: "2026-09-09T10:00:00.000Z", relevance_tags: ["TypeScript"] }] });
    expect(resolveRequirementEvidence(job, after).find(item => item.requirement === "TypeScript")).toMatchObject({ status: "VERIFIED", evidence_sources: ["USER_CONFIRMED"] });
    expect(evaluateApplicationReadiness({ requirements: resolveRequirementEvidence(job, after), derivedResumeValid: true, identityValid: true, requiredQuestionsComplete: true }).status).toBe("READY");
  });

  it("treats documented mandatory experience without evidence as a critical missing gap", () => {
    const job = analyzeJobOffer({ title: "Web Developer", description: "Required skills and experience\n3 years of Angular experience", companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const evidence = buildCandidateEvidence(profile, source, job);
    const resolution = resolveRequirementEvidence(job, evidence);
    expect(resolution.find(item => item.requirement === "Angular")).toMatchObject({ status: "MISSING", severity: "CRITICAL" });
    expect(evaluateApplicationReadiness({ requirements: resolution, derivedResumeValid: true, identityValid: true, requiredQuestionsComplete: true }).status).toBe("BLOCKED");
  });

  it("keeps unknown mandatory requirements out of the derived resume", () => {
    const job = analyzeJobOffer({ title: "Web Developer", description: "Required qualifications\nValid professional license", companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const evidence = buildCandidateEvidence(profile, source, job);
    const resolution = resolveRequirementEvidence(job, evidence);
    expect(resolution).toEqual(expect.arrayContaining([expect.objectContaining({ requirement: "Valid professional license", status: "UNKNOWN" })]));
    const adaptation = buildPrioritizedAdaptation(evidence);
    expect(JSON.stringify(buildResumeContent(adaptation, evidence, source, job))).not.toContain("Valid professional license");
  });
});
