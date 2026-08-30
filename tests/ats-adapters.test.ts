import { describe, expect, it, vi } from "vitest";
import leverPageOne from "@/tests/fixtures/lever/postings-page-1.json";
import leverPageTwo from "@/tests/fixtures/lever/postings-page-2.json";
import ashbyBoard from "@/tests/fixtures/ashby/job-board.json";
import { LeverAdapter } from "@/lib/job-sources/lever/adapter";
import type { LeverPosting } from "@/lib/job-sources/lever/types";
import { AshbyAdapter } from "@/lib/job-sources/ashby/adapter";
import { PublicJobSourceError } from "@/lib/job-sources/public-json-client";

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers });
}

function leverWith(fetchImplementation: typeof fetch, overrides = {}) {
  return new LeverAdapter({
    site: "synthetic-site",
    fetchImplementation,
    requestIntervalMs: 0,
    backoffMs: 0,
    sleep: async () => undefined,
    ...overrides,
  });
}

function ashbyWith(fetchImplementation: typeof fetch, overrides = {}) {
  return new AshbyAdapter({
    jobBoardName: "synthetic-board",
    fetchImplementation,
    requestIntervalMs: 0,
    backoffMs: 0,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe("LeverAdapter", () => {
  it("paginates public postings and supports the EU instance", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(leverPageOne))
      .mockResolvedValueOnce(jsonResponse(leverPageTwo));
    const adapter = new LeverAdapter({
      site: "synthetic-site",
      instance: "EU",
      fetchImplementation: fetchMock,
      requestIntervalMs: 0,
    });
    const result = await adapter.search(
      { city: "Madrid, Spain", pageSize: 2 },
      { maxPages: 3, maxOffers: 10 },
    );

    expect(result.stats).toEqual({ pagesRequested: 2, offersReceived: 3 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.eu.lever.co");
    expect(String(fetchMock.mock.calls[0][0])).toContain("location=Madrid%2C+Spain");
    expect(String(fetchMock.mock.calls[1][0])).toContain("skip=2");
  });

  it("normalizes remote, salary and missing content without personal data", () => {
    const adapter = leverWith(vi.fn<typeof fetch>());
    const primary = adapter.normalize(leverPageOne[0] as LeverPosting);
    const remote = adapter.normalize(leverPageOne[1] as LeverPosting);

    expect(primary).toMatchObject({
      externalJobId: "lever-synthetic-001",
      workMode: "HYBRID",
      employmentType: "Full-time",
      salaryMin: 35000,
      salaryMax: 45000,
      salaryCurrency: "EUR",
      countryCode: "ES",
      canonicalSourceUrl:
        "https://jobs.lever.co/synthetic-site/lever-synthetic-001",
    });
    expect(remote).toMatchObject({
      workMode: "REMOTE",
      description: null,
      salaryMin: null,
      company: null,
    });
    expect(primary).not.toHaveProperty("userId");
    expect(primary).not.toHaveProperty("candidateProfileId");
  });

  it("accepts an empty tenant response", async () => {
    const result = await leverWith(
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([])),
    ).search({});
    expect(result.offers).toEqual([]);
  });
});

describe("AshbyAdapter", () => {
  it("normalizes secondary locations, compensation and optional fields", async () => {
    const adapter = ashbyWith(
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ashbyBoard)),
    );
    const result = await adapter.search({}, { maxOffers: 10 });
    const primary = adapter.normalize(result.offers[0]);
    const optional = adapter.normalize(result.offers[1]);

    expect(result.stats).toEqual({ pagesRequested: 1, offersReceived: 3 });
    expect(primary).toMatchObject({
      externalJobId: "ashby-synthetic-001",
      locationText: "Madrid | Barcelona",
      city: "Madrid",
      region: "Madrid",
      countryCode: "ES",
      workMode: "HYBRID",
      employmentType: "FullTime",
      salaryMin: 40000,
      salaryMax: 52000,
      salaryCurrency: "EUR",
      canonicalSourceUrl:
        "https://jobs.ashbyhq.com/synthetic-board/ashby-synthetic-001",
    });
    expect(optional).toMatchObject({
      workMode: "REMOTE",
      description: null,
      salaryMin: null,
      salaryCurrency: null,
      company: null,
    });
  });

  it("accepts an empty job board", async () => {
    const response = { apiVersion: "1", jobs: [] };
    const result = await ashbyWith(
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response)),
    ).search({});
    expect(result.offers).toEqual([]);
  });
});

describe("public ATS robustness", () => {
  it.each([
    ["Lever", (fetchMock: typeof fetch) => leverWith(fetchMock)],
    ["Ashby", (fetchMock: typeof fetch) => ashbyWith(fetchMock)],
  ])("returns NOT_FOUND for an invalid %s identifier", async (_name, factory) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 404));
    await expect(factory(fetchMock).search({})).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and bounded 5xx responses", async () => {
    const rateLimited = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await expect(leverWith(rateLimited, { maxRetries: 1 }).search({})).resolves.toMatchObject({
      offers: [],
    });
    expect(rateLimited).toHaveBeenCalledTimes(2);

    const serverError = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 503));
    await expect(
      ashbyWith(serverError, { maxRetries: 1 }).search({}),
    ).rejects.toMatchObject({ code: "UPSTREAM_SERVER_ERROR", status: 503 });
    expect(serverError).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid JSON and times out", async () => {
    const invalidJson = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(leverWith(invalidJson).search({})).rejects.toBeInstanceOf(
      PublicJobSourceError,
    );

    const timeoutFetch = vi.fn<typeof fetch>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );
    await expect(
      ashbyWith(timeoutFetch, { timeoutMs: 1, maxRetries: 0 }).search({}),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("rejects structurally unexpected responses", async () => {
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ jobs: "invalid" }));
    await expect(ashbyWith(invalid).search({})).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
