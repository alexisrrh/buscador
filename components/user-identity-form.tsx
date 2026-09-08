import type { StructuredUserIdentity } from "@/lib/user-identity";

export function UserIdentityForm({ action, profileId, identity }: {
  action: (data: FormData) => void | Promise<void>;
  profileId: string;
  identity: StructuredUserIdentity | null;
}) {
  return <form action={action} className="card stack">
    <input type="hidden" name="profile_id" value={profileId} />
    <div>
      <h2>Tu identidad para el CV</h2>
      <p className="hint">Se usará como nombre en los CV adaptados. No cambia el nombre de este perfil profesional.</p>
    </div>
    <div className="form-grid">
      <div className="field"><label htmlFor="first_name">Nombre</label><input id="first_name" name="first_name" defaultValue={identity?.first_name ?? ""} required maxLength={80} autoComplete="given-name" /></div>
      <div className="field"><label htmlFor="last_name">Apellido(s)</label><input id="last_name" name="last_name" defaultValue={identity?.last_name ?? ""} required maxLength={80} autoComplete="family-name" /></div>
    </div>
    <div className="actions"><button type="submit">Guardar identidad</button></div>
  </form>;
}
