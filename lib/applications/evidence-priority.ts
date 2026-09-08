import type { AdaptedSection, CandidateEvidence, EvidenceBlock, JobAnalysis, ResumeAdaptation, ResumeStructure, RoleFamily } from "./types";

const ROLE_SKILLS: Record<RoleFamily, string[]> = {
  WEB: ["JavaScript", "HTML", "CSS", "React", "TypeScript", "Next.js", "Vue", "Angular", "Git", "Node.js", "REST", "Tailwind CSS", "Bootstrap", "Vite", "Redux", "Supabase", "PostgreSQL", "SQL", "GitHub", "Python"],
  SOFTWARE: ["TypeScript", "JavaScript", "Node.js", "Python", "Java", "SQL", "PostgreSQL", "REST", "Git", "Docker"],
  DATA: ["Python", "SQL", "PostgreSQL", "MySQL", "Git"],
  OTHER: [],
};
const TECH_ROLE = /\b(developer|programmer|software engineer|desarrollador|programador|ingenier[oa] de software|frontend|front-end|backend|back-end|full[ -]?stack|data scientist|data engineer)\b/i;
const WEB_SIGNAL = /\b(web|react|html|css|frontend|front-end|full[ -]?stack|javascript)\b/i;
const DATE = /\b(?:19|20)\d{2}\b/;

export function roleFamily(title: string): RoleFamily {
  if (/\b(web|frontend|front-end|front end|full[ -]?stack)\b/i.test(title)) return "WEB";
  if (/\b(data|datos|machine learning)\b/i.test(title)) return "DATA";
  if (TECH_ROLE.test(title)) return "SOFTWARE";
  return "OTHER";
}

export function safeEvidenceUrl(value: string): string | null {
  const text = value.trim().replace(/[),.;]+$/, "");
  if (!/^(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:[a-z0-9-]+\.)*(?:app|com|org|net|dev|io)(?:\/|$))/i.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const usefulLine = (line: string) => !/^(?:[•·*\-]+|-- \d+ of \d+ --)$/.test(line.trim());
const skillPresent = (line: string, skill: string) => new RegExp(`(^|[^a-z0-9])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(line);

export function enrichEvidence(evidence: CandidateEvidence, resume: ResumeStructure, job: JobAnalysis): CandidateEvidence {
  const links = new Map<string, { text: string; url: string }>();
  for (const link of resume.links ?? []) {
    const url = safeEvidenceUrl(link.url);
    if (url) links.set(url, { text: link.text, url });
  }
  for (const line of resume.lines) {
    for (const text of line.match(/https?:\/\/[^\s|]+|\bwww\.[^\s|]+|\b[a-z0-9-]+\.(?:vercel\.app|com|dev|io)(?:\/[^\s|]*)?/gi) ?? []) {
      // A bare email domain is not a portfolio URL.
      if (line.includes(`@${text}`)) continue;
      const url = safeEvidenceUrl(text);
      if (url && !links.has(url)) links.set(url, { text, url });
    }
  }
  const blocks: EvidenceBlock[] = [];
  for (const section of resume.sections) {
    const kind = /project|proyecto/i.test(section.heading) ? "project" : /experience|experiencia|employment|trayectoria/i.test(section.heading) ? "employment" : /education|educaci[oó]n|formaci[oó]n|studies|estudios/i.test(section.heading) ? "education" : null;
    if (!kind) continue;
    const lines = section.lines.filter(usefulLine);
    const starts = new Set<number>([0]);
    if (kind === "project") {
      for (let i = 1; i < lines.length; i++) {
        // A repeated standalone role followed by a project URL marks a project,
        // never an employment relationship or an invented employer.
        if (safeEvidenceUrl(lines[i]) && TECH_ROLE.test(lines[i - 1]) && lines[i - 1].length < 70) starts.add(i - 1);
        else if (/^(?:project|proyecto)\s*[:—-]/i.test(lines[i])) starts.add(i);
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (!DATE.test(lines[i])) continue;
        const start = /^(?:\d{2}\/)?(?:19|20)\d{2}/.test(lines[i]) && i >= 2 ? i - 2 : i;
        starts.add(start);
      }
    }
    const boundaries = [...starts].sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length; index++) {
      const part = lines.slice(boundaries[index], boundaries[index + 1]);
      if (!part.length) continue;
      const dateIndex = part.findIndex(line => DATE.test(line));
      const identity = dateIndex >= 0 ? part.slice(0, dateIndex + 1) : part;
      const technical = kind === "employment" ? TECH_ROLE.test(identity.slice(0, 2).join(" "))
        : TECH_ROLE.test(part.join(" ")) || evidence.verified_skills.some(skill => skillPresent(part.join(" "), skill));
      const blockLinks = [...links.values()].filter(link => part.some(line => line === link.text || line.includes(link.url))).map(link => link.url);
      const title = kind === "project" ? part.find(line => /[|]/.test(line) && !TECH_ROLE.test(line)) ?? part.find(line => safeEvidenceUrl(line)) ?? part[0] : part[0];
      blocks.push({ id: `${kind}-${blocks.filter(b => b.kind === kind).length + 1}`, kind, title, lines: part, identity_lines: identity,
        technical, skills: evidence.verified_skills.filter(skill => skillPresent(part.join(" "), skill)), links: blockLinks });
    }
  }
  return { ...evidence, blocks, links: [...links.values()], role_family: roleFamily(job.job_title),
    target_job: { job_title: job.job_title, required_skills: job.required_skills, preferred_skills: job.preferred_skills, keywords: job.keywords },
    language_lines: evidence.language_lines.filter(usefulLine) };
}

export function prioritizedSkills(evidence: CandidateEvidence) {
  const family = ROLE_SKILLS[evidence.role_family ?? "OTHER"];
  const job = evidence.target_job;
  const skills = evidence.verified_skills.filter(skill => !evidence.requested_skills.some(s => s.skill === skill && s.status === "NOT_FOUND"));
  const tier = (skill: string) => job?.required_skills.includes(skill) ? 0 : job?.preferred_skills.includes(skill) ? 1 : family.includes(skill) ? 2 : 3;
  const roleIndex = (skill: string) => family.includes(skill) ? family.indexOf(skill) : 100;
  return skills.sort((a, b) => tier(a) - tier(b) || roleIndex(a) - roleIndex(b) || a.localeCompare(b));
}

export function correctedHeadline(value: string) {
  const text = value.trim().replace(/\bfronted\b/gi, "frontend").replace(/\bproduccion\b/gi, "producción");
  return text ? text[0].toLocaleUpperCase("es") + text.slice(1) : "";
}

function professionalSummary(evidence: CandidateEvidence, skills: string[]) {
  const blocks = evidence.blocks ?? [];
  const webProjects = blocks.filter(b => b.kind === "project" && b.technical && WEB_SIGNAL.test(b.lines.join(" ")));
  const webEmployment = blocks.filter(b => b.kind === "employment" && b.technical && WEB_SIGNAL.test(b.lines.join(" ")));
  if (evidence.role_family !== "WEB" || !(webProjects.length || webEmployment.length)) {
    return correctedHeadline(evidence.candidate_profile.headline ?? [evidence.candidate_profile.seniority, evidence.candidate_profile.job_family].filter(Boolean).join(" "));
  }
  const fullStack = blocks.some(b => b.kind === "education" && /full[ -]?stack/i.test(b.lines.join(" ")));
  const practice = webProjects.length ? "experiencia práctica en proyectos de aplicaciones web" : "experiencia profesional en desarrollo web";
  const strengths = skills.slice(0, 5);
  return `Desarrollador web con ${fullStack ? "formación Full Stack y " : ""}${practice}.${strengths.length ? ` Tecnologías acreditadas: ${strengths.slice(0, -1).join(", ")}${strengths.length > 1 ? " y " : ""}${strengths.at(-1)}.` : ""}`;
}

export function buildPrioritizedAdaptation(evidence: CandidateEvidence): ResumeAdaptation {
  const skills = prioritizedSkills(evidence);
  const technicalRole = evidence.role_family !== "OTHER";
  const blocks = evidence.blocks ?? [];
  const score = (block: EvidenceBlock) => block.skills.reduce((sum, skill) => sum + (evidence.target_job?.required_skills.includes(skill) ? 10 : evidence.target_job?.preferred_skills.includes(skill) ? 5 : ROLE_SKILLS[evidence.role_family ?? "OTHER"].includes(skill) ? 2 : 0), 0);
  const projects = blocks.filter(b => b.kind === "project").sort((a, b) => Number(b.technical && technicalRole) - Number(a.technical && technicalRole) || score(b) - score(a));
  const employment = blocks.filter(b => b.kind === "employment");
  const primary = technicalRole ? employment.filter(b => b.technical) : employment;
  const additional = technicalRole ? employment.filter(b => !b.technical) : [];
  const training = technicalRole ? blocks.filter(b => b.kind === "education" && b.technical) : [];
  const education = blocks.filter(b => b.kind === "education" && !training.includes(b));
  const hasTechnicalEvidence = projects.some(b => b.technical) || primary.some(b => b.technical) || training.length > 0;
  const technicalFirst = technicalRole && hasTechnicalEvidence;
  const summary = professionalSummary(evidence, skills);
  const title = evidence.role_family === "WEB" && /^Desarrollador web con /.test(summary) ? "Desarrollador web" : correctedHeadline(evidence.candidate_profile.headline ?? "");
  const projectUrls = new Set(projects.flatMap(p => p.links));
  const portfolio = (evidence.links ?? []).filter(link => !projectUrls.has(link.url)).map(link => link.url);
  const section = (key: string, heading: string, items: EvidenceBlock[], compact = false): AdaptedSection => ({ key, heading,
    lines: items.flatMap(b => compact ? b.identity_lines : b.lines), evidence_ids: items.map(b => b.id) });
  const selectedProjects = section("projects", technicalFirst ? "Proyectos seleccionados" : "Proyectos", projects);
  selectedProjects.lines = projects.flatMap(project => [project.title, ...project.lines.filter((line, index) => line !== project.title && !(index === 0 && TECH_ROLE.test(line) && line.length < 70))]);
  const work = section("experience", technicalFirst ? "Experiencia profesional técnica" : "Experiencia profesional", technicalFirst ? primary : employment);
  const technicalTraining = section("training", "Formación técnica", training);
  const extra = section("additional", "Experiencia adicional", technicalFirst ? additional : [], true);
  const sections = [
    { key: "summary", heading: "Resumen profesional", lines: summary ? [summary] : [], evidence_ids: [] },
    { key: "skills", heading: technicalFirst ? "Skills técnicas" : "Skills", lines: skills.length ? [skills.join(" · ")] : [], evidence_ids: [] },
    ...(technicalFirst ? [selectedProjects, work, technicalTraining, extra] : [work, selectedProjects, technicalTraining]),
    section("education", "Educación", education),
    { key: "languages", heading: "Idiomas", lines: evidence.language_lines, evidence_ids: [] },
  ].filter(s => s.lines.length);
  return { selection_version: "evidence-priority-v2", professional_title: title, professional_summary: summary,
    prioritized_skills: skills, experience_sections: (technicalFirst ? primary : employment).flatMap(b => b.lines),
    project_sections: projects.flatMap(b => b.lines), education: blocks.filter(b => b.kind === "education").flatMap(b => b.lines),
    ats_keywords: skills.filter(skill => evidence.target_job?.keywords.includes(skill)),
    excluded_requested_skills: evidence.requested_skills.filter(s => s.status === "NOT_FOUND").map(s => s.skill),
    sections, selected_project_ids: projects.map(b => b.id), technical_experience_ids: primary.filter(b => b.technical).map(b => b.id),
    additional_experience: extra.lines, technical_training: technicalTraining.lines, portfolio_links: portfolio };
}

export function canonicalEvidenceValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalEvidenceValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalEvidenceValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
