import { describe, expect, it, vi } from "vitest";

import { JobicyAdapter, parseJobicyJobs, sanitizeJobicyDescription } from "@/lib/job-sources/jobicy/adapter";
import { PublicJobSourceError } from "@/lib/job-sources/public-json-client";

const europeJob = {
  id: 152833,
  url: "https://jobicy.com/jobs/152833-senior-android-engineer-3",
  jobTitle: "Senior Android Engineer",
  companyName: "Example Labs",
  jobIndustry: ["Engineering"],
  jobType: ["Full-Time"],
  jobGeo: "Europe",
  jobLevel: "Senior",
  jobDescription: "<p>Build <strong>reliable</strong> systems.</p><script>alert('unsafe')</script>",
  pubDate: "2026-09-09T10:00:00.000Z",
  salaryMin: 78000,
  salaryMax: 98000,
  salaryCurrency: "EUR",
};

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("JobicyAdapter", () => {
  it("uses the documented Europe engineering scope and caps a run at 200 offers", async () => {
    const jobs = Array.from({ length: 205 }, (_, index) => ({ ...europeJob, id: index + 1, url: `https://jobicy.com/jobs/${index + 1}` }));
    const fetchMock = vi.fn<typeof fetch>(async () => response({ jobs }));
    const adapter = new JobicyAdapter({ fetchImplementation: fetchMock, requestIntervalMs: 0 });
    const result = await adapter.search({}, { maxOffers: 500 });
    expect(result.stats).toEqual({ pagesRequested: 1, offersReceived: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const input = fetchMock.mock.calls[0][0];
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.searchParams.get("count")).toBe("200");
    expect(url.searchParams.get("geo")).toBe("europe");
    expect(url.searchParams.get("industry")).toBe("engineering");
  });

  it("normalizes provided fields without converting Europe into Spain", () => {
    const adapter = new JobicyAdapter({ fetchImplementation: vi.fn(), requestIntervalMs: 0 });
    expect(adapter.normalize(europeJob)).toMatchObject({
      externalJobId: "152833", title: "Senior Android Engineer", company: { name: "Example Labs" },
      locationText: "Europe", countryCode: null, region: null, city: null, workMode: "REMOTE",
      seniority: "Senior", employmentType: "Full-Time", salaryMin: 78000, salaryMax: 98000,
      salaryCurrency: "EUR", sourceUrl: europeJob.url,
    });
    expect(adapter.normalize({ ...europeJob, jobGeo: "Spain" }).countryCode).toBe("ES");
    expect(adapter.normalize({ ...europeJob, jobGeo: "Europe, Spain" }).countryCode).toBeNull();
  });

  it("turns external HTML into safe plain text and leaves absent fields absent", () => {
    const adapter = new JobicyAdapter({ fetchImplementation: vi.fn(), requestIntervalMs: 0 });
    expect(sanitizeJobicyDescription(europeJob.jobDescription)).toBe("Build reliable systems.");
    const normalized = adapter.normalize({ id: "missing", url: "https://jobicy.com/jobs/missing", jobTitle: "QA Engineer" });
    expect(normalized).toMatchObject({ company: null, description: null, locationText: null, countryCode: null, seniority: null, employmentType: null, salaryMin: null, salaryMax: null, salaryCurrency: null, publishedAt: null });
    expect(normalized.workMode).toBe("REMOTE");
  });

  it("rejects malformed API payloads", () => {
    expect(() => parseJobicyJobs({ jobs: [{ id: null }] })).toThrow(PublicJobSourceError);
  });
});
