export type GateResult = "PASS" | "FAIL" | "UNKNOWN";
export type MatchEligibility = "ELIGIBLE" | "REVIEW" | "REJECTED";

export interface MatchCandidateProfile {
  id: string;
  userId: string;
  seniority: string | null;
}

export interface MatchSearchProfile {
  id: string;
  userId: string;
  candidateProfileId: string;
  version: number;
  status: string;
  notificationMinScore: number;
}

export interface MatchJobPreferences {
  keywords: string[];
  targetTitles: string[];
  excludedTitles: string[];
  locations: Array<{ label?: string; country?: string; city?: string }>;
  workModes: string[];
  minimumSalary: number | null;
  currency: string | null;
  acceptedSeniorities: string[];
  minimumExperienceYears: number | null;
  maximumExperienceYears: number | null;
  requiredTechnologies: string[];
  excludedTechnologies: string[];
  contractTypes: string[];
}

export interface MatchJobOffer {
  id: string;
  status: string;
  title: string;
  description: string | null;
  locationText: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  workMode: string | null;
  seniority: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}

export interface MatchScoreComponents {
  title: number;
  keywords: number;
  technologies: number;
  location: number;
  seniority: number;
  contract: number;
  salary: number;
}

export interface MatchHardGates {
  offerActive: GateResult;
  searchActive: GateResult;
  location: GateResult;
  workMode: GateResult;
  seniority: GateResult;
  experience: GateResult;
  excludedTitle: GateResult;
  excludedTechnologies: GateResult;
}

export interface DeterministicMatchResult {
  scoringVersion: "deterministic-v1";
  score: number;
  eligibility: MatchEligibility;
  components: MatchScoreComponents;
  hardGates: MatchHardGates;
  reasons: string[];
}
