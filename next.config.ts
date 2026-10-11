import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Shopify CLI is spawned as a child process, so it must be shipped with the functions that launch stores.
  // Keys are globs, so the dynamic chat route is matched with a wildcard rather than its [id] segment.
  outputFileTracingIncludes: {
    "/api/stores/*/chat": ["./shopify-cli/**/*"],
  },
  // Arcade serves full-size PNGs; thumbnails go through the image optimizer.
  images: { remotePatterns: [{ protocol: "https", hostname: "storage.googleapis.com" }] },
};

export default nextConfig;
