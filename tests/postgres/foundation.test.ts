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
import { CatalogUnitOfWork } from "@/lib/server/db/catalog-unit-of-work";
import { PostgresJobOfferRepository } from "@/lib/server/db/job-offer-repository";
import { PostgresCatalogReader } from "@/lib/server/db/catalog-reader";
import { PostgresSourceRegistry } from "@/lib/server/db/source-registry";
import type { NormalizedJobOffer } from "@/lib/job-sources/types";
import { ingestJobSearchResults } from "@/lib/job-sources/ingestion";
import { PostgresMatchingRepository } from "@/lib/server/db/matching-repository";
import { matchJobOfferToSearchProfile } from "@/lib/matching/engine";
import { generateMatchesForSearchProfile } from "@/lib/matching/service";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const runtimeRole = `bv_test_${randomUUID().replaceAll("-", "")}`;
const testPassword = "synthetic-runtime-only";
const ingestRole = runtimeRole + "_ingest";
const catalogRole = runtimeRole + "_public";
let ingestPool: Pool, catalogPool: Pool;
let ingestWork: CatalogUnitOfWork;
let catalogWork: CatalogUnitOfWork;
let offers: PostgresJobOfferRepository;
let reader: PostgresCatalogReader;
let registry: PostgresSourceRegistry;
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
  for (const [login, role] of [[ingestRole,"bv_ingest"],[catalogRole,"bv_catalog"]]) {
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`);
    await admin.query(`GRANT ${role} TO ${login}`);
  }
  const roleUrl = new URL(raw); roleUrl.password = testPassword; roleUrl.username = ingestRole;
  ingestPool = createDatabasePool(roleUrl.toString(),2);
  roleUrl.username = catalogRole; catalogPool = createDatabasePool(roleUrl.toString(),1);
  ingestWork = new CatalogUnitOfWork(ingestPool,"bv_ingest");
  catalogWork = new CatalogUnitOfWork(catalogPool,"bv_catalog");
  offers = new PostgresJobOfferRepository(ingestWork);
  reader = new PostgresCatalogReader(catalogWork);
  registry = new PostgresSourceRegistry(ingestWork);
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
  if (ingestPool) await ingestPool.end();
  if (catalogPool) await catalogPool.end();
  if (runtime) await runtime.end();
  if (admin) {
    try { for(const role of [runtimeRole,ingestRole,catalogRole]) await admin.query(`DROP ROLE IF EXISTS ${role}`); }
    finally { await admin.end(); }
  }
  for (const directory of temporaryDirectories) {
    if (!directory.startsWith(join(tmpdir(), "bv-migrations-"))) throw new Error("Unsafe temporary path");
    await rm(directory, { recursive: true, force: true });
  }
});

function source() { return { code: "TEST_"+randomUUID().replaceAll("-","").toUpperCase(), name:"Fuente sintética", baseUrl:"https://jobs.example.test" }; }
function neutral(patch: Partial<NormalizedJobOffer> = {}): NormalizedJobOffer {
  const url="https://jobs.example.test/"+randomUUID();
  return {externalJobId:randomUUID(),title:"Frontend Developer",normalizedTitle:"frontend developer",company:{name:"Empresa Ejemplo",normalizedName:"empresa ejemplo",websiteUrl:null},
    description:"TypeScript and React",locationText:"España",countryCode:"ES",region:null,city:null,workMode:"REMOTE",seniority:"MID",employmentType:"FULL_TIME",
    salaryMin:35000,salaryMax:45000,salaryCurrency:"EUR",publishedAt:null,canonicalUrl:url,canonicalUrlIsReliable:true,sourceUrl:url,canonicalSourceUrl:url,status:"ACTIVE",...patch};
}
describe("PostgreSQL neutral ingestion and public catalogue",()=>{
  it("persists, looks up and reingests one neutral offer without duplicating it",async()=>{
    const src=source(),offer=neutral(),now=new Date();
    const first=await offers.persist(src,offer,{raw_marker_secret:"private diagnostic"},now);
    expect(first).toMatchObject({offerCreated:true,sourceCreated:true});
    expect(await offers.findExisting(src.code,offer)).toMatchObject({jobOfferId:first.jobOfferId,matchedBy:"external_job_id"});
    const second=await offers.persist(src,offer,{raw_marker_secret:"updated diagnostic"},new Date(now.valueOf()+1000));
    expect(second).toMatchObject({jobOfferId:first.jobOfferId,offerCreated:false,sourceCreated:false});
    const row=await ingestWork.run(tx=>tx.query("SELECT description_hash,last_seen_at FROM public.job_offers WHERE id=$1",[first.jobOfferId]));
    expect(row.rows[0].description_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.rows[0].last_seen_at.valueOf()).toBe(now.valueOf()+1000);
    const publicRows=await reader.load({now:new Date(now.valueOf()+1000),limit:1000});
    expect(publicRows.find(x=>x.id===first.jobOfferId)).toMatchObject({title:offer.title,companyName:"Empresa Ejemplo",sourceUrl:offer.sourceUrl,salaryMin:35000});
    expect(JSON.stringify(publicRows)).not.toContain("raw_marker_secret");
  });
  it("deduplicates a reliable canonical URL across providers but not an unreliable one",async()=>{
    const firstSource=source(),secondSource=source(),offer=neutral();
    const first=await offers.persist(firstSource,offer,{},new Date());
    const second=await offers.persist(secondSource,{...offer,externalJobId:randomUUID()}, {},new Date());
    expect(second).toMatchObject({jobOfferId:first.jobOfferId,offerCreated:false,sourceCreated:true});
    const unreliable=neutral({canonicalUrl:offer.canonicalUrl,canonicalUrlIsReliable:false});
    const third=await offers.persist(source(),unreliable,{},new Date());expect(third.jobOfferId).not.toBe(first.jobOfferId);
  });
  it("serializes concurrent retries into one offer/source",async()=>{
    const src=source(),offer=neutral();
    const results=await Promise.all([offers.persist(src,offer,{},new Date()),offers.persist(src,offer,{},new Date())]);
    expect(new Set(results.map(x=>x.jobOfferId)).size).toBe(1);
    expect(results.filter(x=>x.offerCreated)).toHaveLength(1);
  });
  it("uses canonical source URL when an external ID is absent",async()=>{
    const src=source(),offer=neutral({externalJobId:null,canonicalUrlIsReliable:false});
    await offers.persist(src,offer,{},new Date());
    expect(await offers.findExisting(src.code,offer)).toMatchObject({matchedBy:"canonical_source_url"});
  });
  it("supports mixed valid/invalid batches and reports unchanged/updated outcomes",async()=>{
    const src=source(),offer=neutral(),invalid=neutral({salaryMin:-1});
    const batch=await offers.persistBatch(src,[{offer,rawPayload:{n:1}},{offer:invalid,rawPayload:{n:2}}],new Date());
    expect(batch.errors).toBe(1);expect(batch.results).toHaveLength(1);expect(batch.results[0]).toMatchObject({inputIndex:0,outcome:"CREATED"});
    expect(await offers.findExisting(src.code,invalid)).toBeNull();
    const repeated=await offers.persistBatch(src,[{offer,rawPayload:{n:3}}],new Date());
    expect(repeated.results[0].outcome).toBe("UNCHANGED");
    const edited=await offers.persistBatch(src,[{offer:{...offer,description:"Updated requirement: PostgreSQL"},rawPayload:{n:4}}],new Date());
    expect(edited.results[0].outcome).toBe("UPDATED");
    expect(await offers.findExistingBatch(src.code,[offer,invalid])).toEqual([expect.objectContaining({jobOfferId:batch.results[0].jobOfferId}),null]);
  });
  it("reuses the existing ingestion engine with normalized fixture data and no network",async()=>{
    const src=source(),offer=neutral();
    const report=await ingestJobSearchResults({sourceCode:src.code,sourceName:src.name,sourceBaseUrl:src.baseUrl,
      search:async()=>({offers:[offer],stats:{pagesRequested:1,offersReceived:1}}),normalize:(value:NormalizedJobOffer)=>value},offers,{});
    expect(report).toMatchObject({offers_created:1,errors:0});expect(report.matching_job_offer_ids).toHaveLength(1);
  });
  it("registers all supported boards, records health and never reenables a disabled board",async()=>{
    const id=await registry.register({companyName:"Empresa Tablero",platform:"LEVER",identifier:"example",careersUrl:"https://jobs.lever.co/example"});
    expect(await registry.register({companyName:"Empresa Tablero",platform:"LEVER",identifier:"example",careersUrl:"https://jobs.lever.co/example"})).toBe(id);
    await offers.recordCompanyCareerSourceCheck(id,{success:false,errorCode:"SOURCE_TIMEOUT",checkedAt:new Date()});
    expect((await registry.list()).find(x=>x.id===id)).toMatchObject({status:"DEGRADED",lastErrorCode:"SOURCE_TIMEOUT"});
    await offers.recordCompanyCareerSourceCheck(id,{success:true,errorCode:null,checkedAt:new Date()});
    expect((await registry.list()).find(x=>x.id===id)).toMatchObject({status:"ACTIVE",lastErrorCode:null});
    await ingestWork.run(tx=>tx.query("UPDATE public.company_career_sources SET enabled=false,status='DISABLED' WHERE id=$1",[id]));
    await registry.register({companyName:"Empresa Tablero",platform:"LEVER",identifier:"example",careersUrl:"https://jobs.lever.co/example"});
    expect((await registry.list()).find(x=>x.id===id)).toMatchObject({enabled:false,status:"DISABLED"});
    await expect(offers.persist({code:"LEVER",name:"Lever",baseUrl:"https://jobs.lever.co",companyCareerSourceId:id},neutral(),{},new Date())).rejects.toThrow("42501");
    for(const platform of ["ASHBY","GREENHOUSE","SMARTRECRUITERS","JOBGETHER","JOBICY"] as const) {
      expect(await registry.register({companyName:"Empresa "+platform,platform,identifier:"example",careersUrl:"https://example.test/jobs"})).toBeTruthy();
    }
  });
  it("rejects provider/platform mismatches and rolls back collisions between boards",async()=>{
    const one=await registry.register({companyName:"Tablero Uno",platform:"ASHBY",identifier:"one",careersUrl:"https://jobs.ashbyhq.com/one"});
    const two=await registry.register({companyName:"Tablero Dos",platform:"ASHBY",identifier:"two",careersUrl:"https://jobs.ashbyhq.com/two"});
    const src={code:"ASHBY",name:"Ashby",baseUrl:"https://jobs.ashbyhq.com",companyCareerSourceId:one};
    const offer=neutral();const saved=await offers.persist(src,offer,{},new Date());
    await expect(offers.persist({...src,companyCareerSourceId:two},{...offer,title:"must not overwrite"},{},new Date())).rejects.toThrow("23505");
    expect((await ingestWork.run(tx=>tx.query("SELECT title FROM public.job_offers WHERE id=$1",[saved.jobOfferId]))).rows[0].title).toBe(offer.title);
    await expect(offers.persist({...src,code:"LEVER"},neutral(),{},new Date())).rejects.toThrow("23514");
  });
  it("hides expired, removed, stale and disabled-source offers from public readers",async()=>{
    const now=new Date(),ids:string[]=[];
    for(const status of ["EXPIRED","REMOVED"] as const) ids.push((await offers.persist(source(),neutral({status}),{},now)).jobOfferId);
    ids.push((await offers.persist(source(),neutral(),{},new Date(now.valueOf()-60*86400000))).jobOfferId);
    const src=source();const disabled=await offers.persist(src,neutral(),{},now);ids.push(disabled.jobOfferId);
    await ingestWork.run(tx=>tx.query("UPDATE public.job_sources SET enabled=false WHERE code=$1",[src.code]));
    await expect(offers.persist(src,neutral(),{},now)).rejects.toThrow("42501");
    const expired=await offers.persist(source(),neutral(),{},now);ids.push(expired.jobOfferId);
    await ingestWork.run(tx=>tx.query("UPDATE public.job_offers SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.jobOfferId]));
    expect((await reader.load({now,limit:1000})).some(x=>ids.includes(x.id))).toBe(false);
  });
  it("keeps last_seen monotonic and rejects unsafe public URLs",async()=>{
    const src=source(),offer=neutral(),now=new Date();const saved=await offers.persist(src,offer,{},now);
    await offers.persist(src,offer,{},new Date(now.valueOf()-1000));
    expect((await ingestWork.run(tx=>tx.query("SELECT last_seen_at FROM public.job_offers WHERE id=$1",[saved.jobOfferId]))).rows[0].last_seen_at.valueOf()).toBe(now.valueOf());
    await expect(offers.persist(source(),neutral({sourceUrl:"javascript:alert(1)"}),{},now)).rejects.toThrow("23514");
  });
  it.each(["profiles","candidate_profiles","search_profiles","job_preferences","job_matches"])("both neutral roles cannot read private %s",async table=>{
    await expect(ingestPool.query(`SELECT id FROM public.${table}`)).rejects.toMatchObject({code:"42501"});
    await expect(catalogPool.query(`SELECT id FROM public.${table}`)).rejects.toMatchObject({code:"42501"});
  });
  it("denies raw payload, source health, writes and ingestion functions to the public role",async()=>{
    for(const sql of ["SELECT raw_payload FROM public.job_offer_sources","SELECT last_error_code FROM public.company_career_sources",
      "INSERT INTO public.companies(name) VALUES('forbidden')","SELECT app.ingest_job_offer('{}'::jsonb,now())"]) {
      await expect(catalogPool.query(sql)).rejects.toMatchObject({code:"42501"});
    }
    await expect(runtime.query("SELECT app.ingest_job_offer('{}'::jsonb,now())")).rejects.toMatchObject({code:"42501"});
    await expect(ingestPool.query("TRUNCATE public.job_offers CASCADE")).rejects.toMatchObject({code:"42501"});
  });
  it("rejects privileged, private or mixed credentials in neutral transactions",async()=>{
    await expect(new CatalogUnitOfWork(admin,"bv_ingest").run(tx=>tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_CATALOG_ROLE");
    await expect(new CatalogUnitOfWork(runtime,"bv_ingest").run(tx=>tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_CATALOG_ROLE");
    await expect(new UnitOfWork(ingestPool).withActor(actorA,tx=>tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_DATABASE_ROLE");
    await admin.query(`GRANT bv_app TO ${ingestRole}`);
    try { await expect(ingestWork.run(tx=>tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_CATALOG_ROLE"); }
    finally { await admin.query(`REVOKE bv_app FROM ${ingestRole}`); }
    await admin.query(`ALTER ROLE ${ingestRole} CREATEROLE`);
    try { await expect(ingestWork.run(tx=>tx.query("SELECT 1"))).rejects.toThrow("UNSAFE_CATALOG_ROLE"); }
    finally { await admin.query(`ALTER ROLE ${ingestRole} NOCREATEROLE`); }
    expect((await catalogPool.query("SELECT current_setting('app.user_id',true) AS id")).rows[0].id??"").toBe("");
  });
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

describe("PostgreSQL matching using the existing deterministic engine",()=>{
  async function matchingFixture() {
    const saved=await searches.save(actorA,draft());
    await searches.transition(actorA,saved.search.id,1,"ACTIVE");
    const repo=new PostgresMatchingRepository(work,catalogWork,actorA);
    const context=await repo.loadSearchContext(saved.search.id,A);
    const persisted=await offers.persist(source(),neutral(),{},new Date());
    const offer=(await repo.loadRecentActiveOffers({limit:5000,seenAfter:new Date(Date.now()-86400000).toISOString()})).find(o=>o.id===persisted.jobOfferId)!;
    expect(offer).toBeDefined();
    const result=matchJobOfferToSearchProfile({...context,offer});
    return {repo,context,saved,input:{searchProfileId:saved.search.id,jobOfferId:offer.id,result}};
  }
  async function stored(searchId:string) {
    return (await work.withActor(actorA,tx=>tx.query("SELECT * FROM public.job_matches WHERE search_profile_id=$1 ORDER BY created_at,id",[searchId]))).rows;
  }
  it("persists the unchanged engine output and upserts without duplicating the result",async()=>{
    const f=await matchingFixture();expect(await f.repo.upsertMatch(f.input)).toEqual({created:true});
    expect(await f.repo.upsertMatch(f.input)).toEqual({created:false});
    const rows=await stored(f.saved.search.id);expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({user_id:A,candidate_profile_id:candidateA,search_profile_version:1,scoring_version:"deterministic-v2",
      score:f.input.result.score,eligibility_status:f.input.result.eligibility,score_components:f.input.result.components,
      hard_gates:f.input.result.hardGates,reasons:f.input.result.reasons,status:"NEW"});
    expect(await f.repo.loadExistingMatchOfferIds({searchProfileId:f.saved.search.id,searchProfileVersion:1,scoringVersion:"deterministic-v2"})).toEqual(new Set([f.input.jobOfferId]));
  });
  it("runs the existing matching service against the new repository and skips unchanged offers",async()=>{
    const f=await matchingFixture();
    const first=await generateMatchesForSearchProfile(f.repo,A,f.saved.search.id,{limit:5000});
    expect(first.offersProcessed).toBeGreaterThan(0);expect(first.matchesCreated).toBe(first.offersProcessed);
    const second=await generateMatchesForSearchProfile(f.repo,A,f.saved.search.id,{limit:5000,changedJobOfferIds:[]});
    expect(second.offersProcessed).toBe(0);expect(second.matchesSkipped).toBe(first.offersProcessed);
  });
  it("isolates two users even for direct SQL without a user filter",async()=>{
    const f=await matchingFixture();await f.repo.upsertMatch(f.input);
    const row=(await stored(f.saved.search.id))[0];
    const other=new PostgresMatchingRepository(work,catalogWork,actorB);
    await expect(other.loadSearchContext(f.saved.search.id,B)).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");
    await expect(other.loadSearchContext(f.saved.search.id,A)).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");
    expect((await work.withActor(actorB,tx=>tx.query("SELECT id FROM public.job_matches WHERE id=$1",[row.id]))).rows).toEqual([]);
    await expect(other.setStatus(row.id,"DISMISSED")).rejects.toThrow("MATCH_NOT_FOUND");
    await expect(work.withActor(actorA,tx=>tx.query("UPDATE public.job_matches SET user_id=$1 WHERE id=$2",[B,row.id]))).rejects.toMatchObject({code:"42501"});
  });
  it("rejects stale calculations after a preference edit and keeps both snapshots",async()=>{
    const f=await matchingFixture();await f.repo.upsertMatch(f.input);
    await searches.save(actorA,{...draft(),searchId:f.saved.search.id,expectedVersion:1});
    await expect(f.repo.upsertMatch(f.input)).rejects.toThrow("MATCH_SEARCH_VERSION_CONFLICT");
    const context=await f.repo.loadSearchContext(f.saved.search.id,A);expect(context.search.version).toBe(2);
    await f.repo.upsertMatch(f.input);expect((await stored(f.saved.search.id)).map(x=>x.search_profile_version)).toEqual([1,2]);
  });
  it("rejects paused searches and rolls back a batch containing a nonexistent offer",async()=>{
    const f=await matchingFixture();
    await expect(f.repo.upsertMatches([f.input,{...f.input,jobOfferId:randomUUID()}])).rejects.toMatchObject({code:"23503"});
    expect(await stored(f.saved.search.id)).toHaveLength(0);
    await searches.transition(actorA,f.saved.search.id,1,"PAUSED");
    await expect(f.repo.upsertMatch(f.input)).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");
  });
  it.each(["SAVED","DISMISSED","APPLIED"] as const)("preserves %s during rescoring and inherits only within a preference snapshot",async status=>{
    const f=await matchingFixture();await f.repo.upsertMatch(f.input);
    const row=(await stored(f.saved.search.id))[0];await f.repo.setStatus(row.id,status);
    await f.repo.upsertMatch(f.input);expect((await stored(f.saved.search.id))[0].status).toBe(status);
    // Legacy import fixture: v1 decisions carry to v2 scoring within the same search version.
    await work.withActor(actorA,tx=>tx.query("UPDATE public.job_matches SET scoring_version='deterministic-v1' WHERE id=$1",[row.id]));
    await f.repo.upsertMatch(f.input);expect((await stored(f.saved.search.id)).map(x=>x.status)).toEqual([status,status]);
    await searches.save(actorA,{...draft(),searchId:f.saved.search.id,expectedVersion:1});
    await f.repo.loadSearchContext(f.saved.search.id,A);await f.repo.upsertMatch(f.input);
    expect((await stored(f.saved.search.id)).find(x=>x.search_profile_version===2)?.status).toBe("NEW");
  });
  it("serializes concurrent upserts into a single identity",async()=>{
    const f=await matchingFixture();
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username=runtimeRole;url.password=testPassword;
    const independentPool=createDatabasePool(url.toString(),1);
    try {
      const second=new PostgresMatchingRepository(new UnitOfWork(independentPool),catalogWork,actorA);
      await second.loadSearchContext(f.saved.search.id,A);
      const results=await Promise.all([f.repo.upsertMatch(f.input),second.upsertMatch(f.input)]);
      expect(results.filter(x=>x.created)).toHaveLength(1);expect(await stored(f.saved.search.id)).toHaveLength(1);
    } finally { await independentPool.end(); }
  });
  it("rolls back the first 200 results when a later chunk fails",async()=>{
    const f=await matchingFixture();
    const batch=await offers.persistBatch(source(),Array.from({length:200},()=>({offer:neutral(),rawPayload:{}})),new Date());
    expect(batch.errors).toBe(0);expect(batch.results).toHaveLength(200);
    const inputs=batch.results.map(row=>({...f.input,jobOfferId:row.jobOfferId}));
    await expect(f.repo.upsertMatches([...inputs,{...f.input,jobOfferId:randomUUID()}])).rejects.toMatchObject({code:"23503"});
    expect(await stored(f.saved.search.id)).toHaveLength(0);
  });
  it("denies missing tenant context and validates scores and preference references",async()=>{
    const f=await matchingFixture();await f.repo.upsertMatch(f.input);const row=(await stored(f.saved.search.id))[0];
    expect((await runtime.query("SELECT id FROM public.job_matches")).rows).toEqual([]);
    await expect(work.withActor(actorA,tx=>tx.query("UPDATE public.job_matches SET score=101 WHERE id=$1",[row.id]))).rejects.toMatchObject({code:"23514"});
    await expect(work.withActor(actorA,tx=>tx.query("UPDATE public.job_matches SET search_profile_version=99 WHERE id=$1",[row.id]))).rejects.toMatchObject({code:"23503"});
    await expect(work.withActor(actorA,tx=>tx.query("SELECT * FROM public.job_offers"))).rejects.toMatchObject({code:"42501"});
  });
});
