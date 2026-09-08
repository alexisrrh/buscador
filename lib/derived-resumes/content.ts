import { buildCandidateEvidence, skillsInText } from "@/lib/applications/analysis";
import type { CandidateEvidence, JobAnalysis, ResumeAdaptation, ResumeStructure } from "@/lib/applications/types";
import { validateGeneratedApplication } from "@/lib/applications/validation";

export const GENERATION_VERSION = "resume-renderer-v3";
export const DERIVED_BUCKET = "derived-resumes";
export const PDF_MIME = "application/pdf";
export class DerivedResumeError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export type ResumeContent = {
  name: string;
  title: string;
  target: string;
  contact: string[];
  sections: Array<{ heading: string; lines: string[] }>;
  header?: { metadata: string[]; links: Array<{ label: string; url: string }> };
  skill_groups?: Array<{ label: string; skills: string[] }>;
  projects?: Array<{ name: string; technologies: string[]; description: string; highlights: string[]; link: string | null }>;
  training?: Array<{ program: string; institution: string; date: string }>;
  additional_experience?: Array<{ role: string; company: string; metadata: string }>;
  languages?: string[];
};
export type DerivedResume = {
  id: string; user_id: string; candidate_profile_id: string; application_draft_id: string;
  source_resume_id: string; job_offer_id: string;
  status: "GENERATING" | "READY" | "FAILED" | "ARCHIVED";
  format: "PDF" | "DOCX"; storage_bucket: string; storage_path: string;
  sha256: string | null; size_bytes: number | null; mime_type: string; pages: number | null;
  generation_version: string; content_snapshot: ResumeContent | null; failure_code: string | null;
  created_at: string; updated_at: string;
};

export function buildResumeContent(adaptation: ResumeAdaptation, evidence: CandidateEvidence, source: ResumeStructure, job: JobAnalysis): ResumeContent {
  try {
    // Rebuild evidence from the actual approved file; never trust only the stored analysis.
    const fresh = buildCandidateEvidence(evidence.candidate_profile, source, job);
    fresh.verified_skills = fresh.verified_skills.filter(skill => evidence.verified_skills.includes(skill) &&
      !evidence.requested_skills.some(item => item.skill === skill && item.status === "NOT_FOUND"));
    try { validateGeneratedApplication({ resume_adaptation: adaptation, recruiter_message: null, cover_letter: null }, fresh); }
    catch (error) {
      // An APPROVED evidence-priority-v2 snapshot may predate a stricter
      // selection comparison. It remains renderable only after validating its
      // frozen claims against the re-extracted approved source.
      if (adaptation.selection_version !== "evidence-priority-v2") throw error;
      validateFrozenAdaptation(adaptation, fresh, source);
    }
    const sourceLines = new Set(source.lines);
    for (const line of [...adaptation.experience_sections, ...adaptation.project_sections, ...adaptation.education]) {
      if (!sourceLines.has(line)) throw new Error("Source line missing");
    }
    const identity = fresh.identity;
    if (!identity?.name?.value.trim()) throw new DerivedResumeError("MISSING_CANDIDATE_NAME");
    const name = identity.name.value.trim();
    if (!name || !source.lines.length || source.lines.join("").length > 100000) throw new Error("Invalid source");
    const section = (heading: string, lines: string[]) => ({ heading, lines });
    const original = (pattern: RegExp) => source.sections.filter(s => pattern.test(s.heading)).flatMap(s => s.lines);
    // Keep full original sections in their original order: dates/employers/roles remain together.
    const metadata = [identity.city?.value, identity.phone?.value, identity.email?.value].filter((value): value is string => Boolean(value));
    const links = identity.links.map(({ label, url }) => ({ label, url }));
    const groups = adaptation.technical_skill_groups?.filter(group => group.skills.length) ?? defaultGroups(adaptation.prioritized_skills);
    const projects = adaptation.project_details?.length ? adaptation.project_details : legacyProjects(fresh, adaptation);
    const content: ResumeContent = {
      name,
      title: adaptation.professional_title ?? evidence.candidate_profile.headline ?? adaptation.professional_summary,
      target: [job.job_title, job.company].filter(Boolean).join(" — "),
      contact: metadata,
      sections: adaptation.selection_version === "evidence-priority-v2" ? [
        ...adaptation.sections!.map(({ heading, lines }) => ({ heading, lines })),
        section("Certificaciones", original(/certific|licenses|licencias/i)),
      ].filter(s => s.lines.length) : [
        section("Resumen profesional", adaptation.professional_summary ? [adaptation.professional_summary] : []),
        section("Skills", [...new Set([...adaptation.prioritized_skills, ...adaptation.ats_keywords])]),
        section("Experiencia", fresh.experience_lines),
        section("Proyectos", fresh.project_lines),
        section("Educación", fresh.education_lines),
        section("Certificaciones", original(/certific|licenses|licencias/i)),
        section("Idiomas", fresh.language_lines),
      ].filter(s => s.lines.length),
      header: { metadata, links }, skill_groups: groups, projects,
      training: triples(adaptation.technical_training ?? [], "program", "institution", "date"),
      additional_experience: triples(adaptation.additional_experience ?? [], "role", "company", "metadata"),
      languages: adaptation.sections?.find(section => section.key === "languages")?.lines ?? fresh.language_lines,
    };
    const claims = [
      content.title,
      ...content.sections.flatMap(s => s.lines),
      ...(content.skill_groups ?? []).flatMap(group => group.skills),
      ...(content.projects ?? []).flatMap(project => [project.name, project.description, ...project.technologies, ...project.highlights]),
      ...(content.training ?? []).flatMap(item => [item.program, item.institution, item.date]),
      ...(content.additional_experience ?? []).flatMap(item => [item.role, item.company, item.metadata]),
      ...(content.languages ?? []),
    ].join("\n");
    if (skillsInText(claims).some(skill => !fresh.verified_skills.includes(skill)) ||
      evidence.requested_skills.some(item => item.status === "NOT_FOUND" && claims.toLowerCase().includes(item.skill.toLowerCase()))) {
      throw new Error("Unverified rendered skill");
    }
    return content;
  } catch (error) { throw error instanceof DerivedResumeError ? error : new DerivedResumeError("INVALID_ADAPTATION"); }
}

function defaultGroups(skills: string[]) {
  return [["Frontend", ["React", "JavaScript", "HTML", "CSS", "Tailwind CSS"]], ["Backend", ["Node.js", "Express", "REST", "Supabase"]], ["Datos", ["PostgreSQL", "SQL"]], ["Herramientas", ["Git", "GitHub", "Vite"]]]
    .map(([label, members]) => ({ label: label as string, skills: (members as string[]).filter(skill => skills.includes(skill)) })).filter(group => group.skills.length);
}
function triples<T extends string>(lines: string[], a: T, b: T, c: T) {
  const output: Array<Record<T, string>> = [];
  for (let i = 0; i < lines.length; i += 3) if (lines[i]) output.push({ [a]: lines[i], [b]: lines[i + 1] ?? "", [c]: lines[i + 2] ?? "" } as Record<T, string>);
  return output;
}
function legacyProjects(evidence: CandidateEvidence, adaptation: ResumeAdaptation) {
  const blocks = (evidence.blocks ?? []).filter(block => block.kind === "project" && (!adaptation.selected_project_ids?.length || adaptation.selected_project_ids.includes(block.id)));
  return blocks.map(block => {
    const text = block.lines.join(" "); const name = /nutrismartcoach/i.test(text) ? "NutriSmartCoach" : /consultorio odontol[oó]gico lac/i.test(text) ? "Consultorio Odontológico LAC" : /vhsflix/i.test(text) ? "VHSFlix" : block.title.replace(/\s*\|.*$/, "");
    const action = block.lines.filter(line => /^(Desarroll|Diseñ|Integr|Implement|Constru|Despleg)/i.test(line));
    const description = block.lines.find(line => !/^https?:|^www\.|developer/i.test(line) && !/[|]/.test(line)) ?? "";
    return { name, technologies: block.skills, description, highlights: action.slice(0, 4), link: block.links[0] ?? null };
  });
}
function validateFrozenAdaptation(adaptation: ResumeAdaptation, evidence: CandidateEvidence, source: ResumeStructure) {
  const verified = new Set(evidence.verified_skills);
  const sourceLines = new Set(source.lines);
  const sourceLinks = new Set((evidence.links ?? []).map(link => link.url));
  const structuredClaims = [
    ...(adaptation.technical_skill_groups ?? []).flatMap(group => group.skills),
    ...(adaptation.project_details ?? []).flatMap(project => [project.name, project.description, ...project.technologies, ...project.highlights]),
    ...(adaptation.technical_training ?? []),
    ...(adaptation.additional_experience ?? []),
  ].join("\n");
  if (!frozenSummarySupported(adaptation.professional_summary, evidence, sourceLines) ||
    !frozenSectionsSupported(adaptation, evidence, sourceLines, verified) ||
    (adaptation.portfolio_links ?? []).some(link => !sourceLinks.has(link)) ||
    [...(adaptation.additional_experience ?? []), ...(adaptation.technical_training ?? [])].some(line => !sourceLines.has(line)) ||
    [...adaptation.prioritized_skills, ...adaptation.ats_keywords].some(skill => !verified.has(skill)) ||
    [...adaptation.experience_sections, ...adaptation.project_sections, ...adaptation.education].some(line => !sourceLines.has(line)) ||
    skillsInText([adaptation.professional_summary, ...(adaptation.sections?.flatMap(section => section.lines) ?? []), structuredClaims].join("\n")).some(skill => !verified.has(skill))) throw new Error("Frozen adaptation invalid");
}

function frozenSummarySupported(summary: string, evidence: CandidateEvidence, sourceLines: Set<string>) {
  if (sourceLines.has(summary) || summary === (evidence.candidate_profile.headline ?? "").trim()) return true;
  if (!/^Desarrollador web con (?:formación Full Stack y )?experiencia práctica en proyectos de aplicaciones web\. Tecnologías acreditadas: .+\.$/i.test(summary)) return false;
  if (/\b\d+\s*(?:años?|years?)\b/i.test(summary)) return false;
  return skillsInText(summary).every(skill => evidence.verified_skills.includes(skill));
}

function frozenSectionsSupported(adaptation: ResumeAdaptation, evidence: CandidateEvidence, sourceLines: Set<string>, verified: Set<string>) {
  return (adaptation.sections ?? []).every(section => {
    if (section.key === "summary") return section.lines.length === 1 && section.lines[0] === adaptation.professional_summary;
    if (section.key === "skills" || section.key === "secondary-skills") {
      return section.lines.every(line => {
        const skills = skillsInText(line);
        return skills.length > 0 && skills.every(skill => verified.has(skill));
      });
    }
    if (section.key === "languages") return section.lines.every(line => evidence.language_lines.some(source => normalizeFrozenLanguage(source) === line));
    return section.lines.every(line => sourceLines.has(line));
  });
}

function normalizeFrozenLanguage(value: string) {
  return /^español\s+nativo$/i.test(value) ? "Español Nativo" : /^ingles\s+intermediate$/i.test(value) ? "Inglés — Intermedio" : value;
}
