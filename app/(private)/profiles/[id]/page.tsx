import { redirect } from "next/navigation";
import { intentFromQuery, intentQuery } from "@/lib/intent-first";

export default async function EditProfilePage({ searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const intent = intentFromQuery(await searchParams);
  redirect(intent ? `/onboarding?${intentQuery(intent)}` : "/onboarding");
}
