export interface InfoJobsDictionaryItem {
  id?: number | string;
  key?: string;
  value?: string;
}

export interface InfoJobsCompany {
  id?: string;
  name?: string;
  uri?: string;
  web?: string;
  websiteUrl?: string;
  corporateWebsiteUrl?: string;
  hidden?: boolean;
}

export interface InfoJobsPay {
  amount?: number;
  amountValue?: string;
  periodValue?: string;
}

export interface InfoJobsOffer {
  id: string;
  title: string;
  link: string;
  city?: string;
  province?: InfoJobsDictionaryItem;
  country?: InfoJobsDictionaryItem;
  author?: InfoJobsCompany;
  profile?: InfoJobsCompany;
  updated?: string;
  published?: string;
  creationDate?: string;
  updateDate?: string;
  requirementMin?: string;
  description?: string;
  contractType?: InfoJobsDictionaryItem;
  jobLevel?: InfoJobsDictionaryItem;
  salaryMin?: InfoJobsDictionaryItem;
  salaryMax?: InfoJobsDictionaryItem;
  minPay?: InfoJobsPay;
  maxPay?: InfoJobsPay;
  showPay?: boolean;
  active?: boolean;
  archived?: boolean;
  deleted?: boolean;
}

export interface InfoJobsSearchResponse {
  offers: InfoJobsOffer[];
  totalResults: number;
  currentResults: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}
