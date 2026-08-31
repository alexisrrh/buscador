import Link from "next/link";
import { Feedback, StatusBadge } from "@/components/feedback";
import { SearchStatusActions } from "@/components/search-status-actions";
import { requireUser } from "@/lib/supabase/server";
import type { SearchProfile } from "@/lib/types";

export default async function SearchesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("search_profiles")
    .select("*")
    .is("deleted_at", null)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: false });
  const searches = (data ?? []) as SearchProfile[];

  return <>
    <div className="page-header">
      <div>
        <h1>Tus búsquedas de empleo</h1>
        <p>Configura una búsqueda diferente para cada tipo de trabajo que te interese.</p>
      </div>
      <Link className="button" href="/searches/new">Crear una búsqueda</Link>
    </div>
    <Feedback message={params.message} />
    <section className="list">
      {searches.length ? searches.map((search) => (
        <article key={search.id} className="card list-item">
          <div>
            <h2><Link href={`/searches/${search.id}`}>{search.name}</Link></h2>
            <p>{frequencyLabel(search)} · Horario de España</p>
            <StatusBadge status={search.status} />
          </div>
          <SearchStatusActions
            id={search.id}
            status={search.status}
            editHref={`/searches/${search.id}`}
            editLabel={search.status === "DRAFT" ? "Continuar" : "Editar"}
          />
        </article>
      )) : <div className="card empty">Todavía no has creado ninguna búsqueda de empleo.</div>}
    </section>
  </>;
}

function frequencyLabel(search: SearchProfile) {
  if (search.frequency_type === "DAILY") return "Una vez al día";
  if (search.frequency_type === "WEEKDAYS") return "Solo días laborables";
  const minutes = Number(search.frequency_value.minutes);
  if (minutes === 60) return "Cada hora";
  if (minutes === 180) return "Cada 3 horas";
  if (minutes === 360) return "Cada 6 horas";
  return "Frecuencia personalizada";
}
