import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeLiveJobSearch, redirect } = vi.hoisted(() => ({
  executeLiveJobSearch: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/job-sources/live-search.server", () => ({ executeLiveJobSearch }));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn(async () => ({ supabase: {}, user: null })),
}));

import { searchJobs } from "@/app/actions/jobs";

describe("searchJobs authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauthenticated users before starting ingestion", async () => {
    const formData = new FormData();
    formData.set("search_profile_id", "61110000-0000-0000-0000-000000000001");
    await expect(searchJobs(formData)).rejects.toThrow("REDIRECT:/login");
    expect(executeLiveJobSearch).not.toHaveBeenCalled();
  });
});
