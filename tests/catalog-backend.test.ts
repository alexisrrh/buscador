import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { CatalogUnitOfWork } from "@/lib/server/db/catalog-unit-of-work";
import { PostgresCatalogReader } from "@/lib/server/db/catalog-reader";
import { PostgresSourceRegistry } from "@/lib/server/db/source-registry";
import { createPostgresJobOfferClient, PostgresJobOfferRepository } from "@/lib/server/db/job-offer-repository";
import { RpcJobOfferRepository } from "@/lib/job-sources/rpc-repository";

function fixture(role: "bv_ingest"|"bv_catalog"="bv_ingest") {
  const query=vi.fn<(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number}>>()
    .mockImplementation(async sql=>({rows:sql.includes("AS allowed")?[{allowed:true,unsafe:false}]:sql.includes("AS data")?[{data:{ok:true}}]:[],rowCount:1}));
  const release=vi.fn();const connect=vi.fn(async()=>({query,release}) as unknown as PoolClient);
  return {work:new CatalogUnitOfWork({connect} as Pick<Pool,"connect">,role),query,release,connect};
}
describe("neutral transaction boundary",()=>{
  it("enforces role membership and clears tenant context before a neutral operation",async()=>{
    const f=fixture();expect(await f.work.run(async tx=>{await tx.query("SELECT 1");return 1;})).toBe(1);
    expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.user_id','',true)");
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");expect(f.release).toHaveBeenCalledWith(false);
  });
  it("makes public reads read-only and rejects unsupported roles",async()=>{
    const f=fixture("bv_catalog");await f.work.run(async()=>1);expect(f.query).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
    expect(()=>new CatalogUnitOfWork({connect:f.connect} as Pick<Pool,"connect">,"other" as "bv_catalog")).toThrow("INVALID_CATALOG_ROLE");
  });
  it.each([{allowed:false,unsafe:false},{allowed:true,unsafe:true}])("denies unsafe membership %#",async state=>{
    const f=fixture();f.query.mockResolvedValue({rows:[state],rowCount:1});const operation=vi.fn();
    await expect(f.work.run(operation)).rejects.toThrow("UNSAFE_CATALOG_ROLE");expect(operation).not.toHaveBeenCalled();
  });
  it("denies missing role metadata",async()=>{
    const f=fixture();f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.work.run(async()=>1)).rejects.toThrow("UNSAFE_CATALOG_ROLE");
  });
  it("rolls back a domain error and preserves it when rollback also fails",async()=>{
    const f=fixture();await expect(f.work.run(async()=>{throw new Error("ORIGINAL");})).rejects.toThrow("ORIGINAL");
    expect(f.release).toHaveBeenLastCalledWith(false);
    f.query.mockImplementation(async sql=>{if(sql==="ROLLBACK")throw new Error("LOST");return {rows:[{allowed:true,unsafe:false}],rowCount:1};});
    await expect(f.work.run(async()=>{throw new Error("ORIGINAL");})).rejects.toThrow("ORIGINAL");expect(f.release).toHaveBeenLastCalledWith(true);
  });
});
describe("parameterized PostgreSQL ingestion transport",()=>{
  it("allows only known SQL functions and serializes JSON as a value",async()=>{
    const f=fixture(),client=createPostgresJobOfferClient(f.work);
    expect(await client.rpc("ingest_job_offer",{p_offer:{title:"'; DROP TABLE profiles; --"},p_observed_at:"2026-11-06"})).toEqual({data:{ok:true},error:null});
    expect(f.query).toHaveBeenCalledWith("SELECT app.ingest_job_offer($1,$2) AS data",[JSON.stringify({title:"'; DROP TABLE profiles; --"}),"2026-11-06"]);
    const before=f.connect.mock.calls.length;
    expect((await client.rpc("__proto__",{})).error?.code).toBe("UNSUPPORTED_OPERATION");
    expect((await client.rpc("DROP TABLE profiles",{})).error?.code).toBe("UNSUPPORTED_OPERATION");expect(f.connect).toHaveBeenCalledTimes(before);
  });
  it("returns codes without exposing SQL diagnostics or payloads",async()=>{
    const f=fixture(),client=createPostgresJobOfferClient(f.work);
    f.query.mockRejectedValue(Object.assign(new Error("secret SQL and payload"),{code:"42501"}));
    const result=await client.rpc("ingest_job_offer",{p_offer:{},p_observed_at:"2026-11-06"});
    expect(result.error).toEqual({message:"CATALOG_OPERATION_FAILED",code:"42501"});expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("rejects serialization failures and handles absent SQL data",async()=>{
    const f=fixture(),client=createPostgresJobOfferClient(f.work);
    expect((await client.rpc("ingest_job_offer",{p_offer:{bad:BigInt(1)}})).error?.code).toBe("DATABASE_ERROR");
    f.query.mockImplementation(async sql=>({rows:sql.includes("AS allowed")?[{allowed:true,unsafe:false}]:[],rowCount:0}));
    expect(await client.rpc("find_existing_job_offer",{})).toEqual({data:null,error:null});
  });
  it("requires ingestion credentials and bounded batch sizes",()=>{
    const f=fixture("bv_catalog");expect(()=>createPostgresJobOfferClient(f.work)).toThrow("INGESTION_ROLE_REQUIRED");
    for(const size of [0,-1,501,1.5])expect(()=>new PostgresJobOfferRepository(fixture().work,size)).toThrow("INVALID_BATCH_SIZE");
    expect(new PostgresJobOfferRepository(fixture().work,2)).toBeInstanceOf(RpcJobOfferRepository);
  });
  it("counts per-item SQL failures alongside valid batch results",async()=>{
    const rpc=vi.fn(async()=>({data:{results:[],errors:1},error:null}));
    const repository=new RpcJobOfferRepository({rpc});
    const result=await repository.persistBatch({code:"TEST",name:"Test",baseUrl:"https://example.test"},[{offer:{} as Parameters<RpcJobOfferRepository["persist"]>[1],rawPayload:{}}],new Date());
    expect(result.errors).toBe(1);expect(result.results).toEqual([]);
  });
});
describe("public catalogue and source registry boundaries",()=>{
  it("restricts constructors to the corresponding role",()=>{
    expect(()=>new PostgresCatalogReader(fixture().work)).toThrow("CATALOG_READER_ROLE_REQUIRED");
    expect(()=>new PostgresSourceRegistry(fixture("bv_catalog").work)).toThrow("INGESTION_ROLE_REQUIRED");
  });
  it("validates public limits/dates before opening a transaction",async()=>{
    const f=fixture("bv_catalog"),reader=new PostgresCatalogReader(f.work);
    for(const limit of [0,1001,1.5])await expect(reader.load({limit})).rejects.toThrow("INVALID_CATALOG_READ");
    await expect(reader.load({now:new Date(NaN)})).rejects.toThrow("INVALID_CATALOG_READ");expect(f.connect).not.toHaveBeenCalled();
  });
  it("maps only the public allowlist, reusing the current domain output",async()=>{
    const f=fixture("bv_catalog"),now=new Date("2026-11-06T10:00:00Z");
    f.query.mockImplementation(async sql=>({rows:sql.includes("AS allowed")?[{allowed:true,unsafe:false}]:sql.includes("FROM public.job_offers o")?[{
      id:"offer",title:"Developer",description:"TypeScript",status:"ACTIVE",last_seen_at:now.toISOString(),companies:{name:"Example"},
      job_offer_sources:[{source_url:"https://example.test/job",job_sources:{name:"Example source"}}],raw_payload:{private_marker:"secret"},
    }]:[],rowCount:1}));
    const result=await new PostgresCatalogReader(f.work).load({now});expect(result[0]).toMatchObject({id:"offer",sourceName:"Example source"});
    expect(JSON.stringify(result)).not.toContain("private_marker");
  });
  it("reads a source registry without implicit seed writes and validates registration",async()=>{
    const f=fixture(),registry=new PostgresSourceRegistry(f.work);
    f.query.mockImplementation(async sql=>({rows:sql.includes("AS allowed")?[{allowed:true,unsafe:false}]:[{id:"source"}],rowCount:1}));
    expect((await registry.list())[0].id).toBe("source");
    const input={companyName:"Example",platform:"LEVER" as const,identifier:"example",careersUrl:"https://jobs.lever.co/example"};
    expect(await registry.register(input)).toBe("source");
    await expect(registry.register({...input,companyName:" "})).rejects.toThrow("INVALID_SOURCE_REGISTRATION");
    await expect(registry.register({...input,identifier:" "})).rejects.toThrow("INVALID_SOURCE_REGISTRATION");
    await expect(registry.register({...input,careersUrl:"javascript:alert(1)"})).rejects.toThrow("HTTP or HTTPS");
  });
});
