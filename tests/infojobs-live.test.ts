import { describe, expect, it } from "vitest";
import { InfoJobsAdapter } from "@/lib/job-sources/infojobs/adapter";

const clientId = process.env.INFOJOBS_CLIENT_ID;
const clientSecret = process.env.INFOJOBS_CLIENT_SECRET;
const liveEnabled =
  Boolean(clientId && clientSecret) && process.env.INFOJOBS_LIVE_TEST === "1";

describe("InfoJobs live integration", () => {
  it.skipIf(!liveEnabled)("can retrieve one official API result page", async () => {
    const adapter = new InfoJobsAdapter({
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
    const result = await adapter.search(
      { keywords: "test", pageSize: 1 },
      { maxPages: 1, maxOffers: 1 },
    );

    expect(result.stats.pagesRequested).toBe(1);
    expect(result.offers.length).toBeLessThanOrEqual(1);
  });
});
