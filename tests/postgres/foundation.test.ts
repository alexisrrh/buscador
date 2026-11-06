import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate";
import { requireActor, type ActorContext } from "@/lib/server/context";
import { createDatabasePool } from "@/lib/server/db/pool";
import { UnitOfWork } from "@/lib/server/db/unit-of-work";
import { PostgresProfileRepository } from "@/lib/server/db/profile-repository";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const runtimeRole = `bv_test_${randomUUID().replaceAll("-", "")}`;
const testPassword = "synthetic-runtime-only";
let admin: Pool;
let runtime: Pool;
let work: UnitOfWork;
let repository: PostgresProfileRepository;
let actorA: ActorContext;
let actorB: ActorContext;
let candidateA: string;
let candidateB: string;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is required; database tests never silently skip.");
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/buscavacante_test") {
    throw new Error("Only the dedicated local buscavacante_test database is allowed.");
  }
  admin = new Pool({ connectionString: raw, max: 2, connectionTimeoutMillis: 5_000 });
  const version = await admin.query<{ version: string }>("SELECT current_setting('server_version_num') AS version");
  expect(Number(version.rows[0].version)).toBeGreaterThanOrEqual(170000);
  expect(Number(version.rows[0].version)).toBeLessThan(180000);
  await admin.query(await readFile(new URL("../../db/bootstrap.sql", import.meta.url), "utf8"));
  const first = await applyMigrations(admin);
  // Re-running a clean test database is supported without dropping any data.
  expect(first.every(name => name === "0001_identity_profiles.sql")).toBe(true);
  expect(await applyMigrations(admin)).toEqual([]);
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
  await admin.query(`GRANT bv_app TO ${runtimeRole}`);
  url.username = runtimeRole;
  url.password = testPassword;
  runtime = createDatabasePool(url.toString(), 1);
  work = new UnitOfWork(runtime);
  repository = new PostgresProfileRepository(work);
  const actor = (id: string) => requireActor(async () => ({ user: { id, disabled: false }, session: { id: `synthetic-${id}`, expiresAt: new Date(Date.now() + 600_000) } }));
  actorA = await actor(A);
  actorB = await actor(B);
  await repository.ensureOwnProfile(actorA);
  await repository.ensureOwnProfile(actorB);
  // Fixture rows are only inserted when missing, preserving repeated-run data.
  candidateA = (await repository.listCandidates(actorA))[0]?.id ?? (await repository.createCandidate(actorA, "Persona A")).id;
  candidateB = (await repository.listCandidates(actorB))[0]?.id ?? (await repository.createCandidate(actorB, "Persona B")).id;
});

afterAll(async () => {
  if (runtime) await runtime.end();
  if (admin) {
    try { await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`); }
    finally { await admin.end(); }
  }
  for (const directory of temporaryDirectories) {
    if (!directory.startsWith(join(tmpdir(), "bv-migrations-"))) throw new Error("Unsafe temporary path");
    await rm(directory, { recursive: true, force: true });
  }
});

describe("real PostgreSQL tenant isolation", () => {
  it("keeps original UUID identity and creates a profile idempotently", async () => {
    expect(await repository.ensureOwnProfile(actorA)).toBe(A);
    const result = await work.withActor(actorA, tx => tx.query("SELECT id FROM public.profiles"));
    expect(result.rows).toEqual([{ id: A }]);
  });
  it("does not reveal another candidate even when the repository knows its UUID", async () => {
    expect(await repository.findCandidate(actorA, candidateB)).toBeNull();
    expect((await repository.listCandidates(actorB)).every(row => row.user_id === B)).toBe(true);
  });
  it("enforces RLS even without an application ownership filter", async () => {
    const result = await work.withActor(actorA, tx => tx.query("SELECT user_id FROM public.candidate_profiles"));
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(row => row.user_id === A)).toBe(true);
  });
  it("denies insertion for another owner", async () => {
    await expect(work.withActor(actorA, tx => tx.query("INSERT INTO public.candidate_profiles (user_id, name) VALUES ($1, 'forbidden')", [B])))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("denies ownership reassignment through WITH CHECK", async () => {
    await expect(work.withActor(actorA, tx => tx.query("UPDATE public.candidate_profiles SET user_id = $1 WHERE id = $2", [B, candidateA])))
      .rejects.toMatchObject({ code: "42501" });
    expect((await repository.findCandidate(actorA, candidateA))?.user_id).toBe(A);
  });
  it("cannot update or delete another user's row", async () => {
    const count = await work.withActor(actorA, async tx => {
      const update = await tx.query("UPDATE public.candidate_profiles SET name = 'forbidden' WHERE id = $1", [candidateB]);
      const remove = await tx.query("DELETE FROM public.candidate_profiles WHERE id = $1", [candidateB]);
      return [update.rowCount, remove.rowCount];
    });
    expect(count).toEqual([0, 0]);
    expect(await repository.findCandidate(actorB, candidateB)).not.toBeNull();
  });
  it("denies data without context after commit and after rollback on the same pooled connection", async () => {
    await repository.listCandidates(actorA);
    expect((await runtime.query("SELECT id FROM public.profiles")).rows).toEqual([]);
    await expect(work.withActor(actorB, async () => { throw new Error("ROLLBACK_TEST"); })).rejects.toThrow("ROLLBACK_TEST");
    expect((await runtime.query("SELECT id FROM public.profiles")).rows).toEqual([]);
    const result = await runtime.query("SELECT app.current_user_id() AS id");
    expect(result.rows).toEqual([{ id: null }]);
  });
  it("rolls back domain writes and safely alternates A/B after SQL errors", async () => {
    const id = randomUUID();
    await expect(work.withActor(actorA, async tx => {
      await tx.query("INSERT INTO public.candidate_profiles (id,user_id,name) VALUES ($1,$2,'rollback')", [id, A]);
      await tx.query("SELECT 1/0");
    })).rejects.toMatchObject({ code: "22012" });
    expect(await repository.findCandidate(actorA, id)).toBeNull();
    expect((await repository.listCandidates(actorB)).every(x => x.user_id === B)).toBe(true);
    expect((await repository.listCandidates(actorA)).every(x => x.user_id === A)).toBe(true);
  });
  it("preserves isolation across concurrent requests and connections", async () => {
    const pool = createDatabasePool(runtime.options.connectionString!, 2);
    const concurrent = new UnitOfWork(pool);
    try {
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => {
        const actor = i % 2 ? actorA : actorB;
        return concurrent.withActor(actor, async tx => {
          await tx.query("SELECT pg_sleep(0.01)");
          const rows = await tx.query("SELECT id FROM public.profiles");
          return { expected: actor.userId, ids: rows.rows.map(x => x.id) };
        });
      }));
      for (const result of results) expect(result.ids).toEqual([result.expected]);
    } finally { await pool.end(); }
  });
  it("rejects no-context writes and malformed context", async () => {
    await expect(runtime.query("INSERT INTO public.profiles (id) VALUES ($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
    await expect(work.withActor(actorA, async tx => {
      await tx.query("SELECT set_config('app.user_id', 'malformed', true)");
      return tx.query("SELECT id FROM public.profiles");
    })).rejects.toMatchObject({ code: "22P02" });
  });
  it("does not reactivate a soft-deleted identity", async () => {
    const id = randomUUID();
    const actor = await requireActor(async () => ({ user: { id, disabled: false }, session: { id: "deleted", expiresAt: new Date(Date.now() + 60_000) } }));
    await repository.ensureOwnProfile(actor);
    await work.withActor(actor, tx => tx.query("UPDATE public.profiles SET deleted_at = now() WHERE id = $1", [id]));
    await expect(repository.ensureOwnProfile(actor)).rejects.toThrow("PROFILE_UNAVAILABLE");
  });
  it.each([
    "CREATE TABLE public.forbidden (id int)",
    "CREATE TABLE app.forbidden (id int)",
    "TRUNCATE public.profiles CASCADE",
    "SELECT * FROM app.schema_migrations",
    "SET ROLE bv_owner",
  ])("runtime lacks privileged access: %s", async sql => {
    await expect(work.withActor(actorA, tx => tx.query(sql))).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects an administrator connection in the application unit of work", async () => {
    await expect(new UnitOfWork(admin).withActor(actorA, tx => tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_DATABASE_ROLE");
  });
});

describe("portable migration history", () => {
  it("detects drift, normalizes CRLF and rolls back a failing migration atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bv-migrations-"));
    temporaryDirectories.push(directory);
    const url = pathToFileURL(directory + "/");
    const original = await readFile(new URL("../../db/migrations/0001_identity_profiles.sql", import.meta.url), "utf8");
    await writeFile(join(directory, "0001_identity_profiles.sql"), original.replace(/\r?\n/g, "\r\n"));
    expect(await applyMigrations(admin, url)).toEqual([]);
    await writeFile(join(directory, "0001_identity_profiles.sql"), original + "\n-- changed after application\n");
    await expect(applyMigrations(admin, url)).rejects.toThrow("MIGRATION_HISTORY_MISMATCH");
    await writeFile(join(directory, "0001_identity_profiles.sql"), original);
    await writeFile(join(directory, "0002_atomic_failure.sql"), "CREATE TABLE public.atomic_probe(id int); SELECT 1/0;");
    await expect(applyMigrations(admin, url)).rejects.toMatchObject({ code: "22012" });
    expect((await admin.query("SELECT to_regclass('public.atomic_probe') AS name")).rows).toEqual([{ name: null }]);
    expect((await admin.query("SELECT name FROM app.schema_migrations ORDER BY name")).rows).toEqual([{ name: "0001_identity_profiles.sql" }]);
    expect(await applyMigrations(admin)).toEqual([]);
  });
});
