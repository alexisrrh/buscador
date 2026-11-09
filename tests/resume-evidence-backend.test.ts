import { createHash } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { requireActor } from "@/lib/server/context";
import type { UnitOfWork } from "@/lib/server/db/unit-of-work";
import { PostgresResumeRepository } from "@/lib/server/db/resume-repository";
import { PostgresEvidenceRepository } from "@/lib/server/db/evidence-repository";

const bytes=new Uint8Array(Buffer.from('%PDF-1.7 synthetic'));
const metadata={filename:'cv.pdf',mimeType:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const resume={id:'resume',candidate_profile_id:'candidate',status:'DRAFT',storage_bucket:'private-resumes',storage_path:'private/key',file_size_bytes:bytes.length,mime_type:metadata.mimeType,content_sha256:metadata.sha256,deleted_at:null};
async function fixture() {
 const actor=await requireActor(async()=>({user:{id:'11111111-1111-4111-8111-111111111111',disabled:false},session:{id:'test',expiresAt:new Date(Date.now()+60000)}}));
 const query=vi.fn().mockImplementation(async(sql:string)=>({rows:sql.includes('content_sha256=$3')?[]:[resume],rowCount:1}));
 const work={withActor:vi.fn(async (_actor,operation)=>operation({query}))} as unknown as UnitOfWork;
 return {actor,query,work,resumes:new PostgresResumeRepository(work),evidence:new PostgresEvidenceRepository(work)};
}
describe('CV and evidence server boundaries',()=>{
 it('validates metadata before SQL and reserves identity under a candidate lock',async()=>{
  const f=await fixture();
  for(const input of [{...metadata,filename:'../cv.pdf'},{...metadata,filename:'cv.docx'},{...metadata,size:0},{...metadata,sha256:'bad'},{...metadata,filename:' '.repeat(256)}]) await expect(f.resumes.register(f.actor,'candidate',input)).rejects.toThrow('INVALID_RESUME_METADATA');
  expect(f.query).not.toHaveBeenCalled();await f.resumes.register(f.actor,'candidate',metadata);
  expect(f.query.mock.calls.some(([sql])=>sql.includes('FOR UPDATE OF c'))).toBe(true);
 });
 it('returns duplicates without resurrecting deleted metadata or accepting conflicting sizes',async()=>{
  const f=await fixture();f.query.mockResolvedValue({rows:[resume],rowCount:1});
  expect(await f.resumes.register(f.actor,'candidate',metadata)).toEqual(resume);
  f.query.mockResolvedValue({rows:[{...resume,deleted_at:'2026-01-01'}],rowCount:1});
  await expect(f.resumes.register(f.actor,'candidate',metadata)).rejects.toThrow('RESUME_DELETED');
  f.query.mockResolvedValue({rows:[{...resume,file_size_bytes:9}],rowCount:1});
  await expect(f.resumes.register(f.actor,'candidate',metadata)).rejects.toThrow('RESUME_METADATA_CONFLICT');
 });
 it('checks bytes outside the database transaction and rejects hash/signature failures',async()=>{
  const f=await fixture();const read=vi.fn().mockResolvedValue(bytes);
  await f.resumes.finalizeUpload(f.actor,'resume',{read});expect(read).toHaveBeenCalledWith({bucket:'private-resumes',key:'private/key',maxBytes:bytes.length});
  read.mockResolvedValue(bytes.subarray(1));await expect(f.resumes.finalizeUpload(f.actor,'resume',{read})).rejects.toThrow('RESUME_INTEGRITY_FAILED');
  const bad=new Uint8Array(Buffer.from('invalid signature'));f.query.mockResolvedValue({rows:[{...resume,file_size_bytes:bad.length,content_sha256:createHash('sha256').update(bad).digest('hex')}],rowCount:1});
  read.mockResolvedValue(bad);await expect(f.resumes.finalizeUpload(f.actor,'resume',{read})).rejects.toThrow('RESUME_SIGNATURE_INVALID');
 });
 it('denies absent or concurrently changed uploads and invalid candidate ownership',async()=>{
  const f=await fixture();f.query.mockResolvedValue({rows:[],rowCount:0});
  expect(await f.resumes.find(f.actor,'missing')).toBeNull();
  await expect(f.resumes.register(f.actor,'foreign',metadata)).rejects.toThrow('RESUME_CANDIDATE_NOT_FOUND');
  await expect(f.resumes.finalizeUpload(f.actor,'missing',{read:vi.fn()})).rejects.toThrow('RESUME_NOT_STAGED');
  f.query.mockResolvedValueOnce({rows:[resume],rowCount:1}).mockResolvedValueOnce({rows:[resume],rowCount:1}).mockResolvedValueOnce({rows:[],rowCount:0});
  await expect(f.resumes.finalizeUpload(f.actor,'resume',{read:async()=>bytes})).rejects.toThrow('RESUME_UPLOAD_CONFLICT');
 });
 it('approves atomically and archives metadata without physical deletion',async()=>{
  const f=await fixture();await f.resumes.approve(f.actor,'resume');await f.resumes.archive(f.actor,'resume');
  expect(f.query.mock.calls.some(([sql])=>sql.includes("SET status='APPROVED'"))).toBe(true);
  expect(f.query.mock.calls.some(([sql])=>sql.includes('deleted_at=now()'))).toBe(true);
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.resumes.approve(f.actor,'missing')).rejects.toThrow('RESUME_NOT_FOUND');await expect(f.resumes.archive(f.actor,'missing')).rejects.toThrow('RESUME_NOT_FOUND');
 });
 it('stores extraction snapshots idempotently and rejects changed payloads under one version',async()=>{
  const f=await fixture();const input={extractorVersion:'test-v1',text:'Extracted',structured:{lines:['Extracted']}};
  for(const bad of [{...input,text:''},{...input,extractorVersion:''},{...input,structured:[] as unknown as Record<string,unknown>}]) await expect(f.resumes.saveExtraction(f.actor,'resume',bad)).rejects.toThrow('INVALID_RESUME_EXTRACTION');
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('AS same')?[]:[resume],rowCount:1}));
  expect(await f.resumes.saveExtraction(f.actor,'resume',input)).toBe('resume');
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('AS same')?[{id:'snapshot',same:true}]:[resume],rowCount:1}));
  expect(await f.resumes.saveExtraction(f.actor,'resume',input)).toBe('snapshot');
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('AS same')?[{id:'snapshot',same:false}]:[resume],rowCount:1}));
  await expect(f.resumes.saveExtraction(f.actor,'resume',input)).rejects.toThrow('EXTRACTION_VERSION_CONFLICT');
 });
 it('only accepts explicit evidence confirmation and safe URLs',async()=>{
  const f=await fixture();await f.evidence.createSubject(f.actor,'candidate',{subjectType:'PROJECT',displayName:'Proyecto'});
  await expect(f.evidence.createSubject(f.actor,'candidate',{subjectType:'PROJECT',displayName:' '})).rejects.toThrow('INVALID_EVIDENCE_SUBJECT');
  const claim={category:'TECHNOLOGY' as const,exactClaim:'Usé TypeScript',sourceReference:'Confirmación manual',relevanceTags:['typescript'],confirmed:true as const};
  await f.evidence.addConfirmedClaim(f.actor,'subject',claim);
  await expect(f.evidence.addConfirmedClaim(f.actor,'subject',{...claim,confirmed:false as true})).rejects.toThrow('EVIDENCE_CONFIRMATION_REQUIRED');
  await f.evidence.addConfirmedUrl(f.actor,'subject',{url:'https://example.test/project',urlType:'DEMO',sourceReference:'Confirmación',confirmed:true});
  await expect(f.evidence.addConfirmedUrl(f.actor,'subject',{url:'javascript:alert(1)',urlType:'DEMO',sourceReference:'Confirmación',confirmed:true})).rejects.toThrow('INVALID_EVIDENCE_URL');
  expect((await f.evidence.loadBank(f.actor,'candidate')).items).toHaveLength(1);await f.evidence.archiveSubject(f.actor,'subject');
  f.query.mockResolvedValue({rows:[],rowCount:0});await expect(f.evidence.addConfirmedClaim(f.actor,'foreign',claim)).rejects.toThrow('EVIDENCE_SUBJECT_NOT_FOUND');
 });
});
