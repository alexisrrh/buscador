"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { executeLiveJobSearch } from "@/lib/job-sources/live-search.server";
import { requireUser } from "@/lib/supabase/server";

function identifier(value: FormDataEntryValue | null) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

export async function searchJobs(formData: FormData) {
  const searchProfileId = identifier(formData.get("search_profile_id"));
  const { user } = await requireUser();
  if (!user) redirect("/login");
  if (!searchProfileId) redirect("/jobs?error=Selecciona%20una%20b%C3%BAsqueda%20v%C3%A1lida");

  let destination: string;
  try {
    const report = await executeLiveJobSearch(user.id, searchProfileId);
    const summary = new URLSearchParams({
      search: searchProfileId,
      run: "1",
      sources: String(report.sources_attempted),
      succeeded: String(report.sources_succeeded),
      failed: String(report.sources_failed),
      received: String(report.offers_received),
      created: String(report.offers_created),
      updated: String(report.offers_updated),
      duplicates: String(report.duplicates),
      matches: String(report.matches_generated),
      high: String(report.high_compatibility),
      infojobs: report.skipped_sources.includes("INFOJOBS") ? "SKIPPED_SOURCE" : "",
      providers: JSON.stringify(report.provider_summary),
    });
    destination = `/jobs?${summary.toString()}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se pudieron generar los matches.";
    redirect(`/jobs?search=${searchProfileId}&error=${encodeURIComponent(detail)}`);
  }
  revalidatePath("/jobs");
  redirect(destination);
}

export async function setJobMatchStatus(formData: FormData) {
  const matchId = identifier(formData.get("job_match_id"));
  const status = formData.get("status");
  if (!matchId || (status !== "SAVED" && status !== "DISMISSED")) {
    redirect("/jobs?error=Acci%C3%B3n%20no%20permitida");
  }

  const { supabase, user } = await requireUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("set_job_match_status", {
    p_job_match_id: matchId,
    p_status: status,
  });
  if (error) redirect(`/jobs?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/jobs");
  redirect(`/jobs?message=${status === "SAVED" ? "Oferta%20guardada" : "Oferta%20descartada"}`);
}
