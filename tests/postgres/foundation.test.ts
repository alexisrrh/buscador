import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
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
import { PostgresSearchRepository } from "@/lib/server/db/search-repository";
import { defaultCanonicalPreferences, defaultCanonicalSearch } from "@/lib/onboarding/persistence";
import type { SaveSearchInput } from "@/lib/server/search-input";

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
let migrationNames: string[];
let searches: PostgresSearchRepository;
function draft(candidateProfileId = candidateA): SaveSearchInput {
  return { candidateProfileId, search: defaultCanonicalSearch("Frontend Developer"), preferences: defaultCanonicalPreferences() };
}

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
  migrationNames = (await readdir(new URL("../../db/migrations/", import.meta.url))).filter(x => x.endsWith(".sql")).sort();
  // Re-running a clean test database is supported without dropping any data.
  expect(first.every(name => migrationNames.includes(name))).toBe(true);
  expect(await applyMigrations(admin)).toEqual([]);
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
  await admin.query(`GRANT bv_app TO ${runtimeRole}`);
  url.username = runtimeRole;
  url.password = testPassword;
  runtime = createDatabasePool(url.toString(), 1);
  work = new UnitOfWork(runtime);
  repository = new PostgresProfileRepository(work);
  searches = new PostgresSearchRepository(work);
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
    for (const name of migrationNames) {
      const sql = await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8");
      await writeFile(join(directory, name), sql.replace(/\r?\n/g, "\r\n"));
    }
    const original = await readFile(join(directory, migrationNames[0]), "utf8");
    expect(await applyMigrations(admin, url)).toEqual([]);
    await writeFile(join(directory, "0001_identity_profiles.sql"), original + "\n-- changed after application\n");
    await expect(applyMigrations(admin, url)).rejects.toThrow("MIGRATION_HISTORY_MISMATCH");
    await writeFile(join(directory, "0001_identity_profiles.sql"), original);
    await writeFile(join(directory, "9999_atomic_failure.sql"), "CREATE TABLE public.atomic_probe(id int); SELECT 1/0;");
    await expect(applyMigrations(admin, url)).rejects.toMatchObject({ code: "22012" });
    expect((await admin.query("SELECT to_regclass('public.atomic_probe') AS name")).rows).toEqual([{ name: null }]);
    expect((await admin.query("SELECT name FROM app.schema_migrations ORDER BY name")).rows).toEqual(migrationNames.map(name => ({ name })));
    expect(await applyMigrations(admin)).toEqual([]);
  });
});

describe("PostgreSQL searches and versioned preferences", () => {
  it("creates one atomic draft with the original ownership and UNKNOWN preferences", async () => {
    const saved = await searches.save(actorA, draft());
    expect(saved.search).toMatchObject({ user_id: A, candidate_profile_id: candidateA, version: 1, status: "DRAFT", application_mode: "MANUAL" });
    expect(saved.preferences).toMatchObject({ search_profile_id: saved.search.id, search_profile_version: 1, work_mode_preference_state: "UNKNOWN" });
    expect(saved.search.next_run_at).toBeNull();
  });
  it("keeps two searches independent and does not expose user B's searches/history", async () => {
    const a1 = await searches.save(actorA, draft());
    const a2 = await searches.save(actorA, draft());
    const b = await searches.save(actorB, draft(candidateB));
    expect(a1.search.id).not.toBe(a2.search.id);
    expect(await searches.find(actorA, b.search.id)).toBeNull();
    await expect(searches.history(actorA, b.search.id)).rejects.toThrow("SEARCH_NOT_FOUND");
    const rows = await work.withActor(actorA, tx => tx.query("SELECT user_id FROM public.search_profiles"));
    expect(rows.rows.every(x => x.user_id === A)).toBe(true);
  });
  it("cannot create for another user's candidate, change owner or move a search to another profile", async () => {
    await expect(searches.save(actorA, draft(candidateB))).rejects.toThrow("SEARCH_NOT_FOUND");
    const saved = await searches.save(actorA, draft());
    await expect(work.withActor(actorA, tx => tx.query("UPDATE public.search_profiles SET user_id=$1,candidate_profile_id=$2 WHERE id=$3", [B,candidateB,saved.search.id])))
      .rejects.toMatchObject({ code: "42501" });
    const other = await repository.createCandidate(actorA, "Otra trayectoria");
    await expect(searches.save(actorA, { ...draft(other.id), searchId: saved.search.id, expectedVersion: 1 })).rejects.toThrow("SEARCH_NOT_FOUND");
  });
  it("preserves immutable snapshots across preference edits", async () => {
    const first = await searches.save(actorA, draft());
    const input = { ...draft(), searchId: first.search.id, expectedVersion: 1 };
    input.preferences.workModes = ["REMOTE"];
    input.preferences.workModePreferenceState = "SPECIFIED";
    input.preferences.locations = [{ country: "ES", label: "España" }];
    input.preferences.locationPreferenceState = "SPECIFIED";
    input.preferences.minimumSalary = 35000;
    input.preferences.currency = "EUR";
    input.preferences.salaryPreferenceState = "SPECIFIED";
    const second = await searches.save(actorA, input);
    expect(second.search.id).toBe(first.search.id);
    expect(second.search.version).toBe(2);
    const history = await searches.history(actorA, first.search.id);
    expect(history.map(x => x.search_profile_version)).toEqual([1, 2]);
    expect(history[0].work_modes).toEqual([]);
    expect(history[1]).toMatchObject({ work_modes: ["REMOTE"], minimum_salary: 35000, currency: "EUR" });
    await expect(work.withActor(actorA, tx => tx.query("UPDATE public.job_preferences SET keywords='{}' WHERE search_profile_id=$1", [first.search.id])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(work.withActor(actorA, tx => tx.query("DELETE FROM public.job_preferences WHERE search_profile_id=$1", [first.search.id])))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("rejects a stale update without creating another preference version", async () => {
    const first = await searches.save(actorA, draft());
    const input = { ...draft(), searchId: first.search.id, expectedVersion: 1 };
    await searches.save(actorA, input);
    await expect(searches.save(actorA, input)).rejects.toThrow("SEARCH_VERSION_CONFLICT");
    expect((await searches.history(actorA, first.search.id)).length).toBe(2);
  });
  it("serializes concurrent saves so only one stale-base update succeeds", async () => {
    const first = await searches.save(actorA, draft());
    const pool = createDatabasePool(runtime.options.connectionString!, 2);
    const concurrent = new PostgresSearchRepository(new UnitOfWork(pool));
    try {
      const input = { ...draft(), searchId: first.search.id, expectedVersion: 1 };
      const result = await Promise.allSettled([concurrent.save(actorA, input), concurrent.save(actorA, input)]);
      expect(result.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(result.filter(x => x.status === "rejected").map(x => x.reason.message)).toEqual(["SEARCH_VERSION_CONFLICT"]);
      expect((await searches.history(actorA, first.search.id)).map(x => x.search_profile_version)).toEqual([1, 2]);
    } finally { await pool.end(); }
  });
  it("rolls back the search version when preference persistence fails", async () => {
    const first = await searches.save(actorA, draft());
    const input = { ...draft(), searchId: first.search.id, expectedVersion: 1 };
    // Positive before SQL, but NUMERIC(14,2) rounds it to zero: the DB invariant rejects it.
    input.preferences.minimumSalary = 0.001;
    input.preferences.currency = "EUR";
    input.preferences.salaryPreferenceState = "SPECIFIED";
    await expect(searches.save(actorA, input)).rejects.toMatchObject({ code: "23514" });
    expect((await searches.find(actorA, first.search.id))?.search.version).toBe(1);
    expect(await searches.history(actorA, first.search.id)).toHaveLength(1);
  });
  it("enforces a preference snapshot for every committed current search version", async () => {
    const saved = await searches.save(actorA, draft());
    await expect(work.withActor(actorA, tx => tx.query("UPDATE public.search_profiles SET version=99 WHERE id=$1", [saved.search.id])))
      .rejects.toMatchObject({ code: "23503" });
    expect((await searches.find(actorA, saved.search.id))?.search.version).toBe(1);
  });
  it("enforces composite candidate ownership in SQL, not only RLS user_id", async () => {
    await expect(work.withActor(actorA, tx => tx.query("INSERT INTO public.search_profiles(user_id,candidate_profile_id,name) VALUES($1,$2,'forbidden')", [A,candidateB])))
      .rejects.toMatchObject({ code: "23503" });
  });
  it("denies future preference versions and cross-owner inserts", async () => {
    const a = await searches.save(actorA, draft());
    const b = await searches.save(actorB, draft(candidateB));
    await expect(work.withActor(actorA, tx => tx.query(`INSERT INTO public.job_preferences(user_id,candidate_profile_id,search_profile_id,search_profile_version)
      VALUES($1,$2,$3,99)`, [A,candidateA,a.search.id]))).rejects.toMatchObject({ code: "23514" });
    await expect(work.withActor(actorA, tx => tx.query(`INSERT INTO public.job_preferences(user_id,candidate_profile_id,search_profile_id,search_profile_version)
      VALUES($1,$2,$3,1)`, [B,candidateB,b.search.id]))).rejects.toMatchObject({ code: "42501" });
  });
  it("preserves UNRESTRICTED instead of inventing a specified preference", async () => {
    const input = draft();
    input.preferences.workModePreferenceState = "UNRESTRICTED";
    input.preferences.locationPreferenceState = "UNRESTRICTED";
    input.preferences.salaryPreferenceState = "UNRESTRICTED";
    const saved = await searches.save(actorA, input);
    expect(saved.preferences).toMatchObject({ work_mode_preference_state: "UNRESTRICTED", location_preference_state: "UNRESTRICTED", salary_preference_state: "UNRESTRICTED", work_modes: [], locations: [], minimum_salary: null });
  });
  it("rejects SPECIFIED salary without an amount even through direct SQL", async () => {
    await expect(work.withActor(actorA, async tx => {
      const created = await tx.query("INSERT INTO public.search_profiles(user_id,candidate_profile_id,name) VALUES($1,$2,'salary check') RETURNING id", [A,candidateA]);
      await tx.query(`INSERT INTO public.job_preferences(user_id,candidate_profile_id,search_profile_id,search_profile_version,salary_preference_state,currency)
        VALUES($1,$2,$3,1,'SPECIFIED','EUR')`, [A,candidateA,created.rows[0].id]);
    })).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects preferences linked to the wrong candidate of the same owner", async () => {
    const saved = await searches.save(actorA,draft());
    const other = await repository.createCandidate(actorA,"Otra preferencia");
    await expect(work.withActor(actorA, async tx => {
      await tx.query("UPDATE public.search_profiles SET version=2 WHERE id=$1",[saved.search.id]);
      await tx.query(`INSERT INTO public.job_preferences(user_id,candidate_profile_id,search_profile_id,search_profile_version)
        VALUES($1,$2,$3,2)`, [A,other.id,saved.search.id]);
    })).rejects.toMatchObject({ code: "23503" });
  });
  it("recalculates an active schedule atomically when saving a new version", async () => {
    const input=draft();input.search.frequencyType="INTERVAL";input.search.frequencyValue={minutes:60};
    const saved=await searches.save(actorA,input);
    await searches.transition(actorA,saved.search.id,1,"ACTIVE");
    input.search.frequencyValue={minutes:120};
    const edited=await searches.save(actorA,{...input,searchId:saved.search.id,expectedVersion:1});
    expect(edited.search).toMatchObject({status:"ACTIVE",version:2,application_mode:"MANUAL"});
    expect(Date.parse(edited.search.next_run_at!)).toBeGreaterThan(Date.now()+119*60000);
    expect(Date.parse(edited.search.next_run_at!)).toBeLessThan(Date.now()+121*60000);
  });
  it("activates, pauses, resumes and archives without changing preference history", async () => {
    const input = draft(); input.search.frequencyType = "INTERVAL"; input.search.frequencyValue = { minutes: 60 };
    const saved = await searches.save(actorA, input);
    const id = saved.search.id;
    await expect(searches.transition(actorA,id,1,"PAUSED")).rejects.toThrow("INVALID_SEARCH_TRANSITION");
    await expect(searches.transition(actorB,id,1,"ACTIVE")).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(searches.transition(actorA,id,2,"ACTIVE")).rejects.toThrow("SEARCH_VERSION_CONFLICT");
    await searches.transition(actorA,id,1,"ACTIVE");
    expect((await searches.find(actorA,id))?.search).toMatchObject({ status: "ACTIVE", version: 1 });
    expect(Date.parse((await searches.find(actorA,id))!.search.next_run_at!)).toBeGreaterThan(Date.now());
    await searches.transition(actorA,id,1,"PAUSED");
    expect((await searches.find(actorA,id))?.search.next_run_at).toBeNull();
    await searches.transition(actorA,id,1,"ACTIVE");
    await searches.transition(actorA,id,1,"ARCHIVED");
    expect(await searches.find(actorA,id)).toBeNull();
    await expect(searches.save(actorA,{...input,searchId:id,expectedVersion:1})).rejects.toThrow("SEARCH_NOT_FOUND");
    expect((await work.withActor(actorA,tx=>tx.query("SELECT count(*)::int AS count FROM public.job_preferences WHERE search_profile_id=$1",[id]))).rows[0].count).toBe(1);
  });
  it("rejects access when the parent candidate was soft-deleted", async () => {
    const parent = await repository.createCandidate(actorA, "Temporal");
    const saved = await searches.save(actorA,draft(parent.id));
    await work.withActor(actorA,tx=>tx.query("UPDATE public.candidate_profiles SET deleted_at=now() WHERE id=$1",[parent.id]));
    expect(await searches.find(actorA,saved.search.id)).toBeNull();
    await expect(searches.save(actorA,{...draft(parent.id),searchId:saved.search.id,expectedVersion:1})).rejects.toThrow("SEARCH_NOT_FOUND");
  });
  it("calculates daily/weekday schedules portably in the requested timezone", async () => {
    const result = await work.withActor(actorA,tx=>tx.query(`SELECT
      app.calculate_search_next_run('WEEKDAYS','{"time":"09:00"}','UTC','2026-11-06T09:00:00Z') AS weekday,
      app.calculate_search_next_run('DAILY','{"time":"09:00"}','Europe/Madrid','2026-11-06T09:00:00Z') AS daily`));
    expect(result.rows[0].weekday.toISOString()).toBe("2026-11-09T09:00:00.000Z");
    expect(result.rows[0].daily.toISOString()).toBe("2026-11-07T08:00:00.000Z");
  });
});
