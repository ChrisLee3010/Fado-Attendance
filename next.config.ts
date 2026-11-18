import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The test server builds into its own folder (.next-test) so it never overwrites a running `npm run share`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
