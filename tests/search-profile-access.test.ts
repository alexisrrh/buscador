import { describe, expect, it } from "vitest";

import { assertActiveSearchProfile } from "@/lib/job-sources/search-profile-access";

function lookup(status: string | null) {
  const builder = {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    maybeSingle: async () => ({
      data: status ? { id: "search", status } : null,
      error: null,
    }),
  };
  return builder;
}

describe("live search profile access", () => {
  it("allows an active SearchProfile", async () => {
    await expect(
      assertActiveSearchProfile(lookup("ACTIVE"), "user", "search"),
    ).resolves.toBeUndefined();
  });

  it("blocks a paused SearchProfile before ingestion", async () => {
    await expect(
      assertActiveSearchProfile(lookup("PAUSED"), "user", "search"),
    ).rejects.toThrow("no está activa");
  });

  it("blocks a missing or non-owned SearchProfile before ingestion", async () => {
    await expect(
      assertActiveSearchProfile(lookup(null), "user", "search"),
    ).rejects.toThrow("no existe");
  });
});
