import "server-only";

import type { ResumeStructure } from "./types";
import { structureResumeText } from "./analysis";
import { safeEvidenceUrl } from "./evidence-priority";

export const RESUME_EXTRACTOR_VERSION = "text-v2-links";

export async function extractResume(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<{ text: string; structured: ResumeStructure }> {
  let text: string;
  const links: NonNullable<ResumeStructure["links"]> = [];
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      text = (await parser.getText()).text;
      for (const page of (await parser.getInfo({ parsePageInfo: true })).pages) {
        for (const link of page.links) {
          const url = safeEvidenceUrl(link.url);
          const label = link.text.replaceAll("\u0000", " ").trim();
          if (url && !links.some(existing => existing.url === url && existing.text === label)) links.push({ text: label, url });
        }
      }
    } finally {
      await parser.destroy();
    }
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else {
    throw new Error("UNSUPPORTED_RESUME_FORMAT");
  }

  // Some PDFs emit NUL for unmapped glyphs. PostgreSQL text/jsonb cannot store
  // U+0000 (22P05). A NUL immediately before an international phone sequence
  // is the missing plus glyph in affected PDFs; preserve that verified prefix.
  const structured = structureResumeText(normalizeExtractedText(text));
  structured.links = links;
  if (!structured.lines.length) throw new Error("RESUME_TEXT_EXTRACTION_FAILED");
  return { text: structured.lines.join("\n"), structured };
}

export function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000(?=\d{1,3}(?:[ ()-]?\d){7,})/g, "+")
    .replaceAll("\u0000", " ");
}
