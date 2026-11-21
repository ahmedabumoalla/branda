import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Stops a production build whose server functions carry files they never read, before anything is deployed.
// It reads the route traces only and changes nothing. Background: until 2026-11-21 a variable path in
// lib/wallet/logo.ts packed the whole public folder into 123 functions and builds grew from 1 to 23 minutes.

/** Files that server code reads from public by a fixed path. Add a file here only together with the code that reads it. */
export const FIXED_PUBLIC_FILES = ["public/fonts/tajawal-regular.ttf", "public/fonts/tajawal-bold.ttf", "public/mqas77/wallet-emblem-v1.png"];
/** Only these routes read brand logos from public at runtime, so only they carry the public images. */
export const WALLET_PREFIX = "api/wallet/";
const IMAGE = /\.(?:png|jpe?g|webp|gif|avif|svg|ico)$/i;
const MB = 1024 * 1024;
// Measured on 2026-11-21 after the fix: largest ordinary route 94 MB (finance pages with Chromium), wallet routes 161 MB,
// all 266 routes 6.6 GB. Before the fix: 293 MB, 214 MB and 29.7 GB.
export const LIMITS = { routeMb: 140, walletRouteMb: 230, totalMb: 12000 };

const slash = value => value.replaceAll("\\", "/");

function walk(directory, keep) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file, keep);
    return entry.isFile() && keep(entry.name) ? [file] : [];
  });
}

export function verifyDeploymentSize(root = process.cwd(), limits = LIMITS) {
  const directory = path.join(root, ".next/server/app");
  if (!existsSync(directory)) throw new Error("Production App Router traces are missing");
  const traces = walk(directory, name => name.endsWith(".nft.json"));
  if (!traces.length) throw new Error("No production route traces found");
  const publicDirectory = path.join(root, "public");
  const publicImages = existsSync(publicDirectory)
    ? walk(publicDirectory, name => IMAGE.test(name)).map(file => slash(path.relative(root, file)))
    : [];
  const fixed = new Set(FIXED_PUBLIC_FILES);
  const sizes = new Map();
  const size = file => {
    if (!sizes.has(file)) sizes.set(file, existsSync(file) ? statSync(file).size : 0);
    return sizes.get(file);
  };
  const problems = [];
  let total = 0;
  let largest = { route: "", bytes: 0 };
  let walletRoutes = 0;

  for (const trace of traces) {
    const route = slash(path.relative(directory, trace)).replace(/\.js\.nft\.json$/, "");
    const content = JSON.parse(readFileSync(trace, "utf8"));
    if (content.version !== 1 || !Array.isArray(content.files)) throw new Error(`Unsupported file trace: ${trace}`);
    const wallet = route.startsWith(WALLET_PREFIX);
    const packed = new Set();
    const stray = [];
    let bytes = 0;
    let strayBytes = 0;
    for (const value of content.files) {
      const absolute = path.resolve(path.dirname(trace), value);
      const relative = slash(path.relative(root, absolute));
      bytes += size(absolute);
      if (!relative.startsWith("public/")) continue;
      packed.add(relative);
      if (fixed.has(relative) || (wallet && IMAGE.test(relative))) continue;
      stray.push(relative);
      strayBytes += size(absolute);
    }
    total += bytes;
    if (bytes > largest.bytes) largest = { route, bytes };
    if (stray.length) {
      problems.push(`${route} packs ${stray.length} public files (${Math.round(strayBytes / MB)} MB) it never reads, for example ${stray.slice(0, 3).join(", ")}`);
    }
    const limit = wallet ? limits.walletRouteMb : limits.routeMb;
    if (bytes > limit * MB) problems.push(`${route} is ${Math.round(bytes / MB)} MB, over its ${limit} MB limit`);
    if (wallet) {
      walletRoutes++;
      const missing = publicImages.filter(file => !packed.has(file));
      if (missing.length) {
        problems.push(`${route} is missing ${missing.length} public images that wallet cards may use as a brand logo, for example ${missing.slice(0, 3).join(", ")}`);
      }
    }
  }
  if (total > limits.totalMb * MB) problems.push(`All routes together are ${Math.round(total / MB)} MB, over the ${limits.totalMb} MB limit`);

  const result = { routes: traces.length, walletRoutes, totalMb: Math.round(total / MB), largestMb: Math.round(largest.bytes / MB), largestRoute: largest.route, problems: problems.length };
  if (problems.length) {
    const shown = problems.slice(0, 12).map(problem => `  - ${problem}`).join("\n");
    throw new Error([
      `[deployment-size] ${problems.length} problem(s), the build is stopped and production keeps its current version`,
      shown,
      problems.length > 12 ? `  - and ${problems.length - 12} more` : "",
      "How to fix: keep large media out of public (host videos in storage and link them), never read public through a variable path in server code,",
      "and read docs/BARNDAKSA_HANDOFF/DEPLOYMENT_SIZE_GUARD_20261121.md before changing a limit or the fixed file list",
    ].filter(Boolean).join("\n"));
  }
  console.log(`[deployment-size] ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { verifyDeploymentSize(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}
