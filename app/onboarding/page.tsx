import { redirect } from "next/navigation";
import { OnboardingExperience } from "@/components/onboarding-experience";
import { intentFromQuery } from "@/lib/intent-first";
import { loadOnboardingSnapshot } from "@/lib/onboarding/state.server";
import { requireUser } from "@/lib/supabase/server";

type OnboardingParams = {
  intent_role?: string;
  intent_location?: string;
  intent_mode?: string;
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<OnboardingParams> }) {
  const [params, { supabase, user }] = await Promise.all([searchParams, requireUser()]);
  if (!user) redirect("/login");

  const snapshot = await loadOnboardingSnapshot({
    client: supabase,
    userId: user.id,
    intent: intentFromQuery(params),
  });

  return <OnboardingExperience initialSnapshot={snapshot} />;
}
