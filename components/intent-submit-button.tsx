"use client";

import { useFormStatus } from "react-dom";

export function IntentSubmitButton({ pending: externallyPending = false }: { pending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || externallyPending;
  return <button className="intent-cta" type="submit" disabled={pending} aria-disabled={pending} aria-busy={pending}>
    <span aria-live="polite">{pending ? "Preparando búsqueda..." : "Empezar búsqueda"}</span>
    <span className="intent-cta__activity" aria-hidden="true" />
  </button>;
}
