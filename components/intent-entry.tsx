import { beginSearchIntent } from "@/app/actions/intent";
import type { SearchIntent } from "@/lib/intent-first";

const modes = [
  ["ANY", "Cualquiera"], ["REMOTE", "Remoto"], ["HYBRID", "Híbrido"], ["ONSITE", "Presencial"],
] as const;

export function IntentEntry({ intent }: { intent?: SearchIntent | null }) {
  return <form action={beginSearchIntent} className="intent-entry" aria-label="Empezar una búsqueda">
    <div className="field"><label htmlFor="intent-role">¿Qué trabajo estás buscando?</label><input id="intent-role" name="role" defaultValue={intent?.role} required maxLength={120} autoFocus placeholder="Por ejemplo, Frontend Developer" /><span className="hint">Puedes escribir el puesto con tus propias palabras.</span></div>
    <div className="field"><label htmlFor="intent-location">Ubicación <span className="intent-optional">opcional</span></label><input id="intent-location" name="location" defaultValue={intent?.location} maxLength={120} placeholder="Por ejemplo, A Coruña" /></div>
    <fieldset className="intent-modes"><legend>Modalidad</legend><div>{modes.map(([value, label]) => <label key={value}><input type="radio" name="work_mode" value={value} defaultChecked={(intent?.workMode ?? "ANY") === value} /><span>{label}</span></label>)}</div></fieldset>
    <button className="intent-cta" type="submit">Encontrar oportunidades <span aria-hidden="true">→</span></button>
    <p className="intent-note">BuscaVacante explora oportunidades reales por ti.</p>
  </form>;
}
