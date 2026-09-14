"use server";

import { persistOnboardingSignal, type ConfirmOnboardingResult } from "@/lib/onboarding/persistence.server";
import type { OnboardingSignalInput } from "@/lib/onboarding/persistence";
import { requireUser } from "@/lib/supabase/server";

export async function confirmOnboardingSignal(signal: OnboardingSignalInput): Promise<ConfirmOnboardingResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: { code: "AUTH_REQUIRED", message: "Necesitas iniciar sesión para guardar esta información." } };
  try {
    return await persistOnboardingSignal({ client: supabase, userId: user.id, signal });
  } catch {
    return { ok: false, error: { code: "PERSISTENCE_FAILED", message: "No se pudo guardar esta información. Inténtalo de nuevo." } };
  }
}
