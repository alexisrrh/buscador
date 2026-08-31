export interface GreenhouseDepartment {
  id?: number;
  name?: string;
}

export interface GreenhouseOffice {
  id?: number;
  name?: string;
  location?: string;
}

export interface GreenhouseJob {
  id: number | string;
  title: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
  departments?: GreenhouseDepartment[];
  offices?: GreenhouseOffice[];
}

export interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta?: { total?: number };
}
