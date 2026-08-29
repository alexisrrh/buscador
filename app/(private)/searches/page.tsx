import Link from "next/link";
import { Feedback, StatusBadge } from "@/components/feedback";
import { requireUser } from "@/lib/supabase/server";
import type { SearchProfile } from "@/lib/types";

export default async function SearchesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams; const { supabase } = await requireUser();
  const { data } = await supabase.from("search_profiles").select("*").order("created_at", { ascending: false });
  const searches = (data ?? []) as SearchProfile[];
  return <><div className="page-header"><div><h1>Búsquedas</h1><p>Cada búsqueda carga su configuración desde PostgreSQL.</p></div><Link className="button" href="/searches/new">Nueva búsqueda</Link></div><Feedback message={params.message} /><section className="list">{searches.length ? searches.map((search) => <Link key={search.id} href={`/searches/${search.id}`} className="card list-item"><div><h2>{search.name}</h2><p>{search.frequency_type} · {search.timezone} · versión {search.version}</p></div><StatusBadge status={search.deleted_at ? "ARCHIVED" : search.status} /></Link>) : <div className="card empty">No hay búsquedas configuradas.</div>}</section></>;
}
