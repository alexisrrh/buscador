export interface SmartRecruitersLocation {
  city?: string;
  region?: string;
  country?: string;
  fullLocation?: string;
  remote?: boolean;
  hybrid?: boolean;
}

export interface SmartRecruitersPosting {
  id: string;
  uuid?: string;
  name: string;
  company?: { identifier?: string; name?: string };
  releasedDate?: string;
  location?: SmartRecruitersLocation;
  department?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
  ref?: string;
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}

export interface SmartRecruitersPostingsResponse {
  limit: number;
  offset: number;
  totalFound: number;
  content: SmartRecruitersPosting[];
}
