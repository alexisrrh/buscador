import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveProfile, updateProfile } from "@/app/actions/profiles";
import { Feedback } from "@/components/feedback";
import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/types";

export default async function EditProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params; const query = await searchParams;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("candidate_profiles").select("*").eq("id", id).eq("user_id", user!.id).maybeSingle();
  if (!data) notFound();
  const profile = data as CandidateProfile;
  return <><div className="page-header"><div><h1>Tu perfil profesional</h1><p>Actualiza cómo quieres presentarte para este tipo de trabajo.</p></div>{!profile.deleted_at && <Link className="button" href="/searches/new">Continuar: crear una búsqueda</Link>}</div><Feedback error={query.error} message={query.message} /><ProfileForm action={updateProfile} profile={profile} />{!profile.deleted_at && <form action={archiveProfile} className="actions"><input type="hidden" name="id" value={profile.id} /><button className="danger" type="submit">Ya no quiero usar este perfil</button></form>}</>;
}
