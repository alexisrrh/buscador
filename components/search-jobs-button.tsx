"use client";

import { useFormStatus } from "react-dom";

export function SearchJobsButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Buscando ofertas…" : "Buscar ofertas"}
    </button>
  );
}
