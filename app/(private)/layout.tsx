import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/supabase/server";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">Job Search</Link>
        <nav className="nav" aria-label="Navegación principal">
          <Link href="/dashboard">Resumen</Link>
          <Link href="/profiles">Perfiles</Link>
          <Link href="/searches">Búsquedas</Link>
          <Link href="/resumes">CV</Link>
          <form action={logout}><button className="secondary small" type="submit">Salir</button></form>
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
