export interface JobgetherJob {
  id: string;
  title: string;
  company?: string;
  url: string;
  location?: string;
  remote?: string;
  contractType?: string;
  experience?: string;
  jobFunctions?: string[];
  postedAt?: string;
}

export interface JobgetherJobsResponse {
  jobs: JobgetherJob[];
  pagination: { page: number; limit: number; hasMore: boolean };
}
