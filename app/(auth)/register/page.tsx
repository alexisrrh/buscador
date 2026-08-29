import Link from "next/link";
import { register } from "@/app/actions/auth";
import { Feedback } from "@/components/feedback";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <section className="auth-card">
      <h1>Crear cuenta</h1>
      <p>Tu información quedará aislada mediante Supabase Auth y RLS.</p>
      <Feedback error={params.error} />
      <form action={register} className="stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <span className="hint">Mínimo 8 caracteres.</span>
        </div>
        <button type="submit">Crear cuenta</button>
      </form>
      <p className="switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>
    </section>
  );
}
