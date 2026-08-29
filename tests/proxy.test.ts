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

  it("allows an authenticated private request", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://app.example/dashboard"));
    expect(response.status).toBe(200);
  });
});
