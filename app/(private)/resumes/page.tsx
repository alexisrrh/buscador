import { Feedback } from "@/components/feedback";
import { ResumeOnboarding } from "@/components/resume-onboarding";
import { requireUser } from "@/lib/supabase/server";
import { loadContextualOnboarding } from "@/lib/resumes/contextual-onboarding.server";
import {
  intentFromQuery,
  offerPreparationContextFromQuery,
} from "@/lib/intent-first";

type ResumesParams = Record<string, string | undefined>;

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<ResumesParams>;
}) {
  const query = await searchParams;
  const context = offerPreparationContextFromQuery(query);
  const intent = intentFromQuery(query);
  const { supabase, user } = await requireUser();

  if (!user) return null;

  const onboarding = await loadContextualOnboarding(
    supabase,
    user.id,
    context?.resumeId ?? null,
  );

  return (
    <>
      <Feedback message={query.message} error={query.error} />
      <ResumeOnboarding context={context} intent={intent} onboarding={onboarding} />
    </>
  );
}
