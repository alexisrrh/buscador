import { enrichEvidence, safeEvidenceUrl } from "./evidence-priority";
import { skillsInText } from "./analysis";
import type { CandidateEvidence, EvidenceBlock, ProfessionalEvidenceCategory, ResumeStructure } from "./types";

export type ApprovedEvidenceSubjectPlan = {
  key: string; subject_type: "PROJECT" | "EMPLOYMENT"; display_name: string; description: string | null;
  employment_role: string | null; employment_company: string | null; employment_dates: string | null; employment_location: string | null;
  claims: Array<{ key: string; category: ProfessionalEvidenceCategory; exact_claim: string }>;
  urls: Array<{ key: string; url: string; url_type: "DEMO" | "REPOSITORY" | "PORTFOLIO" }>;
};

const DATE = /\b(?:19|20)\d{2}\b/;
const TECH_ROLE = /\b(developer|programmer|software engineer|desarrollador|programador|ingenier[oa] de software|frontend|front-end|backend|back-end|full[ -]?stack|data scientist|data engineer)\b/i;
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unique = <T,>(values: T[], key: (value: T) => string) => values.filter((value, index) => values.findIndex(other => key(other) === key(value)) === index);

function evidenceFor(structured: ResumeStructure) {
  const source_text = structured.lines.join("\n");
  const base: CandidateEvidence = { candidate_profile: { name: "", headline: null, job_family: null, seniority: null }, verified_skills: skillsInText(source_text), requested_skills: [], experience_lines: [], project_lines: [], education_lines: [], language_lines: [], source_text };
  return enrichEvidence(base, structured, { job_title: "", company: null, responsibilities: [], required_skills: [], preferred_skills: [], required_experience: [], preferred_experience: [], education: [], languages: [], location: null, work_mode: null, contract: null, salary: null, keywords: [], mandatory_requirements: [] });
}

function projectName(block: EvidenceBlock) {
  const candidate = block.lines.find(line => /\|/.test(line) && !TECH_ROLE.test(line)) ?? block.title;
  return candidate.replace(/^proyecto\s*[:—-]\s*/i, "").split("|")[0].trim() || "Proyecto";
}

function isAction(line: string) {
  return /\b(desarroll[ée]|implement[ée]|constru[íi]|integr[ée]|diseñ[ée]|cre[ée]|gestion[ée]|montaje|resolviendo)\b/i.test(line);
}

function technologyContext(line: string) {
  if (/\b(?:stack|tecnolog[ií]as?|herramientas)\s*[:—-]/i.test(line)) return true;
  const skills = skillsInText(line);
  // Separators alone are not technical context: commercial/project names can
  // include a pipe or slash. Two independently recognised technologies are.
  return /[|·,/]/.test(line) && skills.length >= 2;
}

function continuation(previous: string, next: string) {
  if (!previous || !next || /[.!?:;]$/.test(previous.trim()) || safeEvidenceUrl(next) || TECH_ROLE.test(next) || technologyContext(next) || DATE.test(next)) return false;
  return /(?:\b(?:y|o|a|de|del|con|para|en)|[,(/-])$/i.test(previous.trim()) && /^[a-záéíóúüñ]/.test(next.trim());
}

function logicalLines(lines: string[]) {
  const result: string[] = [];
  for (const line of lines.map(value => value.trim()).filter(Boolean)) {
    const previous = result.at(-1);
    if (previous && continuation(previous, line)) result[result.length - 1] = `${previous} ${line}`.replace(/\s+/g, " ");
    else result.push(line);
  }
  return result;
}

function projectDescription(block: EvidenceBlock) {
  return logicalLines(block.lines.filter(line => line !== block.title && !TECH_ROLE.test(line) && !safeEvidenceUrl(line) && !technologyContext(line))).find(line => !isAction(line)) ?? null;
}

function technologiesFor(block: EvidenceBlock, identity: string[]) {
  // Only independently technical structured lines can create technologies.
  // A commercial name such as "Carrefour Express" therefore cannot imply Express.js.
  const lines = block.lines.filter(line => (block.kind === "project" ? !TECH_ROLE.test(line) && technologyContext(line) : !identity.includes(line) && /\b(?:stack|tecnolog[ií]as?|herramientas)\s*[:—-]/i.test(line)));
  return skillsInText(lines.join("\n"));
}

function claimCategory(line: string, technical: boolean): ProfessionalEvidenceCategory {
  if (/\b(auth|autenticaci[oó]n|jwt)\b/i.test(line)) return "AUTH";
  if (technical && /\b(?:api|apis|rest|integraci[oó]n|integrar|integr[ée]|integrado)\b/i.test(line)) return "API_INTEGRATION";
  if (technical && /\b(?:base de datos|database|postgres(?:ql)?|sql|storage)\b/i.test(line)) return "DATABASE";
  if (technical && /\b(?:testing|tests?|pruebas?)\b/i.test(line)) return "TESTING";
  if (technical && /\b(?:deploy(?:ment)?|despliegue)\b/i.test(line)) return "DEPLOYMENT";
  if (technical && /\b(?:frontend|react|html|css)\b/i.test(line)) return "FRONTEND";
  if (technical && /\b(?:backend|node\.js|express|servidor)\b/i.test(line)) return "BACKEND";
  if (technical && isAction(line)) return "FEATURE";
  if (/\b(?:gesti[oó]n|atenci[oó]n|resolviendo|montaje|instalaci[oó]n)\b/i.test(line)) return "RESPONSIBILITY";
  return "OTHER";
}

function urlType(url: string): "DEMO" | "REPOSITORY" | "PORTFOLIO" {
  return /github\.com|gitlab\.com|bitbucket\.org/i.test(url) ? "REPOSITORY" : "DEMO";
}

function claimsFor(block: EvidenceBlock, identity: string[]) {
  const technologies = technologiesFor(block, identity);
  const prose = logicalLines(block.lines.filter(line => !identity.includes(line) && !safeEvidenceUrl(line) && !TECH_ROLE.test(line) && line.trim().length > 2 && !technologyContext(line)));
  const technical = block.kind === "project" || technologies.length > 0;
  const claims = prose.map(line => ({ key: `claim:${normalize(line)}`, category: claimCategory(line, technical), exact_claim: line }));
  const technology = technologies.map(skill => ({ key: `technology:${normalize(skill)}`, category: "TECHNOLOGY" as const, exact_claim: skill }));
  return unique([...claims, ...technology], item => item.key);
}

export function approvedResumeEvidencePlanFromBlocks(blocks: EvidenceBlock[]): ApprovedEvidenceSubjectPlan[] {
  return blocks.filter(block => block.kind === "project" || block.kind === "employment").map(block => {
    const isProject = block.kind === "project";
    const display_name = isProject ? projectName(block) : block.identity_lines[0] ?? block.title;
    const dates = isProject ? null : block.identity_lines.find(line => DATE.test(line)) ?? null;
    const company = isProject ? null : block.identity_lines.find((line, index) => index > 0 && line !== dates) ?? null;
    const identity = isProject ? [block.title, display_name] : block.identity_lines;
    const key = `${isProject ? "project" : "employment"}:${normalize([display_name, company ?? "", dates ?? ""].join("|"))}`;
    return { key, subject_type: isProject ? "PROJECT" : "EMPLOYMENT", display_name, description: isProject ? projectDescription(block) : null, employment_role: isProject ? null : display_name, employment_company: company, employment_dates: dates, employment_location: null, claims: claimsFor(block, identity), urls: unique(block.links.map(url => ({ key: `url:${normalize(url)}`, url, url_type: urlType(url) })), value => value.key) };
  });
}

export function approvedResumeEvidencePlan(structured: ResumeStructure): ApprovedEvidenceSubjectPlan[] {
  return approvedResumeEvidencePlanFromBlocks(evidenceFor(structured).blocks ?? []);
}

export function approvedResumeSourceReference(resumeId: string, subjectKey: string, valueKey: string) {
  return `approved-resume:${resumeId}:${subjectKey}:${valueKey}`;
}
