"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { MAX_RESUME_BYTES, RESUME_MIME_TYPES } from "@/lib/validation";
import type { Resume } from "@/lib/types";

type PrepareInput = {
  candidateProfileId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  contentSha256: string;
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

export async function finishResumeUpload(id: string) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." };
  const { error } = await supabase.rpc("complete_resume_upload", { p_resume_id: id });
  revalidatePath("/resumes");
  return error
    ? { error: publicResumeError("complete", error, "No se pudo verificar el archivo subido.") }
    : { ok: true };
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
  if (error) {
    redirect(`/resumes?error=${encodeURIComponent(publicResumeError("approve", error, "No se pudo aprobar este CV."))}`);
  }
  revalidatePath("/resumes");
  redirect("/resumes?message=CV%20aprobado");
}

export async function setResumeStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const operation = intent === "delete" ? "soft_delete_resume" : "archive_resume";
  const { error } = await supabase.rpc(operation, { p_resume_id: id });
  if (error) {
    redirect(`/resumes?error=${encodeURIComponent(publicResumeError(intent, error, "No se pudo actualizar este CV."))}`);
  }
  revalidatePath("/resumes");
  redirect("/resumes?message=CV%20actualizado");
}
