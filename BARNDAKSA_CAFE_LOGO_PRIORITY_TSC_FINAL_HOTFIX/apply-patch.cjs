#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const PATCH_NAME = "cafe-logo-priority-tsc-final-hotfix";
const IMPORT_LINE = 'import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";';
const HELPER_PATH = "lib/cafe/cafe-display-logo.ts";
const HELPER_CONTENT = `export const DEFAULT_BARNDAKSA_CAFE_LOGO = "/brand/barndaksa-logo-brown.png";

function normalizeLogoCandidate(value?: string | null) {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next || next.startsWith("data:")) return undefined;

  if (
    next.startsWith("/") ||
    next.startsWith("blob:") ||
    /^https?:\/\//i.test(next)
  ) {
    return next;
  }

  return undefined;
}

export function getPreferredCafeDisplayLogoUrl(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const normalized = normalizeLogoCandidate(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_BARNDAKSA_CAFE_LOGO;
}
`;

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fail(message) {
  console.error("\n[Barndaksa patch] " + message);
  process.exit(1);
}

function ensureProjectRoot(projectRoot) {
  if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
    fail("شغل الأمر من جذر المشروع E:\\branda-platform وليس من داخل مجلد الباتش.");
  }
}

function backupFile(projectRoot, backupDir, relativePath) {
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) return;
  const backup = path.join(backupDir, relativePath + ".bak");
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

function writeFile(projectRoot, backupDir, relativePath, content) {
  const target = path.join(projectRoot, relativePath);
  backupFile(projectRoot, backupDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function listCodeFiles(root) {
  const ignored = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "build", ".barndaksa-patch-backups"]);
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Do not let old patch folders participate in source checks.
        if (/^BARNDAKSA_.*PATCH/i.test(entry.name)) continue;
        walk(full);
        continue;
      }
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  }
  walk(root);
  return out;
}

function insertImport(content) {
  if (content.includes(IMPORT_LINE)) return content;

  const lines = content.split(/\r?\n/);
  let insertAt = 0;

  if (lines[0] === '"use client";' || lines[0] === "'use client';") {
    insertAt = 1;
    if (lines[1] === "") insertAt = 2;
  }

  for (let i = insertAt; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("import ") || line.startsWith("} from ") || line.startsWith("  ") || line.trim() === "") {
      insertAt = i + 1;
      continue;
    }
    break;
  }

  lines.splice(insertAt, 0, IMPORT_LINE);
  return lines.join("\n");
}

function patchMissingImports(projectRoot, backupDir) {
  const changed = [];
  for (const full of listCodeFiles(projectRoot)) {
    const relativePath = path.relative(projectRoot, full).replace(/\\/g, "/");
    if (relativePath === HELPER_PATH) continue;

    const content = fs.readFileSync(full, "utf8");
    if (!content.includes("getPreferredCafeDisplayLogoUrl")) continue;
    if (content.includes(IMPORT_LINE)) continue;

    const next = insertImport(content);
    backupFile(projectRoot, backupDir, relativePath);
    fs.writeFileSync(full, next, "utf8");
    changed.push(relativePath);
  }
  return changed;
}

function verify(projectRoot) {
  const missing = [];
  for (const full of listCodeFiles(projectRoot)) {
    const relativePath = path.relative(projectRoot, full).replace(/\\/g, "/");
    if (relativePath === HELPER_PATH) continue;
    const content = fs.readFileSync(full, "utf8");
    if (content.includes("getPreferredCafeDisplayLogoUrl") && !content.includes(IMPORT_LINE)) {
      missing.push(relativePath);
    }
  }

  if (missing.length) {
    fail("ما زالت دالة شعار الفرع مستخدمة بدون import في:\n- " + missing.join("\n- "));
  }

  const themeFile = path.join(projectRoot, "components/cafe/themes/brand-identity-custom-theme.tsx");
  if (fs.existsSync(themeFile)) {
    const content = fs.readFileSync(themeFile, "utf8");
    if (!content.includes(IMPORT_LINE)) {
      fail("فشل التحقق: import ناقص في components/cafe/themes/brand-identity-custom-theme.tsx");
    }
  }
}

const projectRoot = process.cwd();
ensureProjectRoot(projectRoot);

const backupDir = path.join(projectRoot, ".barndaksa-patch-backups", PATCH_NAME + "-" + nowStamp());
fs.mkdirSync(backupDir, { recursive: true });

writeFile(projectRoot, backupDir, HELPER_PATH, HELPER_CONTENT);
const changed = patchMissingImports(projectRoot, backupDir);
verify(projectRoot);

console.log("\n✅ تم إغلاق خطأ TypeScript الخاص بـ getPreferredCafeDisplayLogoUrl نهائيًا.");
console.log("✅ تم التأكد أن أي ملف يستخدم الدالة يحتوي import الصحيح.");
if (changed.length) {
  console.log("✅ الملفات التي تم إصلاحها:");
  for (const file of changed) console.log("- " + file);
} else {
  console.log("ℹ️ لم توجد ملفات ناقصة import بعد كتابة ملف المساعد.");
}
console.log("✅ نسخة احتياطية: " + path.relative(projectRoot, backupDir));
console.log("\nشغل الآن:");
console.log("npm exec tsc -- --noEmit");
console.log("npm run build");
