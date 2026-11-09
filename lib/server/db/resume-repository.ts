import "server-only";
import { createHash } from "node:crypto";
import type { Resume } from "@/lib/types";
import { validateResumeFile } from "@/lib/validation";
import type { ActorContext } from "../context";
import type { DatabaseTransaction, UnitOfWork } from "./unit-of-work";

/** Server adapter contract; implementations must bound the download before allocating it. */
export interface ResumeObjectReader {
  read(input: { bucket: string; key: string; maxBytes: number }): Promise<Uint8Array>;
}
export type ResumeMetadata = { filename: string; mimeType: string; size: number; sha256: string };
function resumeDto(row:Resume):Resume {
  const timestamp=(value:unknown)=>value instanceof Date?value.toISOString():value as string|null;
  return {...row,created_at:timestamp(row.created_at) as string,approved_at:timestamp(row.approved_at),
    archived_at:timestamp(row.archived_at),deleted_at:timestamp(row.deleted_at)};
}
export async function lockResumeCandidate(tx: DatabaseTransaction, actor: ActorContext, candidateId: string) {
  const result=await tx.query(`SELECT c.id FROM public.candidate_profiles c JOIN public.profiles u ON u.id=c.user_id
    WHERE c.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL AND u.deleted_at IS NULL FOR UPDATE OF c FOR SHARE OF u`,[candidateId,actor.userId]);
  if(result.rowCount!==1) throw new Error("RESUME_CANDIDATE_NOT_FOUND");
}

export class PostgresResumeRepository {
  constructor(private readonly work: UnitOfWork) {}
  async register(actor:ActorContext,candidateId:string,input:ResumeMetadata):Promise<Resume> {
    if(validateResumeFile({name:input.filename,type:input.mimeType,size:input.size}) || !Number.isSafeInteger(input.size)
      || !input.filename.trim() || input.filename.length>255 || !/^[a-f0-9]{64}$/.test(input.sha256)
      || (input.filename.toLowerCase().endsWith('.pdf') !== (input.mimeType==='application/pdf'))) throw new Error("INVALID_RESUME_METADATA");
    return this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,candidateId);
      const previous=await tx.query<Resume>("SELECT *,file_size_bytes::float8 AS file_size_bytes FROM public.resumes WHERE user_id=$1 AND candidate_profile_id=$2 AND content_sha256=$3",[actor.userId,candidateId,input.sha256]);
      if(previous.rows[0]) {
        if(previous.rows[0].deleted_at) throw new Error("RESUME_DELETED");
        if(previous.rows[0].file_size_bytes!==input.size || previous.rows[0].mime_type!==input.mimeType) throw new Error("RESUME_METADATA_CONFLICT");
        return resumeDto(previous.rows[0]);
      }
      const result=await tx.query<Resume>(`INSERT INTO public.resumes(user_id,candidate_profile_id,version,original_filename,mime_type,file_size_bytes,content_sha256)
        SELECT $1,$2,COALESCE(MAX(version),0)+1,$3,$4,$5,$6 FROM public.resumes WHERE user_id=$1 AND candidate_profile_id=$2 RETURNING *,file_size_bytes::float8 AS file_size_bytes`,
      [actor.userId,candidateId,input.filename,input.mimeType,input.size,input.sha256]);
      return resumeDto(result.rows[0]);
    });
  }
  async find(actor:ActorContext,id:string):Promise<Resume|null> {
    return this.work.withActor(actor,async tx=>{
      const result=await tx.query<Resume>(`SELECT r.*,r.file_size_bytes::float8 AS file_size_bytes FROM public.resumes r
        JOIN public.candidate_profiles c ON c.id=r.candidate_profile_id AND c.user_id=r.user_id
        JOIN public.profiles u ON u.id=r.user_id WHERE r.id=$1 AND r.user_id=$2
        AND r.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL`,[id,actor.userId]);
      return result.rows[0]?resumeDto(result.rows[0]):null;
    });
  }
  async finalizeUpload(actor:ActorContext,id:string,storage:ResumeObjectReader):Promise<void> {
    const resume=await this.find(actor,id);
    if(!resume || !['DRAFT','PROCESSING'].includes(resume.status)) throw new Error("RESUME_NOT_STAGED");
    const bytes=await storage.read({bucket:resume.storage_bucket,key:resume.storage_path,maxBytes:resume.file_size_bytes});
    if(bytes.byteLength!==resume.file_size_bytes || createHash('sha256').update(bytes).digest('hex')!==resume.content_sha256) throw new Error("RESUME_INTEGRITY_FAILED");
    const signature=Buffer.from(bytes.subarray(0,5));
    if(resume.mime_type==='application/pdf' ? signature.toString('ascii')!=='%PDF-' : !signature.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))) throw new Error("RESUME_SIGNATURE_INVALID");
    await this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,resume.candidate_profile_id);
      const updated=await tx.query(`UPDATE public.resumes SET status='READY',updated_at=now() WHERE id=$1 AND user_id=$2
        AND status IN ('DRAFT','PROCESSING') AND deleted_at IS NULL RETURNING id`,[id,actor.userId]);
      if(updated.rowCount!==1) throw new Error("RESUME_UPLOAD_CONFLICT");
    });
  }
  /** Approves the file, never its extracted claims or evidence. */
  async approve(actor:ActorContext,id:string):Promise<void> {
    const resume=await this.find(actor,id);if(!resume) throw new Error("RESUME_NOT_FOUND");
    await this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,resume.candidate_profile_id);
      const ready=await tx.query("SELECT id FROM public.resumes WHERE id=$1 AND user_id=$2 AND status='READY' AND deleted_at IS NULL FOR UPDATE",[id,actor.userId]);
      if(ready.rowCount!==1) throw new Error("RESUME_NOT_READY");
      await tx.query(`UPDATE public.resumes SET status='ARCHIVED',archived_at=now(),updated_at=now()
        WHERE user_id=$1 AND candidate_profile_id=$2 AND status='APPROVED' AND deleted_at IS NULL`,[actor.userId,resume.candidate_profile_id]);
      await tx.query("UPDATE public.resumes SET status='APPROVED',approved_at=now(),archived_at=NULL,updated_at=now() WHERE id=$1 AND user_id=$2",[id,actor.userId]);
    });
  }
  async archive(actor:ActorContext,id:string):Promise<void> {
    const resume=await this.find(actor,id);if(!resume) throw new Error("RESUME_NOT_FOUND");
    await this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,resume.candidate_profile_id);
      await tx.query("UPDATE public.resumes SET status='ARCHIVED',archived_at=now(),deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",[id,actor.userId]);
    });
  }
  async saveExtraction(actor:ActorContext,resumeId:string,input:{extractorVersion:string;text:string;structured:Record<string,unknown>}):Promise<string> {
    if(!input.extractorVersion.trim() || input.extractorVersion.length>100 || !input.text.trim() || input.text.length>1000000
      || !input.structured || Array.isArray(input.structured) || typeof input.structured!=='object' || JSON.stringify(input.structured).length>1000000) throw new Error("INVALID_RESUME_EXTRACTION");
    const resume=await this.find(actor,resumeId);if(!resume) throw new Error("RESUME_NOT_FOUND");
    return this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,resume.candidate_profile_id);
      const source=await tx.query("SELECT id FROM public.resumes WHERE id=$1 AND user_id=$2 AND status IN ('READY','APPROVED') AND deleted_at IS NULL FOR SHARE",[resumeId,actor.userId]);
      if(source.rowCount!==1) throw new Error("RESUME_NOT_READY");
      const values=[actor.userId,resume.candidate_profile_id,resumeId,input.extractorVersion,input.text,JSON.stringify(input.structured)];
      const previous=await tx.query<{id:string;same:boolean}>(`SELECT id, deleted_at IS NULL AND extracted_text=$5 AND structured_content=$6::jsonb AS same
        FROM public.resume_extractions WHERE user_id=$1 AND candidate_profile_id=$2 AND source_resume_id=$3 AND extractor_version=$4`,values);
      if(previous.rows[0]) { if(!previous.rows[0].same) throw new Error("EXTRACTION_VERSION_CONFLICT"); return previous.rows[0].id; }
      return (await tx.query<{id:string}>(`INSERT INTO public.resume_extractions(user_id,candidate_profile_id,source_resume_id,extractor_version,extracted_text,structured_content)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,values)).rows[0].id;
    });
  }
}
