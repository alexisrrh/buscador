export interface LeverCategories {
  location?: string;
  commitment?: string;
  team?: string;
  department?: string;
  allLocations?: string[];
}

export interface LeverSalaryRange {
  currency?: string;
  interval?: string;
  min?: number;
  max?: number;
}

export interface LeverPosting {
  id: string;
  text: string;
  categories?: LeverCategories;
  country?: string | null;
  descriptionPlain?: string;
  openingPlain?: string;
  hostedUrl: string;
  applyUrl?: string;
  workplaceType?: "unspecified" | "on-site" | "remote" | "hybrid" | string;
  salaryRange?: LeverSalaryRange;
}
