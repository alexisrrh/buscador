import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_BYTES,
  listFromInput,
  validateResumeFile,
  validateScores,
} from "@/lib/validation";

describe("shared input validation", () => {
  it("normalizes comma and line separated lists", () => {
    expect(listFromInput("React, TypeScript\nNode.js")).toEqual([
      "React",
      "TypeScript",
      "Node.js",
    ]);
  });

  it("accepts ordered scores and rejects invalid ordering", () => {
    expect(() => validateScores(70, 80, 90)).not.toThrow();
    expect(() => validateScores(90, 80, 95)).toThrow(/scores/);
    expect(() => validateScores(70, 80, 101)).toThrow(/scores/);
  });

  it("accepts PDF and DOCX under 10 MiB", () => {
    expect(validateResumeFile({ name: "resume.pdf", type: "application/pdf", size: 1024 })).toBeNull();
    expect(validateResumeFile({ name: "resume.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 2048 })).toBeNull();
  });

  it("rejects invalid MIME and excessive size", () => {
    expect(validateResumeFile({ name: "resume.txt", type: "text/plain", size: 100 })).toMatch(/PDF o DOCX/);
    expect(validateResumeFile({ name: "resume.pdf", type: "application/pdf", size: MAX_RESUME_BYTES + 1 })).toMatch(/10 MiB/);
  });

  it("rejects path-like filenames", () => {
    expect(validateResumeFile({ name: "../resume.pdf", type: "application/pdf", size: 100 })).toMatch(/inválido/);
  });
});
