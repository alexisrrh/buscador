"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { trimmed } from "@/lib/validation";
import { structuredUserIdentity } from "@/lib/user-identity";

function values(formData: FormData) {
  const name = trimmed(formData.get("name"), 120);
  if (!name) throw new Error("El nombre del perfil es obligatorio.");
  return {
    name,
    headline: trimmed(formData.get("headline"), 160) || null,
    job_family: trimmed(formData.get("job_family"), 100) || null,
    seniority: trimmed(formData.get("seniority"), 50) || null,
  };
}

export async function createProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase
    .from("candidate_profiles")
    .insert({ user_id: user.id, ...values(formData) })
    .select("id")
    .single();
  if (error) redirect(`/profiles/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/profiles/${data.id}?message=Perfil%20creado`);
}

export async function updateProfile(formData: FormData) {
  const id = trimmed(formData.get("id"), 36);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase
    .from("candidate_profiles")
    .update(values(formData))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) redirect(`/profiles/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/profiles");
  redirect(`/profiles/${id}?message=Perfil%20actualizado`);
}

export async function updateUserIdentity(formData: FormData) {
  const profileId = trimmed(formData.get("profile_id"), 36);
  const identity = structuredUserIdentity({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
  });
  if (!identity) redirect(`/profiles/${profileId}?error=${encodeURIComponent("Introduce un nombre y apellido(s) válidos.")}`);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update(identity).eq("id", user.id);
  if (error) redirect(`/profiles/${profileId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/profiles");
  redirect(`/profiles/${profileId}?message=Identidad%20actualizada`);
}

export async function archiveProfile(formData: FormData) {
  const id = trimmed(formData.get("id"), 36);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  await supabase
    .from("candidate_profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/profiles");
  redirect("/profiles?message=Perfil%20archivado");
}
