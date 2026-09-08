import "server-only";
import { createHash } from "node:crypto";
import PdfPrinter from "pdfmake";
import bundledFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { DerivedResumeError, PDF_MIME, type ResumeContent } from "./content";

export async function renderResumePdf(content: ResumeContent) {
  validateHeader(content);
  const fonts = bundledFonts as unknown as Record<string, string>;
  const printer = new PdfPrinter({ Roboto: { normal: Buffer.from(fonts["Roboto-Regular.ttf"], "base64"), bold: Buffer.from(fonts["Roboto-Medium.ttf"], "base64"), italics: Buffer.from(fonts["Roboto-Italic.ttf"], "base64"), bolditalics: Buffer.from(fonts["Roboto-MediumItalic.ttf"], "base64") } });
  const heading = (text: string): Content => ({ text, fontSize: 11.5, bold: true, color: "#172033", margin: [0, 6, 0, 2], headlineLevel: 1 });
  const bullet = (text: string): Content => ({ ul: [{ text }], margin: [9, 0, 0, 1] });
  const links = content.header?.links ?? [];
  const body: Content[] = [
    { text: content.name, fontSize: 24, bold: true, color: "#172033", margin: [0, 0, 0, 2] },
    { text: content.title, fontSize: 12.5, bold: true, color: "#3b4963", margin: [0, 0, 0, 4] },
    { text: [...(content.header?.metadata ?? []), ...content.contact.filter(value => !/^https?:\/\//.test(value) && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{7,}\d/i.test(value))].filter((v, i, a) => a.indexOf(v) === i).join(" · "), fontSize: 9.5, color: "#4b5563", margin: [0, 0, 0, 2] },
    links.length ? { text: links.map((link, index) => ({ text: `${index ? " | " : ""}${link.label}`, link: link.url, color: "#1d4ed8", decoration: "underline" })), fontSize: 9.5, margin: [0, 0, 0, 5] } : { text: "", margin: [0, 0, 0, 2] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 0.6, lineColor: "#cbd5e1" }], margin: [0, 0, 0, 1] },
  ];
  const summary = content.sections.find(section => /resumen|summary/i.test(section.heading));
  if (summary?.lines.length) body.push(heading("Resumen profesional"), { text: summary.lines.join(" "), fontSize: 10.2, margin: [0, 0, 0, 1] });
  if (content.skill_groups?.length) {
    body.push(heading("Skills técnicas"));
    for (const group of content.skill_groups) body.push({ text: [{ text: `${group.label}: `, bold: true }, { text: group.skills.join(" · ") }], fontSize: 10, margin: [0, 0, 0, 1] });
  }
  if (content.projects?.length) {
    body.push(heading("Proyectos destacados"));
    for (const project of content.projects) {
      body.push({ stack: [
        { text: project.name, bold: true, fontSize: 10.8, color: "#172033" },
        { text: project.technologies.join(" · "), fontSize: 9.4, color: "#3b4963", margin: [0, 1, 0, 1] },
        ...(project.description ? [{ text: project.description, fontSize: 10, margin: [0, 0, 0, 1] } as Content] : []),
      ], unbreakable: true, margin: [0, 1, 0, 0] });
      body.push(...project.highlights.map(bullet));
      if (project.link) body.push({ text: { text: shortLink(project.link), link: project.link, color: "#1d4ed8", decoration: "underline" }, fontSize: 9.2, margin: [0, 1, 0, 2] });
    }
  }
  for (const section of content.sections.filter(section => /experiencia|experience/i.test(section.heading) && !/adicional|additional/i.test(section.heading))) {
    body.push(heading(section.heading), ...section.lines.map(text => ({ text, fontSize: 10, margin: [0, 1, 0, 1] } as Content)));
  }
  if (content.training?.length) { body.push(heading("Formación")); for (const item of content.training) body.push({ text: [{ text: item.program, bold: true }, { text: `${item.institution ? ` — ${item.institution}` : ""}${item.date ? ` · ${item.date}` : ""}` }], fontSize: 10, margin: [0, 1, 0, 1] }); }
  if (content.additional_experience?.length) { body.push(heading("Experiencia adicional")); for (const item of content.additional_experience) body.push({ text: [{ text: item.role, bold: true }, { text: `${item.company ? ` — ${item.company}` : ""}${item.metadata ? ` · ${item.metadata}` : ""}` }], fontSize: 10, margin: [0, 1, 0, 1] }); }
  if (content.languages?.length) body.push(heading("Idiomas"), { text: content.languages.map(normalizeLanguage).join(" · "), fontSize: 10 });
  const definition: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [38, 26, 38, 26],
    info: { title: `CV — ${content.target}`, author: content.name, creator: "resume-renderer-v3" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.1, color: "#202020" },
    content: body,
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
    footer: (page, total) => ({ text: `${page} / ${total}`, alignment: "center", fontSize: 8.5, color: "#64748b" }),
  };
  const doc = printer.createPdfKitDocument(definition);
  const bytes = await new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; doc.on("data", chunk => chunks.push(chunk)); doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.end(); });
  if (bytes.length < 512 || bytes.length > 10485760 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new DerivedResumeError("UNEXPECTED_SIZE");
  const { PDFParse } = await import("pdf-parse"); const parser = new PDFParse({ data: new Uint8Array(bytes) }); let pages: number;
  try {
    const result = await parser.getText();
    pages = result.total;
    const pageText = result.pages.map(page => page.text.trim());
    if (!pages || pages > 30 || pageText.some(text => text.length < 8)) throw new DerivedResumeError("EMPTY_PDF");
    const extract = normalize(pageText.join("\n"));
    const required = [content.name, content.title, ...(content.header?.metadata ?? []), ...(content.skill_groups ?? []).flatMap(group => group.skills)];
    if (required.some(text => text && !extract.includes(normalize(text)))) throw new DerivedResumeError("PDF_TEXT_MISMATCH");
    const last = pageText.at(-1)?.replace(/\n\d+\s*\/\s*\d+\s*$/, "").trim() ?? "";
    const preceding = pageText.slice(0, -1).join("").length;
    if (pages > 1 && last.length < 48 && preceding > 900) throw new DerivedResumeError("SPARSE_FINAL_PAGE");
  } finally { await parser.destroy(); }
  return { bytes, pages, size_bytes: bytes.length, mime_type: PDF_MIME, sha256: createHash("sha256").update(bytes).digest("hex") };
}
function shortLink(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }
function normalizeLanguage(value: string) { return /^Español\s+Nativo$/i.test(value) ? "Español — Nativo" : value; }
function normalize(value: string) { return value.normalize("NFKC").replace(/\s/g, ""); }
function validateHeader(content: ResumeContent) {
  if (!content.name.trim()) throw new DerivedResumeError("MISSING_CANDIDATE_NAME");
  for (const value of content.header?.metadata ?? []) {
    if (value.includes("@") && !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value)) throw new DerivedResumeError("INVALID_CONTACT");
    if (/\d/.test(value) && !/^\+?\d[\d ()-]{7,}\d$/.test(value)) throw new DerivedResumeError("INVALID_CONTACT");
  }
  for (const link of content.header?.links ?? []) {
    try { if (!/^https?:$/.test(new URL(link.url).protocol)) throw new Error(); } catch { throw new DerivedResumeError("INVALID_CONTACT"); }
  }
}
