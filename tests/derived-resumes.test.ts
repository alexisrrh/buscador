// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildPrioritizedAdaptation } from "@/lib/applications/evidence-priority";
import { buildResumeContent, PDF_MIME } from "@/lib/derived-resumes/content";
import { RESUME_BODY_FONT_SIZE, renderResumePdf, renderResumePdfWithStrategy, selectResumeDensity } from "@/lib/derived-resumes/renderer.server";
import { generateDerivedResume, loadRenderSource, previewDerivedResume } from "@/lib/derived-resumes/service.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const bootstrap = vi.hoisted(() => vi.fn());
vi.mock("@/lib/applications/professional-evidence-bootstrap.server", () => ({ bootstrapApprovedResumeEvidence: bootstrap }));
const extract = vi.hoisted(() => vi.fn());
vi.mock("@/lib/applications/resume-extractor.server", () => ({ extractResume: extract }));

const source = structureResumeText(`María Ejemplo\nmaria@example.test\nhttps://example.test\nEXPERIENCIA\nExample Company — Web Developer — 2020–2024\nDesarrollo de aplicaciones con TypeScript y SQL.\nPROYECTOS\nPortal de documentación — 2023\nEDUCACIÓN\nUniversidad Ejemplo — Grado en Informática — 2016–2020\nCERTIFICACIONES\nCertificación de ejemplo — 2022\nIDIOMAS\nEspañol nativo; inglés B2`);
const job = analyzeJobOffer({ title: "Web Developer", description: "TypeScript required. AWS preferred.", companies: { name: "Example Hiring" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
const evidence = buildCandidateEvidence({ name: "Frontend Developer", headline: "Web Developer", seniority: null, job_family: null }, source, job);
const adaptation = { professional_summary: "Web Developer", prioritized_skills: ["TypeScript"], ats_keywords: ["SQL"], experience_sections: evidence.experience_lines, project_sections: evidence.project_lines, education: evidence.education_lines, excluded_requested_skills: ["AWS"] };

function mockClient(draft: unknown, resume: unknown) {
  const from = vi.fn((table: string) => {
    const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: table === "application_drafts" ? draft : resume }) };
    return query;
  });
  return { from } as unknown as SupabaseClient;
}

describe("Phase 9A deterministic rendering", () => {
  it("keeps rendering and service secrets behind server-only modules", async () => {
    for (const file of ["service.server.ts", "renderer.server.ts"]) {
      expect(await readFile(`lib/derived-resumes/${file}`, "utf8")).toContain('import "server-only"');
    }
    expect(await readFile("components/derived-resume-panel.tsx", "utf8")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("blocks unapproved drafts and source resumes before generation", async () => {
    const context = { userId: "user", draftId: "draft" };
    await expect(loadRenderSource({ ...context, authClient: mockClient({ status: "DRAFT" }, {}) })).rejects.toMatchObject({ code: "DRAFT_NOT_APPROVED" });
    await expect(loadRenderSource({ ...context, authClient: mockClient({ status: "APPROVED" }, { status: "READY" }) })).rejects.toMatchObject({ code: "SOURCE_RESUME_NOT_APPROVED" });
    await expect(loadRenderSource({ ...context, authClient: mockClient({ status: "APPROVED" }, null) })).rejects.toMatchObject({ code: "SOURCE_RESUME_NOT_FOUND" });
    await expect(generateDerivedResume({ ...context, authClient: mockClient(null, null), format: "DOCX" })).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });
  it("defensively ensures approved-resume evidence before rendering a historical derived CV", async () => {
    const bytes = Buffer.from("synthetic approved source");
    const draft = { id: "draft", status: "APPROVED", source_resume_id: "resume", candidate_profile_id: "profile", resume_adaptation: {}, profile_analysis: {}, job_analysis: {} };
    const resume = { id: "resume", status: "APPROVED", storage_bucket: "private-resumes", storage_path: "source.pdf", mime_type: "application/pdf", file_size_bytes: bytes.byteLength, content_sha256: createHash("sha256").update(bytes).digest("hex") };
    const authClient = mockClient(draft, resume);
    const serviceClient = { storage: { from: () => ({ download: async () => ({ data: new Blob([bytes]), error: null }) }) } } as unknown as SupabaseClient;
    extract.mockResolvedValue({ structured: source });
    bootstrap.mockRejectedValueOnce(new Error("temporary bootstrap failure"));

    await expect(previewDerivedResume({ authClient, serviceClient, userId: "user", draftId: "draft" })).rejects.toMatchObject({ code: "EVIDENCE_BOOTSTRAP_FAILED" });
    expect(bootstrap).toHaveBeenCalledWith(authClient, "user", "profile");
  });
  it("rejects unsupported skills, summaries and altered dates or employers", () => {
    for (const altered of [
      { ...adaptation, prioritized_skills: ["AWS"] },
      { ...adaptation, professional_summary: "10 years of management experience" },
      { ...adaptation, experience_sections: ["Other Company — CEO — 2000–2026"] },
    ]) expect(() => buildResumeContent(altered, evidence, source, job)).toThrow("INVALID_ADAPTATION");
    expect(() => buildResumeContent(adaptation, { ...evidence, requested_skills: [{ skill: "TypeScript", status: "NOT_FOUND" }] }, source, job)).toThrow("INVALID_ADAPTATION");
  });
  it("retains original chronology, education, certificates, language and correct target", () => {
    const content = buildResumeContent(adaptation, evidence, source, job);
    expect(content.sections.flatMap(s => s.lines)).toEqual(expect.arrayContaining([...evidence.experience_lines, ...evidence.education_lines, "Certificación de ejemplo — 2022", "Español nativo; inglés B2"]));
    expect(JSON.stringify(content)).not.toContain("AWS");
    expect(content.target).toBe("Web Developer — Example Hiring");
    expect(content.contact).toContain("maria@example.test");
  });
  it("prioritizes a saved structured identity over resume extraction", () => {
    const saved = { first_name: "Ana", last_name: "Usuario" };
    const fresh = buildCandidateEvidence(evidence.candidate_profile, source, job, saved);
    expect(fresh.identity?.name).toEqual({ value: "Ana Usuario", source: "USER_PROFILE" });
    expect(buildResumeContent(adaptation, evidence, source, job, saved).name).toBe("Ana Usuario");
  });
  it("falls back to verified resume extraction and rejects role labels as identity", () => {
    const extracted = buildCandidateEvidence(evidence.candidate_profile, source, job);
    expect(extracted.identity?.name).toEqual({ value: "María Ejemplo", source: "RESUME_EXTRACTION" });
    expect(buildResumeContent(adaptation, evidence, source, job).name).toBe("María Ejemplo");
    const sourceWithoutName = structureResumeText(source.lines.slice(1).join("\n"));
    expect(() => buildResumeContent(adaptation, { ...evidence, candidate_profile: { ...evidence.candidate_profile, name: "Frontend Developer" } }, sourceWithoutName, job)).toThrow("MISSING_CANDIDATE_NAME");
  });
  it("never treats a filename as candidate identity", () => {
    const sourceWithoutName = { ...structureResumeText(source.lines.slice(1).join("\n")), filename: "Alexis_Rodriguez_CV.pdf" };
    expect(() => buildResumeContent(adaptation, evidence, sourceWithoutName, job)).toThrow("MISSING_CANDIDATE_NAME");
    expect(buildCandidateEvidence(evidence.candidate_profile, sourceWithoutName, job).identity?.name).toBeUndefined();
  });
  it("keeps verified contact links in the header and project links in their project", () => {
    const contactSource = structureResumeText("María Ejemplo\n+34 600 000 000\nmaria123@example.test\nportfolio.example.dev\nPROYECTOS\nPortal\nhttps://project.example.dev\nDesarrollo con TypeScript.\nEXPERIENCIA\nExample Company — Web Developer — 2020–2024\nDesarrollo de aplicaciones con TypeScript y SQL.\nEDUCACIÓN\nUniversidad Ejemplo — Grado en Informática — 2016–2020");
    contactSource.links = [
      { text: "Project", url: "https://project.example.dev" },
      { text: "Project duplicate", url: "https://project.example.dev" },
      { text: "LinkedIn", url: "https://www.linkedin.com/in/maria" },
      { text: "GitHub", url: "https://github.com/maria" },
      { text: "Portfolio", url: "https://portfolio.example.dev" },
      { text: "Portfolio duplicate", url: "https://portfolio.example.dev/" },
    ];
    const contactEvidence = buildCandidateEvidence(evidence.candidate_profile, contactSource, job);
    expect(contactEvidence.identity).toMatchObject({ name: { source: "RESUME_EXTRACTION" }, email: { source: "RESUME_EXTRACTION" }, phone: { source: "RESUME_EXTRACTION" } });
    expect(contactEvidence.identity?.links.map(link => link.label)).toEqual(["LinkedIn", "GitHub", "Portfolio"]);
    expect(contactEvidence.identity?.links.map(link => link.url)).not.toContain("https://project.example.dev/");
    expect(contactEvidence.blocks?.find(block => block.kind === "project")?.links).toContain("https://project.example.dev/");
  });
  it("generates a readable nonempty PDF with correct MIME, hash and pages", async () => {
    const content = buildResumeContent(adaptation, evidence, source, job);
    const result = await renderResumePdf(content);
    expect(result.mime_type).toBe(PDF_MIME);
    expect(result.sha256).toBe(createHash("sha256").update(result.bytes).digest("hex"));
    expect(result.size_bytes).toBeGreaterThan(1000);
    expect(result.pages).toBe(1);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(result.bytes) });
    try {
      const text = (await parser.getText()).text;
      expect(text).toContain("Example Company");
      expect(text).toContain("2020–2024");
      expect(text).toContain("María Ejemplo");
      expect(text).not.toContain("AWS");
      if (process.env.PHASE9A_VISUAL_DIR) {
        await mkdir(process.env.PHASE9A_VISUAL_DIR, { recursive: true });
        await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/synthetic-resume.pdf`, result.bytes);
        const screenshots = await parser.getScreenshot({ scale: 1.5 });
        for (const page of screenshots.pages) await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/page-${page.pageNumber}.png`, page.data);
      }
    } finally { await parser.destroy(); }
  }, 30000);
  it("renders grouped skills, structured projects and clickable link annotations", async () => {
    const content = { name: "María Ejemplo", title: "Web Developer", target: "Web Developer", contact: [], sections: [{ heading: "Resumen profesional", lines: ["Web Developer"] }], header: { metadata: ["maria@example.test"], links: [{ label: "Portfolio", url: "https://example.test" }] }, skill_groups: [{ label: "Frontend", skills: ["TypeScript"] }], projects: [{ name: "Portal", technologies: ["TypeScript"], description: "Portal de documentación", highlights: [], link: "https://example.test" }], training: [], additional_experience: [], languages: [] };
    expect(content.skill_groups).toEqual([{ label: "Frontend", skills: ["TypeScript"] }]);
    expect(content.projects?.[0].name).toBe("Portal");
    const rendered = await renderResumePdf(content);
    expect(rendered.bytes.toString("latin1")).toContain("/URI");
  });
  it("renders the in-memory Canonical golden case from verified Resume, Project and Training evidence", async () => {
    const canonicalSource = structureResumeText(`Alexis Rodríguez
alexis@example.test
https://portafolio-alexis-chi.vercel.app/
https://github.com/alexisrrh
PROYECTOS
Proyecto: NutriSmartCoach
React JavaScript Tailwind CSS Vite Node.js Express REST Supabase PostgreSQL SQL.
Aplicación de nutrición y fitness con análisis nutricional, dietas personalizadas y seguimiento.
Desarrollé la interfaz React para dietas personalizadas.
Integré servicios REST para el análisis nutricional.
Implementé persistencia de datos con Supabase y PostgreSQL.
https://nutrismartcoach.example.test
Proyecto: Consultorio Odontológico LAC
React JavaScript HTML CSS Vite Supabase PostgreSQL SQL.
Gestión de odontograma, pacientes e historiales.
Desarrollé componentes React para la gestión de pacientes.
Implementé autenticación y sincronización de datos.
Proyecto: VHSFlix
React JavaScript Tailwind CSS REST.
SPA de películas con autenticación JWT e integración de APIs TMDB y YouTube.
Desarrollé vistas React para catálogo de películas.
Integré las APIs TMDB y YouTube.
EXPERIENCIA
Instalador de Paneles Solares
Parques Fotovoltaicos
02/2025–12/2025 · Burdeos, Francia
Atención al Cliente
Isadri S.L.
01/2024–01/2025 · Leganés, Madrid
Atención al Cliente
Carrefour Express
10/2022–12/2023 · Arguelles, Madrid
FORMACIÓN
Full Stack Software Developer
4Geeks Academy España
2026
Full Stack With AI
4Geeks Academy España
2026
COMPETENCIAS VERIFICADAS
HTML CSS Git GitHub JavaScript React.
IDIOMAS
Español nativo; inglés B2`);
    const canonicalJob = analyzeJobOffer({ title: "Web Developer", description: "React JavaScript HTML CSS Tailwind CSS Node.js Express REST Supabase PostgreSQL SQL Git GitHub Vite", companies: { name: "Canonical" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
    const canonicalEvidence = buildCandidateEvidence({ name: "Alexis Rodríguez", headline: "Desarrollador web", seniority: null, job_family: null }, canonicalSource, canonicalJob);
    const expected = ["React", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Node.js", "Express", "REST", "Supabase", "PostgreSQL", "SQL", "Git", "GitHub", "Vite"];
    expect(expected.every(skill => canonicalEvidence.verified_skills.includes(skill))).toBe(true);
    const canonicalContent = buildResumeContent(buildPrioritizedAdaptation(canonicalEvidence), canonicalEvidence, canonicalSource, canonicalJob);
    const contentHash = createHash("sha256").update(JSON.stringify(canonicalContent)).digest("hex");
    expect(expected.every(skill => canonicalContent.skill_groups?.flatMap(group => group.skills).includes(skill))).toBe(true);
    expect(canonicalContent.additional_experience).toEqual(expect.arrayContaining([{ role: "Instalador de Paneles Solares", company: "Parques Fotovoltaicos", metadata: "02/2025–12/2025 · Burdeos, Francia" }]));
    expect(canonicalContent.training).toEqual([
      { program: "Full Stack Software Developer", institution: "4Geeks Academy España", date: "2026" },
      { program: "Full Stack With AI", institution: "4Geeks Academy España", date: "2026" },
    ]);
    expect(canonicalContent.projects?.map(project => project.highlights.length)).toEqual([3, 2, 1]);
    for (const project of canonicalContent.projects ?? []) expect(project.highlights).not.toContain(project.description);
    for (const project of canonicalContent.projects ?? []) for (const highlight of project.highlights) expect(canonicalSource.lines).toContain(highlight);
    expect(selectResumeDensity(canonicalContent)).toBe("RELAXED");
    const rendered = await renderResumePdf(canonicalContent);
    expect(rendered.density_mode).toBe("RELAXED");
    expect(createHash("sha256").update(JSON.stringify(canonicalContent)).digest("hex")).toBe(contentHash);
    expect(rendered.pages).toBe(1);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(rendered.bytes) });
    try {
      // Both artifacts are generated in memory. An opt-in visual directory is
      // only for human inspection and is never a DerivedResume persistence.
      const screenshots = await parser.getScreenshot({ scale: 1.5 });
      expect(screenshots.pages[0]?.data.length).toBeGreaterThan(1000);
      if (process.env.PHASE9A_VISUAL_DIR) {
        await mkdir(process.env.PHASE9A_VISUAL_DIR, { recursive: true });
        await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/canonical-reference-template-v1-relaxed.pdf`, rendered.bytes);
        await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/canonical-reference-template-v1-relaxed-page-1.png`, screenshots.pages[0]!.data);
      }
    } finally { await parser.destroy(); }
  }, 30000);
  it("selects relaxed, standard and compact visual density without changing extractable content", async () => {
    const base = { name: "Density Candidate", title: "Web Developer", target: "Offer", contact: [], header: { metadata: [], links: [] }, sections: [{ heading: "Perfil", lines: ["Información verificada."] }], skill_groups: [], training: [], additional_experience: [], languages: [] };
    expect(selectResumeDensity(base)).toBe("RELAXED");
    const projects = Array.from({ length: 8 }, (_, index) => ({ name: `Proyecto ${index}`, technologies: ["React"], description: "Descripción verificada de una aplicación web con información relevante.", highlights: ["Implementé una aportación verificada."], link: null }));
    const medium = { ...base, projects, training: Array.from({ length: 4 }, (_, index) => ({ program: `Formación ${index}`, institution: "Centro", date: "2026" })) };
    const dense = { ...medium, projects: [...projects, ...projects, ...projects], additional_experience: Array.from({ length: 8 }, (_, index) => ({ role: `Rol ${index}`, company: "Empresa", metadata: "2024" })) };
    expect(selectResumeDensity(medium)).toBe("STANDARD");
    expect(selectResumeDensity(dense)).toBe("COMPACT");
    const standard = await renderResumePdfWithStrategy(medium, "PHYSICAL_COLUMNS", "STANDARD");
    const relaxed = await renderResumePdfWithStrategy(medium, "PHYSICAL_COLUMNS", "RELAXED");
    const { PDFParse } = await import("pdf-parse");
    const textOf = async (bytes: Buffer) => { const parser = new PDFParse({ data: new Uint8Array(bytes) }); try { return (await parser.getText()).text; } finally { await parser.destroy(); } };
    const comparable = (text: string) => text.split("\n").map(line => line.trim()).filter(line => line && !/^\d+\s*\/\s*\d+$/.test(line) && !/^-- \d+ of \d+ --$/.test(line)).sort();
    expect(comparable(await textOf(relaxed.bytes))).toEqual(comparable(await textOf(standard.bytes)));
    await expect(renderResumePdf(dense)).resolves.toMatchObject({ density_mode: "COMPACT" });
  }, 30000);
  it("never renders empty project labels or duplicate project description bullets", async () => {
    const content = {
      name: "María Ejemplo", title: "Web Developer", target: "Web Developer", contact: [], header: { metadata: [], links: [] },
      sections: [{ heading: "Resumen", lines: ["Perfil verificable."] }], skill_groups: [], training: [], additional_experience: [], languages: [],
      projects: [{ name: "Proyecto:", technologies: ["TypeScript"], description: "Descripción:", highlights: ["Descripción:", "Aportación verificable."], link: null }],
    };
    const rendered = await renderResumePdf(content);
    const { PDFParse } = await import("pdf-parse"); const parser = new PDFParse({ data: new Uint8Array(rendered.bytes) });
    try {
      const text = (await parser.getText()).text;
      expect(text).not.toMatch(/Proyecto:\s*$/m);
      expect(text).not.toMatch(/Descripción:\s*$/m);
      expect((text.match(/Aportación verificable\./g) ?? [])).toHaveLength(1);
    } finally { await parser.destroy(); }
  });
  it("keeps verified compact experience but excludes unverified experience", () => {
    const verified = buildResumeContent(buildPrioritizedAdaptation(evidence), evidence, source, job);
    expect(verified.additional_experience).toEqual([]);
    expect(() => buildResumeContent({ ...adaptation, additional_experience: ["Invented role", "Invented company", "2026"] }, evidence, source, job)).toThrow("INVALID_ADAPTATION");
  });
  it("compares physical columns with a semantic rail and keeps ATS text selectable", async () => {
    const content = {
      name: "María Ejemplo", title: "Web Developer", target: "Web Developer", contact: [],
      header: { metadata: ["maria@example.test"], links: [{ label: "Portfolio", url: "https://example.test" }] },
      sections: [{ heading: "Resumen profesional", lines: ["Perfil verificable."] }],
      skill_groups: [{ label: "Frontend", skills: ["TypeScript"] }],
      projects: [{ name: "Portal", technologies: ["TypeScript"], description: "Proyecto verificable.", highlights: ["Implementé una vista."], link: "https://example.test" }],
      training: [{ program: "Programa", institution: "Institución", date: "2024" }],
      additional_experience: [{ role: "Rol", company: "Empresa", metadata: "2023" }], languages: ["Español — Nativo"],
    };
    const physical = await renderResumePdfWithStrategy(content, "PHYSICAL_COLUMNS");
    const sequential = await renderResumePdfWithStrategy(content, "SEMANTIC_RAIL");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(physical.bytes) });
    try {
      const text = (await parser.getText()).text;
      for (const value of ["María Ejemplo", "Web Developer", "maria@example.test", "PERFIL PROFESIONAL", "TECNOLOGÍAS", "PROYECTOS DESTACADOS", "EXPERIENCIA", "FORMACIÓN", "IDIOMAS"]) expect(text).toContain(value);
    } finally { await parser.destroy(); }
    const sequentialParser = new PDFParse({ data: new Uint8Array(sequential.bytes) });
    try {
      const text = (await sequentialParser.getText()).text;
      const ordered = ["PERFIL PROFESIONAL", "PROYECTOS DESTACADOS", "EXPERIENCIA", "TECNOLOGÍAS", "FORMACIÓN", "IDIOMAS"];
      for (let index = 1; index < ordered.length; index++) expect(text.indexOf(ordered[index - 1])).toBeLessThan(text.indexOf(ordered[index]));
    } finally { await sequentialParser.destroy(); }
  });
  it("accepts a valid email containing digits without treating it as a phone", async () => {
    const content = { name: "María Ejemplo", title: "Web Developer", target: "Web Developer", contact: [], sections: [{ heading: "Resumen profesional", lines: ["Web Developer"] }], header: { metadata: ["candidate123@example.test", "+34 600 000 000"], links: [] }, skill_groups: [], projects: [], training: [], additional_experience: [], languages: [] };
    await expect(renderResumePdf(content)).resolves.toMatchObject({ pages: 1 });
  });
  it("keeps all rendered body text at 10pt or above", () => {
    expect(RESUME_BODY_FONT_SIZE).toBeGreaterThanOrEqual(10);
  });
  it("paginates long content without dropping lines or leaving blank pages", async () => {
    const content = buildResumeContent(adaptation, evidence, source, job);
    content.sections[2].lines = Array.from({ length: 34 }, (_, i) => `Empresa Ejemplo ${i + 1} — Developer — 2020–2024. Desarrollo y mantenimiento de aplicaciones empresariales con TypeScript y SQL.`);
    const result = await renderResumePdf(content);
    expect(result.pages).toBe(2);
    if (process.env.PHASE9A_VISUAL_DIR) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(result.bytes) });
      try {
        await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/synthetic-long.pdf`, result.bytes);
        for (const page of (await parser.getScreenshot({ scale: 1 })).pages) await writeFile(`${process.env.PHASE9A_VISUAL_DIR}/long-${page.pageNumber}.png`, page.data);
      } finally { await parser.destroy(); }
    }
  }, 30000);
});
