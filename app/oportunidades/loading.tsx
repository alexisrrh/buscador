"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OpportunitiesSearchExperience } from "@/components/opportunities-search-experience";

export default function OpportunitiesLoading() {
  return <Suspense fallback={null}><LandingAwareLoading /></Suspense>;
}

function LandingAwareLoading() {
  const params = useSearchParams();
  // Landing has already awaited the server action and its cached result. Keep
  // this boundary for direct/deep-link visits, but never replace the landing
  // with a second search composition during the prepared handoff.
  if (params?.get("landing_handoff") === "1") return null;
  return <OpportunitiesSearchExperience />;
}
