"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { trimmed } from "@/lib/validation";

function authError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  const email = trimmed(formData.get("email"), 320).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) authError("/login", "Email y contraseña son obligatorios.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authError("/login", "Credenciales incorrectas o cuenta no disponible.");
  redirect("/dashboard");
}

export async function register(formData: FormData) {
  const email = trimmed(formData.get("email"), 320).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    authError("/register", "Usa un email válido y una contraseña de al menos 8 caracteres.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) authError("/register", "No se pudo crear la cuenta.");
  if (data.session) redirect("/dashboard");
  redirect("/login?message=Revisa%20tu%20email%20para%20confirmar%20la%20cuenta.");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
