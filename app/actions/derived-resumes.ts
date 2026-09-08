"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { generateDerivedResume, selectDerivedResume } from "@/lib/derived-resumes/service.server";
import { DerivedResumeError } from "@/lib/derived-resumes/content";

async function run(form: FormData, select: boolean) {
  const id = String(form.get("application_draft_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/jobs");
  const { user, supabase } = await requireUser();
  if (!user) redirect("/login");
  let errorCode = "";
  try {
    const input = { authClient: supabase, userId: user.id, draftId: id };
    if (select) await selectDerivedResume({ ...input, derivedId: String(form.get("derived_resume_id") ?? "") });
    else await generateDerivedResume(input);
  } catch (error) { errorCode = error instanceof DerivedResumeError ? error.code : "GENERATION_FAILED"; }
  revalidatePath(`/applications/drafts/${id}`);
  redirect(`/applications/drafts/${id}?${errorCode ? `error=${encodeURIComponent(`No se pudo completar: ${errorCode}`)}` : `message=${encodeURIComponent(select ? "CV asociado a la postulación" : "CV adaptado listo")}`}`);
}
export async function generateAdaptedResume(form: FormData) { await run(form, false); }
export async function chooseAdaptedResume(form: FormData) { await run(form, true); }
