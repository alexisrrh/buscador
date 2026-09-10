export type IntentWorkMode = "ANY" | "REMOTE" | "HYBRID" | "ONSITE";

export type SearchIntent = {
  role: string;
  location: string;
  workMode: IntentWorkMode;
};

export type OfferPreparationContext = {
  intent: SearchIntent;
  offerTitle: string;
  offerUrl: string;
  action: "prepare";
  returnTo: string;
  resumeId: string | null;
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

export function safeReturnTarget(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.startsWith("/resumes?") || value.startsWith("/oportunidades?")
    ? value
    : fallback;
}

function safeOfferUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeResumeId(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function offerPreparationContextFromQuery(input: Record<string, string | undefined>): OfferPreparationContext | null {
  const intent = intentFromQuery(input);
  const offerTitle = input.offer_title?.trim() ?? "";
  const offerUrl = safeOfferUrl(input.offer_url);
  if (!intent || input.action !== "prepare" || !offerTitle || offerTitle.length > 160 || !offerUrl) return null;
  return {
    intent,
    offerTitle,
    offerUrl,
    action: "prepare",
    returnTo: safeReturnTarget(input.return_to, opportunitiesDestination(intent)),
    resumeId: safeResumeId(input.resume_id),
  };
}

export function offerPreparationDestination(context: OfferPreparationContext) {
  const query = new URLSearchParams(intentQuery(context.intent));
  query.set("offer_title", context.offerTitle);
  query.set("offer_url", context.offerUrl);
  query.set("action", context.action);
  query.set("return_to", context.returnTo);
  if (context.resumeId) query.set("resume_id", context.resumeId);
  return `/resumes?${query}`;
}

export function preparationCtaDestination(
  intent: SearchIntent,
  offer: { title: string; url: string },
  authenticated: boolean,
) {
  const destination = resumeContinuationDestination(intent, offer);
  return authenticated
    ? destination
    : `/register?${intentQuery(intent)}&return_to=${encodeURIComponent(destination)}`;
}
