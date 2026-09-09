import type { ResumeContent } from "./content";

export type ResumeSectionType = "SUMMARY" | "SKILLS" | "PROJECTS" | "EXPERIENCE" | "ADDITIONAL_EXPERIENCE" | "EDUCATION" | "CERTIFICATIONS" | "LANGUAGES" | "OTHER_VERIFIED";
export type ResumePlacement = "MAIN" | "SIDEBAR" | "FULL_WIDTH";
export type PlannedResumeSection = {
  type: ResumeSectionType;
  title: string;
  priority: number;
  placement: ResumePlacement;
  lines?: string[];
  groups?: NonNullable<ResumeContent["skill_groups"]>;
  projects?: NonNullable<ResumeContent["projects"]>;
  training?: NonNullable<ResumeContent["training"]>;
  additionalExperience?: NonNullable<ResumeContent["additional_experience"]>;
};
export type ResumeLayoutPlan = {
  main: PlannedResumeSection[];
  sidebar: PlannedResumeSection[];
  profile: "TECH" | "HEALTHCARE" | "SUPPORT" | "GENERAL";
};

const section = (value: PlannedResumeSection | null) => value;

export function planAdaptiveResumeLayout(content: ResumeContent): ResumeLayoutPlan {
  const profile = profileKind(content);
  const summary = content.sections.find(item => /resumen|summary|perfil|profile/i.test(item.heading));
  const experience = content.sections.filter(item => /experiencia|experience/i.test(item.heading) && !/adicional|additional/i.test(item.heading));
  const certifications = content.sections.filter(item => /certific|licen[cs]/i.test(item.heading));
  const skillGroups = content.skill_groups?.filter(group => group.skills.length) ?? [];
  const main = [
    section(summary?.lines.length ? { type: "SUMMARY", title: "Perfil profesional", priority: 1, placement: "MAIN", lines: summary.lines } : null),
    section(content.projects?.length ? { type: "PROJECTS", title: "Proyectos destacados", priority: profile === "TECH" ? 2 : 3, placement: "MAIN", projects: content.projects } : null),
    ...experience.map((item, index) => section(item.lines.length ? { type: "EXPERIENCE", title: item.heading, priority: profile === "TECH" ? 3 + index : 2 + index, placement: "MAIN", lines: item.lines } : null)),
    // The content budget deliberately retains compact verified employment after
    // the offer-relevant projects. It is omitted only when there is no such
    // evidence, never merely because it is non-technical.
    section(content.additional_experience?.length ? { type: "ADDITIONAL_EXPERIENCE", title: "Experiencia", priority: 7, placement: "MAIN", additionalExperience: content.additional_experience } : null),
  ].filter((value): value is PlannedResumeSection => Boolean(value));
  const sidebar = [
    section(skillGroups.length ? { type: "SKILLS", title: skillTitle(profile), priority: 1, placement: "SIDEBAR", groups: skillGroups } : null),
    section(content.training?.length ? { type: "EDUCATION", title: "Formación", priority: 2, placement: "SIDEBAR", training: content.training } : null),
    section(certifications.flatMap(item => item.lines).length ? { type: "CERTIFICATIONS", title: "Certificaciones", priority: 3, placement: "SIDEBAR", lines: certifications.flatMap(item => item.lines) } : null),
    section(content.languages?.length ? { type: "LANGUAGES", title: "Idiomas", priority: 4, placement: "SIDEBAR", lines: content.languages } : null),
  ].filter((value): value is PlannedResumeSection => Boolean(value));
  if (!main.length && sidebar.length) main.push(...sidebar.splice(0));
  return { main: main.sort((a, b) => a.priority - b.priority), sidebar: sidebar.sort((a, b) => a.priority - b.priority), profile };
}

function profileKind(content: ResumeContent): ResumeLayoutPlan["profile"] {
  const title = content.title.toLowerCase();
  if (/enfermer|nurs|cl[ií]nic|sanitari/.test(title)) return "HEALTHCARE";
  if (/soporte|support|help\s*desk|network|redes|sistemas/.test(title)) return "SUPPORT";
  if (/developer|desarrollador|software|frontend|backend|web/.test(title)) return "TECH";
  const text = [title, ...(content.skill_groups ?? []).flatMap(group => [group.label, ...group.skills]), ...content.sections.flatMap(section => section.lines)].join(" ").toLowerCase();
  if (/enfermer|nurs|sanitari|paciente|hospital/.test(text)) return "HEALTHCARE";
  if (/soporte|support|help\s*desk|network|redes|sistemas/.test(text)) return "SUPPORT";
  if (content.projects?.length || content.skill_groups?.length || /developer|desarrollador|software|frontend|backend|web/.test(text)) return "TECH";
  return "GENERAL";
}

function skillTitle(profile: ResumeLayoutPlan["profile"]) {
  if (profile === "HEALTHCARE") return "Competencias clínicas";
  if (profile === "SUPPORT") return "Sistemas y herramientas";
  if (profile === "TECH") return "Tecnologías";
  return "Competencias";
}
