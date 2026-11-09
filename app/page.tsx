import { PublicIntentExperience } from "@/components/public-intent-experience";
import { intentFromQuery } from "@/lib/intent-first";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; intent_role?: string; intent_location?: string; intent_mode?: string }> }) {
  const params = await searchParams;
  return <PublicIntentExperience intent={intentFromQuery(params)} error={params.error} />;
}
