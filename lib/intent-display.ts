import type { IntentWorkMode } from "@/lib/intent-first";

const workModeLabels: Record<IntentWorkMode, string> = {
  ANY: "Sin preferencia",
  ONSITE: "Presencial",
  HYBRID: "Híbrido",
  REMOTE: "Remoto",
};

/** Presentation-only labels. They never alter the search intent or its query. */
export function displayIntentLocation(location: string) {
  return location.split(",", 1)[0]?.trim() ?? "";
}

export function displayIntentRole(role: string) {
  return role.trim().replace(/\S+/g, (word) => `${word[0]?.toLocaleUpperCase("es-ES")}${word.slice(1).toLocaleLowerCase("es-ES")}`);
}

export function displayIntentWorkMode(workMode: IntentWorkMode) {
  return workModeLabels[workMode];
}
