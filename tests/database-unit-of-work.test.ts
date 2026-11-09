import type { Pool, PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireActor } from "@/lib/server/context";
import { UnitOfWork } from "@/lib/server/db/unit-of-work";
import { PostgresProfileRepository } from "@/lib/server/db/profile-repository";

const userId = "11111111-1111-4111-8111-111111111111";
const actor = () => requireActor(async () => ({ user: { id: userId, disabled: false }, session: { id: "session", expiresAt: new Date(Date.now() + 60_000) } }));
function fixture() {
  const query = vi.fn<(sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>>()
    .mockResolvedValue({ rows: [{ unsafe: false }], rowCount: 1 });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }) as unknown as PoolClient);
  const work = new UnitOfWork({ connect } as Pick<Pool, "connect">);
  return { query, release, connect, work };
}
afterEach(() => { vi.useRealTimers(); });

describe("transaction lifecycle", () => {
  it("uses one connection, a parameterized transaction-local actor and commit before release", async () => {
    const f = fixture();
    const result = await f.work.withActor(await actor(), async (tx) => { await tx.query("SELECT 42"); return 42; });
    expect(result).toBe(42);
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.user_id', $1, true)", [userId]);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it("rolls back the original failure without hiding it", async () => {
    const f = fixture();
    const error = new Error("DOMAIN_FAILURE");
    await expect(f.work.withActor(await actor(), async () => { throw error; })).rejects.toBe(error);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it("discards a connection if rollback fails", async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql) => { if (sql === "ROLLBACK") throw new Error("CONNECTION_LOST"); return { rows: [{ unsafe: false }], rowCount: 1 }; });
    await expect(f.work.withActor(await actor(), async () => { throw new Error("ORIGINAL"); })).rejects.toThrow("ORIGINAL");
    expect(f.release).toHaveBeenCalledWith(true);
  });
  it("rolls back a failed commit and still releases the client", async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql) => { if (sql === "COMMIT") throw new Error("COMMIT_FAILED"); return { rows: [{ unsafe: false }], rowCount: 1 }; });
    await expect(f.work.withActor(await actor(), async () => 1)).rejects.toThrow("COMMIT_FAILED");
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it("rejects privileged connections before running domain queries", async () => {
    const f = fixture();
    f.query.mockResolvedValue({ rows: [{ unsafe: true }], rowCount: 1 });
    const operation = vi.fn();
    await expect(f.work.withActor(await actor(), operation)).rejects.toThrow("UNSAFE_DATABASE_ROLE");
    expect(operation).not.toHaveBeenCalled();
  });
  it("rejects a session that expired while waiting for a connection", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const verified = await actor();
    f.connect.mockImplementation(async () => { vi.advanceTimersByTime(60_001); return { query: f.query, release: f.release } as unknown as PoolClient; });
    await expect(f.work.withActor(verified, async () => 1)).rejects.toThrow("AUTHENTICATION_REQUIRED");
    expect(f.release).toHaveBeenCalled();
  });
  it("does not commit when an actor expires during an operation", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await expect(f.work.withActor(await actor(), async () => { vi.advanceTimersByTime(60_001); })).rejects.toThrow("AUTHENTICATION_REQUIRED");
    expect(f.query.mock.calls.map(x => x[0])).not.toContain("COMMIT");
  });
});

describe("profile service boundary", () => {
  function profileFixture(profileExists = true) {
    const f = fixture();
    const candidate = { id: "candidate-id", user_id: userId, name: "Ana", headline: null, job_family: null, seniority: null };
    f.query.mockImplementation(async (sql) => {
      if (sql.includes("AS unsafe")) return { rows: [{ unsafe: false }], rowCount: 1 };
      if (sql.includes("FOR KEY SHARE")) return { rows: profileExists ? [{ id: userId }] : [], rowCount: profileExists ? 1 : 0 };
      if (sql.includes("candidate_profiles")) return { rows: [candidate], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    return { ...f, repository: new PostgresProfileRepository(f.work), candidate };
  }
  it("ensures identity idempotently without accepting a caller-selected owner", async () => {
    const f = profileFixture();
    expect(await f.repository.ensureOwnProfile(await actor())).toBe(userId);
    expect(f.query).toHaveBeenCalledWith("INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [userId]);
  });
  it("rejects a missing or soft-deleted profile instead of reactivating it", async () => {
    const f = profileFixture(false);
    await expect(f.repository.ensureOwnProfile(await actor())).rejects.toThrow("PROFILE_UNAVAILABLE");
    await expect(f.repository.createCandidate(await actor(), "Ana")).rejects.toThrow("PROFILE_UNAVAILABLE");
  });
  it("normalizes a candidate name and derives the owner from the actor", async () => {
    const f = profileFixture();
    expect(await f.repository.createCandidate(await actor(), " Ana ")).toEqual(f.candidate);
    expect(f.query.mock.calls.find(x => x[0].includes("INSERT INTO public.candidate_profiles"))?.[1]).toEqual([userId, "Ana"]);
  });
  it.each(["", "A", "a".repeat(81)])("rejects invalid names before opening a transaction", async (name) => {
    const f = profileFixture();
    await expect(f.repository.createCandidate(await actor(), name)).rejects.toThrow("INVALID_CANDIDATE_NAME");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("returns an owned list and a matching detail", async () => {
    const f = profileFixture();
    expect(await f.repository.listCandidates(await actor())).toEqual([f.candidate]);
    expect(await f.repository.findCandidate(await actor(), f.candidate.id)).toEqual(f.candidate);
  });
  it("returns null for an absent detail", async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql) => ({ rows: sql.includes("FOR KEY SHARE") ? [{ id: userId }] : sql.includes("AS unsafe") ? [{ unsafe: false }] : [], rowCount: 0 }));
    expect(await new PostgresProfileRepository(f.work).findCandidate(await actor(), "missing")).toBeNull();
  });
});
