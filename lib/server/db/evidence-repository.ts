import "server-only";
import type { ProfessionalEvidenceBank, ProfessionalEvidenceCategory } from "@/lib/applications/types";
import { safeEvidenceUrl } from "@/lib/applications/evidence-priority";
import type { ActorContext } from "../context";
import type { DatabaseTransaction, UnitOfWork } from "./unit-of-work";
import { lockResumeCandidate } from "./resume-repository";

export type EvidenceSubjectInput = { subjectType:"PROJECT"|"EMPLOYMENT"; displayName:string; description?:string;
  employmentRole?:string; employmentCompany?:string; employmentDates?:string; employmentLocation?:string };
export type ConfirmedClaimInput = { category:ProfessionalEvidenceCategory; exactClaim:string; sourceReference:string; relevanceTags:string[]; confirmed:true };

export class PostgresEvidenceRepository {
  constructor(private readonly work:UnitOfWork) {}
  async createSubject(actor:ActorContext,candidateId:string,input:EvidenceSubjectInput):Promise<string> {
    if(!input.displayName.trim() || input.displayName.length>200 || (input.description?.length??0)>10000
      || !['PROJECT','EMPLOYMENT'].includes(input.subjectType)
      || (input.subjectType==='PROJECT' && (input.employmentRole || input.employmentCompany))) throw new Error("INVALID_EVIDENCE_SUBJECT");
    return this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,candidateId);
      return (await tx.query<{id:string}>(`INSERT INTO public.professional_evidence_profiles
        (user_id,candidate_profile_id,subject_type,display_name,description,employment_role,employment_company,employment_dates,employment_location)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[actor.userId,candidateId,input.subjectType,input.displayName.trim(),input.description??null,
      input.employmentRole??null,input.employmentCompany??null,input.employmentDates??null,input.employmentLocation??null])).rows[0].id;
    });
  }
  private async subject(tx:DatabaseTransaction,actor:ActorContext,id:string):Promise<string> {
    const row=await tx.query<{candidate_profile_id:string}>("SELECT candidate_profile_id FROM public.professional_evidence_profiles WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",[id,actor.userId]);
    if(!row.rows[0]) throw new Error("EVIDENCE_SUBJECT_NOT_FOUND");
    const candidateId=row.rows[0].candidate_profile_id;
    await lockResumeCandidate(tx,actor,candidateId);
    const locked=await tx.query("SELECT id FROM public.professional_evidence_profiles WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR SHARE",[id,actor.userId]);
    if(locked.rowCount!==1) throw new Error("EVIDENCE_SUBJECT_NOT_FOUND");
    return candidateId;
  }
  /** Caller must collect explicit confirmation; no automatic CV bootstrap here. */
  async addConfirmedClaim(actor:ActorContext,subjectId:string,input:ConfirmedClaimInput):Promise<string> {
    if(input.confirmed!==true || !input.exactClaim.trim() || input.exactClaim.length>10000 || !input.sourceReference.trim()
      || input.sourceReference.length>1000 || input.relevanceTags.length>50 || input.relevanceTags.some(tag=>tag.length>100)) throw new Error("EVIDENCE_CONFIRMATION_REQUIRED");
    return this.work.withActor(actor,async tx=>{
      const candidateId=await this.subject(tx,actor,subjectId);
      return (await tx.query<{id:string}>(`INSERT INTO public.professional_evidence_items
        (user_id,candidate_profile_id,profile_id,category,exact_claim,source_type,source_reference,verification_status,confirmed_at,relevance_tags)
        VALUES($1,$2,$3,$4,$5,'USER_CONFIRMED',$6,'VERIFIED',now(),$7) RETURNING id`,
      [actor.userId,candidateId,subjectId,input.category,input.exactClaim.trim(),input.sourceReference.trim(),input.relevanceTags])).rows[0].id;
    });
  }
  async addConfirmedUrl(actor:ActorContext,subjectId:string,input:{url:string;urlType:'DEMO'|'REPOSITORY'|'PORTFOLIO';sourceReference:string;confirmed:true}):Promise<string> {
    const url=safeEvidenceUrl(input.url);
    if(input.confirmed!==true || !url || url.length>2048 || !input.sourceReference.trim() || input.sourceReference.length>1000) throw new Error("INVALID_EVIDENCE_URL");
    return this.work.withActor(actor,async tx=>{
      const candidateId=await this.subject(tx,actor,subjectId);
      // No network fetching or verification is inferred from the URL's syntax.
      return (await tx.query<{id:string}>(`INSERT INTO public.professional_evidence_urls
        (user_id,candidate_profile_id,profile_id,url,url_type,source_type,source_reference,verification_status,confirmed_at)
        VALUES($1,$2,$3,$4,$5,'USER_CONFIRMED',$6,'VERIFIED',now()) RETURNING id`,
      [actor.userId,candidateId,subjectId,url,input.urlType,input.sourceReference.trim()])).rows[0].id;
    });
  }
  async loadBank(actor:ActorContext,candidateId:string):Promise<ProfessionalEvidenceBank> {
    return this.work.withActor(actor,async tx=>{
      await lockResumeCandidate(tx,actor,candidateId);
      const result=await tx.query<ProfessionalEvidenceBank['items'][number]>(`SELECT i.id,i.profile_id,p.subject_type,p.display_name,
        i.category,i.exact_claim,i.source_type,i.source_reference,i.verification_status,i.confirmed_at::text,i.relevance_tags
        FROM public.professional_evidence_items i JOIN public.professional_evidence_profiles p
          ON p.id=i.profile_id AND p.user_id=i.user_id AND p.candidate_profile_id=i.candidate_profile_id
        WHERE i.user_id=$1 AND i.candidate_profile_id=$2 AND i.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY i.created_at,i.id`,[actor.userId,candidateId]);
      return {items:result.rows};
    });
  }
  async archiveSubject(actor:ActorContext,id:string):Promise<void> {
    await this.work.withActor(actor,async tx=>{
      await this.subject(tx,actor,id);
      await tx.query("UPDATE public.professional_evidence_profiles SET deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2",[id,actor.userId]);
      await tx.query("UPDATE public.professional_evidence_items SET deleted_at=now(),updated_at=now() WHERE profile_id=$1 AND user_id=$2 AND deleted_at IS NULL",[id,actor.userId]);
      await tx.query("UPDATE public.professional_evidence_urls SET deleted_at=now() WHERE profile_id=$1 AND user_id=$2 AND deleted_at IS NULL",[id,actor.userId]);
    });
  }
}
