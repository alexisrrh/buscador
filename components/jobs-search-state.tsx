import Link from "next/link";

import { searchJobs } from "@/app/actions/jobs";
import { StatusBadge } from "@/components/feedback";
import { SearchJobsButton } from "@/components/search-jobs-button";

export interface JobsSearchProfile {
  id: string;
  name: string;
  status: string;
  notification_min_score: number;
}

export function JobsSearchControls({
  searches,
  selectedSearchId,
}: {
  searches: JobsSearchProfile[];
  selectedSearchId?: string;
}) {
  const activeSearches = searches.filter((search) => search.status === "ACTIVE");
  if (activeSearches.length === 0) {
    return (
      <Link className="button" href={searches.length > 0 ? "/searches" : "/searches/new"}>
        {searches.length > 0 ? "Revisar búsquedas" : "Crear búsqueda"}
      </Link>
    );
  }

  const selected = activeSearches.some((search) => search.id === selectedSearchId)
    ? selectedSearchId
    : activeSearches[0].id;
  return (
    <form action={searchJobs} className="match-generator">
      <label htmlFor="generate-search">Búsqueda activa</label>
      <select id="generate-search" name="search_profile_id" defaultValue={selected}>
        {activeSearches.map((search) => (
          <option key={search.id} value={search.id}>{search.name}</option>
        ))}
      </select>
      <SearchJobsButton />
    </form>
  );
}

export function JobsEmptyState({
  searches,
  configuredSourceCount,
  searchLoadFailed = false,
}: {
  searches: JobsSearchProfile[];
  configuredSourceCount: number;
  searchLoadFailed?: boolean;
}) {
  if (searchLoadFailed) {
    return <div className="card empty">No se pudieron cargar tus búsquedas.</div>;
  }

  const activeSearches = searches.filter((search) => search.status === "ACTIVE");
  if (activeSearches.length === 0) {
    return (
      <div className="card empty">
        <strong>No tienes ninguna búsqueda activa.</strong>
        {searches.length > 0 ? (
          <>
            <p>Activa una búsqueda antes de consultar ofertas.</p>
            <div className="inactive-searches">
              {searches.map((search) => (
                <Link key={search.id} href={`/searches/${search.id}`}>
                  <span>{search.name}</span><StatusBadge status={search.status} />
                </Link>
              ))}
            </div>
            <div className="actions empty-actions">
              <Link className="button" href="/searches">Revisar o activar búsquedas</Link>
            </div>
          </>
        ) : (
          <div className="actions empty-actions">
            <Link className="button" href="/searches/new">Crear búsqueda</Link>
          </div>
        )}
      </div>
    );
  }

  if (configuredSourceCount === 0) {
    return (
      <div className="card empty">
        <strong>No hay fuentes de empresas configuradas todavía.</strong>
        <p>Selecciona una búsqueda activa arriba y pulsa “Buscar ofertas” para registrar las fuentes públicas de desarrollo y obtener vacantes reales.</p>
      </div>
    );
  }

  return (
    <div className="card empty">
      No hay ofertas para estos filtros. Pulsa “Buscar ofertas” para actualizar los resultados.
    </div>
  );
}
