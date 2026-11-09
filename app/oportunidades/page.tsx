import Link from "next/link";
import { IntentEntry } from "@/components/intent-entry";
import { BV01Renderer } from "@/components/bv-01-renderer";
import { HeroAgentStatus } from "@/components/hero-agent-status";
import { displayIntentLocation } from "@/lib/intent-display";
import { intentFromQuery, intentQuery, preparationCtaDestination, type SearchIntent } from "@/lib/intent-first";
import { searchPublicOpportunitiesForIntent, type PublicOpportunity } from "@/lib/job-sources/public-opportunities.server";
import { requireUser } from "@/lib/supabase/server";

type OpportunitiesParams = {
  intent_role?: string;
  intent_location?: string;
  intent_mode?: string;
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<OpportunitiesParams> }) {
  const params = await searchParams;
  const intent = intentFromQuery(params);
  if (!intent) return <main className="opportunities-page"><section className="opportunities-header"><p className="eyebrow">Oportunidades</p><h1>Cuéntanos qué quieres encontrar.</h1><IntentEntry /></section></main>;

  const [{ user }, result] = await Promise.all([requireUser(), searchPublicOpportunitiesForIntent(intent)]);
  const query = intentQuery(intent);
  const hasResults = result.opportunities.length > 0;

  return <main className="opportunities-page opportunities-workspace" data-agent-state={hasResults ? "search_results" : "idle"}>
    <ResultsWorkspaceHeader intent={intent} query={query} resultCount={result.opportunities.length} hasResults={hasResults} />

    {!hasResults ? <section className="opportunities-state" aria-labelledby="no-results-title"><h2 id="no-results-title">No encontramos oportunidades suficientemente cercanas a tu búsqueda.</h2><p>Prueba con otro puesto, una ubicación más amplia o modalidad Cualquiera.</p><Link className="button secondary" href={`/?${query}`}>Ajustar búsqueda</Link></section> : null}
    {hasResults ? <section className="opportunities-list" aria-label="Oportunidades encontradas">
      {result.opportunities.map((opportunity) => <OpportunityCard key={`${opportunity.sourceUrl}-${opportunity.title}`} opportunity={opportunity} intent={intent} authenticated={Boolean(user)} />)}
    </section> : null}
  </main>;
}

function ResultsWorkspaceHeader({ intent, query, resultCount, hasResults }: { intent: SearchIntent; query: string; resultCount: number; hasResults: boolean }) {
  const state = hasResults ? "SEARCH_RESULTS" : "IDLE";
  return <section className="opportunities-workspace__header">
    <div className="opportunities-workspace__agent"><BV01Renderer state={state} /><HeroAgentStatus state={state} /></div>
    <div className="opportunities-workspace__summary">
      <p className="opportunities-workspace__count">{hasResults ? `${resultCount} ${resultCount === 1 ? "oportunidad encontrada" : "oportunidades encontradas"}` : "Oportunidades"}</p>
      <h1>{hasResults ? "Resultados para tu búsqueda" : "Oportunidades para tu búsqueda"}</h1>
      <dl className="opportunities-workspace__intent">
        <div><dt>Objetivo</dt><dd>{intent.role}</dd></div>
        {intent.location ? <div><dt>Ubicación</dt><dd>{displayIntentLocation(intent.location)}</dd></div> : null}
        <div><dt>Modalidad</dt><dd>{modeLabel(intent.workMode)}</dd></div>
      </dl>
      <Link className="back-link" href={`/?${query}`}>← Cambiar búsqueda</Link>
    </div>
  </section>;
}

function OpportunityCard({ opportunity, intent, authenticated }: { opportunity: PublicOpportunity; intent: SearchIntent; authenticated: boolean }) {
  const offerUrl = opportunity.canonicalUrl ?? opportunity.sourceUrl;
  const preparationHref = preparationCtaDestination(intent, { title: opportunity.title, url: offerUrl }, authenticated);
  const salary = formatSalary(opportunity);
  return <article className="opportunity-card">
    <div className="opportunity-card__content">
      <p className="opportunity-company">{opportunity.companyName ?? "Empresa no informada"}</p>
      <h2>{opportunity.title}</h2>
      <ul className="opportunity-meta" aria-label="Detalles de la oportunidad">
        {opportunity.locationText ? <li title={opportunity.locationText}>{formatLocation(opportunity.locationText)}</li> : null}
        {opportunity.workMode && opportunity.workMode !== "UNKNOWN" ? <li>{modeLabel(opportunity.workMode)}</li> : null}
        {opportunity.publishedAt ? <li>{formatDate(opportunity.publishedAt)}</li> : null}
        {salary ? <li>{salary}</li> : null}
      </ul>
      {opportunity.description ? <p className="opportunity-summary">{opportunity.description}</p> : null}
      {opportunity.sourceName ? <p className="opportunity-source">Fuente: {opportunity.sourceName}</p> : null}
    </div>
    <div className="opportunity-card__actions">
      <Link className="button" href={preparationHref}>Preparar mi candidatura</Link>
      <a className="button secondary" href={offerUrl} target="_blank" rel="noreferrer">Ver oferta</a>
    </div>
  </article>;
}

function modeLabel(value: SearchIntent["workMode"] | PublicOpportunity["workMode"] | null) {
  return { ANY: "Cualquier modalidad", REMOTE: "Remoto", HYBRID: "Híbrido", ONSITE: "Presencial", UNKNOWN: "Modalidad no informada" }[value ?? "UNKNOWN"] ?? "Modalidad no informada";
}

function formatSalary(opportunity: Pick<PublicOpportunity, "salaryMin" | "salaryMax" | "salaryCurrency">) {
  const values = [opportunity.salaryMin, opportunity.salaryMax].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const numbers = values.map((value) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value));
  return `${numbers.join("–")}${opportunity.salaryCurrency ? ` ${opportunity.salaryCurrency}` : ""}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Fecha no informada" : new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function formatLocation(value: string) {
  const entries = value.split(";").map((entry) => entry.trim()).filter(Boolean);
  if (entries.length > 2 && entries.every((entry) => /\(remote\)/i.test(entry))) return `${entries.length} ubicaciones · Remoto`;
  const clean = value.replace(/\s*[|/]\s*/g, " · ").replace(/\s+/g, " ").trim();
  if (clean.length <= 90) return clean;
  const boundary = clean.lastIndexOf(" ", 90);
  return `${clean.slice(0, boundary > 35 ? boundary : 90)}…`;
}
