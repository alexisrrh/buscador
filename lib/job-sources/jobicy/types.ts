export interface JobicyJob {
  id: number | string;
  url: string;
  jobSlug?: string;
  jobTitle: string;
  companyName?: string | null;
  jobIndustry?: string[] | null;
  jobType?: string[] | null;
  jobGeo?: string | null;
  jobLevel?: string | null;
  jobExcerpt?: string | null;
  jobDescription?: string | null;
  pubDate?: string | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

export interface JobicyJobsResponse {
  jobs: JobicyJob[];
}
