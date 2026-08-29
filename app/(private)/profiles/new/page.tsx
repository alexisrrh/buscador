import { createProfile } from "@/app/actions/profiles";
import { Feedback } from "@/components/feedback";
import { ProfileForm } from "@/components/profile-form";

export default async function NewProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <><div className="page-header"><div><p className="eyebrow">Paso 1 de 3</p><h1>Tu perfil profesional</h1><p>Cuéntanos qué tipo de trabajo te interesa y cómo quieres presentarte.</p></div></div><Feedback error={params.error} /><ProfileForm action={createProfile} /></>;
}
