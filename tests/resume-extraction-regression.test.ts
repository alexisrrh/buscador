// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { extractResume } from "@/lib/applications/resume-extractor.server";

const destroy = vi.fn();
vi.mock("pdf-parse", () => ({ PDFParse: class {
  getText() { return Promise.resolve({ text: "EXPERIENCE\nDeveloper — Company — 2020–2024\nReact\u0000TypeScript\n\u0000EDUCATION\nUniversity — 2020" }); }
  getInfo() { return Promise.resolve({ pages: [{ links: [{ text: "\u0000Github", url: "https://github.com/synthetic" }, { text: "Unsafe", url: "javascript:alert(1)" }] }] }); }
  destroy = destroy;
} }));

describe("PDF text persistence regression", () => {
  it("removes PostgreSQL-incompatible NULs from both text and JSON without joining words", async () => {
    const result = await extractResume(new ArrayBuffer(0), "application/pdf");
    expect(result.text).not.toContain("\u0000");
    expect(JSON.stringify(result.structured)).not.toContain("\\u0000");
    expect(result.text).toContain("React TypeScript");
    expect(result.structured.sections).toContainEqual({ heading: "EDUCATION", lines: ["University — 2020"] });
    expect(result.text).toContain("Developer — Company — 2020–2024");
    expect(result.structured.links).toEqual([{ text: "Github", url: "https://github.com/synthetic" }]);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
