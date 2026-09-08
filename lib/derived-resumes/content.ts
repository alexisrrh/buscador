import { buildCandidateEvidence, skillsInText } from "@/lib/applications/analysis";
import type { CandidateEvidence, JobAnalysis, ResumeAdaptation, ResumeStructure } from "@/lib/applications/types";
import { validateGeneratedApplication } from "@/lib/applications/validation";

export const GENERATION_VERSION = "resume-renderer-v1";
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
    validateGeneratedApplication({ resume_adaptation: adaptation, recruiter_message: null, cover_letter: null }, fresh);
    const sourceLines = new Set(source.lines);
    for (const line of [...adaptation.experience_sections, ...adaptation.project_sections, ...adaptation.education]) {
      if (!sourceLines.has(line)) throw new Error("Source line missing");
    }
    const name = evidence.candidate_profile.name.trim();
    if (!name || !source.lines.length || source.lines.join("").length > 100000) throw new Error("Invalid source");
    const section = (heading: string, lines: string[]) => ({ heading, lines });
    const original = (pattern: RegExp) => source.sections.filter(s => pattern.test(s.heading)).flatMap(s => s.lines);
    // Keep full original sections in their original order: dates/employers/roles remain together.
    const contact = source.sections.filter((s, index) => index === 0 || /^(perfil|profile|contact|contacto|personal details)$/i.test(s.heading))
      .flatMap(s => s.lines).filter(line => /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|(?:\+?\d[\d ()-]{7,}\d)/i.test(line));
    const content = {
      name,
      title: adaptation.professional_title ?? evidence.candidate_profile.headline ?? adaptation.professional_summary,
      target: [job.job_title, job.company].filter(Boolean).join(" — "),
      contact: [...new Set([...contact, ...(adaptation.portfolio_links ?? [])])],
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
    };
    const claims = [content.title, ...content.sections.flatMap(s => s.lines)].join("\n");
    if (skillsInText(claims).some(skill => !fresh.verified_skills.includes(skill)) ||
      evidence.requested_skills.some(item => item.status === "NOT_FOUND" && claims.toLowerCase().includes(item.skill.toLowerCase()))) {
      throw new Error("Unverified rendered skill");
    }
    return content;
  } catch { throw new DerivedResumeError("INVALID_ADAPTATION"); }
}
