import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Feedback } from "@/components/feedback";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <section className="auth-card">
      <h1>Iniciar sesión</h1>
      <p>Accede a tus perfiles, búsquedas y CV privados.</p>
      <Feedback error={params.error} message={params.message} />
      <form action={login} className="stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button type="submit">Entrar</button>
      </form>
      <p className="switch">¿No tienes cuenta? <Link href="/register">Regístrate</Link></p>
    </section>
  );
}
