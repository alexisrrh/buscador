import { afterEach, describe, expect, it, vi } from "vitest";
import { assertActor, requireActor, type ActorContext, type VerifiedSession } from "@/lib/server/context";
import { createDatabasePool } from "@/lib/server/db/pool";

const userId = "11111111-1111-4111-8111-111111111111";
function session(): VerifiedSession {
  return { user: { id: userId, disabled: false }, session: { id: "session-a", expiresAt: new Date(Date.now() + 60_000) } };
}
afterEach(() => { vi.useRealTimers(); });

describe("server-verified actor boundary", () => {
  it("issues an immutable actor only from the server session reader", async () => {
    const actor = await requireActor(async () => session());
    expect(actor.userId).toBe(userId);
    expect(Object.isFrozen(actor)).toBe(true);
    expect(() => assertActor(actor)).not.toThrow();
  });
  it("rejects a structurally forged actor", () => {
    expect(() => assertActor({ userId, sessionId: "forged", expiresAt: Infinity } as ActorContext)).toThrow("AUTHENTICATION_REQUIRED");
  });
  it.each([
    null,
    { ...session(), user: { id: "not-a-uuid", disabled: false } },
    { ...session(), user: { id: userId, disabled: true } },
    { ...session(), session: { id: "", expiresAt: new Date(Date.now() + 60_000) } },
    { ...session(), session: { id: "expired", expiresAt: new Date(0) } },
    { ...session(), session: { id: "invalid", expiresAt: new Date(NaN) } },
  ])("rejects missing, disabled or invalid sessions %#", async (value) => {
    await expect(requireActor(async () => value)).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });
  it("rejects an issued actor after expiry", async () => {
    vi.useFakeTimers();
    const actor = await requireActor(async () => session());
    vi.advanceTimersByTime(60_001);
    expect(() => assertActor(actor)).toThrow("AUTHENTICATION_REQUIRED");
  });
  it("propagates session-store failure without issuing a fallback identity", async () => {
    await expect(requireActor(async () => { throw new Error("SESSION_STORE_UNAVAILABLE"); })).rejects.toThrow("SESSION_STORE_UNAVAILABLE");
  });
});

describe("explicit PostgreSQL pool configuration", () => {
  it.each(["", "not a URL", "https://example.test"])('rejects invalid configuration without echoing secrets: %s', (url) => {
    expect(() => createDatabasePool(url)).toThrow("INVALID_DATABASE_CONFIGURATION");
  });
  it.each([0, 21, 1.5])("rejects invalid pool size %s", (max) => {
    expect(() => createDatabasePool("postgresql://localhost/test", max)).toThrow("INVALID_DATABASE_CONFIGURATION");
  });
  it("creates a lazy bounded pool and handles idle errors without logging connection details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = createDatabasePool("postgresql://localhost/test", 2);
    try {
      expect(pool.totalCount).toBe(0);
      expect(pool.options.max).toBe(2);
      pool.emit("error", new Error("private connection detail"));
      expect(log).toHaveBeenCalledWith("DATABASE_IDLE_CONNECTION_ERROR");
    } finally { await pool.end(); log.mockRestore(); }
  });
});
