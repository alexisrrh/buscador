import type { OfferPreparationContext } from "@/lib/intent-first";

export function OfferPreparationContextCard({ context }: { context: OfferPreparationContext | null }) {
  if (!context) return null;
  return <section className="card offer-preparation-context" aria-label="Contexto de candidatura">
    <p className="eyebrow">Preparando candidatura para</p>
    <h1>{context.offerTitle}</h1>
    <p>Tu CV será el siguiente paso. Seguimos trabajando sobre esta oportunidad.</p>
    <a href={context.offerUrl} target="_blank" rel="noreferrer">Ver oferta original</a>
  </section>;
}
