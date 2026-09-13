"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { intentFromQuery, intentQuery, opportunitiesDestination, safeReturnTarget } from "@/lib/intent-first";
import { trimmed } from "@/lib/validation";

function intentFromFormData(formData: FormData) {
  return intentFromQuery({
    intent_role: String(formData.get("intent_role") ?? ""),
    intent_location: String(formData.get("intent_location") ?? ""),
    intent_mode: String(formData.get("intent_mode") ?? ""),
  });
}

function continuation(formData: FormData) {
  const intent = intentFromFormData(formData);
  return safeReturnTarget(formData.get("return_to"), intent ? opportunitiesDestination(intent) : "/dashboard");
}

function preservedParams(formData: FormData) {
  const intent = intentFromFormData(formData);
  const query = new URLSearchParams(intent ? intentQuery(intent) : "");
  const returnTo = formData.get("return_to");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) query.set("return_to", returnTo);
  return query.toString();
}

function authError(path: string, message: string, formData: FormData): never {
  const preserved = preservedParams(formData);
  redirect(`${path}?error=${encodeURIComponent(message)}${preserved ? `&${preserved}` : ""}`);
}

function registerErrorMessage(error: { code?: string; status?: number; message?: string }) {
  if (error.code === "over_email_send_rate_limit" ||
      (error.status === 429 && error.message === "email rate limit exceeded")) {
    return "Has intentado crear varias cuentas en poco tiempo. Espera unos minutos y vuelve a intentarlo.";
  }
  return "No se pudo crear la cuenta.";
}

export async function login(formData: FormData) {
  const email = trimmed(formData.get("email"), 320).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) authError("/login", "Email y contraseña son obligatorios.", formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authError("/login", "Credenciales incorrectas o cuenta no disponible.", formData);
  redirect(continuation(formData));
}

export async function register(formData: FormData) {
  const email = trimmed(formData.get("email"), 320).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    authError("/register", "Usa un email válido y una contraseña de al menos 8 caracteres.", formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) authError("/register", registerErrorMessage(error), formData);
  if (data.session) redirect(continuation(formData));

  const preserved = preservedParams(formData);
  redirect(`/login?message=Revisa%20tu%20email%20para%20confirmar%20la%20cuenta.${preserved ? `&${preserved}` : ""}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
