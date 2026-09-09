import { describe, expect, it, vi } from "vitest";

import { JobgetherAdapter, parseJobgetherJobs } from "@/lib/job-sources/jobgether/adapter";
import { PublicJobSourceError } from "@/lib/job-sources/public-json-client";

const first = { id: "job-1", title: "Frontend Developer", company: "Acme", url: "https://jobgether.com/offer/job-1", location: "Spain", remote: "Full Remote", contractType: "Full time", experience: "Junior (1-2 years)", postedAt: "2026-09-09T10:00:00.000Z" };
const second = { id: "job-2", title: "IT Support", url: "https://jobgether.com/offer/job-2", location: "France", remote: "", contractType: "", experience: "", postedAt: "not-a-date" };
function response(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }); }

describe("JobgetherAdapter", () => {
  it("parses documented pagination and reaches a relevant offer after page one", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(input instanceof Request ? input.url : input).searchParams.get("page");
      return response(page === "1" ? { jobs: [second], pagination: { page: 1, limit: 25, hasMore: true } } : { jobs: [first], pagination: { page: 2, limit: 25, hasMore: false } });
    });
    const adapter = new JobgetherAdapter({ fetchImplementation: fetchMock as typeof fetch, requestIntervalMs: 0, defaultLocations: "spain" });
    const result = await adapter.search({}, { maxPages: 3, maxOffers: 75 });
    expect(result.stats).toEqual({ pagesRequested: 2, offersReceived: 2 });
    expect(result.offers.map((job) => job.id)).toEqual(["job-2", "job-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInput = fetchMock.mock.calls[0][0];
    const firstUrl = firstInput instanceof Request ? firstInput.url : firstInput.toString();
    expect(new URL(firstUrl).searchParams.get("locations")).toBe("spain");
  });

  it("preserves only provided fields and never invents missing metadata", () => {
    const adapter = new JobgetherAdapter({ fetchImplementation: vi.fn(), requestIntervalMs: 0 });
    expect(adapter.normalize(first)).toMatchObject({ externalJobId: "job-1", title: "Frontend Developer", company: { name: "Acme" }, locationText: "Spain", countryCode: "ES", workMode: "REMOTE", seniority: "Junior (1-2 years)", employmentType: "Full time", sourceUrl: "https://jobgether.com/offer/job-1", salaryMin: null, salaryMax: null, description: null });
    expect(adapter.normalize(second)).toMatchObject({ externalJobId: "job-2", company: null, countryCode: "FR", workMode: "UNKNOWN", seniority: null, employmentType: null, publishedAt: null, description: null, salaryMin: null });
  });

  it("rejects malformed API payloads", () => {
    expect(() => parseJobgetherJobs({ jobs: [{}], pagination: {} })).toThrow(PublicJobSourceError);
  });
});
