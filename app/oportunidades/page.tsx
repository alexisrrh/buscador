import Link from "next/link";
import { IntentEntry } from "@/components/intent-entry";
import { intentFromQuery, intentQuery, resumeContinuationDestination, type SearchIntent } from "@/lib/intent-first";
import { searchPublicOpportunities, type PublicOpportunity } from "@/lib/job-sources/public-opportunities.server";

type OpportunitiesParams = {
  intent_role?: string;
  intent_location?: string;
  intent_mode?: string;
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<OpportunitiesParams> }) {
  const params = await searchParams;
  const intent = intentFromQuery(params);
  if (!intent) return <main className="opportunities-page"><section className="opportunities-header"><p className="eyebrow">Oportunidades</p><h1>Cuéntanos qué quieres encontrar.</h1><IntentEntry /></section></main>;

  const result = await searchPublicOpportunities(intent);
  const query = intentQuery(intent);
  const partialFailure = result.sourcesFailed > 0 && result.sourcesSucceeded > 0;
  const allFailed = result.registryEmpty || (result.sourcesAttempted > 0 && result.sourcesSucceeded === 0);

  return <main className="opportunities-page">
    <section className="opportunities-header">
      <Link className="back-link" href={`/?${query}`}>← Cambiar búsqueda</Link>
      <p className="eyebrow">Oportunidades públicas</p>
      <h1>Oportunidades para {intent.role}</h1>
      <p>{intent.location || "Cualquier ubicación"} · {modeLabel(intent.workMode)}</p>
    </section>

    {partialFailure ? <p className="opportunities-notice" role="status">Alguna fuente no respondió. Te mostramos las oportunidades disponibles.</p> : null}
    {allFailed ? <section className="opportunities-state" role="alert"><h2>No pudimos consultar las fuentes ahora mismo.</h2><p>Prueba de nuevo en unos minutos. No hemos creado ningún perfil ni guardado datos personales.</p><Link className="button" href={`/?${query}`}>Volver a intentar</Link></section> : null}
    {!allFailed && result.opportunities.length === 0 ? <section className="opportunities-state"><h2>No encontramos oportunidades suficientemente cercanas a tu búsqueda.</h2><p>Prueba con otro puesto, una ubicación más amplia o modalidad Cualquiera.</p><Link className="button secondary" href={`/?${query}`}>Ajustar búsqueda</Link></section> : null}
    {!allFailed && result.opportunities.length > 0 ? <section className="opportunities-list" aria-label="Oportunidades encontradas">
      {result.opportunities.map((opportunity) => <OpportunityCard key={`${opportunity.sourceUrl}-${opportunity.title}`} opportunity={opportunity} intent={intent} />)}
    </section> : null}
  </main>;
}

function OpportunityCard({ opportunity, intent }: { opportunity: PublicOpportunity; intent: SearchIntent }) {
  const offerUrl = opportunity.canonicalUrl ?? opportunity.sourceUrl;
  const continuation = resumeContinuationDestination(intent, { title: opportunity.title, url: offerUrl });
  const authHref = `/register?${intentQuery(intent)}&return_to=${encodeURIComponent(continuation)}`;
  return <article className="opportunity-card">
    <div className="opportunity-card__content">
      <p className="opportunity-company">{opportunity.companyName ?? "Empresa no informada"}</p>
      <h2>{opportunity.title}</h2>
      <p className="opportunity-meta"><span>{compactLocation(opportunity.locationText)}</span> · <span>{modeLabel(opportunity.workMode)}</span><span className="opportunity-source"> · {opportunity.sourceName}</span>{opportunity.publishedAt ? ` · ${formatDate(opportunity.publishedAt)}` : ""}</p>
      {opportunity.description ? <p className="opportunity-summary">{opportunity.description}</p> : null}
    </div>
    <div className="opportunity-card__actions">
      <a className="button secondary" href={offerUrl} target="_blank" rel="noreferrer">Ver oferta</a>
      <Link className="button" href={authHref}>Preparar mi candidatura</Link>
    </div>
  </article>;
}

function modeLabel(value: SearchIntent["workMode"] | PublicOpportunity["workMode"]) {
  return { ANY: "Cualquier modalidad", REMOTE: "Remoto", HYBRID: "Híbrido", ONSITE: "Presencial", UNKNOWN: "Modalidad no informada" }[value] ?? "Modalidad no informada";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Fecha no informada" : new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function compactLocation(value: string | null) {
  const clean = value?.replace(/\s*[|/]\s*/g, " · ").replace(/\s+/g, " ").trim();
  if (!clean) return "Ubicación no informada";
  if (clean.length <= 90) return clean;
  const boundary = clean.lastIndexOf(" ", 90);
  return `${clean.slice(0, boundary > 35 ? boundary : 90)}…`;
}
