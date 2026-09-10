import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

describe("private route protection", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
    getUser.mockReset();
  });

  it("redirects an anonymous private request to login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://app.example/profiles/foreign-id"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=%2Fprofiles%2Fforeign-id");
  });

  it("preserves a contextual resume handoff when auth is required", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://app.example/resumes?intent_role=Frontend&intent_mode=REMOTE&offer_title=Frontend&offer_url=https%3A%2F%2Fjobs.example.test%2Ffrontend&action=prepare"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("return_to=%2Fresumes%3Fintent_role%3DFrontend");
    expect(response.headers.get("location")).not.toContain("next=");
  });

  it("allows an authenticated private request", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://app.example/dashboard"));
    expect(response.status).toBe(200);
  });
});
