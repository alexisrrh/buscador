import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzeGaps, analyzeJobOffer, buildCandidateEvidence } from "./analysis";
import { EvidenceBasedApplicationGenerator } from "./generator";
import { ApplicationDraftRepository, createApplicationServiceClient } from "./repository.server";
import { extractResume, RESUME_EXTRACTOR_VERSION } from "./resume-extractor.server";
import type { CandidateApplicationGenerator } from "./types";
import { validateGeneratedApplication } from "./validation";

export class ApplicationPreparationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function prepareApplicationDraft(input: {
  authClient: SupabaseClient;
  userId: string;
  jobMatchId: string;
  regenerate?: boolean;
  generator?: CandidateApplicationGenerator;
  serviceClient?: SupabaseClient;
}) {
  const { data: match, error: matchError } = await input.authClient.from("job_matches")
    .select("id,candidate_profile_id,search_profile_id,job_offer_id,score,eligibility_status,reasons,scoring_version")
    .eq("id", input.jobMatchId)
    .eq("user_id", input.userId)
    .in("eligibility_status", ["ELIGIBLE", "REVIEW"])
    .maybeSingle();
  if (matchError || !match) throw new ApplicationPreparationError("MATCH_NOT_ELIGIBLE", "La oferta no puede prepararse.");

  const [{ data: profile }, { data: resume }, { data: offer }] = await Promise.all([
    input.authClient.from("candidate_profiles")
      .select("id,name,headline,job_family,seniority")
      .eq("id", match.candidate_profile_id).eq("user_id", input.userId).is("deleted_at", null).maybeSingle(),
    input.authClient.from("resumes")
      .select("id,user_id,candidate_profile_id,status,storage_bucket,storage_path,mime_type")
      .eq("candidate_profile_id", match.candidate_profile_id).eq("user_id", input.userId)
      .eq("status", "APPROVED").is("deleted_at", null).maybeSingle(),
    input.authClient.from("job_offers")
      .select("id,title,description,location_text,work_mode,employment_type,salary_min,salary_max,salary_currency,companies(name)")
      .eq("id", match.job_offer_id).maybeSingle(),
  ]);
  if (!profile || !offer) throw new ApplicationPreparationError("PREPARATION_DATA_MISSING", "No se pudo cargar el perfil o la oferta.");
  const approvedResume = requireApprovedResume(resume);

  const serviceClient = input.serviceClient ?? createApplicationServiceClient();
  const repository = new ApplicationDraftRepository(serviceClient);
  const current = await repository.findCurrentDraft({
    userId: input.userId,
    jobOfferId: match.job_offer_id,
    candidateProfileId: match.candidate_profile_id,
    resumeId: approvedResume.id,
  });
  if (current && !input.regenerate) return { id: current.id, reused: true };
  if (current?.status === "APPROVED") {
    throw new ApplicationPreparationError("APPROVED_DRAFT_IMMUTABLE", "La candidatura aprobada no puede regenerarse.");
  }

  let extraction = await repository.loadExtraction(approvedResume.id, RESUME_EXTRACTOR_VERSION);
  if (!extraction) {
    const { data: file, error: downloadError } = await input.authClient.storage
      .from(approvedResume.storage_bucket).download(approvedResume.storage_path);
    if (downloadError || !file) throw new ApplicationPreparationError("RESUME_DOWNLOAD_FAILED", "No se pudo leer el CV aprobado.");
    extraction = await extractResume(await file.arrayBuffer(), approvedResume.mime_type);
    await repository.saveExtraction({
      userId: input.userId,
      candidateProfileId: match.candidate_profile_id,
      resumeId: approvedResume.id,
      extractorVersion: RESUME_EXTRACTOR_VERSION,
      ...extraction,
    });
  }

  const job = analyzeJobOffer(offer as never);
  const evidence = buildCandidateEvidence(profile, extraction.structured, job);
  const gaps = analyzeGaps(job, evidence);
  const generator = input.generator ?? resolveApplicationGenerator();
  const generated = validateGeneratedApplication(await generator.generate({ job, evidence, gaps }), evidence);
  const id = await repository.saveDraft({
    existingId: current?.id,
    userId: input.userId,
    candidateProfileId: match.candidate_profile_id,
    searchProfileId: match.search_profile_id,
    jobOfferId: match.job_offer_id,
    resumeId: approvedResume.id,
    job,
    evidence,
    gaps,
    matchSummary: {
      job_match_id: match.id,
      score: match.score,
      eligibility: match.eligibility_status,
      reasons: match.reasons,
      scoring_version: match.scoring_version,
      generator: generator.provider,
    },
    generated,
  });
  return { id, reused: false };
}

export function requireApprovedResume<T>(resume: T | null): T {
  if (!resume) throw new ApplicationPreparationError("APPROVED_RESUME_REQUIRED", "Necesitas aprobar un CV antes de preparar una candidatura.");
  return resume;
}

export function resolveApplicationGenerator() {
  const provider = process.env.APPLICATION_GENERATOR_PROVIDER?.trim() || "evidence-based";
  if (provider === "evidence-based") return new EvidenceBasedApplicationGenerator();
  throw new ApplicationPreparationError("GENERATION_NOT_CONFIGURED", "El generador de candidaturas no está configurado.");
}
