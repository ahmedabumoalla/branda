import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { optimizeDeploymentTraces } from "./optimize-deployment-traces.mjs";

const root = mkdtempSync(path.join(tmpdir(), "branda-deployment-traces-"));
const binaries = ["al2023.tar.br", "chromium.br", "fonts.tar.br", "swiftshader.tar.br"];
const pkg = path.join(root, "node_modules/@sparticuz/chromium");
function put(file, contents) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, contents); return file; }
const assets = binaries.map(name => put(path.join(pkg, "bin", name), "binary-fixture"));
const runtime = put(path.join(pkg, "build/index.js"), "export default class Chromium {};");
const plain = put(path.join(root, ".next/server/chunks/plain.js"), "export const value = 1;");
const pdf = put(path.join(root, ".next/server/chunks/pdf.js"), "import chromium from '@sparticuz/chromium';");
const font = put(path.join(root, "public/fonts/tajawal-regular.ttf"), "font-fixture");
function trace(name, dependencies) {
  const file = path.join(root, ".next/server/app", name, "route.js.nft.json");
  put(file, JSON.stringify({ version: 1, files: dependencies.map(dep => path.relative(path.dirname(file), dep).replaceAll("\\", "/")), extraMetadata: "preserved" }));
  return file;
}
const read = file => JSON.parse(readFileSync(file, "utf8"));
const absolute = file => read(file).files.map(value => path.resolve(path.dirname(file), value));
try {
  const ordinary = trace("api/finance/read-only", [plain, font, ...assets]);
  const jobs = trace("api/finance/jobs", [pdf, runtime, font, ...assets]);
  const action = trace("dashboard/finance", [pdf, runtime, font, ...assets]);
  const future = trace("api/admin/subscription-quotes/id", [pdf, runtime, font]);
  const unrelated = trace("api/wallet/pass", [plain, font]);
  const initialJobs = readFileSync(jobs, "utf8");
  const initialAction = readFileSync(action, "utf8");
  const initialUnrelated = readFileSync(unrelated, "utf8");
  const result = optimizeDeploymentTraces(root);
  assert.equal(result.removedEntries, 4);
  assert.equal(result.pdfRoutes, 3);
  assert.deepEqual(absolute(ordinary), [plain, font]);
  assert.equal(read(ordinary).extraMetadata, "preserved");
  assert.equal(readFileSync(jobs, "utf8"), initialJobs);
  assert.equal(readFileSync(action, "utf8"), initialAction);
  assert.equal(readFileSync(unrelated, "utf8"), initialUnrelated);
  for (const asset of assets) assert(absolute(future).includes(asset));
  assert.equal(optimizeDeploymentTraces(root).changedRoutes, 0);
  for (const asset of assets) assert.equal(readFileSync(asset, "utf8"), "binary-fixture");

  const removable = trace("api/finance/a-next", [plain, ...assets]);
  const beforeFailure = readFileSync(removable, "utf8");
  const unsafe = trace("api/finance/z-unsafe", [pdf, ...assets]);
  assert.throws(() => optimizeDeploymentTraces(root), /Chromium dependency missing/);
  assert.equal(readFileSync(removable, "utf8"), beforeFailure, "No partial writes on an unsafe trace");
  put(unsafe, JSON.stringify({ version: 2, files: [] }));
  assert.throws(() => optimizeDeploymentTraces(root), /Unsupported file trace/);
  assert.equal(readFileSync(removable, "utf8"), beforeFailure);
  put(unsafe, JSON.stringify({ version: 1, files: [] }));
  put(assets[0], "");
  assert.throws(() => optimizeDeploymentTraces(root), /Required Chromium asset missing/);
  assert.equal(readFileSync(removable, "utf8"), beforeFailure);
  console.log("Deployment trace checks passed: non-PDF reduction, PDF/jobs/actions preservation, missing asset recovery, idempotency and fail-closed validation");
} finally {
  // This directory is created by this test and contains only its synthetic files.
  rmSync(root, { recursive: true, force: true });
}
