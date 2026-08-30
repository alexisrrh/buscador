import { describe, expect, it } from "vitest";
import {
  canonicalizeJobUrl,
  generateDescriptionHash,
  normalizeCompanyName,
  normalizeJobTitle,
} from "@/lib/job-offers/canonicalization";

describe("job offer canonicalization", () => {
  it("normalizes trivial company and title differences", () => {
    expect(normalizeCompanyName("  ACME   Labs  ")).toBe("acme labs");
    expect(normalizeCompanyName("Acme Labs")).toBe("acme labs");
    expect(normalizeJobTitle("  Senior   TypeScript Engineer ")).toBe(
      "senior typescript engineer",
    );
  });

  it("removes only known tracking parameters and sorts the rest", () => {
    expect(
      canonicalizeJobUrl(
        "https://jobs.example.invalid/offers/42?utm_source=mail&location=es&id=42&utm_campaign=spring",
      ),
    ).toBe("https://jobs.example.invalid/offers/42?id=42&location=es");
  });

  it("preserves unknown parameters that may identify an offer", () => {
    expect(
      canonicalizeJobUrl(
        "https://jobs.example.invalid/search?job=42&ref=internal&utm_medium=email",
      ),
    ).toBe("https://jobs.example.invalid/search?job=42&ref=internal");
  });

  it("rejects non-HTTP URLs", () => {
    expect(() => canonicalizeJobUrl("javascript:alert(1)")).toThrow(/HTTP/);
  });

  it("generates a deterministic SHA-256 description hash", async () => {
    await expect(generateDescriptionHash("Synthetic job description")).resolves.toBe(
      "fdfb68a08099c193c8ad16e8fb414a13e50f92da59a993624a7c7190f2b40f77",
    );
  });
});
