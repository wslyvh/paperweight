import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/utils/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_CONFIG.URL}/sitemap.xml`,
  };
}
