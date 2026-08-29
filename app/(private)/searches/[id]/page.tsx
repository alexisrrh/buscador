import { notFound } from "next/navigation";
import { saveSearch, setSearchStatus } from "@/app/actions/searches";
import { Feedback, StatusBadge } from "@/components/feedback";
import { SearchForm } from "@/components/search-form";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile, JobPreferences, SearchProfile } from "@/lib/types";

export default async function EditSearchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params; const query = await searchParams; const { supabase, user } = await requireUser();
  const [{ data: searchData }, { data: profileData }] = await Promise.all([
    supabase.from("search_profiles").select("*").eq("id", id).eq("user_id", user!.id).maybeSingle(),
    supabase.from("candidate_profiles").select("*").is("deleted_at", null).order("name"),
  ]);
  if (!searchData) notFound();
  const search = searchData as SearchProfile;
  const { data: preferencesData } = await supabase.from("job_preferences").select("*").eq("search_profile_id", id).eq("search_profile_version", search.version).maybeSingle();
  return <><div className="page-header"><div><h1>Editar búsqueda</h1><p><StatusBadge status={search.deleted_at ? "ARCHIVED" : search.status} /> · La candidatura sigue siendo manual.</p></div></div><Feedback error={query.error} message={query.message} /><SearchForm action={saveSearch} profiles={(profileData ?? []) as CandidateProfile[]} search={search} preferences={(preferencesData ?? undefined) as JobPreferences | undefined} />{!search.deleted_at && <div className="card" style={{ marginTop: "1rem" }}><h2>Estado</h2><div className="actions">{search.status !== "ACTIVE" && <StatusForm id={id} status="ACTIVE" label="Activar" />}{search.status !== "PAUSED" && <StatusForm id={id} status="PAUSED" label="Pausar" />}<StatusForm id={id} status="ARCHIVED" label="Archivar" danger /></div></div>}</>;
}

function StatusForm({ id, status, label, danger }: { id: string; status: string; label: string; danger?: boolean }) {
  return <form action={setSearchStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className={danger ? "danger" : "secondary"} type="submit">{label}</button></form>;
}
