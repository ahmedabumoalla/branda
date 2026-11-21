import type { NextConfig } from "next";

import { KATH_IMAGE_ORIGIN, KATH_IMAGE_PATH, SHAHI_IMAGE_PATH, TAZA_IMAGE_PATH, DELI_IMAGE_PATH } from "./lib/menu/kath-images";
import { TOGETHER_IMAGE_PATH } from "./lib/menu/together-images";

const nextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/loyalty-guide": ["./assets/guides/branda-loyalty-guide.pdf"],
    // Brand logos stored in public are read from disk only by the wallet API (lib/wallet/logo.ts)
    "/api/wallet/**": ["./public/mqas77/wallet-emblem-v1.png", "./public/**/*.{png,jpg,jpeg,webp,gif,avif,svg,ico}"],
    // Files that server code reads from public by a fixed path. The exclude below drops the rest of public
    "/*": ["./public/fonts/tajawal-regular.ttf", "./public/fonts/tajawal-bold.ttf", "./public/mqas77/wallet-emblem-v1.png"],
    // Turbopack cannot infer Chromium's dynamically resolved binary directory.
    "/api/finance/**": ["./node_modules/@sparticuz/chromium/bin/*.br"],
    "/finance/**": ["./node_modules/@sparticuz/chromium/bin/*.br"],
    "/dashboard/finance": ["./node_modules/@sparticuz/chromium/bin/*.br"],
    "/dashboard/finance/**": ["./node_modules/@sparticuz/chromium/bin/*.br"],
    "/admin/subscription-invoices": ["./node_modules/@sparticuz/chromium/bin/*.br", "./assets/subscription-invoices/*"],
    "/api/admin/subscription-invoices/**": ["./node_modules/@sparticuz/chromium/bin/*.br", "./assets/subscription-invoices/*"],
  },
  // public is served by the CDN. A variable path in lib/wallet/logo.ts used to pack the whole folder into every
  // function that imports the wallet modules (123 routes, 23 minute builds). Includes above are applied after this
  // exclude. scripts/verify-deployment-size.mjs stops the build if this stops holding
  outputFileTracingExcludes: {
    "/*": ["./public/**/*"],
  },
  images: {
    remotePatterns: [KATH_IMAGE_PATH, SHAHI_IMAGE_PATH, TAZA_IMAGE_PATH, DELI_IMAGE_PATH, TOGETHER_IMAGE_PATH].map(path => ({ protocol: "https" as const, hostname: new URL(KATH_IMAGE_ORIGIN).hostname, pathname: `${path}**` })),
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
    // Revisit pages in the current session without a new blocking request.
    // Server actions still invalidate changed paths; no private CDN cache is used.
    staleTimes: { dynamic: 300, static: 300 },
    cpus: 1,
    preloadEntriesOnStart: false,
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
} as NextConfig;

export default nextConfig;
