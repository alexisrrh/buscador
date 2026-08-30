export interface JobSearchSummaryData {
  sources: number;
  succeeded: number;
  failed: number;
  received: number;
  created: number;
  updated: number;
  duplicates: number;
  matches: number;
  high: number;
  infoJobsSkipped: boolean;
}

export function JobSearchSummary({ summary }: { summary: JobSearchSummaryData }) {
  return (
    <section className="card run-summary" aria-label="Resumen de búsqueda">
      <h2>Resultado de la búsqueda</h2>
      <dl>
        <div><dt>Fuentes consultadas</dt><dd>{summary.sources}</dd></div>
        <div><dt>Fuentes correctas</dt><dd>{summary.succeeded}</dd></div>
        <div><dt>Errores de fuente</dt><dd>{summary.failed}</dd></div>
        <div><dt>Ofertas encontradas</dt><dd>{summary.received}</dd></div>
        <div><dt>Nuevas</dt><dd>{summary.created}</dd></div>
        <div><dt>Actualizadas</dt><dd>{summary.updated}</dd></div>
        <div><dt>Duplicadas</dt><dd>{summary.duplicates}</dd></div>
        <div><dt>Matches generados</dt><dd>{summary.matches}</dd></div>
        <div><dt>Alta compatibilidad</dt><dd>{summary.high}</dd></div>
      </dl>
      {summary.infoJobsSkipped && <p className="hint">InfoJobs: SKIPPED_SOURCE (sin credenciales de aplicación).</p>}
    </section>
  );
}
