#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const patchName = 'BARNDAKSA_PATCH_BACKUPS_TSC_EXCLUDE_FINAL_FIX';
const tsconfigPath = path.join(root, 'tsconfig.json');

function log(msg) { console.log(`[${patchName}] ${msg}`); }
function fail(msg) { console.error(`[${patchName}] ${msg}`); process.exit(1); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`تعذر قراءة ${file}: ${error.message}`); }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function moveBackupFolderOutOfProject() {
  const backupDir = path.join(root, 'BARNDAKSA_PATCH_BACKUPS');
  if (!fs.existsSync(backupDir)) {
    log('لا يوجد مجلد BARNDAKSA_PATCH_BACKUPS داخل المشروع.');
    return;
  }

  const parentArchive = path.join(path.dirname(root), `BARNDAKSA_PATCH_BACKUPS_ARCHIVE_${safeTimestamp()}`);
  try {
    fs.renameSync(backupDir, parentArchive);
    log(`تم نقل مجلد النسخ الاحتياطية خارج المشروع إلى: ${parentArchive}`);
  } catch (error) {
    log(`تعذر نقل مجلد النسخ الاحتياطية خارج المشروع: ${error.message}`);
    try {
      fs.rmSync(backupDir, { recursive: true, force: true });
      log('تم حذف مجلد BARNDAKSA_PATCH_BACKUPS من داخل المشروع حتى لا يفحصه TypeScript.');
    } catch (removeError) {
      fail(`تعذر حذف مجلد BARNDAKSA_PATCH_BACKUPS: ${removeError.message}`);
    }
  }
}

function patchTsConfig() {
  if (!fs.existsSync(tsconfigPath)) fail('لم يتم العثور على tsconfig.json. تأكد أنك تشغل السكربت من جذر المشروع.');

  const backupPath = path.join(root, `tsconfig.before-${patchName}-${safeTimestamp()}.json.bak`);
  fs.copyFileSync(tsconfigPath, backupPath);
  log(`تم حفظ نسخة احتياطية من tsconfig: ${path.basename(backupPath)}`);

  const tsconfig = readJson(tsconfigPath);
  const existing = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  const requiredExcludes = [
    'node_modules',
    '.next',
    'out',
    'dist',
    'build',
    'coverage',
    'BARNDAKSA_PATCH_BACKUPS',
    'BARNDAKSA_PATCH_BACKUPS/**',
    'BARNDAKSA_*_PATCH',
    'BARNDAKSA_*_PATCH/**',
    'BARNDAKSA_*_HOTFIX',
    'BARNDAKSA_*_HOTFIX/**',
    '**/BARNDAKSA_PATCH_BACKUPS/**',
    '**/patch-files/**'
  ];

  tsconfig.exclude = Array.from(new Set([...existing, ...requiredExcludes]));
  writeJson(tsconfigPath, tsconfig);
  log('تم تحديث tsconfig.json لاستثناء مجلدات الباتش والنسخ الاحتياطية من فحص TypeScript.');
}

function verify() {
  const tsconfig = readJson(tsconfigPath);
  const excludeText = JSON.stringify(tsconfig.exclude || []);
  const required = ['BARNDAKSA_PATCH_BACKUPS/**', 'BARNDAKSA_*_PATCH/**'];
  const missing = required.filter((item) => !excludeText.includes(item));
  if (missing.length) fail(`لم يتم تثبيت الاستثناءات المطلوبة: ${missing.join(', ')}`);
  log('التحقق النهائي ناجح.');
}

moveBackupFolderOutOfProject();
patchTsConfig();
verify();
log('انتهى الإصلاح. شغّل الآن: npm exec tsc -- --noEmit ثم npm run build');
