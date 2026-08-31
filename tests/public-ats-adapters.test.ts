import { describe, expect, it, vi } from "vitest";
import greenhouseJobs from "@/tests/fixtures/greenhouse/jobs.json";
import smartPageOne from "@/tests/fixtures/smartrecruiters/postings-page-1.json";
import smartPageTwo from "@/tests/fixtures/smartrecruiters/postings-page-2.json";
import smartDetails from "@/tests/fixtures/smartrecruiters/posting-detail.json";
import { GreenhouseAdapter } from "@/lib/job-sources/greenhouse/adapter";
import type { GreenhouseJob } from "@/lib/job-sources/greenhouse/types";
import { SmartRecruitersAdapter } from "@/lib/job-sources/smartrecruiters/adapter";
import type { SmartRecruitersPosting } from "@/lib/job-sources/smartrecruiters/types";
import { PublicJobSourceError } from "@/lib/job-sources/public-json-client";

const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status, headers });

function greenhouse(fetchImplementation: typeof fetch, overrides = {}) {
  return new GreenhouseAdapter({ boardToken: "synthetic", fetchImplementation, requestIntervalMs: 0, backoffMs: 0, sleep: async () => undefined, ...overrides });
}

function smart(fetchImplementation: typeof fetch, overrides = {}) {
  return new SmartRecruitersAdapter({ companyIdentifier: "synthetic", fetchImplementation, requestIntervalMs: 0, backoffMs: 0, sleep: async () => undefined, ...overrides });
}

describe("GreenhouseAdapter", () => {
  it("normalizes content, location, dates and canonical URLs", async () => {
    const adapter = greenhouse(vi.fn<typeof fetch>().mockResolvedValue(response(greenhouseJobs)));
    const result = await adapter.search({}, { maxOffers: 10 });
    const primary = adapter.normalize(result.offers[0] as GreenhouseJob);
    const optional = adapter.normalize(result.offers[1] as GreenhouseJob);
    expect(result.stats).toEqual({ pagesRequested: 1, offersReceived: 2 });
    expect(primary).toMatchObject({ externalJobId: "67001", title: "Frontend Engineer", countryCode: "ES", workMode: "HYBRID", description: "Build interfaces with React and TypeScript.", publishedAt: "2026-08-29T09:00:00.000Z", canonicalSourceUrl: "https://job-boards.greenhouse.io/synthetic/jobs/67001" });
    expect(optional).toMatchObject({ description: null, workMode: "REMOTE", countryCode: null });
  });
});

describe("SmartRecruitersAdapter", () => {
  it("paginates with documented offset/limit and normalizes details", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(smartPageOne))
      .mockResolvedValueOnce(response(smartPageTwo));
    const adapter = smart(fetchMock);
    const result = await adapter.search({ keywords: "frontend", pageSize: 1 }, { maxPages: 3, maxOffers: 10 });
    const normalized = adapter.normalize(smartDetails as SmartRecruitersPosting);
    expect(result.stats).toEqual({ pagesRequested: 2, offersReceived: 2 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=frontend");
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=1");
    expect(normalized).toMatchObject({ externalJobId: "smart-67001", title: "React Developer", countryCode: "ES", city: "Barcelona", workMode: "REMOTE", seniority: "Mid", employmentType: "Full-time", description: "Build React and TypeScript products. Three years of web experience.", canonicalSourceUrl: "https://jobs.smartrecruiters.com/synthetic/smart-67001-react-developer" });
    expect(adapter.needsDetails(result.offers[0])).toBe(true);
  });
});

describe("new public ATS robustness", () => {
  it.each([
    ["Greenhouse", (fetchMock: typeof fetch) => greenhouse(fetchMock)],
    ["SmartRecruiters", (fetchMock: typeof fetch) => smart(fetchMock)],
  ])("handles 404, 429, 5xx, invalid JSON and timeout for %s", async (_name, factory) => {
    await expect(factory(vi.fn<typeof fetch>().mockResolvedValue(response({}, 404))).search({})).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rateLimited = vi.fn<typeof fetch>().mockResolvedValue(response({}, 429, { "retry-after": "0" }));
    await expect(factory(rateLimited,).search({})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const serverError = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503));
    await expect(factory(serverError).search({})).rejects.toMatchObject({ code: "UPSTREAM_SERVER_ERROR" });
    await expect(factory(vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 200 }))).search({})).rejects.toBeInstanceOf(PublicJobSourceError);
    const timeout = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    const timed = _name === "Greenhouse"
      ? new GreenhouseAdapter({ boardToken: "synthetic", fetchImplementation: timeout, timeoutMs: 1, maxRetries: 0, requestIntervalMs: 0 })
      : new SmartRecruitersAdapter({ companyIdentifier: "synthetic", fetchImplementation: timeout, timeoutMs: 1, maxRetries: 0, requestIntervalMs: 0 });
    await expect(timed.search({})).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("rejects structurally unexpected responses", async () => {
    await expect(greenhouse(vi.fn<typeof fetch>().mockResolvedValue(response({ jobs: "bad" }))).search({})).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(smart(vi.fn<typeof fetch>().mockResolvedValue(response({ content: [] }))).search({})).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
