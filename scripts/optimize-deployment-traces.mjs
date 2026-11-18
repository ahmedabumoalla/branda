import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const chromiumSegment = "/node_modules/@sparticuz/chromium/";
const binaries = ["al2023.tar.br", "chromium.br", "fonts.tar.br", "swiftshader.tar.br"];
const slash = value => value.replaceAll("\\", "/");

function traceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return traceFiles(file);
    return entry.isFile() && entry.name.endsWith(".nft.json") ? [file] : [];
  });
}

/** Change packaging only. Keep all JS, fonts, images and application assets intact. */
export function optimizeDeploymentTraces(root = process.cwd()) {
  const directory = path.join(root, ".next/server/app");
  if (!existsSync(directory)) throw new Error("Production App Router traces are missing");
  const files = traceFiles(directory);
  if (!files.length) throw new Error("No production route traces found");
  const sourceCache = new Map();
  const plans = [];
  let removedBytes = 0;
  let removedEntries = 0;
  let pdfRoutes = 0;
  const reducedRoutes = [];

  for (const file of files) {
    const trace = JSON.parse(readFileSync(file, "utf8"));
    if (trace.version !== 1 || !Array.isArray(trace.files) || trace.files.some(value => typeof value !== "string")) {
      throw new Error(`Unsupported file trace: ${file}`);
    }
    const resolved = trace.files.map(value => path.resolve(path.dirname(file), value));
    const packageFiles = resolved.filter(value => slash(value).includes(chromiumSegment));
    const runtime = packageFiles.find(value => /\/build\/index\.(?:c?js|mjs)$/.test(slash(value)));
    const candidateBinaries = new Set(packageFiles.filter(value =>
      binaries.some(name => slash(value).endsWith(`${chromiumSegment}bin/${name}`))));

    // An external Chromium import without a traced package is an unsafe build,
    // not evidence that its binaries are unused. Never publish such a trace.
    let referencesChromium = false;
    const entrypoint = file.slice(0, -".nft.json".length);
    const codeFiles = resolved.filter(value => /\.(?:c?js|mjs)$/.test(value));
    if (existsSync(entrypoint)) codeFiles.push(entrypoint);
    for (const dependency of codeFiles) {
      if (!sourceCache.has(dependency)) sourceCache.set(dependency, readFileSync(dependency, "utf8").includes("@sparticuz/chromium"));
      if (sourceCache.get(dependency)) { referencesChromium = true; break; }
    }
    if (referencesChromium && !runtime) throw new Error(`Chromium dependency missing from ${file}`);

    let next = [...trace.files];
    if (runtime) {
      pdfRoutes++;
      // Preserve existing PDF traces byte-for-byte. Shared Next.js chunks can
      // mention PDF modules on unrelated pages; never expand their payload here.
      for (const binary of candidateBinaries) {
        if (!existsSync(binary) || statSync(binary).size === 0) throw new Error(`Required Chromium asset missing: ${path.basename(binary)}`);
      }
    } else if (packageFiles.every(value => candidateBinaries.has(value))) {
      // Only remove the four explicitly known binary assets when the route has
      // neither a Chromium package dependency nor a compiled Chromium reference.
      next = trace.files.filter((value, index) => {
        if (!candidateBinaries.has(resolved[index])) return true;
        removedBytes += statSync(resolved[index]).size;
        removedEntries++;
        return false;
      });
      if (next.length !== trace.files.length) reducedRoutes.push(slash(path.relative(directory, file)));
    }
    if (JSON.stringify(next) !== JSON.stringify(trace.files)) plans.push({ file, trace: { ...trace, files: next } });
  }

  // Validate every trace before writing any changes. The original binary files
  // stay on disk; only per-route packaging manifests change.
  for (const plan of plans) writeFileSync(plan.file, JSON.stringify(plan.trace));
  const result = { routes: files.length, pdfRoutes, changedRoutes: plans.length, removedEntries, removedBytes, reducedRoutes };
  console.log(`[deployment-traces] ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) optimizeDeploymentTraces();
