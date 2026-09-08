export type EvidenceStatus = "VERIFIED" | "NOT_FOUND";

export type JobAnalysis = {
  job_title: string;
  company: string | null;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  required_experience: string[];
  preferred_experience: string[];
  education: string[];
  languages: string[];
  location: string | null;
  work_mode: string | null;
  contract: string | null;
  salary: string | null;
  keywords: string[];
  mandatory_requirements: string[];
};

export type ResumeStructure = {
  sections: Array<{ heading: string; lines: string[] }>;
  lines: string[];
  links?: Array<{ text: string; url: string }>;
};

export type RoleFamily = "WEB" | "SOFTWARE" | "DATA" | "OTHER";
export type EvidenceBlock = {
  id: string;
  kind: "project" | "employment" | "education";
  title: string;
  lines: string[];
  identity_lines: string[];
  skills: string[];
  technical: boolean;
  links: string[];
};
export type AdaptedSection = { key: string; heading: string; lines: string[]; evidence_ids: string[] };

export type CandidateEvidence = {
  candidate_profile: {
    name: string;
    headline: string | null;
    job_family: string | null;
    seniority: string | null;
  };
  verified_skills: string[];
  requested_skills: Array<{ skill: string; status: EvidenceStatus }>;
  experience_lines: string[];
  project_lines: string[];
  education_lines: string[];
  language_lines: string[];
  source_text: string;
  blocks?: EvidenceBlock[];
  links?: Array<{ text: string; url: string }>;
  role_family?: RoleFamily;
  target_job?: Pick<JobAnalysis, "job_title" | "required_skills" | "preferred_skills" | "keywords">;
  identity?: {
    name?: { value: string; source: "CANDIDATE_PROFILE" | "RESUME_EXTRACTION" | "USER_PROFILE" };
    email?: { value: string; source: "RESUME_EXTRACTION" | "USER_PROFILE" };
    phone?: { value: string; source: "RESUME_EXTRACTION" | "USER_PROFILE" };
    city?: { value: string; source: "RESUME_EXTRACTION" | "USER_PROFILE" };
    links: Array<{ label: "LinkedIn" | "GitHub" | "Portfolio"; url: string; source: "RESUME_EXTRACTION" | "USER_PROFILE" }>;
  };
};

export type GapAnalysis = {
  strong_matches: string[];
  partial_matches: string[];
  missing_requirements: string[];
  unknown_requirements: string[];
};

export type ResumeAdaptation = {
  professional_summary: string;
  prioritized_skills: string[];
  experience_sections: string[];
  project_sections: string[];
  education: string[];
  ats_keywords: string[];
  excluded_requested_skills: string[];
  selection_version?: "evidence-priority-v2";
  professional_title?: string;
  sections?: AdaptedSection[];
  selected_project_ids?: string[];
  technical_experience_ids?: string[];
  additional_experience?: string[];
  technical_training?: string[];
  portfolio_links?: string[];
  technical_skill_groups?: Array<{ label: string; skills: string[] }>;
  project_details?: Array<{
    name: string;
    description: string;
    technologies: string[];
    highlights: string[];
    link: string | null;
  }>;
};

export type GeneratedApplication = {
  resume_adaptation: ResumeAdaptation;
  recruiter_message: string | null;
  cover_letter: string | null;
};

export type ApplicationGenerationInput = {
  job: JobAnalysis;
  evidence: CandidateEvidence;
  gaps: GapAnalysis;
};

export interface CandidateApplicationGenerator {
  readonly provider: string;
  generate(input: ApplicationGenerationInput): Promise<GeneratedApplication>;
}
