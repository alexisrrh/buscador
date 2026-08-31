import { setJobMatchStatus } from "@/app/actions/jobs";
import { Feedback, StatusBadge } from "@/components/feedback";
import { JobSearchSummary } from "@/components/job-search-summary";
import {
  JobsEmptyState,
  JobsSearchControls,
  type JobsSearchProfile,
} from "@/components/jobs-search-state";
import { requireUser } from "@/lib/supabase/server";

type JobMatchRow = {
  id: string;
  search_profile_id: string;
  job_offer_id: string;
  score: number;
  eligibility_status: string;
  reasons: string[];
  status: string;
  created_at: string;
};

type OfferRow = {
  id: string;
  title: string;
  location_text: string | null;
  work_mode: string | null;
  published_at: string | null;
  last_seen_at: string;
  canonical_url: string | null;
  companies: { name: string } | null;
  job_offer_sources: Array<{
    source_url: string;
    company_career_source_id: string | null;
    job_sources: { code: string; name: string } | null;
  }>;
};

type JobsParams = {
  message?: string;
  error?: string;
  search?: string;
  min_score?: string;
  status?: string;
  eligibility?: string;
  work_mode?: string;
  sort?: string;
  run?: string;
  sources?: string;
  succeeded?: string;
  failed?: string;
  received?: string;
  created?: string;
  updated?: string;
  duplicates?: string;
  matches?: string;
  high?: string;
  infojobs?: string;
};

const USER_STATUSES = ["NEW", "SAVED", "DISMISSED"];
const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"];
const ELIGIBILITY_FILTERS = ["compatible", "all", "ELIGIBLE", "REVIEW", "REJECTED"];

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobsParams> }) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const [{ data: searchData, error: searchError }, { data: matchData }, { count: configuredSourceCount }] = await Promise.all([
    supabase
      .from("search_profiles")
      .select("id,name,status,notification_min_score")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_matches")
      .select("id,search_profile_id,job_offer_id,score,eligibility_status,reasons,status,created_at")
      .eq("scoring_version", "deterministic-v2")
      .limit(200),
    supabase
      .from("company_career_sources")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true),
  ]);

  const searches = (searchData ?? []) as JobsSearchProfile[];
  const matches = (matchData ?? []) as JobMatchRow[];
  const offerIds = [...new Set(matches.map((match) => match.job_offer_id))];
  const { data: offerData } = offerIds.length
    ? await supabase
        .from("job_offers")
        .select(
          "id,title,location_text,work_mode,published_at,last_seen_at,canonical_url,companies(name),job_offer_sources(source_url,company_career_source_id,job_sources(code,name))",
        )
        .in("id", offerIds)
    : { data: [] };

  const offers = new Map(
    ((offerData ?? []) as unknown as OfferRow[]).map((offer) => [offer.id, offer]),
  );
  const searchMap = new Map(searches.map((search) => [search.id, search]));
  const minimumScore = Math.min(Math.max(Number(params.min_score) || 0, 0), 100);
  const selectedSearch = searches.some((search) => search.id === params.search)
    ? params.search
    : "";
  const selectedStatus = USER_STATUSES.includes(params.status ?? "") ? params.status : "";
  const selectedEligibility = ELIGIBILITY_FILTERS.includes(params.eligibility ?? "")
    ? params.eligibility!
    : "compatible";
  const selectedMode = WORK_MODES.includes(params.work_mode ?? "") ? params.work_mode : "";
  const sort = params.sort === "recent" ? "recent" : "score";

  const visibleMatches = matches
    .filter((match) => !selectedSearch || match.search_profile_id === selectedSearch)
    .filter((match) => match.score >= minimumScore)
    .filter((match) => !selectedStatus || match.status === selectedStatus)
    .filter((match) =>
      selectedEligibility === "all"
        ? true
        : selectedEligibility === "compatible"
          ? match.eligibility_status !== "REJECTED"
          : match.eligibility_status === selectedEligibility,
    )
    .filter((match) => !selectedMode || offers.get(match.job_offer_id)?.work_mode === selectedMode)
    .sort((left, right) =>
      sort === "recent"
        ? offerDate(offers.get(right.job_offer_id)).getTime() -
          offerDate(offers.get(left.job_offer_id)).getTime()
        : right.score - left.score,
    );

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Matching determinista</p>
          <h1>Ofertas compatibles</h1>
          <p>Revisa el score y los motivos antes de abrir, guardar o descartar una oferta.</p>
        </div>
        <JobsSearchControls searches={searches} selectedSearchId={selectedSearch} />
      </div>

      <Feedback message={params.message} error={params.error} />

      {params.run === "1" && (
        <JobSearchSummary summary={{
          sources: numberParam(params.sources),
          succeeded: numberParam(params.succeeded),
          failed: numberParam(params.failed),
          received: numberParam(params.received),
          created: numberParam(params.created),
          updated: numberParam(params.updated),
          duplicates: numberParam(params.duplicates),
          matches: numberParam(params.matches),
          high: numberParam(params.high),
          infoJobsSkipped: params.infojobs === "SKIPPED_SOURCE",
        }} />
      )}

      <form className="card jobs-filters" method="get">
        <div className="field">
          <label htmlFor="eligibility">Compatibilidad</label>
          <select id="eligibility" name="eligibility" defaultValue={selectedEligibility}>
            <option value="compatible">Compatibles y por revisar</option>
            <option value="ELIGIBLE">Compatibles</option>
            <option value="REVIEW">Por revisar</option>
            <option value="REJECTED">Rechazadas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="search">Búsqueda</label>
          <select id="search" name="search" defaultValue={selectedSearch}>
            <option value="">Todas</option>
            {searches.map((search) => <option key={search.id} value={search.id}>{search.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="min-score">Score mínimo</label>
          <input id="min-score" name="min_score" type="number" min="0" max="100" defaultValue={minimumScore} />
        </div>
        <div className="field">
          <label htmlFor="status">Estado</label>
          <select id="status" name="status" defaultValue={selectedStatus}>
            <option value="">Todos</option>
            <option value="NEW">Nuevas</option>
            <option value="SAVED">Guardadas</option>
            <option value="DISMISSED">Descartadas</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="work-mode">Modalidad</label>
          <select id="work-mode" name="work_mode" defaultValue={selectedMode}>
            <option value="">Todas</option>
            <option value="REMOTE">Remoto</option>
            <option value="HYBRID">Híbrido</option>
            <option value="ONSITE">Presencial</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Ordenar</label>
          <select id="sort" name="sort" defaultValue={sort}>
            <option value="score">Mayor score</option>
            <option value="recent">Más recientes</option>
          </select>
        </div>
        <button type="submit">Aplicar filtros</button>
      </form>

      <section className="jobs-list" aria-label="Resultados">
        {visibleMatches.length > 0 ? visibleMatches.map((match) => {
          const offer = offers.get(match.job_offer_id);
          const search = searchMap.get(match.search_profile_id);
          if (!offer) return null;
          const source = preferredSource(offer);
          const threshold = search?.notification_min_score ?? 100;
          return (
            <article className={`card job-card ${match.status === "DISMISSED" ? "is-dismissed" : ""}`} key={match.id}>
              <div className="job-main">
                <div className="job-heading">
                  <div>
                    <p className="job-company">{offer.companies?.name ?? "Empresa no informada"}</p>
                    <h2>{offer.title}</h2>
                  </div>
                  <div className="score-box" aria-label={`Score ${match.score} de 100`}>
                    <strong>{match.score}</strong><span>/100</span>
                  </div>
                </div>
                <div className="job-meta">
                  <span>{offer.location_text ?? "Ubicación no informada"}</span>
                  <span>{workModeLabel(offer.work_mode)}</span>
                  <span>{source?.job_sources?.name ?? source?.job_sources?.code ?? "Fuente no informada"}</span>
                  <span>{formatDate(offer.published_at ?? offer.last_seen_at)}</span>
                </div>
                <div className="job-badges">
                  <StatusBadge status={match.status} />
                  <StatusBadge status={match.eligibility_status} />
                  {match.eligibility_status === "ELIGIBLE" && match.score >= threshold && <span className="badge high-match">Alta compatibilidad</span>}
                  {search && <span className="badge">{search.name}</span>}
                </div>
                <ul className="job-reasons">
                  {match.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
              <div className="job-actions">
                {(source?.source_url || offer.canonical_url) && (
                  <a className="button secondary" href={source?.source_url ?? offer.canonical_url ?? "#"} target="_blank" rel="noreferrer">
                    Ver oferta
                  </a>
                )}
                <form action={setJobMatchStatus}>
                  <input type="hidden" name="job_match_id" value={match.id} />
                  <input type="hidden" name="status" value="SAVED" />
                  <button className="secondary" type="submit">Guardar</button>
                </form>
                <form action={setJobMatchStatus}>
                  <input type="hidden" name="job_match_id" value={match.id} />
                  <input type="hidden" name="status" value="DISMISSED" />
                  <button className="danger" type="submit">Descartar</button>
                </form>
              </div>
            </article>
          );
        }) : <JobsEmptyState
          searches={searches}
          configuredSourceCount={configuredSourceCount ?? 0}
          searchLoadFailed={Boolean(searchError)}
        />}
      </section>
    </>
  );
}

function preferredSource(offer: OfferRow) {
  return offer.job_offer_sources.find((source) => source.company_career_source_id) ??
    offer.job_offer_sources[0];
}

function offerDate(offer?: OfferRow) {
  return new Date(offer?.published_at ?? offer?.last_seen_at ?? 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function workModeLabel(value: string | null) {
  return { REMOTE: "Remoto", HYBRID: "Híbrido", ONSITE: "Presencial", UNKNOWN: "Modalidad no informada" }[value ?? "UNKNOWN"] ?? value;
}

function numberParam(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
