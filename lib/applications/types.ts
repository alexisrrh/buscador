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
};

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
