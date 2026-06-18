#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PATCH_NAME = 'BARNDAKSA_PUBLIC_CAFE_FAST_LAYER_ONLY_PATCH';
const root = process.cwd();
const packageJson = path.join(root, 'package.json');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packageJson)) {
  fail('شغل السكربت من جذر المشروع E:\\branda-platform وليس من داخل مجلد الباتش.');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const backupRoot = path.resolve(root, '..', 'barndaksa-patch-backups', `${PATCH_NAME}-${timestamp()}`);
fs.mkdirSync(backupRoot, { recursive: true });

function backupFile(relativePath) {
  const src = path.join(root, relativePath);
  if (!fs.existsSync(src)) return;
  const dest = path.join(backupRoot, relativePath);
  ensureDir(dest);
  fs.copyFileSync(src, dest);
}

function moveNoisyBackupsOutOfProject() {
  const noisyDirs = ['BARNDAKSA_PATCH_BACKUPS'];
  for (const dir of noisyDirs) {
    const src = path.join(root, dir);
    if (!fs.existsSync(src)) continue;
    const dest = path.resolve(root, '..', 'barndaksa-patch-backups', `${dir}-${timestamp()}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    console.log(`🧹 نقلت ${dir} خارج المشروع حتى لا يفحصه TypeScript`);
  }
}

function updateTsconfigExcludes() {
  const tsconfigPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;
  backupFile('tsconfig.json');
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn('⚠️ لم أستطع قراءة tsconfig.json كـ JSON، تجاوزت تحديث الاستثناءات.');
    return;
  }
  const exclude = Array.isArray(json.exclude) ? json.exclude : [];
  const required = [
    'node_modules',
    'BARNDAKSA_*',
    'BARNDAKSA_PATCH_BACKUPS',
    '.barndaksa-backups',
    '.barndaksa-patch-backups',
  ];
  for (const item of required) {
    if (!exclude.includes(item)) exclude.push(item);
  }
  json.exclude = exclude;
  fs.writeFileSync(tsconfigPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

const payloadPath = path.join(__dirname, 'payload.json');
if (!fs.existsSync(payloadPath)) fail('ملف payload.json غير موجود داخل مجلد الباتش.');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

moveNoisyBackupsOutOfProject();
updateTsconfigExcludes();

for (const [relativePath, encoded] of Object.entries(payload)) {
  const dest = path.join(root, relativePath);
  backupFile(relativePath);
  ensureDir(dest);
  fs.writeFileSync(dest, Buffer.from(encoded, 'base64'));
  console.log(`✅ ${relativePath}`);
}

console.log('\n✅ تم تطبيق طبقة Barndaksa Fast Layer على الفرع الإلكتروني فقط.');
console.log(`📦 النسخ الاحتياطية خارج المشروع: ${backupRoot}`);
console.log('\nالاختبار التالي:');
console.log('npm exec tsc -- --noEmit');
console.log('npm run build');
