import type { NextConfig } from "next";

// Static export: the app is plain files on a CDN. No server, no API routes,
// nothing for a judge to configure.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
