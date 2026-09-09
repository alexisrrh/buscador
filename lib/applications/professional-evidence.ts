import { skillsInText } from "./analysis";
import type { CandidateEvidence, ProfessionalEvidenceBank, ProfessionalEvidenceItem, ResumeInformationCoverage } from "./types";

export function verifiedProfessionalEvidence(bank: ProfessionalEvidenceBank | null | undefined) {
  return (bank?.items ?? []).filter(item => item.verification_status === "VERIFIED" &&
    (item.source_type !== "USER_CONFIRMED" || Boolean(item.confirmed_at)));
}

export function mergeProfessionalEvidence(evidence: CandidateEvidence, bank?: ProfessionalEvidenceBank | null): CandidateEvidence {
  const items = verifiedProfessionalEvidence(bank);
  const skills = new Set(evidence.verified_skills);
  for (const item of items) for (const skill of skillsInText(item.exact_claim)) skills.add(skill);
  return { ...evidence, verified_skills: [...skills],
    requested_skills: evidence.requested_skills.map(request => skills.has(request.skill) ? { ...request, status: "VERIFIED" } : request),
    professional_evidence: items };
}

// Coverage compares professional claims, not character counts. An omitted
// verified baseline item is invalid unless selection supplies an explicit reason.
export function resumeInformationCoverage(input: {
  baseline: ProfessionalEvidenceItem[];
  renderedClaims: string[];
  omissions?: Map<string, "OMITTED_FOR_RELEVANCE" | "OMITTED_FOR_SPACE">;
}): ResumeInformationCoverage {
  const rendered = input.renderedClaims.join("\n").toLocaleLowerCase();
  return { entries: input.baseline.filter(item => item.verification_status === "VERIFIED").map(item => {
    if (rendered.includes(item.exact_claim.toLocaleLowerCase())) return { claim: item.exact_claim, status: "PRESERVED" as const, reason: "VERIFIED_CLAIM_RENDERED" };
    const omission = input.omissions?.get(item.id);
    if (!omission) throw new Error("UNEXPLAINED_BASELINE_OMISSION");
    return { claim: item.exact_claim, status: omission, reason: omission === "OMITTED_FOR_RELEVANCE" ? "OFFER_RELEVANCE" : "PAGE_SPACE" };
  }) };
}
