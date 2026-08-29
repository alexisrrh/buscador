import Link from "next/link";
import { saveSearch } from "@/app/actions/searches";
import { Feedback } from "@/components/feedback";
import { SearchForm } from "@/components/search-form";
import { requireUser } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/types";

export default async function NewSearchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams; const { supabase } = await requireUser();
  const { data } = await supabase.from("candidate_profiles").select("*").is("deleted_at", null).order("name");
  const profiles = (data ?? []) as CandidateProfile[];
  return <><div className="page-header"><div><h1>Nueva búsqueda</h1><p>Configura criterios independientes para un perfil.</p></div></div><Feedback error={params.error} />{profiles.length ? <SearchForm action={saveSearch} profiles={profiles} /> : <div className="card empty">Primero necesitas un perfil profesional.<div className="actions" style={{ justifyContent: "center" }}><Link className="button" href="/profiles/new">Crear perfil</Link></div></div>}</>;
}
