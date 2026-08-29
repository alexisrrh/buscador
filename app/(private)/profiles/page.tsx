import Link from "next/link";
import { Feedback, StatusBadge } from "@/components/feedback";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/types";

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("candidate_profiles").select("*").order("created_at", { ascending: false });
  const profiles = (data ?? []) as CandidateProfile[];
  return <><div className="page-header"><div><h1>Perfiles profesionales</h1><p>Separa objetivos, CV y búsquedas por perfil.</p></div><Link className="button" href="/profiles/new">Nuevo perfil</Link></div><Feedback message={params.message} /><section className="list">{profiles.length ? profiles.map((profile) => <Link key={profile.id} href={`/profiles/${profile.id}`} className="card list-item"><div><h2>{profile.name}</h2><p>{profile.headline || profile.job_family || "Sin descripción"}</p></div><StatusBadge status={profile.deleted_at ? "ARCHIVED" : "ACTIVE"} /></Link>) : <div className="card empty">Aún no hay perfiles. Crea el primero para configurar búsquedas y CV.</div>}</section></>;
}
