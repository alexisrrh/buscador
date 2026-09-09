import Link from "next/link";
import { register } from "@/app/actions/auth";
import { Feedback } from "@/components/feedback";
import { intentFromQuery, intentQuery } from "@/lib/intent-first";

type RegisterParams = { error?: string; intent_role?: string; intent_location?: string; intent_mode?: string; return_to?: string };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<RegisterParams> }) {
  const params = await searchParams;
  const intent = intentFromQuery(params);
  const query = new URLSearchParams(intent ? intentQuery(intent) : "");
  if (params.return_to?.startsWith("/")) query.set("return_to", params.return_to);
  const loginHref = `/login${query.size ? `?${query}` : ""}`;
  return <section className="auth-card">
    <h1>Crea tu cuenta</h1><p>Guarda tu progreso y prepara tu candidatura cuando quieras.</p>
    <Feedback error={params.error} />
    <form action={register} className="stack">
      {intent ? <><input type="hidden" name="intent_role" value={intent.role} /><input type="hidden" name="intent_location" value={intent.location} /><input type="hidden" name="intent_mode" value={intent.workMode} /></> : null}
      {params.return_to?.startsWith("/") ? <input type="hidden" name="return_to" value={params.return_to} /> : null}
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /><span className="hint">Mínimo 8 caracteres.</span></div>
      <button type="submit">Crear cuenta</button>
    </form>
    <p className="switch">¿Ya tienes cuenta? <Link href={loginHref}>Inicia sesión</Link></p>
  </section>;
}
