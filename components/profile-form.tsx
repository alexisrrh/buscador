import Link from "next/link";
import type { CandidateProfile } from "@/lib/types";

export function ProfileForm({ action, profile }: { action: (data: FormData) => void | Promise<void>; profile?: CandidateProfile }) {
  return (
    <form action={action} className="card stack">
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <div className="form-grid">
        <div className="field"><label htmlFor="name">Nombre del perfil</label><input id="name" name="name" defaultValue={profile?.name} required maxLength={120} placeholder="Frontend Developer" /></div>
        <div className="field"><label htmlFor="seniority">Seniority</label><input id="seniority" name="seniority" defaultValue={profile?.seniority ?? ""} maxLength={50} placeholder="Junior, Mid, Senior…" /></div>
        <div className="field"><label htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={profile?.headline ?? ""} maxLength={160} placeholder="Desarrollador frontend orientado a producto" /></div>
        <div className="field"><label htmlFor="job_family">Familia profesional</label><input id="job_family" name="job_family" defaultValue={profile?.job_family ?? ""} maxLength={100} placeholder="Software Engineering" /></div>
        <div className="field"><label htmlFor="profile-status">Estado</label><input id="profile-status" value={profile?.deleted_at ? "ARCHIVED" : "ACTIVE"} disabled /></div>
      </div>
      <div className="actions"><button type="submit">Guardar perfil</button><Link className="button secondary" href="/profiles">Cancelar</Link></div>
    </form>
  );
}
