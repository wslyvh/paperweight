import type { MetadataRoute } from "next";
import { getReleases } from "@/lib/github";
import { PRIVACY_LAST_UPDATED } from "@/app/privacy/page";
import { TERMS_LAST_UPDATED } from "@/app/terms/page";
import { AUTHORITIES_LAST_UPDATED } from "@/app/resources/authorities/page";
import { GDPR_GENERATOR_LAST_UPDATED } from "@/app/resources/gdpr-generator/page";
import { HOME_LAST_UPDATED } from "@/app/page";
import { SITE_CONFIG } from "@/utils/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const releases = await getReleases().catch(() => []);
  const latestRelease = releases[0]?.published_at ?? HOME_LAST_UPDATED;

  const pages = [
    {
      url: SITE_CONFIG.URL,
      lastModified: HOME_LAST_UPDATED,
      changeFrequency: "always",
      priority: 1,
    },
    {
      url: `${SITE_CONFIG.URL}/changelog`,
      lastModified: latestRelease,
      changeFrequency: "weekly",
      priority: 0.6,
    },
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
