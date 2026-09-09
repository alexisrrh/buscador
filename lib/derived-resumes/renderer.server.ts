import "server-only";
import { createHash } from "node:crypto";
import PdfPrinter from "pdfmake";
import bundledFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { DerivedResumeError, PDF_MIME, type ResumeContent } from "./content";
import { planAdaptiveResumeLayout, type PlannedResumeSection } from "./layout-plan";

export const RESUME_BODY_FONT_SIZE = 10;
export type ResumeRenderStrategy = "PHYSICAL_COLUMNS" | "SEMANTIC_RAIL";
export type ResumeDensityMode = "RELAXED" | "STANDARD" | "COMPACT";
type DensityStyle = { body: number; lineHeight: number; name: number; headline: number; mainHeading: number; sidebarHeading: number; item: number; metadata: number; sectionTop: number; sectionContent: number; projectGap: number; itemGap: number; bodyTop: number };
const INK = "#172033", MUTED = "#526176", ACCENT = "#1E5B93", RULE = "#B9CAD8";
const MAIN_WIDTH = 338, SIDEBAR_WIDTH = 166;

const DENSITY: Record<ResumeDensityMode, DensityStyle> = {
  RELAXED: { body: 10.35, lineHeight: 1.22, name: 27, headline: 13, mainHeading: 11.5, sidebarHeading: 10.5, item: 11, metadata: 9.5, sectionTop: 11, sectionContent: 5, projectGap: 7, itemGap: 7, bodyTop: 13 },
  STANDARD: { body: 10, lineHeight: 1.13, name: 26, headline: 12.5, mainHeading: 11.3, sidebarHeading: 10.1, item: 10.8, metadata: 9.5, sectionTop: 7, sectionContent: 4, projectGap: 3, itemGap: 4, bodyTop: 8 },
  COMPACT: { body: 9.5, lineHeight: 1.05, name: 25, headline: 12, mainHeading: 11, sidebarHeading: 10, item: 10.5, metadata: 9.25, sectionTop: 5, sectionContent: 3, projectGap: 2, itemGap: 3, bodyTop: 5 },
};

export function selectResumeDensity(content: ResumeContent): ResumeDensityMode {
  // Structured projects/training/experience are represented separately below;
  // do not count their source section twice when estimating the rendered page.
  const unstructured = content.sections.filter(section => !/skills|proyecto|project|experiencia|experience|formaci[oó]n|education|idioma|language|resumen|summary|perfil|profile/i.test(section.heading));
  const summary = content.sections.filter(section => /resumen|summary|perfil|profile/i.test(section.heading));
  const units = ([...unstructured, ...summary].reduce((sum, section) => sum + section.lines.join(" ").length / 72, 0)) +
    (content.projects ?? []).reduce((sum, project) => sum + 1.7 + project.description.length / 90 + project.highlights.reduce((inner, item) => inner + item.length / 88, 0), 0) +
    (content.additional_experience?.length ?? 0) * 1.15 + (content.training?.length ?? 0) * 1.45 +
    (content.skill_groups?.length ?? 0) * 0.65 + (content.languages?.length ?? 0) * 0.35;
  if (units < 28) return "RELAXED";
  if (units < 43) return "STANDARD";
  return "COMPACT";
}

/** reference-template-v1: strong header, dominant main zone and secondary rail. */
export async function renderResumePdf(content: ResumeContent) {
  const preferred = selectResumeDensity(content);
  const first = await renderResumePdfWithStrategy(content, "PHYSICAL_COLUMNS", preferred);
  if (first.pages === 1 || preferred === "COMPACT") return first;
  // Presentation compacts only after the selected relaxed/standard rendering
  // demonstrably needs another page; ResumeContent is never altered here.
  return renderResumePdfWithStrategy(content, "PHYSICAL_COLUMNS", preferred === "RELAXED" ? "STANDARD" : "COMPACT");
}

// Exported only for deterministic ATS comparison tests. Persisted artifacts use
// the physical-column template above.
export async function renderResumePdfWithStrategy(content: ResumeContent, strategy: ResumeRenderStrategy, density = selectResumeDensity(content)) {
  validateHeader(content);
  const fonts = bundledFonts as unknown as Record<string, string>;
  const printer = new PdfPrinter({ Roboto: { normal: Buffer.from(fonts["Roboto-Regular.ttf"], "base64"), bold: Buffer.from(fonts["Roboto-Medium.ttf"], "base64"), italics: Buffer.from(fonts["Roboto-Italic.ttf"], "base64"), bolditalics: Buffer.from(fonts["Roboto-MediumItalic.ttf"], "base64") } });
  const metadata = [...(content.header?.metadata ?? []), ...content.contact.filter(value => !/^https?:\/\//.test(value) && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{7,}\d/i.test(value))].filter((value, index, values) => values.indexOf(value) === index);
  const plan = planAdaptiveResumeLayout(content);
  const style = DENSITY[density];
  const main = plan.main.flatMap(section => renderSection(section, "MAIN", MAIN_WIDTH, style));
  const sidebar = plan.sidebar.flatMap(section => renderSection(section, "SIDEBAR", SIDEBAR_WIDTH, style));
  const body = strategy === "PHYSICAL_COLUMNS" ? physicalColumns(main, sidebar, style.bodyTop) : semanticRail(main, sidebar, style.bodyTop);
  const definition: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [38, 28, 38, 28],
    info: { title: `CV — ${content.target}`, author: content.name, creator: "reference-template-v1" },
    defaultStyle: { font: "Roboto", fontSize: style.body, lineHeight: style.lineHeight, color: INK },
    content: [...headerContent(content, metadata, style), ...body],
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
    footer: (page, total) => ({ text: `${page} / ${total}`, alignment: "center", fontSize: 8.5, color: MUTED }),
  };
  const doc = printer.createPdfKitDocument(definition);
  const bytes = await new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; doc.on("data", chunk => chunks.push(chunk)); doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.end(); });
  if (bytes.length < 512 || bytes.length > 10485760 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new DerivedResumeError("UNEXPECTED_SIZE");
  const { PDFParse } = await import("pdf-parse"); const parser = new PDFParse({ data: new Uint8Array(bytes) }); let pages: number;
  try {
    const result = await parser.getText(); pages = result.total;
    const pageText = result.pages.map(page => page.text.trim());
    if (!pages || pages > 30 || pageText.some(text => text.length < 8)) throw new DerivedResumeError("EMPTY_PDF");
    const extract = normalize(pageText.join("\n"));
    const required = [content.name, content.title, ...(content.header?.metadata ?? []), ...(content.skill_groups ?? []).flatMap(group => group.skills)];
    if (required.some(text => text && !extract.includes(normalize(text)))) throw new DerivedResumeError("PDF_TEXT_MISMATCH");
    const last = pageText.at(-1)?.replace(/\n\d+\s*\/\s*\d+\s*$/, "").trim() ?? "", preceding = pageText.slice(0, -1).join("").length;
    if (pages > 1 && last.length < 48 && preceding > 900) throw new DerivedResumeError("SPARSE_FINAL_PAGE");
  } finally { await parser.destroy(); }
  return { bytes, pages, size_bytes: bytes.length, mime_type: PDF_MIME, sha256: createHash("sha256").update(bytes).digest("hex"), density_mode: density };
}

function physicalColumns(main: Content[], sidebar: Content[], bodyTop = 8): Content[] {
  if (!sidebar.length) return [{ stack: main, margin: [0, bodyTop, 0, 0] }];
  return [{ columns: [
    { width: MAIN_WIDTH, stack: main },
    { width: SIDEBAR_WIDTH, stack: sidebar, margin: [10, 0, 9, 0] },
  ], columnGap: 14, margin: [0, bodyTop, 0, 0] }];
}

// Alternative composition: source-order main then rail. It is kept testable to
// compare against physical columns without altering persisted PDFs.
function semanticRail(main: Content[], sidebar: Content[], bodyTop = 8): Content[] {
  return [{ stack: [...main, ...(sidebar.length ? [
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 518, y2: 0, lineWidth: 0.85, lineColor: RULE }], margin: [0, 7, 0, 4] } as Content,
    { stack: sidebar, margin: [10, 0, 9, 0] } as Content,
  ] : [])], margin: [0, bodyTop, 0, 0] }];
}

function headerContent(content: ResumeContent, metadata: string[], style: DensityStyle): Content[] {
  const links = content.header?.links ?? [];
  const details: Content[] = [
    { text: content.name, fontSize: style.name, bold: true, color: INK, characterSpacing: 0.15, margin: [0, 0, 0, 2] },
    { text: content.title, fontSize: style.headline, bold: true, color: ACCENT, margin: [0, 0, 0, 7] },
    ...(metadata.length ? [{ text: metadata.join("  •  "), fontSize: style.metadata, color: MUTED, margin: [0, 0, 0, 4] } as Content] : []),
    ...(links.length ? [{ text: links.map((link, index) => ({ text: `${index ? "   |   " : ""}${link.label}`, link: link.url, color: ACCENT, decoration: "underline" })), fontSize: style.metadata, margin: [0, 0, 0, 4] } as Content] : []),
  ];
  const photo = authorizedPhoto(content.photo?.data_url);
  const row: Content = photo ? { columns: [{ width: "*", stack: details }, { width: 68, image: photo, fit: [62, 62], alignment: "right" }], columnGap: 12 } : { stack: details };
  return [{ stack: [row, { canvas: [{ type: "line", x1: 0, y1: 0, x2: 518, y2: 0, lineWidth: 1.25, lineColor: ACCENT }], margin: [0, 5, 0, 0] }] }];
}

function renderSection(section: PlannedResumeSection, placement: "MAIN" | "SIDEBAR", width: number, style: DensityStyle): Content[] {
  const compact = placement === "SIDEBAR";
  const heading: Content[] = [
    { text: section.title.toLocaleUpperCase("es"), fontSize: compact ? style.sidebarHeading : style.mainHeading, bold: true, color: ACCENT, characterSpacing: 0.35, margin: [0, compact ? style.sectionTop - 2 : style.sectionTop, 0, 2], headlineLevel: 1 },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: compact ? 0.7 : 0.85, lineColor: RULE }], margin: [0, 0, 0, style.sectionContent] },
  ];
  if (section.type === "SUMMARY") return [...heading, { text: section.lines?.join(" ") ?? "", fontSize: style.body, color: INK, margin: [0, 0, 0, style.projectGap] }];
  if (section.type === "SKILLS") return [...heading, ...(section.groups ?? []).map(group => ({ text: [{ text: `${group.label}: `, bold: true, color: INK }, { text: group.skills.join(" · "), color: MUTED }], fontSize: style.metadata, margin: [0, 0, 0, style.itemGap] } as Content))];
  if (section.type === "PROJECTS") return [...heading, ...(section.projects ?? []).map((project, index) => projectCard(project, width, style, index))];
  if (section.type === "EDUCATION") return [...heading, ...(section.training ?? []).map(item => ({ stack: [
    ...(meaningful(item.program) ? [{ text: item.program, bold: true, color: INK, fontSize: style.metadata + 0.25 } as Content] : []),
    ...(meaningful(item.institution) ? [{ text: item.institution, color: MUTED, fontSize: style.metadata } as Content] : []),
    ...(meaningful(item.date) ? [{ text: item.date, color: MUTED, fontSize: style.metadata } as Content] : []),
  ], margin: [0, 0, 0, style.itemGap + 2] } as Content))];
  if (section.type === "ADDITIONAL_EXPERIENCE") return [...heading, ...(section.additionalExperience ?? []).map(item => ({ stack: [{ text: item.role, bold: true, color: INK, fontSize: style.item }, { text: [item.company, item.metadata].filter(Boolean).join(" · "), color: MUTED, fontSize: style.metadata }], margin: [0, 0, 0, style.itemGap + 2] } as Content))];
  if (section.type === "LANGUAGES") return [...heading, { text: (section.lines ?? []).map(normalizeLanguage).join(" · "), fontSize: style.metadata, color: INK, margin: [0, 0, 0, style.itemGap] }];
  return [...heading, ...(section.lines ?? []).map(line => ({ text: line, fontSize: compact ? style.metadata : style.body, color: section.type === "CERTIFICATIONS" ? MUTED : INK, margin: [0, 0, 0, style.itemGap] } as Content))];
}

function projectCard(project: NonNullable<PlannedResumeSection["projects"]>[number], width: number, style: DensityStyle, index: number): Content {
  const name = project.name.replace(/^proyecto\s*:\s*/i, "").trim();
  const description = meaningful(project.description) ? project.description : "";
  return { stack: [
    ...(name ? [{ text: name, bold: true, fontSize: style.item + (index === 0 ? 0.2 : 0), color: INK, margin: [0, index ? style.projectGap : 1, 0, 2] } as Content] : []),
    ...(project.technologies.length ? [{ text: project.technologies.join(" · "), fontSize: style.metadata, color: ACCENT, margin: [0, 0, 0, style.sectionContent] } as Content] : []),
    ...(description ? [{ text: description, fontSize: style.body, color: INK, margin: [0, 0, 0, style.sectionContent] } as Content] : []),
    ...project.highlights.filter(meaningful).filter(text => text.trim() !== description.trim()).map(text => ({ ul: [{ text }], fontSize: style.body, margin: [11, 0, 0, style.itemGap - 1] } as Content)),
    ...(project.link ? [{ text: { text: shortLink(project.link), link: project.link, color: ACCENT, decoration: "underline" }, fontSize: style.metadata, margin: [0, style.sectionContent, 0, style.itemGap] } as Content] : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.35, lineColor: RULE }], margin: [0, style.sectionContent, 0, style.projectGap] },
  ] };
}

function authorizedPhoto(value: string | undefined) { return value && /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=]+$/i.test(value) ? value : null; }
function meaningful(value: string) { return !/^(?:proyecto|experiencia|stack|descripci[oó]n)\s*:?$/i.test(value.trim()); }
function shortLink(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }
function normalizeLanguage(value: string) { return /^Español\s+Nativo$/i.test(value) ? "Español — Nativo" : value; }
function normalize(value: string) { return value.normalize("NFKC").replace(/\s/g, ""); }
function validateHeader(content: ResumeContent) {
  if (!content.name.trim()) throw new DerivedResumeError("MISSING_CANDIDATE_NAME");
  for (const value of content.header?.metadata ?? []) {
    if (value.includes("@")) { if (!/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value)) throw new DerivedResumeError("INVALID_CONTACT"); continue; }
    if (/\d/.test(value) && !/^\+?\d[\d ()-]{7,}\d$/.test(value)) throw new DerivedResumeError("INVALID_CONTACT");
  }
  for (const link of content.header?.links ?? []) { try { if (!/^https?:$/.test(new URL(link.url).protocol)) throw new Error(); } catch { throw new DerivedResumeError("INVALID_CONTACT"); } }
}
