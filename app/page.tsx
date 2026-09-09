import { Feedback } from "@/components/feedback";
import { IntentEntry } from "@/components/intent-entry";
import { intentFromQuery } from "@/lib/intent-first";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; intent_role?: string; intent_location?: string; intent_mode?: string }> }) {
  const params = await searchParams;
  return <main className="intent-page"><section className="intent-hero"><div className="intent-brand"><span className="intent-signal" aria-hidden="true" />BuscaVacante</div><p className="eyebrow">Tu búsqueda, en marcha</p><h1>Encuentra mejores oportunidades sin perder horas buscando.</h1><p className="intent-lead">Dinos qué trabajo buscas. Nosotros nos encargamos del resto.</p><Feedback error={params.error} /><IntentEntry intent={intentFromQuery(params)} /></section><aside className="intent-aside" aria-hidden="true"><div className="intent-grid" /><div className="intent-orb" /><p>Tu próxima oportunidad empieza con una frase.</p></aside></main>;
}
