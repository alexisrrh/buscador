export interface AshbyAddress {
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
}

export interface AshbyCompensationComponent {
  compensationType?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string; address?: AshbyAddress }>;
  department?: string;
  team?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: "OnSite" | "Remote" | "Hybrid" | string;
  descriptionPlain?: string;
  publishedAt?: string;
  employmentType?: string;
  address?: { postalAddress?: AshbyAddress };
  jobUrl: string;
  applyUrl?: string;
  compensation?: {
    summaryComponents?: AshbyCompensationComponent[];
  };
}

export interface AshbyJobBoardResponse {
  apiVersion: string;
  jobs: AshbyJob[];
}
