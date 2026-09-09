import { describe, expect, it } from "vitest";
import { planAdaptiveResumeLayout } from "@/lib/derived-resumes/layout-plan";
import { GENERATION_VERSION, type ResumeContent } from "@/lib/derived-resumes/content";

const base = (overrides: Partial<ResumeContent>): ResumeContent => ({
  name: "Persona de Prueba", title: "Perfil profesional", target: "Oferta", contact: [], sections: [],
  header: { metadata: [], links: [] }, skill_groups: [], projects: [], training: [], additional_experience: [], languages: [], ...overrides,
});

describe("adaptive resume layout planning", () => {
  it("uses the separately versioned reference template", () => {
    expect(GENERATION_VERSION).toBe("reference-template-v1");
  });

  it("places a software profile's projects in MAIN and technologies in SIDEBAR", () => {
    const plan = planAdaptiveResumeLayout(base({
      title: "Web Developer", sections: [{ heading: "Resumen profesional", lines: ["Perfil verificable."] }],
      skill_groups: [{ label: "Frontend", skills: ["JavaScript"] }],
      projects: [{ name: "Portal", technologies: ["JavaScript"], description: "Proyecto.", highlights: [], link: null }],
      training: [{ program: "Programa", institution: "Centro", date: "2024" }], languages: ["Español — Nativo"],
    }));
    expect(plan.profile).toBe("TECH");
    expect(plan.main.map(section => section.type)).toEqual(["SUMMARY", "PROJECTS"]);
    expect(plan.sidebar.map(section => section.title)).toEqual(["Tecnologías", "Formación", "Idiomas"]);
  });

  it("uses verified clinical competencies instead of a hardcoded technology section", () => {
    const plan = planAdaptiveResumeLayout(base({
      title: "Enfermera", sections: [{ heading: "Perfil profesional", lines: ["Experiencia clínica verificable."] }, { heading: "Experiencia clínica", lines: ["Unidad hospitalaria."] }],
      skill_groups: [{ label: "Procedimientos", skills: ["Triage"] }], training: [{ program: "Grado en Enfermería", institution: "Universidad", date: "2022" }], languages: ["Español — Nativo"],
    }));
    expect(plan.profile).toBe("HEALTHCARE");
    expect(plan.main.map(section => section.type)).toEqual(["SUMMARY", "EXPERIENCE"]);
    expect(plan.sidebar[0]).toMatchObject({ type: "SKILLS", title: "Competencias clínicas" });
    expect(plan.sidebar.map(section => section.title)).not.toContain("Tecnologías");
  });

  it("uses systems and tools for a support profile", () => {
    const plan = planAdaptiveResumeLayout(base({
      title: "Técnico de soporte IT", sections: [{ heading: "Perfil", lines: ["Soporte verificable."] }, { heading: "Experiencia", lines: ["Atención a usuarios."] }],
      skill_groups: [{ label: "Sistemas", skills: ["Windows"] }], languages: ["Inglés — Intermedio"],
    }));
    expect(plan.profile).toBe("SUPPORT");
    expect(plan.sidebar[0]).toMatchObject({ type: "SKILLS", title: "Sistemas y herramientas", placement: "SIDEBAR" });
  });

  it("omits empty sections and keeps a usable no-photo fallback", () => {
    const plan = planAdaptiveResumeLayout(base({ sections: [{ heading: "Perfil", lines: ["Información verificada."] }] }));
    expect(plan.main.map(section => section.type)).toEqual(["SUMMARY"]);
    expect(plan.sidebar).toEqual([]);
    expect(plan.main.every(section => (section.lines?.length ?? section.groups?.length ?? section.projects?.length ?? section.training?.length ?? section.additionalExperience?.length ?? 0) > 0)).toBe(true);
  });
});
