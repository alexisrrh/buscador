import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { requireActor } from "@/lib/server/context";
import { UnitOfWork } from "@/lib/server/db/unit-of-work";
import { PostgresSearchRepository } from "@/lib/server/db/search-repository";
import { defaultCanonicalSearch, defaultCanonicalPreferences } from "@/lib/onboarding/persistence";

const owner="11111111-1111-4111-8111-111111111111", candidate="22222222-2222-4222-8222-222222222222", id="33333333-3333-4333-8333-333333333333";
const actor=()=>requireActor(async()=>({user:{id:owner,disabled:false},session:{id:"session",expiresAt:new Date(Date.now()+60000)}}));
const draft=()=>({candidateProfileId:candidate,search:defaultCanonicalSearch("Frontend"),preferences:defaultCanonicalPreferences()});
function fixture(options: { parent?: boolean; current?: boolean; version?: number; status?: string; snapshot?: boolean }={}) {
  const search={id,user_id:owner,candidate_profile_id:candidate,version:options.version??1,status:options.status??"DRAFT"};
  const preferences={search_profile_id:id,search_profile_version:search.version};
  const query=vi.fn<(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number}>>().mockImplementation(async sql=>{
    if(sql.includes("AS unsafe"))return {rows:[{unsafe:false}],rowCount:1};
    if(sql.includes("FOR SHARE OF"))return {rows:options.parent===false?[]:[{id:candidate}],rowCount:options.parent===false?0:1};
    if(sql.includes("SELECT * FROM public.search_profiles"))return {rows:options.current===false?[]:[search],rowCount:1};
    if(sql.includes("AS search"))return {rows:options.snapshot===false?[]:[{search,preferences}],rowCount:1};
    if(sql.includes("RETURNING id,version"))return {rows:[{id,version:1}],rowCount:1};
    if(sql.includes("SELECT to_jsonb(p)"))return {rows:[{preferences}],rowCount:1};
    return {rows:[],rowCount:0};
  });
  const release=vi.fn();const connect=vi.fn(async()=>({query,release}) as unknown as PoolClient);
  return {repository:new PostgresSearchRepository(new UnitOfWork({connect} as Pick<Pool,"connect">)),query,connect,search,preferences};
}
describe("search repository server boundary",()=>{
  it("validates before acquiring a connection",async()=>{
    const f=fixture(),input=draft();input.search.name="";
    await expect(f.repository.save(await actor(),input)).rejects.toThrow("INVALID_SEARCH_INPUT");expect(f.connect).not.toHaveBeenCalled();
  });
  it("creates atomically and derives owner/version from the transaction",async()=>{
    const f=fixture();const result=await f.repository.save(await actor(),draft());expect(result.search.id).toBe(id);
    const values=f.query.mock.calls.find(x=>x[0].includes("INSERT INTO public.job_preferences"))?.[1];
    expect(values?.slice(0,4)).toEqual([owner,candidate,id,1]);expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("rejects inaccessible parents and searches",async()=>{
    await expect(fixture({parent:false}).repository.save(await actor(),draft())).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(fixture({current:false}).repository.save(await actor(),{...draft(),searchId:id,expectedVersion:1})).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(fixture({status:"ARCHIVED"}).repository.save(await actor(),{...draft(),searchId:id,expectedVersion:1})).rejects.toThrow("SEARCH_NOT_FOUND");
  });
  it("rejects stale writes and accepts current versions",async()=>{
    await expect(fixture({version:2}).repository.save(await actor(),{...draft(),searchId:id,expectedVersion:1})).rejects.toThrow("SEARCH_VERSION_CONFLICT");
    const f=fixture();await f.repository.save(await actor(),{...draft(),searchId:id,expectedVersion:1});
    expect(f.query.mock.calls.some(x=>x[0].includes("version=version+1"))).toBe(true);
  });
  it("rolls back when persistence cannot return the created snapshot",async()=>{
    const f=fixture({snapshot:false});await expect(f.repository.save(await actor(),draft())).rejects.toThrow("SEARCH_PERSISTENCE_FAILED");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("returns an optional owned snapshot and authorized history",async()=>{
    const f=fixture();expect((await f.repository.find(await actor(),id))?.search.id).toBe(id);
    expect(await f.repository.history(await actor(),id)).toEqual([f.preferences]);
    const hidden=fixture({snapshot:false});expect(await hidden.repository.find(await actor(),id)).toBeNull();
    await expect(hidden.repository.history(await actor(),id)).rejects.toThrow("SEARCH_NOT_FOUND");
  });
  it("checks access, version and state again before a transition",async()=>{
    await expect(fixture({snapshot:false}).repository.transition(await actor(),id,1,"ACTIVE")).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(fixture({current:false}).repository.transition(await actor(),id,1,"ACTIVE")).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(fixture({parent:false}).repository.transition(await actor(),id,1,"ACTIVE")).rejects.toThrow("SEARCH_NOT_FOUND");
    await expect(fixture({version:2}).repository.transition(await actor(),id,1,"ACTIVE")).rejects.toThrow("SEARCH_VERSION_CONFLICT");
    await expect(fixture().repository.transition(await actor(),id,1,"PAUSED")).rejects.toThrow("INVALID_SEARCH_TRANSITION");
    const f=fixture();await f.repository.transition(await actor(),id,1,"ACTIVE");expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});
