"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { safeReturnTarget } from "@/lib/intent-first";
import { MAX_RESUME_BYTES, RESUME_MIME_TYPES } from "@/lib/validation";
import type { Resume } from "@/lib/types";

type PrepareInput = {
  candidateProfileId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  contentSha256: string;
};

type ContextualPrepareInput = Omit<PrepareInput, "candidateProfileId"> & {
  candidateProfileId?: string;
};

type PublicError = { code?: string };

function publicResumeError(operation: string, error: PublicError | null | undefined, fallback: string) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[resume-action]", { operation, code: error?.code ?? "unknown" });
  }
  return error?.code === "23505"
    ? "Este CV ya existe en el perfil seleccionado."
    : fallback;
}

export async function prepareResumeUpload(input: PrepareInput) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." } as const;
  if (!RESUME_MIME_TYPES.includes(input.mimeType as (typeof RESUME_MIME_TYPES)[number])) {
    return { error: "El formato del archivo no está permitido." } as const;
  }
  if (input.fileSizeBytes <= 0 || input.fileSizeBytes > MAX_RESUME_BYTES) {
    return { error: "Tamaño no permitido." } as const;
  }
  if (!/^[0-9a-f]{64}$/.test(input.contentSha256)) {
    return { error: "No se pudo verificar el archivo." } as const;
  }
  const filename = input.originalFilename.trim();
  if (!filename || filename.length > 255 || /[/\\]/.test(filename)) {
    return { error: "El nombre del archivo no es válido." } as const;
  }

  const { data, error } = await supabase.rpc("create_resume_upload", {
    p_candidate_profile_id: input.candidateProfileId,
    p_original_filename: filename,
    p_mime_type: input.mimeType,
    p_file_size_bytes: input.fileSizeBytes,
    p_content_sha256: input.contentSha256,
  });

  if (error || !data) {
    return {
      error: publicResumeError("prepare", error, "No se pudo preparar la subida del CV."),
    } as const;
  }
  const resume = (Array.isArray(data) ? data[0] : data) as Resume | undefined;
  return resume
    ? { resume } as const
    : { error: "No se pudo preparar la subida del CV." } as const;
}

export async function prepareContextualResumeUpload(input: ContextualPrepareInput) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." } as const;
  let candidateProfileId = input.candidateProfileId?.trim() ?? "";
  if (!candidateProfileId) {
    const { data, error } = await supabase.rpc("ensure_contextual_candidate_profile");
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || row.resolution === "AMBIGUOUS" || typeof row.candidate_profile_id !== "string") {
      return { error: "Necesitamos que elijas la trayectoria profesional a la que pertenece este CV." } as const;
    }
    candidateProfileId = row.candidate_profile_id;
  }
  return prepareResumeUpload({ ...input, candidateProfileId });
}

export async function finishResumeUpload(id: string, autoApproveFirst = false) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." };
  const { data, error } = await supabase.rpc("complete_resume_upload", { p_resume_id: id });
  revalidatePath("/resumes");
  if (error || !data) return { error: publicResumeError("complete", error, "No se pudo verificar el archivo subido.") };

  const resume = (Array.isArray(data) ? data[0] : data) as Pick<Resume, "candidate_profile_id">;
  if (!autoApproveFirst || !resume?.candidate_profile_id) return { ok: true, approved: false };

  const { data: otherResumes, error: otherResumesError } = await supabase
    .from("resumes")
    .select("id")
    .eq("user_id", user.id)
    .eq("candidate_profile_id", resume.candidate_profile_id)
    .in("status", ["READY", "APPROVED"])
    .is("deleted_at", null)
    .neq("id", id);
  if (otherResumesError || (otherResumes ?? []).length) return { ok: true, approved: false };

  const { error: approvalError } = await supabase.rpc("approve_resume", { p_resume_id: id });
  if (approvalError) return { error: publicResumeError("approve-first", approvalError, "No se pudo seleccionar el CV subido.") };
  revalidatePath("/resumes");
  return { ok: true, approved: true };
}

export async function rejectResumeUpload(id: string) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." };
  const { error } = await supabase.rpc("reject_resume_upload", { p_resume_id: id });
  return error
    ? { error: publicResumeError("reject", error, "No se pudo cerrar la subida fallida.") }
    : { ok: true };
}

export async function approveResume(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("approve_resume", { p_resume_id: id });
  const destination = safeReturnTarget(formData.get("return_to"), "/resumes");
  if (error) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(publicResumeError("approve", error, "No se pudo aprobar este CV."))}`);
  }
  revalidatePath("/resumes");
  redirect(`${destination}${destination.includes("?") ? "&" : "?"}message=CV%20aprobado`);
}

export async function setResumeStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const operation = intent === "delete" ? "soft_delete_resume" : "archive_resume";
  const { error } = await supabase.rpc(operation, { p_resume_id: id });
  const destination = safeReturnTarget(formData.get("return_to"), "/resumes");
  if (error) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(publicResumeError(intent, error, "No se pudo actualizar este CV."))}`);
  }
  revalidatePath("/resumes");
  redirect(`${destination}${destination.includes("?") ? "&" : "?"}message=CV%20actualizado`);
}
