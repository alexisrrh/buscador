export type CandidateProfile = {
  id: string;
  user_id: string;
  name: string;
  headline: string | null;
  job_family: string | null;
  seniority: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SearchStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "DISABLED"
  | "ARCHIVED";

export type SearchProfile = {
  id: string;
  user_id: string;
  candidate_profile_id: string;
  name: string;
  status: SearchStatus;
  frequency_type: "INTERVAL" | "DAILY" | "WEEKDAYS";
  frequency_value: Record<string, unknown>;
  timezone: string;
  notification_min_score: number;
  semi_auto_min_score: number;
  auto_apply_min_score: number;
  daily_application_limit: number;
  application_mode: "MANUAL" | "REVIEW" | "AUTO";
  version: number;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type JobPreferences = {
  id: string;
  search_profile_version: number;
  keywords: string[];
  target_titles: string[];
  excluded_titles: string[];
  locations: Array<{ label?: string; country?: string; city?: string }>;
  work_modes: string[];
  minimum_salary: number | null;
  currency: string | null;
  accepted_seniorities: string[];
  minimum_experience_years: number | null;
  maximum_experience_years: number | null;
  required_technologies: string[];
  excluded_technologies: string[];
  languages: Array<{ code?: string; minimum_level?: string }>;
  contract_types: string[];
};

export type Resume = {
  id: string;
  user_id: string;
  candidate_profile_id: string;
  version: number;
  status: "DRAFT" | "PROCESSING" | "READY" | "APPROVED" | "ARCHIVED" | "REJECTED";
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  content_sha256: string;
  created_at: string;
  approved_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};
