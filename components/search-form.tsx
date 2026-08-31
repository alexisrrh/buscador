import Link from "next/link";
import type { CandidateProfile, JobPreferences, SearchProfile } from "@/lib/types";

const join = (items?: string[]) => items?.join(", ") ?? "";

function schedulePreset(search?: SearchProfile) {
  if (!search) return "DAILY";
  if (search.frequency_type === "DAILY") return "DAILY";
  if (search.frequency_type === "WEEKDAYS") return "WEEKDAYS";
  const minutes = Number(search.frequency_value.minutes);
  if (minutes === 60) return "HOURLY";
  if (minutes === 180) return "EVERY_3_HOURS";
  if (minutes === 360) return "EVERY_6_HOURS";
  return "DAILY";
}

export function SearchForm({ action, profiles, search, preferences }: {
  action: (data: FormData) => void | Promise<void>;
  profiles: CandidateProfile[];
  search?: SearchProfile;
  preferences?: JobPreferences;
}) {
  const locations = preferences?.locations ?? [];
  const allSpain = locations.some((item) => item.country === "ES" && item.label === "Toda España");
  const locationMode = allSpain ? "ALL_SPAIN" : locations.length > 1 ? "MULTIPLE_CITIES" : "ONE_CITY";
  const locationNames = locations
    .filter((item) => item.label !== "Toda España")
    .map((item) => item.label || [item.city, item.country].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(", ");
  const otherTitles = preferences?.target_titles.filter((title) => title !== search?.name) ?? [];
  const languageLabels: Record<string, string> = {
    es: "Español", en: "Inglés", fr: "Francés", de: "Alemán", pt: "Portugués", it: "Italiano",
  };
  const languages = preferences?.languages
    .map((item) => item.code ? (languageLabels[item.code] ?? item.code) : undefined)
    .filter(Boolean)
    .join(", ") ?? "";

  return (
    <form id="search-editor" action={action} className="questionnaire stack">
      {search && <input type="hidden" name="id" value={search.id} />}
      <input type="hidden" name="semi_auto_min_score" value={search?.semi_auto_min_score ?? 80} />
      <input type="hidden" name="auto_apply_min_score" value={search?.auto_apply_min_score ?? 90} />
      <input type="hidden" name="daily_application_limit" value={search?.daily_application_limit ?? 0} />

      <fieldset className="card question-section">
        <legend><span>1</span> El trabajo que quieres encontrar</legend>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="name">¿Qué trabajo estás buscando?</label>
            <input id="name" name="name" defaultValue={search?.name} required maxLength={120} placeholder="Ej.: Frontend Developer" />
            <span className="hint">Escribe el nombre que mejor describe tu trabajo ideal.</span>
          </div>
          <div className="field full">
            <label htmlFor="target_titles">¿Qué otros nombres puede tener ese puesto?</label>
            <textarea id="target_titles" name="target_titles" defaultValue={join(otherTitles)} placeholder="Ej.: React Developer, Desarrollador Frontend, Programador web" />
            <span className="hint">Añade otros nombres que las empresas puedan utilizar. Sepáralos con comas.</span>
          </div>
          <div className="field">
            <label htmlFor="excluded_titles">¿Hay puestos que no quieres que aparezcan?</label>
            <textarea id="excluded_titles" name="excluded_titles" defaultValue={join(preferences?.excluded_titles)} placeholder="Ej.: Tech Lead, Director, Prácticas" />
          </div>
          <div className="field">
            <label htmlFor="keywords">¿Qué palabras ayudarían a encontrar buenas ofertas?</label>
            <textarea id="keywords" name="keywords" defaultValue={join(preferences?.keywords)} placeholder="Ej.: React, producto digital, comercio electrónico" />
            <span className="hint">Es opcional. Usa habilidades o temas relacionados con el puesto.</span>
          </div>
          <div className="field full">
            <label htmlFor="candidate_profile_id">¿Qué perfil profesional quieres usar?</label>
            <select id="candidate_profile_id" name="candidate_profile_id" defaultValue={search?.candidate_profile_id} required>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <span className="hint">Usaremos el CV y la experiencia asociados a este perfil.</span>
          </div>
        </div>
      </fieldset>

      <fieldset className="card question-section">
        <legend><span>2</span> Dónde y cómo quieres trabajar</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="location_mode">¿Dónde quieres trabajar?</label>
            <select id="location_mode" name="location_mode" defaultValue={locationMode}>
              <option value="ALL_SPAIN">En toda España</option>
              <option value="ONE_CITY">En una ciudad concreta</option>
              <option value="MULTIPLE_CITIES">En varias ciudades</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="location_names">¿Qué ciudad o ciudades prefieres?</label>
            <input id="location_names" name="location_names" defaultValue={locationNames} placeholder="Ej.: A Coruña, Madrid, Valencia" />
            <span className="hint">Si elegiste toda España, puedes dejarlo vacío.</span>
          </div>
          <fieldset className="field full nested-fieldset">
            <legend>¿Cómo prefieres trabajar?</legend>
            <div className="checks">
              <Choice name="work_modes" value="REMOTE" label="Remoto" checked={preferences?.work_modes.includes("REMOTE")} />
              <Choice name="work_modes" value="HYBRID" label="Híbrido" checked={preferences?.work_modes.includes("HYBRID")} />
              <Choice name="work_modes" value="ONSITE" label="Presencial" checked={preferences?.work_modes.includes("ONSITE")} />
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset className="card question-section">
        <legend><span>3</span> Experiencia y salario</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="experience_years">¿Cuántos años de experiencia tienes aproximadamente?</label>
            <input id="experience_years" name="experience_years" type="number" min="0" max="60" defaultValue={preferences?.maximum_experience_years ?? ""} placeholder="Ej.: 2" />
            <span className="hint">Evitaremos ofertas que pidan más experiencia de la que indiques.</span>
          </div>
          <fieldset className="field nested-fieldset">
            <legend>¿Qué niveles de puesto te interesan?</legend>
            <div className="checks">
              <Choice name="accepted_seniorities" value="ENTRY" label="Estoy empezando" checked={preferences?.accepted_seniorities.includes("ENTRY")} />
              <Choice name="accepted_seniorities" value="JUNIOR" label="Junior" checked={preferences?.accepted_seniorities.includes("JUNIOR")} />
              <Choice name="accepted_seniorities" value="MID" label="Intermedio" checked={preferences?.accepted_seniorities.includes("MID")} />
              <Choice name="accepted_seniorities" value="SENIOR" label="Senior" checked={preferences?.accepted_seniorities.includes("SENIOR")} />
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="minimum_salary">¿Cuál es el salario mínimo anual que aceptarías?</label>
            <input id="minimum_salary" name="minimum_salary" type="number" min="0" step="500" defaultValue={preferences?.minimum_salary ?? ""} placeholder="Ej.: 24000" />
            <span className="hint">Déjalo vacío si el salario no es importante para esta búsqueda.</span>
          </div>
          <div className="field">
            <label htmlFor="currency">¿En qué moneda?</label>
            <select id="currency" name="currency" defaultValue={preferences?.currency ?? "EUR"}><option value="EUR">Euros (EUR)</option><option value="USD">Dólares (USD)</option><option value="GBP">Libras (GBP)</option></select>
          </div>
        </div>
      </fieldset>

      <fieldset className="card question-section">
        <legend><span>4</span> Conocimientos y condiciones</legend>
        <div className="form-grid">
          <QuestionList name="required_technologies" label="¿Qué tecnologías o conocimientos quieres que tengan las ofertas?" value={join(preferences?.required_technologies)} placeholder="Ej.: React, JavaScript, TypeScript" />
          <QuestionList name="excluded_technologies" label="¿Hay tecnologías con las que no quieres trabajar?" value={join(preferences?.excluded_technologies)} placeholder="Ej.: Cobol, Salesforce" />
          <QuestionList name="languages" label="¿En qué idiomas puedes trabajar?" value={languages} placeholder="Ej.: Español, Inglés" />
          <fieldset className="field nested-fieldset">
            <legend>¿Qué tipo de contrato buscas?</legend>
            <div className="checks">
              <Choice name="contract_types" value="FULL_TIME" label="Jornada completa" checked={preferences?.contract_types.includes("FULL_TIME")} />
              <Choice name="contract_types" value="PART_TIME" label="Media jornada" checked={preferences?.contract_types.includes("PART_TIME")} />
              <Choice name="contract_types" value="PERMANENT" label="Indefinido" checked={preferences?.contract_types.includes("PERMANENT")} />
              <Choice name="contract_types" value="TEMPORARY" label="Temporal" checked={preferences?.contract_types.includes("TEMPORARY")} />
              <Choice name="contract_types" value="FREELANCE" label="Autónomo / freelance" checked={preferences?.contract_types.includes("FREELANCE")} />
              <Choice name="contract_types" value="INTERNSHIP" label="Prácticas" checked={preferences?.contract_types.includes("INTERNSHIP")} />
            </div>
          </fieldset>
        </div>
      </fieldset>

      <fieldset className="card question-section">
        <legend><span>5</span> Cuándo buscar nuevas ofertas</legend>
        <div className="field">
          <label htmlFor="schedule_preset">¿Cada cuánto quieres que busquemos nuevas ofertas?</label>
          <select id="schedule_preset" name="schedule_preset" defaultValue={schedulePreset(search)}>
            <option value="HOURLY">Cada hora</option>
            <option value="EVERY_3_HOURS">Cada 3 horas</option>
            <option value="EVERY_6_HOURS">Cada 6 horas</option>
            <option value="DAILY">Una vez al día</option>
            <option value="WEEKDAYS">Solo días laborables</option>
          </select>
        </div>
      </fieldset>

      <details className="card advanced">
        <summary>Configuración avanzada</summary>
        <p className="muted">Estos valores tienen opciones seguras por defecto. Puedes dejarlos como están.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="notification_min_score">¿A partir de qué compatibilidad quieres recibir avisos?</label>
            <input id="notification_min_score" name="notification_min_score" type="number" min="0" max="100" defaultValue={search?.notification_min_score ?? 70} required />
            <span className="hint">70% es un buen punto de partida.</span>
          </div>
          <div className="field">
            <label htmlFor="timezone">¿En qué zona horaria estás?</label>
            <input id="timezone" name="timezone" defaultValue={search?.timezone ?? "Europe/Madrid"} required />
            <span className="hint">Para España normalmente es Europe/Madrid.</span>
          </div>
        </div>
        <p className="hint">Las candidaturas continúan siendo completamente manuales. No hay postulación automática activa.</p>
      </details>

      <div className="actions form-footer"><button type="submit">Guardar y revisar mi búsqueda</button><Link className="button secondary" href="/searches">Cancelar</Link></div>
    </form>
  );
}

function Choice({ name, value, label, checked }: { name: string; value: string; label: string; checked?: boolean }) {
  return <label><input type="checkbox" name={name} value={value} defaultChecked={checked} />{label}</label>;
}

function QuestionList({ name, label, value, placeholder }: { name: string; label: string; value: string; placeholder: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><textarea id={name} name={name} defaultValue={value} placeholder={placeholder} /><span className="hint">Separa las respuestas con comas.</span></div>;
}
