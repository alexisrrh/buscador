import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const jobsPage = readFileSync("app/(private)/jobs/page.tsx", "utf8");

describe("jobs results presentation", () => {
  it("defaults to useful results and keeps rejected matches explicitly accessible", () => {
    expect(jobsPage).toContain('<option value="useful">Todas las útiles</option>');
    expect(jobsPage).toContain('<option value="ELIGIBLE">Elegibles</option>');
    expect(jobsPage).toContain('<option value="REVIEW">Revisar</option>');
    expect(jobsPage).toContain('<option value="REJECTED">Rechazadas</option>');
    expect(jobsPage).toContain('match.eligibility_status !== "REJECTED"');
  });

  it("orders eligible matches before review matches before rejected matches", () => {
    expect(jobsPage).toContain("{ ELIGIBLE: 0, REVIEW: 1, REJECTED: 2 }");
    expect(jobsPage).toContain("eligibilityRank(left.eligibility_status)");
  });
});
