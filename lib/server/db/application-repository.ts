import "server-only";
import type { ApplicationDraftRepository } from "@/lib/applications/repository.server";
import { validateGeneratedApplication } from "@/lib/applications/validation";
import type { ApplicationQuestion } from "@/lib/application-engine/types";
import { safeEvidenceUrl } from "@/lib/applications/evidence-priority";
import type { ActorContext } from "../context";
import type { DatabaseTransaction, UnitOfWork } from "./unit-of-work";
import { lockResumeCandidate } from "./resume-repository";

export type SaveApplicationDraftInput=Omit<Parameters<ApplicationDraftRepository['saveDraft']>[0],'userId'|'existingId'> & {id?:string;expectedRevision?:number};
export type DraftRecord={id:string;user_id:string;candidate_profile_id:string;search_profile_id:string;job_offer_id:string;
  source_resume_id:string;revision:number;status:'DRAFT'|'READY_FOR_REVIEW'|'APPROVED'|'ARCHIVED';deleted_at:string|null};
const draftPayload=(input:SaveApplicationDraftInput)=>{
  const {source_text: _source,...profile}=input.evidence;void _source;
  return [JSON.stringify(input.job),JSON.stringify(profile),JSON.stringify({...input.matchSummary,gaps:input.gaps}),
    JSON.stringify(input.generated.resume_adaptation),input.generated.recruiter_message,input.generated.cover_letter];
};
export class PostgresApplicationRepository {
  constructor(private readonly work:UnitOfWork) {}
  private async account(tx:DatabaseTransaction,actor:ActorContext) {
    const result=await tx.query('SELECT id FROM public.profiles WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[actor.userId]);
    if(result.rowCount!==1) throw new Error('APPLICATION_ACCOUNT_UNAVAILABLE');
  }
  private async context(tx:DatabaseTransaction,actor:ActorContext,candidateId:string,searchId:string,resumeId:string) {
    await lockResumeCandidate(tx,actor,candidateId);
    const result=await tx.query(`SELECT s.id FROM public.search_profiles s JOIN public.resumes r
      ON r.user_id=s.user_id AND r.candidate_profile_id=s.candidate_profile_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.candidate_profile_id=$3 AND r.id=$4
      AND s.status='ACTIVE' AND s.deleted_at IS NULL AND r.status='APPROVED' AND r.deleted_at IS NULL FOR SHARE OF s,r`,
    [searchId,actor.userId,candidateId,resumeId]);
    if(result.rowCount!==1) throw new Error('APPLICATION_CONTEXT_UNAVAILABLE');
  }
  async findDraft(actor:ActorContext,id:string):Promise<DraftRecord|null> {
    return this.work.withActor(actor,async tx=>(await tx.query<{draft:DraftRecord}>(`SELECT to_jsonb(d) AS draft FROM public.application_drafts d
      JOIN public.candidate_profiles c ON c.id=d.candidate_profile_id AND c.user_id=d.user_id JOIN public.profiles u ON u.id=d.user_id
      WHERE d.id=$1 AND d.user_id=$2 AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL`,[id,actor.userId])).rows[0]?.draft??null);
  }
  async findCurrentDraft(actor:ActorContext,input:{candidateProfileId:string;jobOfferId:string;resumeId:string}):Promise<DraftRecord|null> {
    return this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,input.candidateProfileId);
      return (await tx.query<{draft:DraftRecord}>(`SELECT to_jsonb(d) AS draft FROM public.application_drafts d
        WHERE user_id=$1 AND candidate_profile_id=$2 AND job_offer_id=$3 AND source_resume_id=$4
          AND status<>'ARCHIVED' AND deleted_at IS NULL`,[actor.userId,input.candidateProfileId,input.jobOfferId,input.resumeId])).rows[0]?.draft??null;
    });
  }
  async saveDraft(actor:ActorContext,input:SaveApplicationDraftInput):Promise<{id:string;revision:number}> {
    validateGeneratedApplication(input.generated,input.evidence);
    if(JSON.stringify(input).length>2_000_000) throw new Error('APPLICATION_PAYLOAD_TOO_LARGE');
    return this.work.withActor(actor,async tx=>{
      await this.context(tx,actor,input.candidateProfileId,input.searchProfileId,input.resumeId);
      const values=[actor.userId,input.candidateProfileId,input.searchProfileId,input.jobOfferId,input.resumeId,...draftPayload(input)];
      const result=input.id
        ? await tx.query<{id:string;revision:number}>(`UPDATE public.application_drafts SET job_analysis=$6,profile_analysis=$7,
          match_summary=$8,resume_adaptation=$9,recruiter_message=$10,cover_letter=$11,status='READY_FOR_REVIEW',revision=revision+1
          WHERE user_id=$1 AND candidate_profile_id=$2 AND search_profile_id=$3 AND job_offer_id=$4 AND source_resume_id=$5
            AND id=$12 AND revision=$13 AND status IN ('DRAFT','READY_FOR_REVIEW') AND deleted_at IS NULL RETURNING id,revision`,
        [...values,input.id,input.expectedRevision])
        : await tx.query<{id:string;revision:number}>(`INSERT INTO public.application_drafts
          (user_id,candidate_profile_id,search_profile_id,job_offer_id,source_resume_id,job_analysis,profile_analysis,match_summary,
            resume_adaptation,recruiter_message,cover_letter,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'READY_FOR_REVIEW')
          ON CONFLICT DO NOTHING RETURNING id,revision`,values);
      if(!result.rows[0]) throw new Error(input.id?'DRAFT_REVISION_CONFLICT':'DRAFT_ALREADY_EXISTS');
      return result.rows[0];
    });
  }
  async approveDraft(actor:ActorContext,id:string,expectedRevision:number):Promise<void> {
    const draft=await this.findDraft(actor,id);if(!draft) throw new Error('DRAFT_NOT_FOUND');
    await this.work.withActor(actor,async tx=>{
      await this.context(tx,actor,draft.candidate_profile_id,draft.search_profile_id,draft.source_resume_id);
      const result=await tx.query(`UPDATE public.application_drafts SET status='APPROVED'
        WHERE id=$1 AND user_id=$2 AND revision=$3 AND status='READY_FOR_REVIEW' AND deleted_at IS NULL RETURNING id`,[id,actor.userId,expectedRevision]);
      if(result.rowCount!==1) throw new Error('DRAFT_REVISION_CONFLICT');
    });
  }
  async archiveDraft(actor:ActorContext,id:string,expectedRevision:number):Promise<void> {
    const draft=await this.findDraft(actor,id);if(!draft) throw new Error('DRAFT_NOT_FOUND');
    await this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,draft.candidate_profile_id);
      const result=await tx.query(`UPDATE public.application_drafts SET status='ARCHIVED',deleted_at=now()
        WHERE id=$1 AND user_id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id`,[id,actor.userId,expectedRevision]);
      if(result.rowCount!==1) throw new Error('DRAFT_REVISION_CONFLICT');
    });
  }
  async findApplication(actor:ActorContext,id:string):Promise<Record<string,unknown>|null> {
    return this.work.withActor(actor,async tx=>(await tx.query<{application:Record<string,unknown>}>(`SELECT to_jsonb(p) AS application
      FROM public.applications p JOIN public.candidate_profiles c ON c.id=p.candidate_profile_id AND c.user_id=p.user_id
      JOIN public.profiles u ON u.id=p.user_id WHERE p.id=$1 AND p.user_id=$2
      AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL`,[id,actor.userId])).rows[0]?.application??null);
  }
  async prepare(actor:ActorContext,input:{draftId:string;targetUrl:string;questions:ApplicationQuestion[]}):Promise<{id:string;created:boolean}> {
    const url=safeEvidenceUrl(input.targetUrl);
    if(!url || url.length>2048 || input.questions.length>100 || JSON.stringify(input.questions).length>200000) throw new Error('INVALID_APPLICATION_INPUT');
    const draft=await this.findDraft(actor,input.draftId);if(!draft) throw new Error('DRAFT_NOT_FOUND');
    return this.work.withActor(actor,async tx=>{
      await this.context(tx,actor,draft.candidate_profile_id,draft.search_profile_id,draft.source_resume_id);
      const current=await tx.query<DraftRecord>("SELECT * FROM public.application_drafts WHERE id=$1 AND user_id=$2 AND status='APPROVED' AND deleted_at IS NULL FOR SHARE",[draft.id,actor.userId]);
      if(!current.rows[0]) throw new Error('DRAFT_NOT_APPROVED');
      const created=await tx.query<{id:string}>(`INSERT INTO public.applications(user_id,candidate_profile_id,search_profile_id,
        job_offer_id,application_draft_id,resume_id,apply_mode,target_url) VALUES($1,$2,$3,$4,$5,$6,'MANUAL',$7)
        ON CONFLICT(user_id,job_offer_id,candidate_profile_id) DO NOTHING RETURNING id`,
      [actor.userId,draft.candidate_profile_id,draft.search_profile_id,draft.job_offer_id,draft.id,draft.source_resume_id,url]);
      if(!created.rows[0]) {
        const existing=await tx.query<{id:string}>("SELECT id FROM public.applications WHERE user_id=$1 AND job_offer_id=$2 AND candidate_profile_id=$3 AND deleted_at IS NULL",[actor.userId,draft.job_offer_id,draft.candidate_profile_id]);
        if(!existing.rows[0]) throw new Error('APPLICATION_ARCHIVED');
        return {id:existing.rows[0].id,created:false};
      }
      const id=created.rows[0].id;
      for(const q of input.questions) await tx.query(`INSERT INTO public.application_answers
        (application_id,user_id,question_key,question_text,answer_type,answer_value,source,confidence,requires_confirmation,classification)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9)`,[id,actor.userId,q.questionKey,q.questionText,q.answerType,
      JSON.stringify(q.answerValue),q.source,q.confidence,q.classification]);
      await tx.query(`INSERT INTO public.application_events(application_id,user_id,event_type,metadata)
        VALUES($1,$2,'CREATED','{}'),($1,$2,'MODE_DECIDED','{"mode":"MANUAL"}')`,[id,actor.userId]);
      return {id,created:true};
    });
  }
  async confirmAnswer(actor:ActorContext,answerId:string,value:unknown):Promise<void> {
    const encoded=JSON.stringify(value);if(encoded===undefined || encoded.length>10000) throw new Error('INVALID_APPLICATION_ANSWER');
    await this.work.withActor(actor,async tx=>{
      await this.account(tx,actor);
      const editable=await tx.query(`SELECT p.id FROM public.applications p JOIN public.application_answers a
        ON a.application_id=p.id AND a.user_id=p.user_id WHERE a.id=$1 AND a.user_id=$2
        AND p.status IN ('PREPARED','BLOCKED') AND p.deleted_at IS NULL FOR UPDATE OF p,a`,[answerId,actor.userId]);
      if(editable.rowCount!==1) throw new Error('APPLICATION_ANSWER_UNAVAILABLE');
      const result=await tx.query<{application_id:string;question_key:string}>(`UPDATE public.application_answers a
        SET answer_value=$3::jsonb,source='USER_APPROVED',requires_confirmation=false,confidence=1
        FROM public.applications p WHERE a.id=$1 AND a.user_id=$2 AND p.id=a.application_id AND p.user_id=a.user_id
          AND p.status IN ('PREPARED','BLOCKED') AND p.deleted_at IS NULL RETURNING a.application_id,a.question_key`,[answerId,actor.userId,encoded]);
      if(!result.rows[0]) throw new Error('APPLICATION_ANSWER_UNAVAILABLE');
      await tx.query(`INSERT INTO public.application_events(application_id,user_id,event_type,metadata)
        VALUES($1,$2,'REVIEW_REQUIRED',jsonb_build_object('answer_confirmed', $3::text))`,[result.rows[0].application_id,actor.userId,result.rows[0].question_key]);
    });
  }
  async rememberAnswer(actor:ActorContext,q:ApplicationQuestion,value:unknown):Promise<void> {
    const encoded=JSON.stringify(value);if(encoded===undefined || encoded.length>10000) throw new Error('INVALID_APPLICATION_ANSWER');
    await this.work.withActor(actor,async tx=>{
      await this.account(tx,actor);
      await tx.query(`INSERT INTO public.user_application_answers(user_id,question_key,question_text,answer_type,answer_value,classification)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,question_key) DO UPDATE SET question_text=EXCLUDED.question_text,
        answer_type=EXCLUDED.answer_type,answer_value=EXCLUDED.answer_value,classification=EXCLUDED.classification,approved_at=now()`,
      [actor.userId,q.questionKey,q.questionText,q.answerType,encoded,q.classification]);
    });
  }
  async settings(actor:ActorContext) {
    return this.work.withActor(actor,async tx=>{
      await this.account(tx,actor);
      await tx.query('INSERT INTO public.application_user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor.userId]);
      return (await tx.query<{auto_apply_enabled:boolean}>('SELECT auto_apply_enabled FROM public.application_user_settings WHERE user_id=$1',[actor.userId])).rows[0];
    });
  }
  async history(actor:ActorContext,applicationId:string) {
    return this.work.withActor(actor,async tx=>{
      await this.account(tx,actor);
      return (await tx.query(`SELECT id,event_type,metadata,created_at::text FROM public.application_events
        WHERE application_id=$1 AND user_id=$2 ORDER BY created_at,id`,[applicationId,actor.userId])).rows;
    });
  }
}
