#!/usr/bin/env node
/**
 * Generates BRANDA_HANDOFF source bundles and file tree.
 * Does not touch secrets or node_modules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HANDOFF = path.join(ROOT, "docs", "BRANDA_HANDOFF");
const BUNDLES = path.join(HANDOFF, "SOURCE_BUNDLES");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
]);

const SECRET_PATTERNS = [/^\.env$/i, /^\.env\.local$/i, /^\.env\.production$/i];

function langFor(file) {
  const ext = path.extname(file).slice(1);
  const map = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    mjs: "javascript",
    json: "json",
    sql: "sql",
    md: "markdown",
    toml: "toml",
    css: "css",
  };
  return map[ext] ?? (ext || "text");
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

function isSecret(file) {
  const base = path.basename(file);
  return SECRET_PATTERNS.some((re) => re.test(base));
}

function readFileContent(file) {
  if (isSecret(file)) {
    return `[REDACTED — contains secrets — path: ${rel(file)}]`;
  }
  return fs.readFileSync(file, "utf8");
}

function bundleFiles(title, outName, files, maxBytes = 4_500_000) {
  fs.mkdirSync(BUNDLES, { recursive: true });
  let part = 1;
  let current = `# ${title}${part > 1 ? ` (Part ${part})` : ""}\n\n`;
  let currentSize = Buffer.byteLength(current, "utf8");
  const written = [];

  function flush() {
    const name =
      part === 1 && !written.length
        ? `${outName}.md`
        : `${outName}_PART_${String(part).padStart(2, "0")}.md`;
    const outPath = path.join(BUNDLES, name);
    fs.writeFileSync(outPath, current, "utf8");
    written.push(rel(outPath));
    part += 1;
    current = `# ${title} (Part ${part})\n\n`;
    currentSize = Buffer.byteLength(current, "utf8");
  }

  for (const file of files.sort()) {
    const content = readFileContent(file);
    const block =
      `# File: ${rel(file)}\n\n` +
      "```" +
      langFor(file) +
      "\n" +
      content +
      "\n```\n\n";
    const blockSize = Buffer.byteLength(block, "utf8");
    if (currentSize + blockSize > maxBytes && currentSize > 100) {
      flush();
    }
    current += block;
    currentSize += blockSize;
  }
  if (current.trim().length > 0) flush();
  return written;
}

function collect(globs) {
  const files = [];
  for (const g of globs) {
    const full = path.join(ROOT, g);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) files.push(full);
    else if (g.endsWith("/**")) {
      walk(path.join(ROOT, g.replace(/\/\*\*$/, "")), files);
    }
  }
  return [...new Set(files)];
}

function writeFileTree() {
  const roots = [
    "app",
    "components",
    "lib",
    "types",
    "supabase",
    "docs",
    "public/brand",
    "proxy.ts",
    "package.json",
    "next.config.ts",
    "next.config.mjs",
    "tsconfig.json",
    ".env.example",
  ];
  const lines = ["# Branda Platform — Complete File Tree", "", "```txt"];
  for (const r of roots) {
    const full = path.join(ROOT, r);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isFile()) {
      lines.push(r);
      continue;
    }
    const all = walk(full).map(rel).sort();
    for (const f of all) lines.push(f);
  }
  lines.push("```", "");
  fs.writeFileSync(path.join(HANDOFF, "01_COMPLETE_FILE_TREE.md"), lines.join("\n"), "utf8");
}

function main() {
  fs.mkdirSync(HANDOFF, { recursive: true });
  writeFileTree();

  const bundleDefs = [
    {
      title: "App Routes and API Source",
      out: "01_APP_ROUTES_AND_API_SOURCE",
      files: [...collect(["app/**", "proxy.ts"])],
    },
    {
      title: "Components Source",
      out: "02_COMPONENTS_SOURCE",
      files: collect(["components/**"]),
    },
    {
      title: "Lib Data Auth Supabase Source",
      out: "03_LIB_DATA_AUTH_SUPABASE_SOURCE",
      files: collect([
        "lib/data/**",
        "lib/supabase/**",
        "lib/branda/**",
        "lib/customer/**",
        "lib/platform/**",
      ]),
    },
    {
      title: "Lib Storage Cafe UI Source",
      out: "04_LIB_STORAGE_CAFE_UI_SOURCE",
      files: collect(["lib/storage/**", "lib/cafe/**", "lib/ui/**"]),
    },
    {
      title: "Types Config Package Source",
      out: "05_TYPES_CONFIG_PACKAGE_SOURCE",
      files: collect([
        "types/**",
        "package.json",
        "tsconfig.json",
        "next.config.ts",
        "next.config.mjs",
        ".env.example",
        "postcss.config.mjs",
        "eslint.config.mjs",
      ]),
    },
    {
      title: "Supabase Migrations Tests Source",
      out: "06_SUPABASE_MIGRATIONS_TESTS_SOURCE",
      files: collect([
        "supabase/migrations/**",
        "supabase/tests/**",
        "supabase/config.toml",
        "supabase/seed/security_test_seed.sql",
      ]),
    },
  ];

  const manifest = ["# Source Bundles Manifest", ""];
  for (const def of bundleDefs) {
    const written = bundleFiles(def.title, def.out, def.files);
    manifest.push(`## ${def.out}`, ...written.map((w) => `- ${w}`), "");
  }
  fs.writeFileSync(path.join(BUNDLES, "00_BUNDLE_MANIFEST.md"), manifest.join("\n"), "utf8");

  const securityDocs = [
    "docs/BRANDA_FINAL_SOURCE_SECURITY_AUDIT.md",
    "docs/BRANDA_PRODUCTION_DATABASE_MIGRATION_REPORT.md",
    "docs/BRANDA_RLS_SECURITY_REVIEW.md",
    "docs/BRANDA_SERVER_SECURITY_REVIEW.md",
    "docs/BRANDA_PRODUCTION_SECURITY_TEST_CHECKLIST.md",
    "docs/BRANDA_STAGING_SECURITY_VALIDATION_REPORT.md",
    "docs/BRANDA_SECURITY_DEFINER_REVIEW.md",
    "docs/BRANDA_HANDOFF/00_MASTER_INDEX.md",
    "docs/BRANDA_HANDOFF/03_DATABASE_AND_SECURITY_ARCHITECTURE.md",
    "docs/BRANDA_HANDOFF/06_SECURITY_FINAL_STATUS.md",
  ];
  let docIndex = "# Branda Handoff — Docs & Reports Index\n\n";
  docIndex +=
    "**Status:** Code hardening complete at source level — database not initialized — runtime security validation pending.\n\n";
  docIndex += "## All docs/BRANDA*.md files\n\n";
  for (const f of walk(path.join(ROOT, "docs")).filter((p) => p.endsWith(".md")).map(rel).sort()) {
    docIndex += `- \`${f}\`\n`;
  }
  docIndex += "\n---\n\n## Final security & handoff reports (full content)\n\n";
  for (const relDoc of securityDocs) {
    const full = path.join(ROOT, relDoc);
    if (!fs.existsSync(full)) continue;
    docIndex += `# File: ${relDoc}\n\n`;
    docIndex += fs.readFileSync(full, "utf8");
    docIndex += "\n\n---\n\n";
  }
  fs.writeFileSync(path.join(HANDOFF, "07_DOCS_AND_REPORTS_INDEX.md"), docIndex, "utf8");

  console.log("Handoff bundles generated:", manifest.join("\n"));
}

main();
