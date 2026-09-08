// Run after opening /jobs in `next dev`. Exercises the actual Turbopack module,
// not a Vitest import (which does not reproduce Next's PDF.js worker resolution).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "package.json"));
const root = join(process.cwd(), ".next/dev");
const runtime = require(join(root, "server/chunks/ssr/[turbopack]_runtime.js"))("server/app/(private)/jobs/page.js");
const route = readFileSync(join(root, "server/app/(private)/jobs/page.js"), "utf8");
for (const chunk of route.matchAll(/R\.c\("([^"]+)"\)/g)) runtime.c(chunk[1]);
const { extractResume } = runtime.m("[project]/lib/applications/resume-extractor.server.ts [app-rsc] (ecmascript)").exports;

const PdfPrinter = require("pdfmake");
const fonts = require("pdfmake/build/vfs_fonts");
const printer = new PdfPrinter({ Roboto: { normal: Buffer.from(fonts["Roboto-Regular.ttf"], "base64") } });
const doc = printer.createPdfKitDocument({ content: ["EXPERIENCE", "Synthetic Company — Developer — 2020–2024", "TypeScript applications."] });
const bytes = await new Promise((resolve, reject) => {
  const chunks = [];
  doc.on("data", chunk => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
  doc.end();
});
const result = await extractResume(Uint8Array.from(bytes).buffer, "application/pdf");
if (!result.text.includes("Synthetic Company") || !result.text.includes("2020–2024")) throw new Error("NEXT_PDF_EXTRACTION_REGRESSION");
console.log("PASS: Next.js Turbopack PDF extraction with package-local worker");
