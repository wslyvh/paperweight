export interface NavLinkItem {
  href: string;
  label: string;
}

export const RESOURCE_NAV_LINKS: NavLinkItem[] = [
  { href: "/resources", label: "Resources Overview" },
  { href: "/breaches", label: "Data Breaches" },
  { href: "/resources/gdpr-generator", label: "GDPR Generator" },
  { href: "/guides/how-to-exercise-your-gdpr-rights", label: "GDPR Guide" },
  { href: "/resources/authorities", label: "DPAs" },
  { href: "/changelog", label: "Changelog" },
];
