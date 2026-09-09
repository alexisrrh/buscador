import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Feedback } from "@/components/feedback";
import { intentFromQuery, intentQuery } from "@/lib/intent-first";

type LoginParams = { error?: string; message?: string; intent_role?: string; intent_location?: string; intent_mode?: string; return_to?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginParams> }) {
  const params = await searchParams;
  const intent = intentFromQuery(params);
  const query = new URLSearchParams(intent ? intentQuery(intent) : "");
  if (params.return_to?.startsWith("/")) query.set("return_to", params.return_to);
  const registerHref = `/register${query.size ? `?${query}` : ""}`;
  return <section className="auth-card">
    <h1>Iniciar sesión</h1><p>Continúa con tu oportunidad cuando estés dentro.</p>
    <Feedback error={params.error} message={params.message} />
    <form action={login} className="stack">
      {intent ? <><input type="hidden" name="intent_role" value={intent.role} /><input type="hidden" name="intent_location" value={intent.location} /><input type="hidden" name="intent_mode" value={intent.workMode} /></> : null}
      {params.return_to?.startsWith("/") ? <input type="hidden" name="return_to" value={params.return_to} /> : null}
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <button type="submit">Entrar</button>
    </form>
    <p className="switch">¿No tienes cuenta? <Link href={registerHref}>Regístrate</Link></p>
  </section>;
}
