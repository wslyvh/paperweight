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
  reminder: string;
  followup: string;
}
