import "server-only";
import { createHash } from 'node:crypto';
import { GENERATION_VERSION,PDF_MIME,type DerivedResume,type ResumeContent } from '@/lib/derived-resumes/content';
import type { ActorContext } from '../context';
import type { DatabaseTransaction,UnitOfWork } from './unit-of-work';
import { lockResumeCandidate,type ResumeObjectReader } from './resume-repository';

type RenderContext={candidate_profile_id:string;source_resume_id:string;job_offer_id:string};
export type DerivedArtifactInput={sha256:string;sizeBytes:number;pages:number;content:ResumeContent};
export class PostgresDerivedResumeRepository {
  constructor(private readonly work:UnitOfWork) {}
  private async context(tx:DatabaseTransaction,actor:ActorContext,draftId:string):Promise<RenderContext> {
    const selected=await tx.query<RenderContext>('SELECT candidate_profile_id,source_resume_id,job_offer_id FROM public.application_drafts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',[draftId,actor.userId]);
    const row=selected.rows[0];if(!row) throw new Error('DERIVED_CONTEXT_UNAVAILABLE');
    await lockResumeCandidate(tx,actor,row.candidate_profile_id);
    const approved=await tx.query(`SELECT d.id FROM public.application_drafts d JOIN public.resumes r
      ON r.id=d.source_resume_id AND r.user_id=d.user_id AND r.candidate_profile_id=d.candidate_profile_id
      WHERE d.id=$1 AND d.user_id=$2 AND d.status='APPROVED' AND d.deleted_at IS NULL
        AND r.status='APPROVED' AND r.deleted_at IS NULL FOR SHARE OF d,r`,[draftId,actor.userId]);
    if(approved.rowCount!==1) throw new Error('DERIVED_CONTEXT_UNAVAILABLE');
    return row;
  }
  async create(actor:ActorContext,draftId:string,format:'PDF'|'DOCX'='PDF'):Promise<DerivedResume> {
    if(format!=='PDF') throw new Error('UNSUPPORTED_FORMAT');
    return this.work.withActor(actor,async tx=>{
      const source=await this.context(tx,actor,draftId);
      return (await tx.query<{artifact:DerivedResume}>(`INSERT INTO public.derived_resumes
        (user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id,generation_version)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(derived_resumes) AS artifact`,
      [actor.userId,source.candidate_profile_id,draftId,source.source_resume_id,source.job_offer_id,GENERATION_VERSION])).rows[0].artifact;
    });
  }
  async find(actor:ActorContext,id:string):Promise<DerivedResume|null> {
    return this.work.withActor(actor,async tx=>(await tx.query<{artifact:DerivedResume}>(`SELECT to_jsonb(a) AS artifact
      FROM public.derived_resumes a JOIN public.candidate_profiles c ON c.id=a.candidate_profile_id AND c.user_id=a.user_id
      JOIN public.profiles u ON u.id=a.user_id WHERE a.id=$1 AND a.user_id=$2 AND c.deleted_at IS NULL AND u.deleted_at IS NULL`,[id,actor.userId])).rows[0]?.artifact??null);
  }
  async complete(actor:ActorContext,id:string,input:DerivedArtifactInput,storage:ResumeObjectReader):Promise<void> {
    if(!/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes<512 || input.sizeBytes>10485760
      || !Number.isInteger(input.pages) || input.pages<1 || input.pages>30 || !input.content || typeof input.content!=='object'
      || Array.isArray(input.content) || JSON.stringify(input.content).length>2_000_000) throw new Error('INVALID_DERIVED_METADATA');
    const artifact=await this.find(actor,id);if(!artifact || artifact.status!=='GENERATING' || artifact.mime_type!==PDF_MIME) throw new Error('DERIVED_NOT_GENERATING');
    const bytes=await storage.read({bucket:artifact.storage_bucket,key:artifact.storage_path,maxBytes:input.sizeBytes});
    if(bytes.byteLength!==input.sizeBytes || createHash('sha256').update(bytes).digest('hex')!==input.sha256
      || Buffer.from(bytes.subarray(0,5)).toString('ascii')!=='%PDF-') throw new Error('DERIVED_INTEGRITY_FAILED');
    await this.work.withActor(actor,async tx=>{
      await this.context(tx,actor,artifact.application_draft_id);
      const updated=await tx.query(`UPDATE public.derived_resumes SET status='READY',sha256=$3,size_bytes=$4,pages=$5,
        content_snapshot=$6::jsonb,failure_code=NULL WHERE id=$1 AND user_id=$2 AND status='GENERATING' RETURNING id`,
      [id,actor.userId,input.sha256,input.sizeBytes,input.pages,JSON.stringify(input.content)]);
      if(updated.rowCount!==1) throw new Error('DERIVED_GENERATION_CONFLICT');
    });
  }
  async fail(actor:ActorContext,id:string,code:string):Promise<void> {
    if(!/^[A-Z][A-Z0-9_]{0,79}$/.test(code)) throw new Error('INVALID_DERIVED_FAILURE');
    await this.work.withActor(actor,async tx=>{
      const artifact=await tx.query<{candidate_profile_id:string}>('SELECT candidate_profile_id FROM public.derived_resumes WHERE id=$1 AND user_id=$2',[id,actor.userId]);
      if(!artifact.rows[0]) throw new Error('DERIVED_NOT_FOUND');
      await lockResumeCandidate(tx,actor,artifact.rows[0].candidate_profile_id);
      const result=await tx.query("UPDATE public.derived_resumes SET status='FAILED',failure_code=$3 WHERE id=$1 AND user_id=$2 AND status='GENERATING' RETURNING id",[id,actor.userId,code]);
      if(result.rowCount!==1) throw new Error('DERIVED_GENERATION_CONFLICT');
    });
  }
  async archive(actor:ActorContext,id:string):Promise<void> {
    const artifact=await this.find(actor,id);if(!artifact) throw new Error('DERIVED_NOT_FOUND');
    await this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,artifact.candidate_profile_id);
      const result=await tx.query("UPDATE public.derived_resumes SET status='ARCHIVED' WHERE id=$1 AND user_id=$2 AND status='READY' RETURNING id",[id,actor.userId]);
      if(result.rowCount!==1) throw new Error('DERIVED_NOT_READY');
    });
  }
  async attach(actor:ActorContext,applicationId:string,derivedId:string):Promise<void> {
    const artifact=await this.find(actor,derivedId);if(!artifact) throw new Error('DERIVED_NOT_FOUND');
    await this.work.withActor(actor,async tx=>{
      await this.context(tx,actor,artifact.application_draft_id);
      const app=await tx.query(`SELECT id FROM public.applications WHERE id=$1 AND user_id=$2
        AND application_draft_id=$3 AND resume_id=$4 AND candidate_profile_id=$5 AND job_offer_id=$6
        AND status IN ('PREPARED','READY','BLOCKED','FAILED') AND attempt_count=0 AND deleted_at IS NULL FOR UPDATE`,
      [applicationId,actor.userId,artifact.application_draft_id,artifact.source_resume_id,artifact.candidate_profile_id,artifact.job_offer_id]);
      if(app.rowCount!==1) throw new Error('PREPARED_APPLICATION_REQUIRED');
      const ready=await tx.query("SELECT id FROM public.derived_resumes WHERE id=$1 AND user_id=$2 AND status='READY' FOR SHARE",[derivedId,actor.userId]);
      if(ready.rowCount!==1) throw new Error('DERIVED_NOT_READY');
      await tx.query('UPDATE public.applications SET derived_resume_id=$3 WHERE id=$1 AND user_id=$2',[applicationId,actor.userId,derivedId]);
    });
  }
}
