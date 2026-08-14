export interface NavLinkItem {
  href: string;
  label: string;
}

export const FEATURE_NAV_LINKS: NavLinkItem[] = [
  { href: "/account-discovery", label: "Account discovery" },
  { href: "/email-cleanup", label: "Email cleanup" },
  { href: "/remove-personal-data", label: "Personal data removal" },
];

export const RESOURCE_NAV_LINKS: NavLinkItem[] = [
  { href: "/breaches", label: "Data Breaches" },
  { href: "/resources/gdpr-generator", label: "GDPR Generator" },
  { href: "/resources/authorities", label: "DPAs" },
  { href: "/changelog", label: "Changelog" },
];
