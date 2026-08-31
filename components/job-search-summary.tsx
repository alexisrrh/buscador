export interface JobSearchSummaryData {
  sources: number;
  succeeded: number;
  failed: number;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  matches: number;
  skipped: number;
  totalMs: number;
  high: number;
  infoJobsSkipped: boolean;
  providers?: Record<string, { attempted: number; succeeded: number; failed: number; offers_received: number }>;
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
        <div><dt>Sin cambios</dt><dd>{summary.unchanged}</dd></div>
        <div><dt>Duplicadas</dt><dd>{summary.duplicates}</dd></div>
        <div><dt>Matches generados</dt><dd>{summary.matches}</dd></div>
        <div><dt>Matches omitidos</dt><dd>{summary.skipped}</dd></div>
        <div><dt>Tiempo total</dt><dd>{(summary.totalMs / 1_000).toFixed(1)} s</dd></div>
        <div><dt>Alta compatibilidad</dt><dd>{summary.high}</dd></div>
      </dl>
      {summary.providers && Object.keys(summary.providers).length > 0 && (
        <div className="provider-summary">
          {Object.entries(summary.providers).map(([provider, stats]) => (
            <p className="hint" key={provider}>
              {provider}: {stats.succeeded}/{stats.attempted} fuentes · {stats.offers_received} ofertas{stats.failed ? ` · ${stats.failed} errores` : ""}
            </p>
          ))}
        </div>
      )}
      {summary.infoJobsSkipped && <p className="hint">InfoJobs: SKIPPED_SOURCE (sin credenciales de aplicación).</p>}
    </section>
  );
}
