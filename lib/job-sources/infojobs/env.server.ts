import "server-only";

import { InfoJobsAdapter } from "@/lib/job-sources/infojobs/adapter";

export function createInfoJobsAdapterFromEnv() {
  const clientId = process.env.INFOJOBS_CLIENT_ID;
  const clientSecret = process.env.INFOJOBS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("InfoJobs application credentials are not configured.");
  }

  return new InfoJobsAdapter({ clientId, clientSecret });
}
