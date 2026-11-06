"use client";

import { useEffect } from "react";
import { exposeLastSearchQa } from "@/lib/dev-search-qa";

/** Development-only, non-visual bridge for session-persisted BV-01 QA. */
export function DevSearchQaRestore() {
  useEffect(() => { exposeLastSearchQa(); }, []);
  return null;
}
