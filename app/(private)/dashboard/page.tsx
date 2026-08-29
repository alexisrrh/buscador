import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  if (!user) return null;
  const [profiles, searches, resumes, approved, nextSearch] = await Promise.all([
    supabase.from("candidate_profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("search_profiles").select("id", { count: "exact", head: true }).eq("status", "ACTIVE").is("deleted_at", null),
    supabase.from("resumes").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("resumes").select("id", { count: "exact", head: true }).eq("status", "APPROVED").is("deleted_at", null),
    supabase.from("search_profiles").select("name,next_run_at").eq("status", "ACTIVE").is("deleted_at", null).not("next_run_at", "is", null).order("next_run_at").limit(1).maybeSingle(),
  ]);
  return (
    <>
      <div className="page-header"><div><h1>Tu búsqueda de empleo</h1><p>Aquí puedes ver lo que ya has preparado y qué falta por configurar.</p></div></div>
      <section className="grid cards" aria-label="Métricas actuales">
        <article className="card"><span className="muted">Perfiles</span><div className="metric">{profiles.count ?? 0}</div></article>
        <article className="card"><span className="muted">Búsquedas activas</span><div className="metric">{searches.count ?? 0}</div></article>
        <article className="card"><span className="muted">CV totales</span><div className="metric">{resumes.count ?? 0}</div></article>
        <article className="card"><span className="muted">CV aprobados</span><div className="metric">{approved.count ?? 0}</div></article>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Próxima búsqueda programada</h2>
        {nextSearch.data ? <p><strong>{nextSearch.data.name}</strong><br /><span className="muted">{new Date(nextSearch.data.next_run_at).toLocaleString("es-ES")}</span></p> : <p className="muted">No hay búsquedas activas programadas.</p>}
        <div className="actions"><Link className="button secondary" href="/searches">Administrar búsquedas</Link></div>
      </section>
    </>
  );
}
