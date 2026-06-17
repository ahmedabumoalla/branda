#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PATCH_NAME = 'BARNDAKSA_PERFORMANCE_SEGMENT_CONFIG_BUILD_FIX';

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function assertProjectRoot(root) {
  const required = ['package.json', 'app', 'components', 'lib'];
  const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
  if (missing.length) {
    console.error('❌ شغل السكربت من جذر المشروع E:\\branda-platform');
    console.error('المفقود:', missing.join(', '));
    process.exit(1);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function backupFile(root, rel, backupRoot) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) return;
  const dest = path.join(backupRoot, rel + '.bak');
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function readFileIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function writeIfChanged(root, rel, next, backupRoot) {
  const file = path.join(root, rel);
  const current = readFileIfExists(file);
  if (current == null) {
    console.warn('⚠️ لم أجد الملف:', rel);
    return false;
  }
  if (current === next) {
    console.log('ℹ️ لا يحتاج تعديل:', rel);
    return false;
  }
  backupFile(root, rel, backupRoot);
  fs.writeFileSync(file, next, 'utf8');
  console.log('✅ تم إصلاح:', rel);
  return true;
}

function fixRouteSegmentConfig(source) {
  let next = source;

  // Next.js/Turbopack rejects non-literal segment config values like:
  // export const revalidate = PUBLIC_CAFE_CACHE_SECONDS;
  // We already cache through headers + server memory cache, so these exports are unnecessary.
  next = next.replace(/^export\s+const\s+revalidate\s*=\s*PUBLIC_[A-Z0-9_]+_SECONDS\s*;\s*\r?\n/gm, '');
  next = next.replace(/^export\s+const\s+fetchCache\s*=\s*["']default-cache["']\s*;\s*\r?\n/gm, '');

  // Remove any accidental blank triple lines caused by the cleanup.
  next = next.replace(/\n{3,}/g, '\n\n');
  return next;
}

function scanForInvalidSegmentConfig(root) {
  const offenders = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git' || entry.name.startsWith('BARNDAKSA_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/route\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        const txt = fs.readFileSync(full, 'utf8');
        if (/export\s+const\s+revalidate\s*=\s*PUBLIC_[A-Z0-9_]+_SECONDS/.test(txt)) offenders.push(rel + ' → revalidate variable');
        if (/export\s+const\s+fetchCache\s*=\s*["']default-cache["']/.test(txt)) offenders.push(rel + ' → fetchCache default-cache');
      }
    }
  }
  walk(path.join(root, 'app'));
  return offenders;
}

function main() {
  const root = process.cwd();
  assertProjectRoot(root);

  const backupRoot = path.join(root, '.barndaksa-patch-backups', `segment-config-build-fix-${stamp()}`);
  ensureDir(backupRoot);

  const targets = [
    'app/api/public/cafe/[slug]/route.ts',
    'app/api/public/cafe/[slug]/menu/route.ts',
  ];

  let changed = 0;
  for (const rel of targets) {
    const file = path.join(root, rel);
    const current = readFileIfExists(file);
    if (current == null) {
      console.warn('⚠️ لم أجد الملف:', rel);
      continue;
    }
    const next = fixRouteSegmentConfig(current);
    if (writeIfChanged(root, rel, next, backupRoot)) changed++;
  }

  const offenders = scanForInvalidSegmentConfig(root);
  console.log('');
  if (offenders.length) {
    console.warn('⚠️ بقيت إعدادات segment config مشبوهة:');
    for (const item of offenders) console.warn(' - ' + item);
    console.warn('انسخ هذه القائمة وأرسلها لي لو استمر build.');
  } else {
    console.log('✅ تم إغلاق سبب Invalid segment configuration export في ملفات API العامة.');
  }
  console.log('📌 نسخة احتياطية:');
  console.log(backupRoot);
  console.log('');
  console.log('الآن شغل:');
  console.log('npm exec tsc -- --noEmit');
  console.log('npm run build');
}

main();
