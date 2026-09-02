import "server-only";

import type { ResumeStructure } from "./types";
import { structureResumeText } from "./analysis";

export const RESUME_EXTRACTOR_VERSION = "text-v1";

export async function extractResume(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<{ text: string; structured: ResumeStructure }> {
  let text: string;
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else {
    throw new Error("UNSUPPORTED_RESUME_FORMAT");
  }

  const structured = structureResumeText(text);
  if (!structured.lines.length) throw new Error("RESUME_TEXT_EXTRACTION_FAILED");
  return { text: structured.lines.join("\n"), structured };
}
