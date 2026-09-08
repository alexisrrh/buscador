import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createApplicationServiceClient } from "@/lib/applications/repository.server";
import { extractResume } from "@/lib/applications/resume-extractor.server";
import { buildResumeContent, DERIVED_BUCKET, DerivedResumeError, GENERATION_VERSION, type ResumeContent } from "./content";
import { renderResumePdf } from "./renderer.server";

type Context = { authClient: SupabaseClient; userId: string; draftId: string; serviceClient?: SupabaseClient };
export async function loadRenderSource(input: Context) {
  const { data: draft, error } = await input.authClient.from("application_drafts").select("*")
    .eq("id", input.draftId).eq("user_id", input.userId).maybeSingle();
  if (error || !draft) throw new DerivedResumeError("DRAFT_NOT_FOUND");
  if (draft.status !== "APPROVED") throw new DerivedResumeError("DRAFT_NOT_APPROVED");
  const { data: resume } = await input.authClient.from("resumes").select("*")
    .eq("id", draft.source_resume_id).eq("candidate_profile_id", draft.candidate_profile_id).eq("user_id", input.userId).is("deleted_at", null).maybeSingle();
  if (!resume) throw new DerivedResumeError("SOURCE_RESUME_NOT_FOUND");
  if (resume.status !== "APPROVED") throw new DerivedResumeError("SOURCE_RESUME_NOT_APPROVED");
  return { draft, resume };
}

async function contentFromSource(input: Context, source: Awaited<ReturnType<typeof loadRenderSource>>) {
  const { draft, resume } = source;
  const service = input.serviceClient ?? createApplicationServiceClient();
  const { data: file, error } = await service.storage.from(resume.storage_bucket).download(resume.storage_path);
  if (error || !file) throw new DerivedResumeError("SOURCE_DOWNLOAD_FAILED");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== resume.file_size_bytes || createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== resume.content_sha256) {
    throw new DerivedResumeError("SOURCE_INTEGRITY_FAILED");
  }
  const extraction = await extractResume(bytes, resume.mime_type);
  const { data: userIdentity } = await input.authClient.from("profiles")
    .select("first_name,last_name").eq("id", input.userId).maybeSingle();
  return buildResumeContent(draft.resume_adaptation, draft.profile_analysis, extraction.structured, draft.job_analysis, userIdentity);
}

export async function previewDerivedResume(input: Context): Promise<ResumeContent> {
  return contentFromSource(input, await loadRenderSource(input));
}

export async function generateDerivedResume(input: Context & { format?: string }) {
  if (input.format && input.format !== "PDF") throw new DerivedResumeError("UNSUPPORTED_FORMAT");
  const source = await loadRenderSource(input);
  const service = input.serviceClient ?? createApplicationServiceClient();
  const { draft } = source;
  const id = randomUUID();
  const { data: record, error: insertError } = await service.from("derived_resumes").insert({
    id, user_id: input.userId, candidate_profile_id: draft.candidate_profile_id,
    application_draft_id: draft.id, source_resume_id: draft.source_resume_id, job_offer_id: draft.job_offer_id,
    generation_version: GENERATION_VERSION,
  }).select("storage_path").single();
  if (insertError || !record) throw new DerivedResumeError("GENERATION_CREATE_FAILED");
  try {
    const content = await contentFromSource({ ...input, serviceClient: service }, source);
    const rendered = await renderResumePdf(content);
    const { error: storageError } = await service.storage.from(DERIVED_BUCKET).upload(record.storage_path, rendered.bytes, {
      contentType: rendered.mime_type, upsert: false, cacheControl: "0",
    });
    if (storageError) throw new DerivedResumeError("STORAGE_FAILED");
    const { bytes: _bytes, ...metadata } = rendered;
    void _bytes;
    const { error: readyError } = await service.from("derived_resumes").update({
      ...metadata, status: "READY", content_snapshot: content,
    }).eq("id", id).eq("status", "GENERATING").select("id").single();
    if (readyError) throw new DerivedResumeError("GENERATION_FINALIZE_FAILED");
    return { id, ...metadata, status: "READY" as const };
  } catch (error) {
    const code = error instanceof DerivedResumeError ? error.code : "GENERATION_FAILED";
    const { error: failureError } = await service.from("derived_resumes").update({ status: "FAILED", failure_code: code })
      .eq("id", id).eq("status", "GENERATING");
    if (failureError) throw new DerivedResumeError("GENERATION_FINALIZE_FAILED");
    throw new DerivedResumeError(code);
  }
}

export async function selectDerivedResume(input: Context & { derivedId: string }) {
  const { draft } = await loadRenderSource(input);
  const { data: derived } = await input.authClient.from("derived_resumes").select("id")
    .eq("id", input.derivedId).eq("user_id", input.userId).eq("application_draft_id", draft.id).eq("status", "READY").maybeSingle();
  if (!derived) throw new DerivedResumeError("READY_DERIVED_REQUIRED");
  const service = input.serviceClient ?? createApplicationServiceClient();
  const { data, error } = await service.from("applications").update({ derived_resume_id: derived.id })
    .eq("user_id", input.userId).eq("application_draft_id", draft.id).eq("attempt_count", 0)
    .in("status", ["PREPARED", "READY", "BLOCKED", "FAILED"]).select("id");
  if (error || !data?.length) throw new DerivedResumeError("PREPARED_APPLICATION_REQUIRED");
}
