import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const checkedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".sql",
  ".json",
]);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "out",
  "dist",
  "build",
  "coverage",
]);

const ignoredFiles = new Set(["package-lock.json"]);

const forbiddenPatterns = [
  { label: "\\u00d8", value: "\u00d8" },
  { label: "\\u00d9", value: "\u00d9" },
  { label: "\\u00d0", value: "\u00d0" },
  { label: "\\u00c3", value: "\u00c3" },
  { label: "\\u00c2", value: "\u00c2" },
  { label: "\\u00e2", value: "\u00e2" },
  { label: "\\ufffd", value: "\ufffd" },
  { label: "\\u0637\\u00a7", value: "\u0637\u00a7" },
  { label: "\\u00d8\\u00a7", value: "\u00d8\u00a7" },
  { label: "\\u00d9\\u2026", value: "\u00d9\u2026" },
];

function extensionOf(filePath) {
  const match = filePath.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
}

function collectFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;

    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectFiles(fullPath, files);
      continue;
    }

    if (!stat.isFile()) continue;
    if (ignoredFiles.has(entry)) continue;
    if (!checkedExtensions.has(extensionOf(entry))) continue;

    files.push(fullPath);
  }

  return files;
}

const failures = [];

for (const file of collectFiles(root)) {
  const text = readFileSync(file, "utf8");
  if (text.includes("\0")) continue;

  const matched = forbiddenPatterns.filter((pattern) => text.includes(pattern.value));
  if (!matched.length) continue;

  failures.push({
    file: relative(root, file),
    patterns: matched.map((pattern) => pattern.label),
  });
}

if (failures.length) {
  console.error("Text integrity check failed. Possible mojibake found:");
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.patterns.join(", ")}`);
  }
  process.exit(1);
}

console.log("Text integrity check passed.");
