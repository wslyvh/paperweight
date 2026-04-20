import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  async redirects() {
    return [
      {
        source: "/guides",
        destination: "/resources",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
