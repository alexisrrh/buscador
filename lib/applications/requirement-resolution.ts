import type { ApplicationReadiness, CandidateEvidence, GapSeverity, JobAnalysis, RequirementClassification, RequirementResolution } from "./types";

const DOCUMENTED_REQUIREMENT = /\b\d+\+?\s*(?:years?|a(?:ñ|n)os?)\b|\b(?:licen[cs]|certif|degree|grado|titulaci[oó]n|visa|permit|work authorization|legal|colegiad)/i;

export function resolveRequirementEvidence(job: JobAnalysis, evidence: CandidateEvidence): RequirementResolution[] {
  const verified = new Set(evidence.verified_skills);
  const projectSkills = new Set((evidence.blocks ?? []).filter(block => block.kind === "project").flatMap(block => block.skills));
  const userConfirmedSkills = new Set((evidence.professional_evidence ?? [])
    .filter(item => item.source_type === "USER_CONFIRMED" && item.verification_status === "VERIFIED" && Boolean(item.confirmed_at))
    .flatMap(item => item.relevance_tags));
  const trainingText = evidence.education_lines.join("\n").toLowerCase();
  const entries = new Map<string, RequirementClassification>();
  for (const skill of job.required_skills) entries.set(skill, "MANDATORY");
  for (const skill of job.preferred_skills) if (!entries.has(skill)) entries.set(skill, "PREFERRED");
  for (const skill of job.keywords) if (!entries.has(skill)) entries.set(skill, "OPTIONAL");
  const resolved: RequirementResolution[] = [...entries].map(([requirement, classification]) => {
    const sources = verified.has(requirement)
      ? [userConfirmedSkills.has(requirement) ? "USER_CONFIRMED" : projectSkills.has(requirement) ? "VERIFIED_PROJECT" : "APPROVED_RESUME"] as RequirementResolution["evidence_sources"]
      : trainingText.includes(requirement.toLowerCase()) ? ["VERIFIED_TRAINING"] as RequirementResolution["evidence_sources"] : [];
    const status = sources.length ? "VERIFIED" as const : documentedStatus(requirement, classification);
    return {
      requirement, classification, status, severity: severityFor(requirement, classification, status), evidence_sources: sources,
      ...(status === "CONFIRMABLE" ? { confirmation_prompt: { skill: requirement, context_required: ["context", "scope", "confirmed_at"] as ["context", "scope", "confirmed_at"] } } : {}),
    };
  });
  for (const requirement of job.mandatory_requirements) {
    const covered = resolved.filter(item => requirement.toLowerCase().includes(item.requirement.toLowerCase()));
    if (isAtomicDocumentedRequirement(requirement) && covered.length) {
      for (const item of covered.filter(item => item.status !== "VERIFIED")) {
        item.status = "MISSING";
        item.severity = "CRITICAL";
        item.evidence_sources = [];
        delete item.confirmation_prompt;
      }
      if (covered.some(item => item.status === "VERIFIED")) {
        resolved.push({ requirement, classification: "MANDATORY", status: "MISSING", severity: "CRITICAL", evidence_sources: [] });
      }
      continue;
    }
    if (covered.length) continue;
    resolved.push({ requirement, classification: "UNKNOWN", status: "UNKNOWN", severity: severityFor(requirement, "UNKNOWN", "UNKNOWN"), evidence_sources: [] });
  }
  return resolved;
}

function documentedStatus(requirement: string, classification: RequirementClassification) {
  if (isAtomicDocumentedRequirement(requirement)) return "MISSING" as const;
  return classification === "UNKNOWN" ? "UNKNOWN" as const : "CONFIRMABLE" as const;
}

function severityFor(requirement: string, classification: RequirementClassification, status: RequirementResolution["status"]): GapSeverity {
  if (status === "VERIFIED") return "MINOR";
  if (classification === "MANDATORY" && isAtomicDocumentedRequirement(requirement)) return "CRITICAL";
  if (classification === "MANDATORY" || classification === "UNKNOWN") return "IMPORTANT";
  return "MINOR";
}

function isAtomicDocumentedRequirement(requirement: string) {
  return requirement.length <= 180 && DOCUMENTED_REQUIREMENT.test(requirement);
}

export function evaluateApplicationReadiness(input: {
  requirements: RequirementResolution[];
  derivedResumeValid: boolean;
  identityValid: boolean;
  requiredQuestionsComplete: boolean;
}): ApplicationReadiness {
  const reasons: string[] = [];
  if (!input.derivedResumeValid) reasons.push("DERIVED_RESUME_INVALID");
  if (!input.identityValid) reasons.push("VERIFIED_IDENTITY_OR_CONTACT_REQUIRED");
  if (!input.requiredQuestionsComplete) reasons.push("REQUIRED_QUESTIONS_INCOMPLETE");
  const critical = input.requirements.filter(item => item.status !== "VERIFIED" && item.severity === "CRITICAL");
  if (critical.length) reasons.push("CRITICAL_REQUIREMENT_GAP");
  const pending = input.requirements.filter(item => item.status === "CONFIRMABLE");
  if (reasons.length) return { status: "BLOCKED", reasons, pending_confirmations: pending };
  if (pending.length) return { status: "REVIEW_REQUIRED", reasons: ["EVIDENCE_CONFIRMATION_REQUIRED"], pending_confirmations: pending };
  return { status: "READY", reasons: [], pending_confirmations: [] };
}
