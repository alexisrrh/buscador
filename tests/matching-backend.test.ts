import { describe, expect, it, vi } from "vitest";
import { PostgresMatchingRepository } from "@/lib/server/db/matching-repository";
import { requireActor } from "@/lib/server/context";
import type { UnitOfWork } from "@/lib/server/db/unit-of-work";
import type { CatalogUnitOfWork } from "@/lib/server/db/catalog-unit-of-work";
import type { MatchUpsertInput, SearchMatchingContext } from "@/lib/matching/service";
import { matchJobOfferToSearchProfile } from "@/lib/matching/engine";

const userId="11111111-1111-4111-8111-111111111111";
const context: SearchMatchingContext={candidate:{id:"candidate",userId,seniority:null,jobFamily:null},
  search:{id:"search",userId,candidateProfileId:"candidate",version:1,status:"ACTIVE",name:"Frontend",notificationMinScore:60},
  preferences:{keywords:[],targetTitles:[],excludedTitles:[],locations:[],workModes:[],minimumSalary:null,currency:null,
    acceptedSeniorities:[],minimumExperienceYears:null,maximumExperienceYears:null,requiredTechnologies:[],excludedTechnologies:[],contractTypes:[]}};
const offer={id:"offer",status:"ACTIVE",title:"Frontend Developer",description:null,locationText:null,countryCode:null,region:null,city:null,
  workMode:null,seniority:null,employmentType:null,salaryMin:null,salaryMax:null,salaryCurrency:null};
const result=matchJobOfferToSearchProfile({...context,offer});
const input:MatchUpsertInput={searchProfileId:"search",jobOfferId:"offer",result};
async function fixture() {
  const actor=await requireActor(async()=>({user:{id:userId,disabled:false},session:{id:"test",expiresAt:new Date(Date.now()+60000)}}));
  const query=vi.fn().mockResolvedValue({rows:[context],rowCount:1});
  const withActor=vi.fn(async (_actor,operation)=>operation({query}));
  const run=vi.fn(async operation=>operation({query}));
  const work={withActor} as unknown as UnitOfWork;
  const catalog={role:"bv_catalog",run} as unknown as CatalogUnitOfWork;
  return {actor,query,withActor,run,work,catalog,repo:new PostgresMatchingRepository(work,catalog,actor)};
}
describe("matching persistence boundary",()=>{
  it("requires a verified actor and dedicated read-only catalogue role",async()=>{
    const f=await fixture();
    expect(()=>new PostgresMatchingRepository(f.work,{...f.catalog,role:"bv_ingest"} as CatalogUnitOfWork,f.actor)).toThrow("CATALOG_READER_ROLE_REQUIRED");
    expect(()=>new PostgresMatchingRepository(f.work,f.catalog,{...f.actor})).toThrow("AUTHENTICATION_REQUIRED");
  });
  it("rejects foreign user claims before accessing SQL and missing active context",async()=>{
    const f=await fixture();await expect(f.repo.loadSearchContext("search","foreign")).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");expect(f.query).not.toHaveBeenCalled();
    f.query.mockResolvedValue({rows:[]});await expect(f.repo.loadSearchContext("search",userId)).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");
  });
  it("requires a loaded snapshot and rejects changed or inactive searches",async()=>{
    const f=await fixture();await expect(f.repo.upsertMatch(input)).rejects.toThrow("MATCH_CONTEXT_REQUIRED");
    await f.repo.loadSearchContext("search",userId);f.query.mockResolvedValue({rows:[{version:2}]});
    await expect(f.repo.upsertMatch(input)).rejects.toThrow("MATCH_SEARCH_VERSION_CONFLICT");
    f.query.mockResolvedValue({rows:[]});await expect(f.repo.upsertMatch(input)).rejects.toThrow("MATCH_SEARCH_NOT_FOUND");
  });
  it("rejects mixed searches, duplicates and oversized runs",async()=>{
    const f=await fixture();await expect(f.repo.upsertMatches([input,{...input,searchProfileId:"other"}])).rejects.toThrow("MIXED_MATCH_SEARCHES");
    await expect(f.repo.upsertMatches([input,input])).rejects.toThrow("DUPLICATE_MATCH_INPUT");
    await expect(f.repo.upsertMatches(Array.from({length:5001},()=>input))).rejects.toThrow("MATCH_BATCH_TOO_LARGE");
    expect(await f.repo.upsertMatches([])).toEqual({created:0,updated:0});expect(f.query).not.toHaveBeenCalled();
  });
  it("keeps 201 results in one private transaction and reports insert/update outcomes",async()=>{
    const f=await fixture();await f.repo.loadSearchContext("search",userId);f.withActor.mockClear();
    f.query.mockResolvedValueOnce({rows:[{version:1}]}).mockResolvedValueOnce({rows:Array.from({length:200},()=>({created:true}))}).mockResolvedValueOnce({rows:[{created:false}]});
    expect(await f.repo.upsertMatches(Array.from({length:201},(_,i)=>({...input,jobOfferId:`offer-${i}`})))).toEqual({created:200,updated:1});
    expect(f.withActor).toHaveBeenCalledTimes(1);expect(f.run).not.toHaveBeenCalled();
    f.query.mockResolvedValueOnce({rows:[{version:1}]}).mockResolvedValueOnce({rows:[{created:true}]});
    expect(await f.repo.upsertMatch(input)).toEqual({created:true});
  });
  it("uses catalogue credentials for bounded reads only",async()=>{
    const f=await fixture();f.query.mockResolvedValue({rows:[offer]});
    expect(await f.repo.loadRecentActiveOffers({limit:5000,seenAfter:new Date().toISOString()})).toEqual([offer]);
    expect(f.run).toHaveBeenCalledTimes(1);expect(f.withActor).not.toHaveBeenCalled();
    for(const options of [{limit:0,seenAfter:"2026-01-01"},{limit:5001,seenAfter:"2026-01-01"},{limit:2,seenAfter:"invalid"}]) {
      await expect(f.repo.loadRecentActiveOffers(options)).rejects.toThrow("INVALID_MATCH_OFFERS_READ");
    }
  });
  it("returns existing IDs and restricts status changes to the actor",async()=>{
    const f=await fixture();f.query.mockResolvedValue({rows:[{job_offer_id:"offer"}],rowCount:1});
    expect(await f.repo.loadExistingMatchOfferIds({searchProfileId:"search",searchProfileVersion:1,scoringVersion:"deterministic-v2"})).toEqual(new Set(["offer"]));
    await f.repo.setStatus("match","SAVED");expect(f.query.mock.calls.at(-1)?.[1]).toEqual(["match",userId,"SAVED"]);
    f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.repo.setStatus("foreign","SAVED")).rejects.toThrow("MATCH_NOT_FOUND");
    await expect(f.repo.setStatus("match","invalid" as "NEW")).rejects.toThrow("INVALID_MATCH_STATUS");
  });
});
