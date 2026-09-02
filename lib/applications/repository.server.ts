import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { GeneratedApplication, JobAnalysis, CandidateEvidence, GapAnalysis, ResumeStructure } from "./types";

export function createApplicationServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("APPLICATION_SERVICE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class ApplicationDraftRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadExtraction(resumeId: string, extractorVersion: string) {
    const { data, error } = await this.client.from("resume_extractions")
      .select("extracted_text,structured_content")
      .eq("source_resume_id", resumeId)
      .eq("extractor_version", extractorVersion)
      .maybeSingle();
    if (error) throw new Error(`RESUME_EXTRACTION_READ_FAILED:${error.code ?? "unknown"}`);
    return data ? {
      text: data.extracted_text as string,
      structured: data.structured_content as ResumeStructure,
    } : null;
  }

  async saveExtraction(input: {
    userId: string;
    candidateProfileId: string;
    resumeId: string;
    extractorVersion: string;
    text: string;
    structured: ResumeStructure;
  }) {
    const { error } = await this.client.from("resume_extractions").upsert({
      user_id: input.userId,
      candidate_profile_id: input.candidateProfileId,
      source_resume_id: input.resumeId,
      extractor_version: input.extractorVersion,
      extracted_text: input.text,
      structured_content: input.structured,
    }, { onConflict: "source_resume_id,extractor_version" });
    if (error) throw new Error(`RESUME_EXTRACTION_WRITE_FAILED:${error.code ?? "unknown"}`);
  }

  async findCurrentDraft(input: {
    userId: string;
    jobOfferId: string;
    candidateProfileId: string;
    resumeId: string;
  }) {
    const { data, error } = await this.client.from("application_drafts")
      .select("id,status")
      .eq("user_id", input.userId)
      .eq("job_offer_id", input.jobOfferId)
      .eq("candidate_profile_id", input.candidateProfileId)
      .eq("source_resume_id", input.resumeId)
      .neq("status", "ARCHIVED")
      .maybeSingle();
    if (error) throw new Error(`APPLICATION_DRAFT_READ_FAILED:${error.code ?? "unknown"}`);
    return data as { id: string; status: string } | null;
  }

  async saveDraft(input: {
    existingId?: string;
    userId: string;
    candidateProfileId: string;
    searchProfileId: string;
    jobOfferId: string;
    resumeId: string;
    job: JobAnalysis;
    evidence: CandidateEvidence;
    gaps: GapAnalysis;
    matchSummary: Record<string, unknown>;
    generated: GeneratedApplication;
  }) {
    const storedEvidence = { ...input.evidence } as Partial<CandidateEvidence>;
    delete storedEvidence.source_text;
    const values = {
      user_id: input.userId,
      candidate_profile_id: input.candidateProfileId,
      search_profile_id: input.searchProfileId,
      job_offer_id: input.jobOfferId,
      source_resume_id: input.resumeId,
      status: "READY_FOR_REVIEW",
      job_analysis: input.job,
      profile_analysis: storedEvidence,
      match_summary: { ...input.matchSummary, gaps: input.gaps },
      resume_adaptation: input.generated.resume_adaptation,
      recruiter_message: input.generated.recruiter_message,
      cover_letter: input.generated.cover_letter,
    };
    const query = input.existingId
      ? this.client.from("application_drafts").update(values).eq("id", input.existingId).eq("user_id", input.userId)
      : this.client.from("application_drafts").insert(values);
    const { data, error } = await query.select("id").single();
    if (error) throw new Error(`APPLICATION_DRAFT_WRITE_FAILED:${error.code ?? "unknown"}`);
    return data.id as string;
  }
}
