import type {
  ApplicationGenerationInput,
  CandidateApplicationGenerator,
  GeneratedApplication,
} from "./types";

export class EvidenceBasedApplicationGenerator implements CandidateApplicationGenerator {
  readonly provider = "evidence-based-v1";

  async generate(input: ApplicationGenerationInput): Promise<GeneratedApplication> {
    const { job, evidence, gaps } = input;
    const relevantSkills = evidence.verified_skills.filter((skill) => job.keywords.includes(skill));
    const strengths = relevantSkills.slice(0, 3);
    const profileSummary = evidence.candidate_profile.headline?.trim() ||
      [evidence.candidate_profile.seniority, evidence.candidate_profile.job_family]
        .filter(Boolean).join(" ");
    const company = job.company ? ` en ${job.company}` : "";
    const strengthText = strengths.length
      ? `Mi experiencia verificable incluye ${joinNatural(strengths)}.`
      : "Mi experiencia descrita en el CV guarda relación con los requisitos revisados.";

    return {
      resume_adaptation: {
        professional_summary: profileSummary,
        prioritized_skills: relevantSkills,
        experience_sections: evidence.experience_lines,
        project_sections: evidence.project_lines,
        education: evidence.education_lines,
        ats_keywords: relevantSkills,
        excluded_requested_skills: gaps.missing_requirements,
      },
      recruiter_message: `Hola, me interesa el puesto de ${job.job_title}${company}. ${strengthText} Tras revisar la oferta, considero que estas capacidades pueden aportar una base útil para asumir sus responsabilidades. He preparado mi candidatura utilizando únicamente la experiencia acreditada en mi CV y manteniendo visibles los requisitos que todavía no constan en él. Me gustaría conversar sobre las necesidades del equipo y sobre cómo podría contribuir desde mi experiencia real. Quedo disponible para ampliar cualquier información y comentar mi motivación por la oportunidad.`,
      cover_letter: null,
    };
  }
}

export function buildCoverLetter(input: ApplicationGenerationInput) {
  const { job, evidence } = input;
  const relevant = evidence.verified_skills.filter((skill) => job.keywords.includes(skill)).slice(0, 5);
  const company = job.company ?? "su equipo";
  const evidenceText = relevant.length
    ? `Mi CV acredita experiencia con ${joinNatural(relevant)}, capacidades relacionadas directamente con esta oportunidad.`
    : "Mi experiencia verificable, detallada en el CV adjunto, es relevante para las responsabilidades descritas.";
  return `Estimado equipo de selección de ${company}:\n\nMe gustaría presentar mi candidatura al puesto de ${job.job_title}. ${evidenceText}\n\nDespués de revisar la descripción de la vacante, encuentro una relación clara entre las capacidades verificadas en mi trayectoria y parte de las responsabilidades indicadas. Me interesa especialmente la posibilidad de aportar ese conocimiento en un contexto profesional exigente, colaborar con el equipo y continuar creciendo mediante retos reales. La adaptación que acompaña esta carta reorganiza la información de mi CV para facilitar su revisión, pero conserva íntegramente las empresas, funciones, fechas, estudios y tecnologías que aparecen en el documento original.\n\nTambién considero importante ser transparente sobre los requisitos. Las capacidades que no figuran en mi CV se mantienen identificadas como no acreditadas y no se presentan como experiencia adquirida. Prefiero que una posible conversación sirva para valorar con precisión tanto mis fortalezas actuales como mi capacidad de aprendizaje, sin exagerar ninguna parte de mi perfil.\n\nMe gustaría conocer mejor las prioridades del puesto, la forma de trabajo del equipo y los resultados que esperan de la persona seleccionada durante sus primeros meses. Por mi parte, estaré encantado de explicar con detalle los proyectos y experiencias recogidos en mi currículum, así como responder a cualquier duda relacionada con mi candidatura.\n\nGracias por dedicar tiempo a revisar mi perfil. Quedo a su disposición para mantener una conversación cuando lo consideren oportuno.\n\nAtentamente.`;
}

function joinNatural(values: string[]) {
  return values.length < 2 ? values[0] ?? "" : `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}
