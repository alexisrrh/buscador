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

  const { data: profile } = await supabase
    .from("candidate_profiles")
    .select("id")
    .eq("id", input.candidateProfileId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!profile) return { error: "Perfil no disponible." } as const;

  const { data: duplicate } = await supabase
    .from("resumes")
    .select("id")
    .eq("candidate_profile_id", input.candidateProfileId)
    .eq("content_sha256", input.contentSha256)
    .maybeSingle();
  if (duplicate) return { error: "Este CV ya existe en el perfil seleccionado." } as const;

  const { data: latest } = await supabase
    .from("resumes")
    .select("version")
    .eq("candidate_profile_id", input.candidateProfileId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      candidate_profile_id: input.candidateProfileId,
      version: Number(latest?.version ?? 0) + 1,
      status: "PROCESSING",
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      content_sha256: input.contentSha256,
    })
    .select("*")
    .single();

  if (error) return { error: error.message } as const;
  return { resume: data as Resume } as const;
}

export async function finishResumeUpload(id: string, success: boolean) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sesión no válida." };
  const { error } = await supabase
    .from("resumes")
    .update({ status: success ? "READY" : "REJECTED" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "PROCESSING");
  revalidatePath("/resumes");
  return error ? { error: error.message } : { ok: true };
}

export async function approveResume(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("approve_resume", { p_resume_id: id });
  if (error) redirect(`/resumes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/resumes");
  redirect("/resumes?message=CV%20aprobado");
}

export async function setResumeStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const patch = intent === "delete"
    ? { deleted_at: new Date().toISOString() }
    : { status: "ARCHIVED" as const };
  const { error } = await supabase
    .from("resumes")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) redirect(`/resumes?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/resumes");
  redirect("/resumes?message=CV%20actualizado");
}
