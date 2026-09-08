// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { analyzeJobOffer, buildCandidateEvidence, structureResumeText } from "@/lib/applications/analysis";
import { buildResumeContent, PDF_MIME } from "@/lib/derived-resumes/content";
import { renderResumePdf } from "@/lib/derived-resumes/renderer.server";
import { generateDerivedResume, loadRenderSource } from "@/lib/derived-resumes/service.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const source = structureResumeText(`María Ejemplo\nmaria@example.test\nhttps://example.test\nEXPERIENCIA\nExample Company — Web Developer — 2020–2024\nDesarrollo de aplicaciones con TypeScript y SQL.\nPROYECTOS\nPortal de documentación — 2023\nEDUCACIÓN\nUniversidad Ejemplo — Grado en Informática — 2016–2020\nCERTIFICACIONES\nCertificación de ejemplo — 2022\nIDIOMAS\nEspañol nativo; inglés B2`);
const job = analyzeJobOffer({ title: "Web Developer", description: "TypeScript required. AWS preferred.", companies: { name: "Example Hiring" }, location_text: null, work_mode: null, employment_type: null, salary_min: null, salary_max: null, salary_currency: null });
const evidence = buildCandidateEvidence({ name: "María Ejemplo", headline: "Web Developer", seniority: null, job_family: null }, source, job);
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
