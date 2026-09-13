"use client";

import { useFormStatus } from "react-dom";

export function RegisterSubmitButton() {
  const { pending } = useFormStatus();

  return <button className="register-submit-button" type="submit" disabled={pending} aria-disabled={pending} aria-busy={pending}>
    <span aria-live="polite">{pending ? "Creando tu cuenta…" : "Crear cuenta"}</span>
    <span className="register-submit-button__sizer" aria-hidden="true">Creando tu cuenta…</span>
  </button>;
}
