"use server";

import { redirect } from "next/navigation";
import { opportunitiesDestination, searchIntent } from "@/lib/intent-first";
import { searchPublicOpportunitiesForIntent } from "@/lib/job-sources/public-opportunities.server";

export type PreparedSearchIntent =
  | { ok: true; destination: string; resultsReady?: true }
  | { ok: false; error: string; errorDestination: string };

export async function prepareSearchIntent(formData: FormData): Promise<PreparedSearchIntent> {
  try {
    const intent = searchIntent({
      role: formData.get("role"),
      location: formData.get("location"),
      workMode: formData.get("work_mode"),
    });
    return { ok: true, destination: opportunitiesDestination(intent) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revisa tu búsqueda.";
    const role = String(formData.get("role") ?? "").trim().slice(0, 120);
    const location = String(formData.get("location") ?? "").trim().slice(0, 120);
    const workMode = searchIntent({ role: "context", workMode: formData.get("work_mode") }).workMode;
    const query = new URLSearchParams({ error: message, intent_mode: workMode });
    if (role) query.set("intent_role", role);
    if (location) query.set("intent_location", location);
    return { ok: false, error: message, errorDestination: `/?${query}` };
  }
}

export async function beginSearchIntent(formData: FormData) {
  const result = await prepareSearchIntent(formData);
  redirect(result.ok ? result.destination : result.errorDestination);
}

/** Executes the existing server search before the client changes route. */
export async function startPublicSearchIntent(formData: FormData): Promise<PreparedSearchIntent> {
  const result = await prepareSearchIntent(formData);
  if (!result.ok) return result;
  try {
    const intent = searchIntent({
      role: formData.get("role"),
      location: formData.get("location"),
      workMode: formData.get("work_mode"),
    });
    await searchPublicOpportunitiesForIntent(intent);
    return { ...result, resultsReady: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo consultar las oportunidades.",
      errorDestination: result.destination,
    };
  }
}
