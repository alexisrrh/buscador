"use server";

import { redirect } from "next/navigation";
import { opportunitiesDestination, searchIntent } from "@/lib/intent-first";

export async function beginSearchIntent(formData: FormData) {
  let intent;
  try {
    intent = searchIntent({
      role: formData.get("role"),
      location: formData.get("location"),
      workMode: formData.get("work_mode"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revisa tu búsqueda.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }
  redirect(opportunitiesDestination(intent));
}
