import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/utils/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    {
      url: SITE_CONFIG.URL,
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 1,
    },
    {
      url: `${SITE_CONFIG.URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_CONFIG.URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ] as MetadataRoute.Sitemap;

  return pages;
}
