import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("server secret boundary", () => {
  it("does not reference the service-role secret from client-side jobs code", () => {
    const clientButton = readFileSync("components/search-jobs-button.tsx", "utf8");
    const jobsPage = readFileSync("app/(private)/jobs/page.tsx", "utf8");
    expect(clientButton).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(jobsPage).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientButton).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
