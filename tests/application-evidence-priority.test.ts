// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeGaps, analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { EvidenceBasedApplicationGenerator } from "@/lib/applications/generator";
import { validateGeneratedApplication } from "@/lib/applications/validation";
import { buildResumeContent } from "@/lib/derived-resumes/content";
import type { GeneratedApplication } from "@/lib/applications/types";

const sourceText = `Synthetic Candidate
https://portfolio.example.dev
EXPERIENCIA
Instalador
Solar Example
02/2024 - 12/2024
Montaje de instalaciones.
Atención al Cliente
Retail Example
01/2022 - 01/2024
Atención a clientes.
PROYECTOS
Full Stack Developer
https://project-one.example.dev
Portal One | React · Node.js
Construí una interfaz con React, HTML y CSS.
Integré una API REST y autenticación con Node.js.
Full Stack Developer
https://project-two.example.dev
Portal Two | Python · Flask
Construí una herramienta de consulta con Python.
EDUCACIÓN
Full Stack Software Developer
Academia Ejemplo
2026
IDIOMAS
Español nativo
HERRAMIENTAS
JavaScript HTML5 CSS3 Git React Node.js Python`;

function scenario(text = sourceText, title = "Web Developer") {
  const source = structureResumeText(text);
  source.links = [{ text: "Github", url: "https://github.com/synthetic-candidate" }];
  const job = analyzeJobOffer({ title, description: "Required skills and experience HTML, CSS and JavaScript. Git and TypeScript. Useful experience if you have it React and Python. Who you are Curious and collaborative.", companies: { name: "Synthetic Employer" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
  const evidence = buildCandidateEvidence({ name: "Synthetic Candidate", headline: "desarrollador fronted orientado a produccion", job_family: "software engineer", seniority: null }, source, job);
  return { source, job, evidence, gaps: analyzeGaps(job, evidence) };
}
async function generated(input = scenario()) {
  return { input, output: await new EvidenceBasedApplicationGenerator().generate(input) };
}

describe("evidence priority v2", () => {
  it("separates flattened ATS required and preferred lists", () => {
    const { job } = scenario();
    expect(job.required_skills).toEqual(expect.arrayContaining(["HTML", "CSS", "JavaScript", "Git", "TypeScript"]));
    expect(job.required_skills).not.toContain("Python");
    expect(job.preferred_skills).toEqual(expect.arrayContaining(["React", "Python"]));
  });
  it("ranks required, preferred, role family and remaining verified skills", async () => {
    const { output } = await generated();
    expect(output.resume_adaptation.prioritized_skills).toEqual(["React", "JavaScript", "HTML", "CSS", "Node.js", "REST", "Git"]);
    expect(output.resume_adaptation.technical_skill_groups).toEqual([
      { label: "Frontend", skills: ["React", "JavaScript", "HTML", "CSS"] },
      { label: "Backend", skills: ["Node.js", "REST"] },
      { label: "Herramientas", skills: ["Git"] },
    ]);
    expect(output.resume_adaptation.sections?.find(section => section.key === "secondary-skills")?.lines.join(" ")).toContain("Python");
    expect(output.resume_adaptation.prioritized_skills).not.toContain("TypeScript");
    expect(output.resume_adaptation.excluded_requested_skills).toContain("TypeScript");
  });
  it("does not treat project roles as professional employment", async () => {
    const { input, output } = await generated();
    expect(input.evidence.blocks?.filter(b => b.kind === "project")).toHaveLength(2);
    expect(output.resume_adaptation.experience_sections).toEqual([]);
    expect(output.resume_adaptation.technical_experience_ids).toEqual([]);
    expect(output.resume_adaptation.professional_summary).toContain("experiencia práctica");
    expect(output.resume_adaptation.professional_summary).not.toContain("experiencia profesional");
  });
  it("moves a relevant web project ahead of an earlier less relevant project", async () => {
    const start = sourceText.indexOf("PROYECTOS\n") + "PROYECTOS\n".length;
    const end = sourceText.indexOf("EDUCACIÓN\n");
    const projects = sourceText.slice(start, end).split("Full Stack Developer\n").filter(Boolean);
    const reversed = sourceText.slice(0, start) + projects.reverse().map(p => `Full Stack Developer\n${p}`).join("") + sourceText.slice(end);
    const { input, output } = await generated(scenario(reversed));
    expect(input.evidence.blocks?.find(b => b.id === "project-1")?.title).toContain("Portal Two");
    expect(output.resume_adaptation.selected_project_ids).toEqual(["project-2", "project-1"]);
    expect(output.resume_adaptation.sections!.find(s => s.key === "projects")!.lines[0]).toContain("Portal One");
  });
  it("keeps every nontechnical employer, role and date in a compact additional section", async () => {
    const { output } = await generated();
    expect(output.resume_adaptation.additional_experience).toEqual(["Instalador", "Solar Example", "02/2024 - 12/2024", "Atención al Cliente", "Retail Example", "01/2022 - 01/2024"]);
    expect(output.resume_adaptation.additional_experience).not.toContain("Montaje de instalaciones.");
    const keys = output.resume_adaptation.sections!.map(s => s.key);
    expect(keys.indexOf("projects")).toBeLessThan(keys.indexOf("training"));
    expect(keys.indexOf("training")).toBeLessThan(keys.indexOf("additional"));
  });
  it("reformulates a poor headline using only verified training, projects and skills", async () => {
    const { input, output } = await generated();
    expect(output.resume_adaptation.professional_summary).toBe("Desarrollador web con formación Full Stack y experiencia práctica en proyectos de aplicaciones web. Tecnologías acreditadas: React, JavaScript, HTML, CSS y Node.js.");
    expect(() => validateGeneratedApplication(output, input.evidence)).not.toThrow();
  });
  it("does not claim Full Stack training when only projects mention Full Stack", async () => {
    const { output } = await generated(scenario(sourceText.replace("Full Stack Software Developer\nAcademia Ejemplo\n2026", "Estudios generales\nCentro Ejemplo\n2026")));
    expect(output.resume_adaptation.professional_summary).not.toContain("formación Full Stack");
  });
  it("verifies TypeScript only when it is actually present in project evidence", async () => {
    const absent = await generated();
    expect(absent.input.evidence.requested_skills.find(s => s.skill === "TypeScript")?.status).toBe("NOT_FOUND");
    const present = await generated(scenario(sourceText.replace("Construí una interfaz con React", "Construí una interfaz con TypeScript y React")));
    expect(present.input.evidence.requested_skills.find(s => s.skill === "TypeScript")?.status).toBe("VERIFIED");
    expect(present.output.resume_adaptation.prioritized_skills).not.toContain("TypeScript");
    expect(present.output.resume_adaptation.sections?.find(section => section.key === "secondary-skills")?.lines.join(" ")).toContain("TypeScript");
  });
  it("includes verified portfolio and annotation GitHub without inventing repository URLs", async () => {
    const { input, output } = await generated();
    expect(output.resume_adaptation.portfolio_links).toContain("https://github.com/synthetic-candidate");
    expect(output.resume_adaptation.portfolio_links).toContain("https://portfolio.example.dev/");
    expect(input.evidence.blocks?.filter(b => b.kind === "project").flatMap(b => b.links)).not.toContain("https://github.com/synthetic-candidate");
  });
  it("uses the same validated order and links for the renderer content, without generating a PDF", async () => {
    const { input, output } = await generated();
    const content = buildResumeContent(output.resume_adaptation, input.evidence, input.source, input.job);
    expect(content.sections.map(s => s.heading)).toEqual(output.resume_adaptation.sections!.map(s => s.heading));
    expect(content.contact).toContain("https://github.com/synthetic-candidate");
    expect(content.title).toBe("Desarrollador web");
  });
  it("retains employment-first ordering for another profession and for no technical evidence", async () => {
    const other = await generated(scenario(sourceText, "Customer Service Representative"));
    const keys = other.output.resume_adaptation.sections!.map(s => s.key);
    expect(keys.indexOf("experience")).toBeLessThan(keys.indexOf("projects"));
    expect(other.output.resume_adaptation.experience_sections).toContain("Atención al Cliente");
    const noTech = await generated(scenario("EXPERIENCIA\nAtención al Cliente\nRetail Example\n2024\nAtención a clientes."));
    expect(noTech.output.resume_adaptation.sections!.some(s => s.key === "experience")).toBe(true);
  });
  it("recognizes actual technical employment separately from additional employment", async () => {
    const { output } = await generated(scenario(sourceText.replace("Instalador\nSolar Example", "Frontend Developer\nSoftware Example")));
    expect(output.resume_adaptation.experience_sections).toContain("Frontend Developer");
    expect(output.resume_adaptation.additional_experience).not.toContain("Software Example");
    expect(output.resume_adaptation.additional_experience).toContain("Retail Example");
  });
  it.each(["summary", "skills", "project", "date", "link", "section", "downgrade"])("rejects invented or tampered %s content", async change => {
    const { input, output } = await generated();
    const altered: GeneratedApplication = structuredClone(output);
    const a = altered.resume_adaptation;
    if (change === "summary") a.professional_summary = "Senior developer with 10 years of professional experience";
    if (change === "skills") a.prioritized_skills.push("TypeScript");
    if (change === "project") a.project_sections.push("Used by 10000 users");
    if (change === "date") a.additional_experience![2] = "2010 - 2026";
    if (change === "link") a.portfolio_links!.push("https://github.com/invented-repository");
    if (change === "section") a.sections![2].lines.push("Led a team of 20 developers");
    if (change === "downgrade") delete a.selection_version;
    expect(() => validateGeneratedApplication(altered, input.evidence)).toThrow();
    expect(() => buildResumeContent(a, input.evidence, input.source, input.job)).toThrow("INVALID_ADAPTATION");
  });
  it("revalidates against the source rather than trusting stored evidence alone", async () => {
    const { input, output } = await generated();
    const changedSource = structureResumeText(sourceText.replace("React", "Unrelated"));
    expect(() => buildResumeContent(output.resume_adaptation, input.evidence, changedSource, input.job)).toThrow("INVALID_ADAPTATION");
  });
});
