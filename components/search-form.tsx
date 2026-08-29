import Link from "next/link";
import type { CandidateProfile, JobPreferences, SearchProfile } from "@/lib/types";

const join = (items?: string[]) => items?.join(", ") ?? "";

export function SearchForm({
  action,
  profiles,
  search,
  preferences,
}: {
  action: (data: FormData) => void | Promise<void>;
  profiles: CandidateProfile[];
  search?: SearchProfile;
  preferences?: JobPreferences;
}) {
  const frequencyValue = search?.frequency_type === "INTERVAL"
    ? String(search.frequency_value.minutes ?? "60")
    : String(search?.frequency_value.time ?? "09:00");
  const locations = preferences?.locations.map((item) => item.label || [item.city, item.country].filter(Boolean).join(", ")).filter(Boolean).join("; ") ?? "";
  const languages = preferences?.languages.map((item) => item.code).filter(Boolean).join(", ") ?? "";
  return (
    <form action={action} className="card stack">
      {search && <input type="hidden" name="id" value={search.id} />}
      <div className="form-grid">
        <div className="field"><label htmlFor="name">Nombre</label><input id="name" name="name" defaultValue={search?.name} required maxLength={120} /></div>
        <div className="field"><label htmlFor="candidate_profile_id">Perfil profesional</label><select id="candidate_profile_id" name="candidate_profile_id" defaultValue={search?.candidate_profile_id} required>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>
        <div className="field"><label htmlFor="frequency_type">Frecuencia</label><select id="frequency_type" name="frequency_type" defaultValue={search?.frequency_type ?? "DAILY"}><option value="INTERVAL">Intervalo</option><option value="DAILY">Diaria</option><option value="WEEKDAYS">Días laborables</option></select></div>
        <div className="field"><label htmlFor="frequency_value">Valor de frecuencia</label><input id="frequency_value" name="frequency_value" defaultValue={frequencyValue} required /><span className="hint">Minutos para intervalo; hora HH:MM para diaria/laborables.</span></div>
        <div className="field"><label htmlFor="timezone">Zona horaria</label><input id="timezone" name="timezone" defaultValue={search?.timezone ?? "Europe/Madrid"} required /></div>
        <div className="field"><label htmlFor="daily_application_limit">Límite diario futuro</label><input id="daily_application_limit" name="daily_application_limit" type="number" min="0" defaultValue={search?.daily_application_limit ?? 0} required /><span className="hint">La aplicación continúa siendo manual.</span></div>
        <div className="field"><label htmlFor="notification_min_score">Score para notificar</label><input id="notification_min_score" name="notification_min_score" type="number" min="0" max="100" defaultValue={search?.notification_min_score ?? 70} required /></div>
        <div className="field"><label htmlFor="semi_auto_min_score">Umbral reservado semi-auto</label><input id="semi_auto_min_score" name="semi_auto_min_score" type="number" min="0" max="100" defaultValue={search?.semi_auto_min_score ?? 80} required /></div>
        <div className="field"><label htmlFor="auto_apply_min_score">Umbral reservado automático</label><input id="auto_apply_min_score" name="auto_apply_min_score" type="number" min="0" max="100" defaultValue={search?.auto_apply_min_score ?? 90} required /><span className="hint">Configuración futura; no activa auto-apply.</span></div>
      </div>
      <h2 className="section-title">Preferencias</h2>
      <div className="form-grid">
        <TextList name="keywords" label="Keywords" value={join(preferences?.keywords)} />
        <TextList name="target_titles" label="Puestos objetivo" value={join(preferences?.target_titles)} />
        <TextList name="excluded_titles" label="Puestos excluidos" value={join(preferences?.excluded_titles)} />
        <TextList name="locations" label="Ubicaciones" value={locations} />
        <fieldset className="field full"><legend>Modalidad</legend><div className="checks">{["REMOTE", "HYBRID", "ONSITE"].map((mode) => <label key={mode}><input type="checkbox" name="work_modes" value={mode} defaultChecked={preferences?.work_modes.includes(mode)} />{mode}</label>)}</div></fieldset>
        <div className="field"><label htmlFor="minimum_salary">Salario mínimo</label><input id="minimum_salary" name="minimum_salary" type="number" min="0" step="0.01" defaultValue={preferences?.minimum_salary ?? ""} /></div>
        <div className="field"><label htmlFor="currency">Moneda</label><input id="currency" name="currency" maxLength={3} defaultValue={preferences?.currency ?? "EUR"} /></div>
        <TextList name="accepted_seniorities" label="Seniorities aceptados" value={join(preferences?.accepted_seniorities)} />
        <div className="field"><label htmlFor="minimum_experience_years">Experiencia mínima</label><input id="minimum_experience_years" name="minimum_experience_years" type="number" min="0" defaultValue={preferences?.minimum_experience_years ?? ""} /></div>
        <div className="field"><label htmlFor="maximum_experience_years">Experiencia máxima</label><input id="maximum_experience_years" name="maximum_experience_years" type="number" min="0" defaultValue={preferences?.maximum_experience_years ?? ""} /></div>
        <TextList name="required_technologies" label="Tecnologías requeridas" value={join(preferences?.required_technologies)} />
        <TextList name="excluded_technologies" label="Tecnologías excluidas" value={join(preferences?.excluded_technologies)} />
        <TextList name="languages" label="Idiomas (códigos)" value={languages} />
        <TextList name="contract_types" label="Tipos de contrato" value={join(preferences?.contract_types)} />
      </div>
      <div className="actions"><button type="submit">Guardar búsqueda</button><Link className="button secondary" href="/searches">Cancelar</Link></div>
    </form>
  );
}

function TextList({ name, label, value }: { name: string; label: string; value: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><textarea id={name} name={name} defaultValue={value} /><span className="hint">Separa valores con comas o líneas.</span></div>;
}
