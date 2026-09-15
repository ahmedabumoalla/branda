import type { NextConfig } from "next";

const nextConfig = {
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
