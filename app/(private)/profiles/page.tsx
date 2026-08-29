import Link from "next/link";
import { Feedback, StatusBadge } from "@/components/feedback";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/types";

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("candidate_profiles").select("*").order("created_at", { ascending: false });
  const profiles = (data ?? []) as CandidateProfile[];
  return <><div className="page-header"><div><h1>Tus perfiles profesionales</h1><p>Crea uno para cada tipo de trabajo que quieras buscar.</p></div><Link className="button" href="/profiles/new">Crear otro perfil</Link></div><Feedback message={params.message} /><section className="list">{profiles.length ? profiles.map((profile) => <Link key={profile.id} href={`/profiles/${profile.id}`} className="card list-item"><div><h2>{profile.name}</h2><p>{profile.headline || profile.job_family || "Añade una breve presentación"}</p></div><StatusBadge status={profile.deleted_at ? "ARCHIVED" : "ACTIVE"} /></Link>) : <div className="card empty">Aún no tienes perfiles. Crea uno para empezar a preparar tu búsqueda.</div>}</section></>;
}
