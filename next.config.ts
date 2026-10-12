import type { NextConfig } from "next";

import { KATH_IMAGE_ORIGIN, KATH_IMAGE_PATH } from "./lib/menu/kath-images";

const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: new URL(KATH_IMAGE_ORIGIN).hostname, pathname: `${KATH_IMAGE_PATH}**` }],
    formats: ["image/webp"],
    minimumCacheTTL: 60,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/c/meknes-loung/products/popular",
          destination: "/menu/meknes-loung",
        },
        {
          source: "/c/shahi-w-hail/products/popular",
          destination: "/menu/shahi-w-hail",
        },
      ],
    };
  },
  devIndicators: false,
  experimental: {
    cpus: 1,
    preloadEntriesOnStart: false,
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
} as NextConfig;

export default nextConfig;
