const fs = require('fs');
const path = require('path');

const root = process.cwd();
const patchName = 'BARNDAKSA_FEATURES_TSC_FINAL_FIX_PATCH';
const target = path.join(root, 'components', 'cafe', 'themes', 'cafe-page-client.tsx');
const backupRoot = path.join(root, 'BARNDAKSA_PATCH_BACKUPS', `features-tsc-final-fix-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function fail(message) {
  console.error(`\n[${patchName}] ${message}`);
  process.exit(1);
}

function ensureFile(file) {
  if (!fs.existsSync(file)) fail(`لم أجد الملف المطلوب: ${path.relative(root, file)}`);
}

function backupFile(file) {
  const rel = path.relative(root, file);
  const dest = path.join(backupRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
}

function writeIfChanged(file, next) {
  const current = fs.readFileSync(file, 'utf8');
  if (current === next) return false;
  backupFile(file);
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

ensureFile(target);
let src = fs.readFileSync(target, 'utf8');
let next = src;

// 1) اجعل useCafeThemePage يرجع features داخل صفحة الثيم نفسها.
next = next.replace(
  'const { theme, settings, previewThemeId, loadError: cafeLoadError } = useCafeThemePage(slug);',
  'const { theme, settings, previewThemeId, loadError: cafeLoadError, features } = useCafeThemePage(slug);'
);

// 2) أضف دالة صلاحيات آمنة مرة واحدة بعد loadError.
if (!next.includes('const featureList = Array.isArray(features) ? features : [];')) {
  next = next.replace(
    '  const loadError = cafeLoadError || menuError;\n',
    '  const loadError = cafeLoadError || menuError;\n  const featureList = Array.isArray(features) ? features : [];\n  const hasFeature = (feature: string) => !featureList.length || featureList.includes("all") || featureList.includes(feature);\n'
  );
}

// 3) استبدل شروط features المكشوفة بشروط آمنة.
next = next.replace(
  /features\.includes\("loyalty"\) \|\| features\.includes\("all"\) \|\| !features\.length/g,
  'hasFeature("loyalty")'
);
next = next.replace(
  /features\.includes\("experience_reviews"\) \|\| features\.includes\("all"\) \|\| !features\.length/g,
  'hasFeature("experience_reviews")'
);

// 4) لو بقيت أي features مكشوفة في الملف بعد الإصلاح نوقف بدل ما نترك build ينكسر.
if (!next.includes('const { theme, settings, previewThemeId, loadError: cafeLoadError, features } = useCafeThemePage(slug);')) {
  fail('لم أستطع إضافة features إلى useCafeThemePage. أرسل الملف components/cafe/themes/cafe-page-client.tsx إذا تكرر الخطأ.');
}
if (next.match(/\{features\.includes\(|\| \| !features\.length/)) {
  fail('بقيت شروط features قديمة داخل الملف، لم أكتب أي تعديل.');
}

const changed = writeIfChanged(target, next);
console.log(`\n[${patchName}] تم ${changed ? 'إصلاح' : 'تأكيد سلامة'}: components/cafe/themes/cafe-page-client.tsx`);
console.log(`[${patchName}] انتهى. شغل الآن: npm exec tsc -- --noEmit ثم npm run build\n`);
