export type IntentWorkMode = "ANY" | "REMOTE" | "HYBRID" | "ONSITE";

export type SearchIntent = {
  role: string;
  location: string;
  workMode: IntentWorkMode;
};

const WORK_MODES = new Set<IntentWorkMode>(["ANY", "REMOTE", "HYBRID", "ONSITE"]);

export function searchIntent(input: { role?: unknown; location?: unknown; workMode?: unknown }): SearchIntent {
  const role = String(input.role ?? "").trim().slice(0, 120);
  if (!role) throw new Error("Escribe el trabajo que estás buscando.");
  const candidate = String(input.workMode ?? "ANY").trim() as IntentWorkMode;
  return {
    role,
    location: String(input.location ?? "").trim().slice(0, 120),
    workMode: WORK_MODES.has(candidate) ? candidate : "ANY",
  };
}

export function intentQuery(intent: SearchIntent) {
  const query = new URLSearchParams({ intent_role: intent.role, intent_mode: intent.workMode });
  if (intent.location) query.set("intent_location", intent.location);
  return query.toString();
}

export function intentFromQuery(input: Record<string, string | undefined>) {
  const role = input.intent_role?.trim();
  if (!role) return null;
  return searchIntent({ role, location: input.intent_location, workMode: input.intent_mode });
}

export function opportunitiesDestination(intent: SearchIntent) {
  return `/oportunidades?${intentQuery(intent)}`;
}

export function resumeContinuationDestination(intent: SearchIntent, offer?: { title: string; url: string }) {
  const query = new URLSearchParams(intentQuery(intent));
  if (offer) {
    query.set("offer_title", offer.title.slice(0, 160));
    query.set("offer_url", offer.url);
    query.set("action", "prepare");
    query.set("return_to", opportunitiesDestination(intent));
  }
  return `/resumes?${query}`;
}
