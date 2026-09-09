import { describe, expect, it } from "vitest";
import { analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildPrioritizedAdaptation } from "@/lib/applications/evidence-priority";
import { mergeProfessionalEvidence, resumeInformationCoverage } from "@/lib/applications/professional-evidence";
import type { ProfessionalEvidenceBank } from "@/lib/applications/types";

const item = (overrides = {}) => ({ id: "item", profile_id: "project", subject_type: "PROJECT" as const, display_name: "Portal", category: "BACKEND" as const, exact_claim: "Express", source_type: "USER_CONFIRMED" as const, source_reference: "candidate confirmation", verification_status: "VERIFIED" as const, confirmed_at: "2026-09-09T00:00:00.000Z", relevance_tags: ["backend"], ...overrides });
const job = (description: string) => analyzeJobOffer({ title: "Web Developer", description, companies: { name: "Example" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
const resume = structureResumeText("Ana Ejemplo\nPROYECTOS\nProyecto: Portal\nReact JavaScript\nDesarrollé una interfaz React.");

describe("professional evidence bank foundation", () => {
  it("accepts approved-resume and explicitly confirmed evidence, never an unconfirmed claim", () => {
    const base = buildCandidateEvidence({ name: "Ana", headline: "Web Developer", job_family: null, seniority: null }, resume, job("Express required"));
    const verified: ProfessionalEvidenceBank = { items: [item()] };
    const pending: ProfessionalEvidenceBank = { items: [item({ verification_status: "CONFIRMABLE", confirmed_at: null })] };
    expect(mergeProfessionalEvidence(base, verified).verified_skills).toContain("Express");
    expect(mergeProfessionalEvidence(base, pending).verified_skills).not.toContain("Express");
  });
  it("lets verified bank evidence improve offer-specific selection without fabricating a claim", () => {
    const evidence = buildCandidateEvidence({ name: "Ana", headline: "Web Developer", job_family: null, seniority: null }, resume, job("Express required"), null, { items: [item()] });
    const adaptation = buildPrioritizedAdaptation(evidence);
    expect(adaptation.prioritized_skills).toContain("Express");
    expect(evidence.professional_evidence?.map(value => value.exact_claim)).toEqual(["Express"]);
  });
  it("requires an explicit relevance or space reason for every omitted baseline claim", () => {
    const baseline = [item({ exact_claim: "Built a verified API", source_type: "APPROVED_RESUME", confirmed_at: null })];
    expect(() => resumeInformationCoverage({ baseline, renderedClaims: [] })).toThrow("UNEXPLAINED_BASELINE_OMISSION");
    expect(resumeInformationCoverage({ baseline, renderedClaims: [], omissions: new Map([["item", "OMITTED_FOR_RELEVANCE"]]) }).entries[0]).toMatchObject({ status: "OMITTED_FOR_RELEVANCE" });
    expect(resumeInformationCoverage({ baseline, renderedClaims: ["Built a verified API"] }).entries[0]).toMatchObject({ status: "PRESERVED" });
  });
});
