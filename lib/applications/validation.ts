import type { CandidateEvidence, GeneratedApplication } from "./types";
import { buildPrioritizedAdaptation, canonicalEvidenceValue, correctedHeadline } from "./evidence-priority";

export class UnsupportedApplicationClaimError extends Error {
  readonly code = "INVALID_GENERATION";
  constructor(public readonly unsupportedClaims: string[]) {
    super(`Generated application contains unsupported claims: ${unsupportedClaims.join(", ")}`);
  }
}

export function validateGeneratedApplication(
  output: GeneratedApplication,
  evidence: CandidateEvidence,
) {
  if (!isGeneratedApplication(output)) {
    throw new UnsupportedApplicationClaimError(["INVALID_OUTPUT_STRUCTURE"]);
  }
  const unsupported: string[] = [];
  const adaptation = output.resume_adaptation;
  if (adaptation.selection_version === "evidence-priority-v2") {
    // Recompute every claim, source block, link and ordering from evidence.
    // Accept factual deterministic reformulation, never arbitrary persuasive prose.
    if (!evidence.blocks || !evidence.target_job || canonicalEvidenceValue(adaptation) !== canonicalEvidenceValue(buildPrioritizedAdaptation(evidence))) {
      throw new UnsupportedApplicationClaimError(["INVALID_EVIDENCE_SELECTION"]);
    }
  } else if (adaptation.sections !== undefined || adaptation.professional_title !== undefined || adaptation.portfolio_links !== undefined || adaptation.additional_experience !== undefined || adaptation.technical_training !== undefined) {
    throw new UnsupportedApplicationClaimError(["UNVALIDATED_SELECTION_FIELDS"]);
  }
  const verified = new Set(evidence.verified_skills);
  for (const skill of [
    ...output.resume_adaptation.prioritized_skills,
    ...output.resume_adaptation.ats_keywords,
  ]) {
    if (!verified.has(skill)) unsupported.push(skill);
  }

  const exactSourceLines = new Set([
    ...evidence.experience_lines,
    ...evidence.project_lines,
    ...evidence.education_lines,
  ]);
  for (const line of [
    ...output.resume_adaptation.experience_sections,
    ...output.resume_adaptation.project_sections,
    ...output.resume_adaptation.education,
  ]) {
    if (!exactSourceLines.has(line)) unsupported.push(line);
  }

  const claimText = [
    output.resume_adaptation.professional_summary,
    ...output.resume_adaptation.experience_sections,
    ...output.resume_adaptation.project_sections,
    ...output.resume_adaptation.education,
    output.recruiter_message ?? "",
    output.cover_letter ?? "",
  ].join("\n");
  for (const skill of knownSkillsIn(claimText)) {
    if (!verified.has(skill)) unsupported.push(skill);
  }
  const supportedSummaries = new Set([
    "",
    evidence.candidate_profile.headline?.trim() ?? "",
    correctedHeadline(evidence.candidate_profile.headline ?? ""),
    [evidence.candidate_profile.seniority, evidence.candidate_profile.job_family].filter(Boolean).join(" "),
  ]);
  if (adaptation.selection_version === "evidence-priority-v2") supportedSummaries.add(buildPrioritizedAdaptation(evidence).professional_summary);
  if (!supportedSummaries.has(output.resume_adaptation.professional_summary)) {
    unsupported.push(output.resume_adaptation.professional_summary);
  }
  if (unsupported.length) throw new UnsupportedApplicationClaimError([...new Set(unsupported)]);
  return output;
}

const KNOWN_SKILLS = ["Angular", "AWS", "Azure", "CSS", "Docker", "Flutter", "Git", "GraphQL", "HTML", "Java", "JavaScript", "Kubernetes", "Next.js", "Node.js", "PHP", "PostgreSQL", "Python", "React", "REST", "Ruby", "SQL", "Supabase", "TypeScript", "Vue"];
function knownSkillsIn(value: string) {
  return KNOWN_SKILLS.filter((skill) => new RegExp(`\\b${skill.replace(".", "\\.")}\\b`, "i").test(value));
}

function isGeneratedApplication(value: unknown): value is GeneratedApplication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GeneratedApplication>;
  const adaptation = candidate.resume_adaptation as Partial<GeneratedApplication["resume_adaptation"]> | undefined;
  return Boolean(adaptation) &&
    typeof adaptation?.professional_summary === "string" &&
    [adaptation.prioritized_skills, adaptation.experience_sections, adaptation.project_sections,
      adaptation.education, adaptation.ats_keywords, adaptation.excluded_requested_skills]
      .every((item) => Array.isArray(item) && item.every((entry) => typeof entry === "string")) &&
    (candidate.recruiter_message === null || typeof candidate.recruiter_message === "string") &&
    (candidate.cover_letter === null || typeof candidate.cover_letter === "string");
}
