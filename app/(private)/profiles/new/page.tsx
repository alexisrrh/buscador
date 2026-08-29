import { createProfile } from "@/app/actions/profiles";
import { Feedback } from "@/components/feedback";
import { ProfileForm } from "@/components/profile-form";

export default async function NewProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <><div className="page-header"><div><h1>Nuevo perfil</h1><p>Define un objetivo profesional independiente.</p></div></div><Feedback error={params.error} /><ProfileForm action={createProfile} /></>;
}
