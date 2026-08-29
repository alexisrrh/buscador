import Link from "next/link";
import type { CandidateProfile } from "@/lib/types";

export function ProfileForm({ action, profile }: { action: (data: FormData) => void | Promise<void>; profile?: CandidateProfile }) {
  return (
    <form action={action} className="card stack">
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <div className="form-grid">
        <div className="field full"><label htmlFor="name">¿Cómo quieres llamar a este perfil?</label><input id="name" name="name" defaultValue={profile?.name} required maxLength={120} placeholder="Ej.: Desarrollo Frontend" /><span className="hint">Crea uno diferente para cada tipo de trabajo que quieras buscar.</span></div>
        <div className="field"><label htmlFor="headline">¿Cómo quieres presentarte profesionalmente?</label><input id="headline" name="headline" defaultValue={profile?.headline ?? ""} maxLength={160} placeholder="Ej.: Desarrollador Frontend especializado en React" /><span className="hint">Una frase corta que resuma lo que haces mejor.</span></div>
        <div className="field"><label htmlFor="job_family">¿En qué área quieres trabajar?</label><input id="job_family" name="job_family" defaultValue={profile?.job_family ?? ""} maxLength={100} placeholder="Ej.: Desarrollo de software, Soporte IT…" /></div>
        <div className="field"><label htmlFor="seniority">¿Qué nivel de experiencia tienes?</label><select id="seniority" name="seniority" defaultValue={profile?.seniority ?? ""}><option value="">Selecciona una opción</option><option value="ENTRY">Estoy empezando</option><option value="JUNIOR">Junior</option><option value="MID">Intermedio</option><option value="SENIOR">Senior</option></select></div>
        <div className="field"><label htmlFor="profile-status">Estado del perfil</label><input id="profile-status" value={profile?.deleted_at ? "Archivado" : "Activo"} disabled /></div>
      </div>
      <div className="actions"><button type="submit">Guardar mi perfil</button><Link className="button secondary" href="/profiles">Cancelar</Link></div>
    </form>
  );
}
