"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import {
  listFromInput,
  nullableNumber,
  requiredInteger,
  trimmed,
  validateScores,
} from "@/lib/validation";

function searchPayload(formData: FormData) {
  const frequencyType = trimmed(formData.get("frequency_type"));
  const frequencyInput = trimmed(formData.get("frequency_value"), 50);
  const notification = requiredInteger(formData.get("notification_min_score"), "Score de notificación");
  const semi = requiredInteger(formData.get("semi_auto_min_score"), "Score semi-automático");
  const auto = requiredInteger(formData.get("auto_apply_min_score"), "Score automático");
  validateScores(notification, semi, auto);

  const frequencyValue =
    frequencyType === "INTERVAL"
      ? { minutes: requiredInteger(formData.get("frequency_value"), "Intervalo") }
      : frequencyType === "WEEKDAYS"
        ? { time: frequencyInput, days: [1, 2, 3, 4, 5] }
        : { time: frequencyInput };

  return {
    name: trimmed(formData.get("name"), 120),
    frequency_type: frequencyType,
    frequency_value: frequencyValue,
    timezone: trimmed(formData.get("timezone"), 100) || "Europe/Madrid",
    notification_min_score: notification,
    semi_auto_min_score: semi,
    auto_apply_min_score: auto,
    daily_application_limit: requiredInteger(formData.get("daily_application_limit"), "Límite diario"),
  };
}

function preferencesPayload(formData: FormData) {
  const minimumSalary = nullableNumber(formData.get("minimum_salary"));
  const minimumExperience = nullableNumber(formData.get("minimum_experience_years"));
  const maximumExperience = nullableNumber(formData.get("maximum_experience_years"));
  if (
    minimumExperience !== null &&
    maximumExperience !== null &&
    minimumExperience > maximumExperience
  ) throw new Error("La experiencia mínima no puede superar la máxima.");

  return {
    keywords: listFromInput(formData.get("keywords")),
    target_titles: listFromInput(formData.get("target_titles")),
    excluded_titles: listFromInput(formData.get("excluded_titles")),
    locations: listFromInput(formData.get("locations")).map((label) => ({ label })),
    work_modes: formData.getAll("work_modes").map(String),
    minimum_salary: minimumSalary,
    currency: trimmed(formData.get("currency"), 3).toUpperCase(),
    accepted_seniorities: listFromInput(formData.get("accepted_seniorities")),
    minimum_experience_years: minimumExperience,
    maximum_experience_years: maximumExperience,
    required_technologies: listFromInput(formData.get("required_technologies")),
    excluded_technologies: listFromInput(formData.get("excluded_technologies")),
    languages: listFromInput(formData.get("languages")).map((code) => ({ code })),
    contract_types: listFromInput(formData.get("contract_types")),
  };
}

export async function saveSearch(formData: FormData) {
  const id = trimmed(formData.get("id"), 36) || null;
  const candidateProfileId = trimmed(formData.get("candidate_profile_id"), 36);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");

  let savedId: string;
  try {
    const { data, error } = await supabase.rpc("save_search_profile", {
      p_search_profile_id: id,
      p_candidate_profile_id: candidateProfileId,
      p_search: searchPayload(formData),
      p_preferences: preferencesPayload(formData),
    });
    if (error) throw error;
    const saved = data as { id: string };
    savedId = saved.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la búsqueda.";
    redirect(`${id ? `/searches/${id}` : "/searches/new"}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/searches");
  redirect(`/searches/${savedId}?message=Búsqueda%20guardada`);
}

export async function setSearchStatus(formData: FormData) {
  const id = trimmed(formData.get("id"), 36);
  const status = trimmed(formData.get("status"));
  const allowed = ["ACTIVE", "PAUSED", "ARCHIVED"];
  if (!allowed.includes(status)) throw new Error("Estado no permitido.");
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const patch = status === "ARCHIVED"
    ? { status, deleted_at: new Date().toISOString() }
    : { status, deleted_at: null };
  const { error } = await supabase
    .from("search_profiles")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) redirect(`/searches/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/searches");
  redirect(`/searches/${id}?message=Estado%20actualizado`);
}
