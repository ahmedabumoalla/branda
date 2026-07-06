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
  { label: "mojibake \\u0638\\u2026", value: "\u0638\u2026" },
  { label: "mojibake \\u0637\\u061b\\u0638\\u0679", value: "\u0637\u061b\u0638\u0679" },
  {
    label: "mojibake \\u0637\\u00b7\\u0622\\u00b7\\u0637\\u00b8",
    value: String.fromCodePoint(0x0637, 0x00b7, 0x0622, 0x00b7, 0x0637, 0x00b8),
  },
  {
    label: "mojibake \\u0637\\u00b7\\u0639\\u00be\\u0637\\u00b8",
    value: String.fromCodePoint(0x0637, 0x00b7, 0x0639, 0x00be, 0x0637, 0x00b8),
  },
  {
    label: "mojibake \\u0637\\u00b8\\u00e2\\u20ac\\u00a6\\u0637\\u00b8",
    value: String.fromCodePoint(0x0637, 0x00b8, 0x00e2, 0x20ac, 0x00a6, 0x0637, 0x00b8),
  },
  {
    label: "mojibake \\u0623\\u00a2\\u00e2\\u201a\\u00ac\\u0022",
    value: String.fromCodePoint(0x0623, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x0022),
  },
  {
    label: "mojibake \\u0623\\u00a2\\u00e2\\u20ac\\u00a2\\u0639\\u00af",
    value: String.fromCodePoint(0x0623, 0x00a2, 0x00e2, 0x20ac, 0x00a2, 0x0639, 0x00af),
  },
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
