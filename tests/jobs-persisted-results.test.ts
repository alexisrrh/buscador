import { describe, expect, it } from "vitest";

import {
  JOB_OFFER_QUERY_CHUNK_SIZE,
  chunkValues,
  matchesResultFilter,
} from "@/lib/jobs/persisted-results";

describe("persisted /jobs results", () => {
  it("keeps all useful persisted matches visible after an incremental run skips unchanged offers", () => {
    const persistedMatches = [
      ...Array.from({ length: 3 }, () => ({ eligibility_status: "ELIGIBLE", status: "NEW" })),
      ...Array.from({ length: 15 }, () => ({ eligibility_status: "REVIEW", status: "NEW" })),
      ...Array.from({ length: 2256 }, () => ({ eligibility_status: "REJECTED", status: "NEW" })),
    ];
    const runReport = { matches_generated: 16, matches_skipped: 2256 };

    expect(runReport.matches_skipped).toBeGreaterThan(0);
    expect(persistedMatches.filter((match) => matchesResultFilter(match, "useful"))).toHaveLength(18);
  });

  it("loads large persisted result sets using bounded offer-id queries", () => {
    const offerIds = Array.from({ length: 1000 }, (_, index) => `offer-${index}`);
    const chunks = chunkValues(offerIds);

    expect(chunks).toHaveLength(10);
    expect(chunks.every((chunk) => chunk.length <= JOB_OFFER_QUERY_CHUNK_SIZE)).toBe(true);
    expect(chunks.flat()).toEqual(offerIds);
  });
});
