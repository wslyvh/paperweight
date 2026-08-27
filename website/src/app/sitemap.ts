import type { MetadataRoute } from "next";
import { getReleases } from "@/lib/github";
import { getBreachSitemapEntries } from "@/utils/breach";
import { SITE_CONFIG } from "@/utils/config";
import { GetGuides } from "@/utils/guides";
import {
  ACCOUNT_DISCOVERY_LAST_UPDATED,
  AUTHORITIES_LAST_UPDATED,
  EMAIL_CLEANUP_LAST_UPDATED,
  GDPR_GENERATOR_LAST_UPDATED,
  HOME_LAST_UPDATED,
  PRICING_LAST_UPDATED,
  PRIVACY_LAST_UPDATED,
  REMOVE_PERSONAL_DATA_LAST_UPDATED,
  TERMS_LAST_UPDATED,
} from "@/utils/page-dates";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const releases = await getReleases().catch(() => []);
  const latestRelease = releases[0]?.published_at ?? HOME_LAST_UPDATED;
  const guides = GetGuides();
  const latestGuideUpdate = guides[0]?.last_updated ?? HOME_LAST_UPDATED;
  const guideEntries = guides
    .map((guide) => ({
      url: `${SITE_CONFIG.URL}/guides/${guide.slug}`,
      lastModified: guide.last_updated,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
  const breachEntries = getBreachSitemapEntries()
    .map((entry) => ({
      url: `${SITE_CONFIG.URL}/breaches/${entry.slug}`,
      lastModified: entry.lastModified ?? HOME_LAST_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  const latestBreachUpdate =
    breachEntries[0]?.lastModified ?? HOME_LAST_UPDATED;

  const pages = [
    {
      url: SITE_CONFIG.URL,
      lastModified: HOME_LAST_UPDATED,
      changeFrequency: "always",
      priority: 1,
    },
    {
      url: `${SITE_CONFIG.URL}/account-discovery`,
      lastModified: ACCOUNT_DISCOVERY_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.URL}/email-cleanup`,
      lastModified: EMAIL_CLEANUP_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.URL}/remove-personal-data`,
      lastModified: REMOVE_PERSONAL_DATA_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.URL}/pricing`,
      lastModified: PRICING_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.URL}/changelog`,
      lastModified: latestRelease,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_CONFIG.URL}/breaches`,
      lastModified: latestBreachUpdate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_CONFIG.URL}/resources`,
      lastModified: HOME_LAST_UPDATED,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_CONFIG.URL}/guides`,
      lastModified: latestGuideUpdate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...guideEntries,
    ...breachEntries,
    {
      url: `${SITE_CONFIG.URL}/resources/gdpr-generator`,
      lastModified: GDPR_GENERATOR_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_CONFIG.URL}/resources/authorities`,
      lastModified: AUTHORITIES_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.5,
    },

    {
      url: `${SITE_CONFIG.URL}/privacy`,
      lastModified: PRIVACY_LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_CONFIG.URL}/terms`,
      lastModified: TERMS_LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ] as MetadataRoute.Sitemap;

  return pages;
}
