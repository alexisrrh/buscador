import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {requireActor} from '@/lib/server/context';
import type {UnitOfWork} from '@/lib/server/db/unit-of-work';
import {PostgresDerivedResumeRepository} from '@/lib/server/db/derived-resume-repository';

const bytes=new Uint8Array(Buffer.from('%PDF-1.7\n'+'synthetic'.repeat(70)));
const input={sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,pages:1,
 content:{name:'Synthetic',title:'Developer',target:'Developer',contact:[],sections:[]}};
const artifact={id:'artifact',candidate_profile_id:'candidate',application_draft_id:'draft',source_resume_id:'resume',job_offer_id:'offer',
 status:'GENERATING',mime_type:'application/pdf',storage_bucket:'derived-resumes',storage_path:'private/resume.pdf'};
async function fixture() {
 const actor=await requireActor(async()=>({user:{id:'11111111-1111-4111-8111-111111111111',disabled:false},session:{id:'session',expiresAt:new Date(Date.now()+60000)}}));
 const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('AS artifact')?[{artifact}]:[artifact],rowCount:1}));
 const work={withActor:vi.fn(async(_actor,operation)=>operation({query}))} as unknown as UnitOfWork;
 return {actor,query,work,repo:new PostgresDerivedResumeRepository(work)};
}
describe('derived CV persistence boundary',()=>{
 it('creates only supported PDF artifacts from an approved owned context',async()=>{
  const f=await fixture();expect(await f.repo.create(f.actor,'draft')).toEqual(artifact);
  await expect(f.repo.create(f.actor,'draft','DOCX')).rejects.toThrow('UNSUPPORTED_FORMAT');
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.repo.create(f.actor,'foreign')).rejects.toThrow('DERIVED_CONTEXT_UNAVAILABLE');
 });
 it('verifies stored bytes and freezes the content snapshot only after rechecking source approval',async()=>{
  const f=await fixture(),read=vi.fn().mockResolvedValue(bytes);
  await f.repo.complete(f.actor,'artifact',input,{read});
  expect(read).toHaveBeenCalledWith({bucket:'derived-resumes',key:'private/resume.pdf',maxBytes:bytes.length});
  expect(f.query.mock.calls.some(([sql])=>sql.includes("SET status='READY'"))).toBe(true);
  read.mockResolvedValue(bytes.subarray(1));await expect(f.repo.complete(f.actor,'artifact',input,{read})).rejects.toThrow('DERIVED_INTEGRITY_FAILED');
  for(const bad of [{...input,sha256:'bad'},{...input,sizeBytes:511},{...input,pages:31},{...input,content:[] as unknown as typeof input.content}]) await expect(f.repo.complete(f.actor,'artifact',bad,{read})).rejects.toThrow('INVALID_DERIVED_METADATA');
 });
 it('denies unknown, terminal and concurrently completed artifacts before mutation',async()=>{
  const f=await fixture();f.query.mockResolvedValue({rows:[],rowCount:0});expect(await f.repo.find(f.actor,'foreign')).toBeNull();
  await expect(f.repo.complete(f.actor,'foreign',input,{read:vi.fn()})).rejects.toThrow('DERIVED_NOT_GENERATING');
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('AS artifact')?[{artifact}]:[artifact],rowCount:sql.includes("SET status='READY'")?0:1}));
  await expect(f.repo.complete(f.actor,'artifact',input,{read:async()=>bytes})).rejects.toThrow('DERIVED_GENERATION_CONFLICT');
 });
 it('records bounded failure codes and archives ready artifacts without deleting them',async()=>{
  const f=await fixture();await f.repo.fail(f.actor,'artifact','STORAGE_FAILED');await f.repo.archive(f.actor,'artifact');
  await expect(f.repo.fail(f.actor,'artifact','message with private data')).rejects.toThrow('INVALID_DERIVED_FAILURE');
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.repo.fail(f.actor,'foreign','FAILED')).rejects.toThrow('DERIVED_NOT_FOUND');
  await expect(f.repo.archive(f.actor,'foreign')).rejects.toThrow('DERIVED_NOT_FOUND');
 });
 it('attaches only a ready artifact to an editable application of the same context',async()=>{
  const f=await fixture();await f.repo.attach(f.actor,'app','artifact');
  expect(f.query.mock.calls.at(-1)?.[1]).toEqual(['app',f.actor.userId,'artifact']);
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('AS artifact')?[{artifact}]:[artifact],rowCount:sql.includes('SELECT id FROM public.applications')?0:1}));
  await expect(f.repo.attach(f.actor,'foreign','artifact')).rejects.toThrow('PREPARED_APPLICATION_REQUIRED');
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.repo.attach(f.actor,'app','foreign')).rejects.toThrow('DERIVED_NOT_FOUND');
 });
});
