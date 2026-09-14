import { redirect } from "next/navigation";
import { intentFromQuery, intentQuery } from "@/lib/intent-first";

export default async function NewProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const intent = intentFromQuery(await searchParams);
  redirect(intent ? `/onboarding?${intentQuery(intent)}` : "/onboarding");
}
