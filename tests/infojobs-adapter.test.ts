import { describe, expect, it, vi } from "vitest";
import pageOne from "@/tests/fixtures/infojobs/search-page-1.json";
import pageTwo from "@/tests/fixtures/infojobs/search-page-2.json";
import offerDetail from "@/tests/fixtures/infojobs/offer-detail.json";
import {
  buildInfoJobsSearchUrl,
  InfoJobsAdapter,
} from "@/lib/job-sources/infojobs/adapter";
import { InfoJobsError } from "@/lib/job-sources/infojobs/errors";
import type { InfoJobsOffer } from "@/lib/job-sources/infojobs/types";

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers });
}

function adapterWith(fetchImplementation: typeof fetch, overrides = {}) {
  return new InfoJobsAdapter({
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
    fetchImplementation,
    requestIntervalMs: 0,
    backoffMs: 0,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe("InfoJobsAdapter", () => {
  it("builds only documented MVP search parameters", () => {
    const url = buildInfoJobsSearchUrl({
      keywords: "synthetic engineer",
      province: "madrid",
      city: "Madrid",
      publishedSince: new Date("2026-08-01T00:00:00Z"),
      page: 2,
      pageSize: 20,
    });

    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "synthetic engineer",
      province: "madrid",
      city: "Madrid",
      publishedMin: "2026-08-01T00:00:00.000Z",
      page: "2",
      maxResults: "20",
    });
  });

  it("parses search results and paginates until the final page", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(pageOne))
      .mockResolvedValueOnce(jsonResponse(pageTwo));
    const result = await adapterWith(fetchMock).search(
      { keywords: "synthetic", pageSize: 2 },
      { maxPages: 5, maxOffers: 10 },
    );

    expect(result.offers.map((offer) => offer.id)).toEqual([
      "synthetic-offer-001",
      "synthetic-offer-002",
      "synthetic-offer-003",
    ]);
    expect(result.stats).toEqual({ pagesRequested: 2, offersReceived: 3 });
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=2");
  });

  it("respects maxOffers without downloading another page", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(pageOne));
    const result = await adapterWith(fetchMock).search(
      { keywords: "synthetic" },
      { maxPages: 5, maxOffers: 1 },
    );

    expect(result.offers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes detail fields and removes UTM parameters", () => {
    const normalized = adapterWith(vi.fn<typeof fetch>()).normalize(
      offerDetail as InfoJobsOffer,
    );

    expect(normalized).toMatchObject({
      externalJobId: "synthetic-offer-001",
      title: "Senior Synthetic Engineer",
      normalizedTitle: "senior synthetic engineer",
      countryCode: "ES",
      region: "Madrid",
      city: "Madrid",
      workMode: "UNKNOWN",
      employmentType: "Indefinido",
      seniority: "Especialista",
      salaryMin: 30000,
      salaryMax: 42000,
      salaryCurrency: "EUR",
      canonicalSourceUrl:
        "https://www.infojobs.net/madrid/synthetic-engineer/of-i001?id=001",
    });
    expect(normalized.company?.normalizedName).toBe("synthetic systems");
    expect(normalized.description).toMatch(/Synthetic description/);
  });

  it("keeps missing salary and company as null", () => {
    const raw = pageOne.offers[1] as InfoJobsOffer;
    const normalized = adapterWith(vi.fn<typeof fetch>()).normalize(raw);
    expect(normalized.company).toBeNull();
    expect(normalized.salaryMin).toBeNull();
    expect(normalized.salaryMax).toBeNull();
    expect(normalized.salaryCurrency).toBeNull();
  });

  it("does not retry a 401 response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401));
    await expect(adapterWith(fetchMock).search({ keywords: "synthetic" })).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 response with bounded backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ ...pageOne, totalPages: 1 }));
    const sleep = vi.fn(async () => undefined);
    const result = await adapterWith(fetchMock, { maxRetries: 1, sleep }).search({});
    expect(result.offers).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it("returns a typed error after bounded 5xx retries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500));
    await expect(
      adapterWith(fetchMock, { maxRetries: 1 }).search({}),
    ).rejects.toMatchObject({ code: "UPSTREAM_SERVER_ERROR", status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts timed out requests", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );

    await expect(
      adapterWith(fetchMock, { timeoutMs: 1, maxRetries: 0 }).search({}),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it.each([
    new Response("not-json", { status: 200 }),
    jsonResponse({ offers: [{ id: "missing-fields" }] }),
  ])("rejects invalid or unexpected JSON", async (response) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(adapterWith(fetchMock).search({})).rejects.toMatchObject({
      name: InfoJobsError.name,
      code: "INVALID_RESPONSE",
    });
  });
});
