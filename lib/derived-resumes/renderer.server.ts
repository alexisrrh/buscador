import "server-only";
import { createHash } from "node:crypto";
import PdfPrinter from "pdfmake";
import bundledFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { DerivedResumeError, PDF_MIME, type ResumeContent } from "./content";

export async function renderResumePdf(content: ResumeContent) {
  const fonts = bundledFonts as unknown as Record<string, string>;
  const printer = new PdfPrinter({ Roboto: {
    normal: Buffer.from(fonts["Roboto-Regular.ttf"], "base64"),
    bold: Buffer.from(fonts["Roboto-Medium.ttf"], "base64"),
    italics: Buffer.from(fonts["Roboto-Italic.ttf"], "base64"),
    bolditalics: Buffer.from(fonts["Roboto-MediumItalic.ttf"], "base64"),
  } });
  const body: Content[] = [
    { text: content.name, fontSize: 22, bold: true, margin: [0, 0, 0, 6] },
    { text: content.title, fontSize: 12, margin: [0, 0, 0, 6] },
    { text: content.contact.join(" | "), fontSize: 9, margin: [0, 0, 0, 5] },
    { text: `Candidatura: ${content.target}`, fontSize: 9, color: "#444444", margin: [0, 0, 0, 8] },
  ];
  for (const section of content.sections) {
    body.push({ text: section.heading, style: "heading", headlineLevel: 1 });
    body.push(...section.lines.map(text => ({ stack: [{ text }], unbreakable: text.length <= 800, margin: [0, 0, 0, 4] } as Content)));
  }
  const definition: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [45, 40, 45, 40],
    info: { title: `CV — ${content.target}`, author: content.name, creator: "resume-renderer-v1" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.15, color: "#202020" },
    styles: { heading: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] } },
    content: body,
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
    footer: (page, total) => ({ text: `${page} / ${total}`, alignment: "center", fontSize: 8, color: "#666666" }),
  };
  const doc = printer.createPdfKitDocument(definition);
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
  if (bytes.length < 512 || bytes.length > 10485760) throw new DerivedResumeError("UNEXPECTED_SIZE");
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new DerivedResumeError("EMPTY_PDF");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  let pages: number;
  try {
    const result = await parser.getText();
    pages = result.total;
    if (!pages || pages > 30 || result.pages.some(page => page.text.trim().length < 8)) throw new DerivedResumeError("EMPTY_PDF");
    const normalize = (value: string) => value.normalize("NFKC").replace(/\s/g, "");
    const extracted = normalize(result.pages.map(page => page.text.replace(/\n\d+\s*\/\s*\d+\s*$/, "")).join(""));
    const expected = [content.name, content.title, content.target, ...content.contact, ...content.sections.flatMap(section => [section.heading, ...section.lines])];
    if (expected.some(text => !extracted.includes(normalize(text)))) throw new DerivedResumeError("PDF_TEXT_MISMATCH");
  } finally { await parser.destroy(); }
  return { bytes, pages, size_bytes: bytes.length, mime_type: PDF_MIME, sha256: createHash("sha256").update(bytes).digest("hex") };
}
