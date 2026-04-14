export interface LanguageOption {
  label: string;
  flag: string;
}

export interface EmailTemplate {
  deletionSubject: string;
  deletion: string;
  accessSubject: string;
  access: string;
  accountRefLabel: string;
}

export interface CompanyOption {
  slug: string;
  name: string;
  runs?: string[];
  categories?: string[];
  address?: string;
  web?: string;
  email?: string;
  phone?: string;
  quality?: string;
  comments?: string[];
  suggestedTransportMedium?: string;
  webform?: string;
  domains: string[];
}

export type GdprRequestAction = "access" | "delete";

export interface GdprRequestContext {
  language: string;
  action: GdprRequestAction;
  companyName: string;
  companyEmail?: string;
  companyWebform?: string;
  userName: string;
  userEmail: string;
  accountReference?: string;
}

export interface Dpa {
  flag: string;
  country: string;
  dpaName: string;
  phone: string;
  email?: string;
  address: string;
  complaintUrl: string;
  websiteUrl: string;
  englishOk?: boolean;
  warning?: string;
  tld: string;
  languageCode: string;
  countryAliases: string[];
}

export interface GdprGeneratorInitialState {
  companyQuery?: string;
  selectedCompany?: CompanyOption;
  manualOrgEmail?: string;
}
