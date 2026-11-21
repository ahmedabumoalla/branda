import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXED_PUBLIC_FILES, verifyDeploymentSize } from "./verify-deployment-size.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(path.join(tmpdir(), "branda-deployment-size-"));
function put(file, contents) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, contents); return file; }
const chunk = put(path.join(root, ".next/server/chunks/page.js"), "export const value = 1;");
const fixed = FIXED_PUBLIC_FILES.map(file => put(path.join(root, file), "fixed-fixture"));
const logo = put(path.join(root, "public/menu-logos/brand.png"), "image-fixture");
const upper = put(path.join(root, "public/brand/MARK.PNG"), "image-fixture");
const video = put(path.join(root, "public/guides/lesson.mp4"), "video-fixture");
function trace(name, dependencies) {
  const file = path.join(root, ".next/server/app", name, "route.js.nft.json");
  put(file, JSON.stringify({ version: 1, files: dependencies.map(dep => path.relative(path.dirname(file), dep).replaceAll("\\", "/")) }));
  return file;
}
const limits = { routeMb: 1, walletRouteMb: 1, totalMb: 1 };
try {
  const page = trace("dashboard/loyalty", [chunk, ...fixed]);
  const wallet = trace("api/wallet/brand/logo", [chunk, ...fixed, logo, upper]);
  const before = [page, wallet].map(file => readFileSync(file, "utf8"));
  const clean = verifyDeploymentSize(root, limits);
  assert.equal(clean.routes, 2);
  assert.equal(clean.walletRoutes, 1);
  assert.equal(clean.problems, 0);
  assert.deepEqual([page, wallet].map(file => readFileSync(file, "utf8")), before, "The guard never rewrites a trace");

  // The original fault: an ordinary route carrying public files it never reads
  trace("dashboard/loyalty", [chunk, ...fixed, logo, video]);
  assert.throws(() => verifyDeploymentSize(root, limits), /dashboard\/loyalty\/route packs 2 public files/);
  trace("dashboard/loyalty", [chunk, ...fixed]);

  // Wallet routes keep images only, and must keep every one of them
  trace("api/wallet/brand/logo", [chunk, ...fixed, logo, upper, video]);
  assert.throws(() => verifyDeploymentSize(root, limits), /api\/wallet\/brand\/logo\/route packs 1 public files/);
  trace("api/wallet/brand/logo", [chunk, ...fixed, logo]);
  assert.throws(() => verifyDeploymentSize(root, limits), /missing 1 public images/);
  trace("api/wallet/brand/logo", [chunk, ...fixed, logo, upper]);

  // Size limits per route and for the whole deployment
  const heavy = put(path.join(root, ".next/server/chunks/heavy.js"), Buffer.alloc(1024 * 1024 + 1));
  trace("finance/reports", [heavy]);
  assert.throws(() => verifyDeploymentSize(root, limits), /finance\/reports\/route is 1 MB, over its 1 MB limit/);
  assert.throws(() => verifyDeploymentSize(root, { routeMb: 5, walletRouteMb: 5, totalMb: 1 }), /All routes together/);
  assert.equal(verifyDeploymentSize(root, { routeMb: 5, walletRouteMb: 5, totalMb: 5 }).problems, 0);

  put(path.join(root, ".next/server/app/broken/route.js.nft.json"), JSON.stringify({ version: 2, files: [] }));
  assert.throws(() => verifyDeploymentSize(root, limits), /Unsupported file trace/);

  // The guard must stay wired into the production build and the tracing fix must stay in place
  const build = JSON.parse(readFileSync(path.join(here, "../package.json"), "utf8")).scripts.build;
  assert.match(build, /next build && node scripts\/optimize-deployment-traces\.mjs && node scripts\/verify-deployment-size\.mjs$/);
  const config = readFileSync(path.join(here, "../next.config.ts"), "utf8");
  assert.match(config, /outputFileTracingExcludes: \{\s*"\/\*": \["\.\/public\/\*\*\/\*"\],\s*\}/, "public stays out of every function");
  assert.match(config, /"\/api\/wallet\/\*\*": \[[^\]]*"\.\/public\/\*\*\/\*\.\{png,jpg,jpeg,webp,gif,avif,svg,ico\}"/, "wallet routes keep the public images");
  const everyRoute = /\n\s*"\/\*": \[([^\]]*)\],\s*\n\s*\/\/ Turbopack cannot infer/.exec(config)?.[1] ?? "";
  for (const file of FIXED_PUBLIC_FILES) assert.ok(everyRoute.includes(`"./${file}"`), `${file} must be included for every route`);
  // Measured on 2026-11-21: this comment made the tracer pack the whole project (1.2 GB per route) instead of public
  const reader = readFileSync(path.join(here, "../lib/wallet/logo.ts"), "utf8");
  assert.doesNotMatch(reader, /turbopackIgnore/, "Do not hide the public path from tracing; the exclude in next.config.ts handles it");
  console.log("Deployment size checks passed: stray public files, wallet image parity, route and total limits, read-only guard, build wiring");
} finally {
  // This directory is created by this test and contains only its synthetic files.
  rmSync(root, { recursive: true, force: true });
}
