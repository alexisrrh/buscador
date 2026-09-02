import type {
  CandidateEvidence,
  GapAnalysis,
  JobAnalysis,
  ResumeStructure,
} from "./types";

const SKILLS = [
  "Angular", "AWS", "Azure", "CSS", "Docker", "Flutter", "Git", "GraphQL",
  "HTML", "Java", "JavaScript", "Kubernetes", "Next.js", "Node.js", "PHP",
  "PostgreSQL", "Python", "React", "REST", "Ruby", "SQL", "Supabase",
  "TypeScript", "Vue",
];

type OfferInput = {
  title: string;
  description: string | null;
  location_text: string | null;
  work_mode: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  companies: { name: string } | Array<{ name: string }> | null;
};

type ProfileInput = {
  name: string;
  headline: string | null;
  job_family: string | null;
  seniority: string | null;
};

export function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function meaningfulLines(value: string) {
  return cleanText(value)
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length >= 4)
    .slice(0, 200);
}

export function skillsInText(value: string) {
  const normalized = ` ${cleanText(value).toLocaleLowerCase("en")} `;
  return SKILLS.filter((skill) => {
    const needle = skill.toLocaleLowerCase("en");
    return new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(needle)}([^a-z0-9+#]|$)`, "i").test(normalized);
  });
}

export function analyzeJobOffer(offer: OfferInput): JobAnalysis {
  const description = offer.description ?? "";
  const lines = meaningfulLines(description);
  const mandatory = lines.filter((line) => /\b(required|must|essential|requisito|imprescindible|necesario)\b/i.test(line));
  const preferred = lines.filter((line) => /\b(preferred|nice to have|desirable|valorable|deseable)\b/i.test(line));
  const responsibilities = lines.filter((line) => /\b(build|develop|design|implement|maintain|deliver|crear|desarroll|diseñ|implement|mantener)\b/i.test(line));
  const experience = lines.filter((line) => /\b\d+\+?\s*(years?|años?)\b/i.test(line));
  const education = lines.filter((line) => /\b(degree|bachelor|master|university|grado|licenciatura|ingenier[ií]a)\b/i.test(line));
  const languages = lines.filter((line) => /\b(english|spanish|german|french|ingl[eé]s|español|alem[aá]n|franc[eé]s)\b/i.test(line));
  const allSkills = skillsInText(`${offer.title}\n${description}`);
  const requiredSkills = skillsInText(mandatory.join("\n"));
  const preferredSkills = skillsInText(preferred.join("\n"));
  const salary = offer.salary_min === null && offer.salary_max === null
    ? null
    : [offer.salary_min, offer.salary_max].filter((value) => value !== null).join("–") +
      (offer.salary_currency ? ` ${offer.salary_currency}` : "");

  return {
    job_title: offer.title,
    company: (Array.isArray(offer.companies) ? offer.companies[0]?.name : offer.companies?.name) ?? null,
    responsibilities: responsibilities.slice(0, 12),
    required_skills: requiredSkills,
    preferred_skills: preferredSkills.filter((skill) => !requiredSkills.includes(skill)),
    required_experience: experience.filter((line) => mandatory.includes(line)).slice(0, 8),
    preferred_experience: experience.filter((line) => !mandatory.includes(line)).slice(0, 8),
    education: education.slice(0, 8),
    languages: languages.slice(0, 8),
    location: offer.location_text,
    work_mode: offer.work_mode,
    contract: offer.employment_type,
    salary,
    keywords: allSkills,
    mandatory_requirements: mandatory.slice(0, 20),
  };
}

export function structureResumeText(rawText: string): ResumeStructure {
  const lines = cleanText(rawText).split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: ResumeStructure["sections"] = [];
  let current = { heading: "Perfil", lines: [] as string[] };
  for (const line of lines) {
    if (isHeading(line)) {
      if (current.lines.length) sections.push(current);
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);
  return { sections, lines };
}

export function buildCandidateEvidence(
  profile: ProfileInput,
  resume: ResumeStructure,
  job: JobAnalysis,
): CandidateEvidence {
  const sourceText = resume.lines.join("\n");
  const verifiedSkills = skillsInText(sourceText);
  const requested = [...new Set([...job.required_skills, ...job.preferred_skills, ...job.keywords])];
  const sectionLines = (pattern: RegExp) => resume.sections
    .filter((section) => pattern.test(section.heading))
    .flatMap((section) => section.lines);

  return {
    candidate_profile: profile,
    verified_skills: verifiedSkills,
    requested_skills: requested.map((skill) => ({
      skill,
      status: verifiedSkills.includes(skill) ? "VERIFIED" : "NOT_FOUND",
    })),
    experience_lines: sectionLines(/experience|experiencia|employment|trayectoria/i),
    project_lines: sectionLines(/project|proyecto/i),
    education_lines: sectionLines(/education|educaci[oó]n|formaci[oó]n|studies|estudios/i),
    language_lines: sectionLines(/language|idioma/i),
    source_text: sourceText,
  };
}

export function analyzeGaps(job: JobAnalysis, evidence: CandidateEvidence): GapAnalysis {
  const verified = new Set(evidence.verified_skills);
  const strong = job.required_skills.filter((skill) => verified.has(skill));
  const partial = job.preferred_skills.filter((skill) => verified.has(skill));
  const missing = job.required_skills.filter((skill) => !verified.has(skill));
  const mappedRequirements = [...job.required_skills, ...job.required_experience];
  const unknown = job.mandatory_requirements.filter((requirement) =>
    !mappedRequirements.some((mapped) => requirement.includes(mapped)),
  );
  return {
    strong_matches: strong,
    partial_matches: partial,
    missing_requirements: missing,
    unknown_requirements: unknown,
  };
}

function isHeading(line: string) {
  return line.length <= 50 && (
    /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s/&-]+$/.test(line) ||
    /^(profile|summary|skills|experience|projects|education|languages|perfil|resumen|habilidades|experiencia|proyectos|formaci[oó]n|idiomas)$/i.test(line)
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
