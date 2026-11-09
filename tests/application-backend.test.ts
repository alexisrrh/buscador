import {describe,expect,it,vi} from 'vitest';
import {requireActor} from '@/lib/server/context';
import type {UnitOfWork} from '@/lib/server/db/unit-of-work';
import {PostgresApplicationRepository} from '@/lib/server/db/application-repository';
import {applicationDraftInput} from './application-persistence-fixture';
const q={questionKey:'city',questionText:'City?',answerType:'TEXT' as const,answerValue:'Madrid',source:'PROFILE' as const,confidence:0.8,requiresConfirmation:false,classification:'SAFE_STRUCTURED' as const};
async function fixture() {
 const actor=await requireActor(async()=>({user:{id:'11111111-1111-4111-8111-111111111111',disabled:false},session:{id:'session',expiresAt:new Date(Date.now()+60000)}}));
 const input=await applicationDraftInput({candidateProfileId:'candidate',searchProfileId:'search',jobOfferId:'offer',resumeId:'resume'});
 const draft={id:'draft',candidate_profile_id:'candidate',search_profile_id:'search',source_resume_id:'resume',job_offer_id:'offer',status:'APPROVED',revision:1};
 const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('AS draft')?[{draft}]:[{...draft,id:'record',auto_apply_enabled:false}],rowCount:1}));
 const work={withActor:vi.fn(async(_actor,operation)=>operation({query}))} as unknown as UnitOfWork;
 return {actor,input,draft,query,repo:new PostgresApplicationRepository(work)};
}
describe('application persistence boundary',()=>{
 it('reuses generated-material validation and strips source CV text from the snapshot',async()=>{
  const f=await fixture();await f.repo.saveDraft(f.actor,f.input);
  expect(await f.repo.findCurrentDraft(f.actor,f.input)).toMatchObject({id:'draft'});
  const values=f.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO public.application_drafts'))?.[1];
  expect(JSON.parse(values[6])).not.toHaveProperty('source_text');
  await expect(f.repo.saveDraft(f.actor,{...f.input,generated:{...f.input.generated,resume_adaptation:{...f.input.generated.resume_adaptation,professional_summary:'Invented achievement'}}})).rejects.toThrow();
  await expect(f.repo.saveDraft(f.actor,{...f.input,matchSummary:{large:'x'.repeat(2000000)}})).rejects.toThrow('APPLICATION_PAYLOAD_TOO_LARGE');
 });
 it('supports revisioned edits and rejects missing context or conflicting revisions',async()=>{
  const f=await fixture();await f.repo.saveDraft(f.actor,{...f.input,id:'draft',expectedRevision:1});
  f.query.mockImplementation(async(sql:string)=>({rows:[],rowCount:sql.includes('JOIN public.resumes')?0:1}));
  await expect(f.repo.saveDraft(f.actor,f.input)).rejects.toThrow('APPLICATION_CONTEXT_UNAVAILABLE');
  f.query.mockResolvedValue({rows:[],rowCount:1});
  await expect(f.repo.saveDraft(f.actor,{...f.input,id:'draft',expectedRevision:0})).rejects.toThrow('DRAFT_REVISION_CONFLICT');
  await expect(f.repo.saveDraft(f.actor,f.input)).rejects.toThrow('DRAFT_ALREADY_EXISTS');
 });
 it('checks the approved revision and denies unknown drafts',async()=>{
  const f=await fixture();await f.repo.approveDraft(f.actor,'draft',1);
  await f.repo.archiveDraft(f.actor,'draft',1);
  f.query.mockResolvedValue({rows:[],rowCount:0});expect(await f.repo.findDraft(f.actor,'foreign')).toBeNull();
  await expect(f.repo.approveDraft(f.actor,'foreign',1)).rejects.toThrow('DRAFT_NOT_FOUND');
  await expect(f.repo.archiveDraft(f.actor,'foreign',1)).rejects.toThrow('DRAFT_NOT_FOUND');
  expect(await f.repo.findApplication(f.actor,'foreign')).toBeNull();
 });
 it('prepares MANUAL only, writes questions and events together, and leaves duplicates intact',async()=>{
  const f=await fixture();expect(await f.repo.prepare(f.actor,{draftId:'draft',targetUrl:'https://example.test/apply',questions:[q]})).toEqual({id:'record',created:true});
  expect(f.query.mock.calls.some(([sql])=>sql.includes("'MANUAL'"))).toBe(true);
  expect(f.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO public.application_events'))).toBe(true);
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('INSERT INTO public.applications')?[]:sql.includes('AS draft')?[{draft:f.draft}]:[{id:'existing'}],rowCount:1}));
  expect(await f.repo.prepare(f.actor,{draftId:'draft',targetUrl:'https://example.test/apply',questions:[]})).toEqual({id:'existing',created:false});
  await expect(f.repo.prepare(f.actor,{draftId:'draft',targetUrl:'javascript:alert(1)',questions:[]})).rejects.toThrow('INVALID_APPLICATION_INPUT');
 });
 it('requires an owned answer and validates confirmation payloads before SQL',async()=>{
  const f=await fixture();await f.repo.confirmAnswer(f.actor,'answer','Madrid');await f.repo.rememberAnswer(f.actor,q,'Madrid');
  expect(await f.repo.settings(f.actor)).toMatchObject({auto_apply_enabled:false});expect(await f.repo.history(f.actor,'record')).toHaveLength(1);
  await expect(f.repo.confirmAnswer(f.actor,'answer',undefined)).rejects.toThrow('INVALID_APPLICATION_ANSWER');
  await expect(f.repo.rememberAnswer(f.actor,q,'x'.repeat(10001))).rejects.toThrow('INVALID_APPLICATION_ANSWER');
  f.query.mockImplementation(async(sql:string)=>({rows:[],rowCount:sql.startsWith('SELECT id FROM public.profiles')?1:0}));
  await expect(f.repo.confirmAnswer(f.actor,'foreign','Madrid')).rejects.toThrow('APPLICATION_ANSWER_UNAVAILABLE');
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.repo.settings(f.actor)).rejects.toThrow('APPLICATION_ACCOUNT_UNAVAILABLE');
 });
});
