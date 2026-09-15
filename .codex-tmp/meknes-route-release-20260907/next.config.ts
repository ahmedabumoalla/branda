import type { NextConfig } from "next";

const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/c/meknes-loung/products/popular",
          destination: "/menu/meknes-loung",
        },
      ],
    };
  },

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
