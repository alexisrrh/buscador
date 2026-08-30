import { describe, expect, it } from "vitest";
import { LeverAdapter } from "@/lib/job-sources/lever/adapter";
import { AshbyAdapter } from "@/lib/job-sources/ashby/adapter";

const leverSite = process.env.LEVER_LIVE_SITE;
const ashbyBoard = process.env.ASHBY_LIVE_BOARD;

describe("public ATS live integration", () => {
  it.skipIf(!leverSite)("retrieves a configured Lever public site", async () => {
    const adapter = new LeverAdapter({
      site: leverSite!,
      instance: process.env.LEVER_LIVE_INSTANCE === "EU" ? "EU" : "GLOBAL",
    });
    const result = await adapter.search(
      { pageSize: 1 },
      { maxPages: 1, maxOffers: 1 },
    );
    expect(result.offers.length).toBeLessThanOrEqual(1);
  });

  it.skipIf(!ashbyBoard)("retrieves a configured Ashby public board", async () => {
    const adapter = new AshbyAdapter({ jobBoardName: ashbyBoard! });
    const result = await adapter.search({}, { maxOffers: 1 });
    expect(result.offers.length).toBeLessThanOrEqual(1);
  });
});
