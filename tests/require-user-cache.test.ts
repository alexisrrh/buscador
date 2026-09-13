import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAll: vi.fn(() => []),
  getUser: vi.fn(),
}));
const requestCache = vi.hoisted(() => ({
  cache: <T extends (...args: never[]) => Promise<unknown>>(fn: T) => {
    const entries = new Map<string, Promise<unknown>>();
    return ((...args: Parameters<T>) => {
      const key = JSON.stringify(args);
      const existing = entries.get(key);
      if (existing) return existing;
      const result = fn(...args) as Promise<unknown>;
      entries.set(key, result);
      return result as ReturnType<T>;
    }) as T;
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: mocks.getAll, set: vi.fn() })) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: requestCache.cache }));

describe("requireUser request memoization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
  });

  it("shares one auth resolution when layout and page call it in the same render", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const { requireUser } = await import("@/lib/supabase/server");
    const [layoutAuth, resumesAuth] = await Promise.all([requireUser(), requireUser()]);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(layoutAuth.user).toEqual({ id: "user-a" });
    expect(resumesAuth.user).toEqual({ id: "user-a" });
  });

  it("creates a fresh auth resolution for a new request scope", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const firstRequest = await import("@/lib/supabase/server");
    await firstRequest.requireUser();
    vi.resetModules();
    const secondRequest = await import("@/lib/supabase/server");
    await secondRequest.requireUser();
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("does not authenticate an anonymous request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { requireUser } = await import("@/lib/supabase/server");
    await expect(requireUser()).resolves.toMatchObject({ user: null });
  });
});
