const fs = require('fs');
const path = require('path');

const project = process.cwd();
const patchRoot = __dirname;
const filesRoot = path.join(patchRoot, 'files');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function backup(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  fs.copyFileSync(filePath, `${filePath}.bak-${stamp}`);
}

function copyPatchFile(rel) {
  const src = path.join(filesRoot, ...rel.split('/'));
  const dest = path.join(project, ...rel.split('/'));
  if (!fs.existsSync(src)) throw new Error(`Missing patch file: ${rel}`);
  ensureDir(dest);
  backup(dest);
  fs.copyFileSync(src, dest);
  console.log(`COPIED ${rel}`);
}

function replaceInFile(rel, replacements) {
  const file = path.join(project, ...rel.split('/'));
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${rel}`);
    return;
  }
  backup(file);
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    content = content.replace(from, to);
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log(`UPDATED ${rel}`);
}

copyPatchFile('lib/payments/paymob.ts');
copyPatchFile('app/api/payments/subscription/paymob/create-intention/route.ts');
copyPatchFile('components/payments/barndaksa-card-payment-button.tsx');

replaceInFile('lib/data/subscription.ts', [
  [/\.in\("status", \["active", "trialing", "paid"\]\)/g, '.in("status", ["active", "trialing"])'],
  [/return \(data \?\? \[\]\)\.map\(mapDbRowToRecord\);/g, 'return (data ?? []).map(mapDbRowToRecord).filter((record) => record.paymentStatus !== "pending");'],
]);

replaceInFile('components/dashboard/pages/subscription-page.tsx', [
  [/pending: "بانتظار الدفع",/g, 'pending: "لم يكتمل الدفع",'],
  [/"لديك باقة بانتظار الدفع"/g, '"اختر طريقة الدفع لإكمال الاشتراك"'],
  [/"اختيار والمتابعة للفاتورة"/g, '"اختيار الباقة"'],
  [/لن يتم تغيير الباقة الحالية \(\{activePlan\?\.name\}\) حتى تضغط «الدفع وتفعيل\s*الباقة» وتنجح العملية\./g, 'لن يتم تغيير الباقة الحالية ({activePlan?.name}) إلا بعد إتمام الدفع بنجاح.'],
]);

const paymobContent = fs.readFileSync(path.join(project, 'lib', 'payments', 'paymob.ts'), 'utf8');
const buttonContent = fs.readFileSync(path.join(project, 'components', 'payments', 'barndaksa-card-payment-button.tsx'), 'utf8');
const routeContent = fs.readFileSync(path.join(project, 'app', 'api', 'payments', 'subscription', 'paymob', 'create-intention', 'route.ts'), 'utf8');

if (!paymobContent.includes('normalizePaymobPaymentMethodChoice') || !paymobContent.includes('payment_methods: paymentMethods')) {
  throw new Error('VERIFY FAILED: paymob.ts was not updated correctly');
}
if (!buttonContent.includes('مدى / Visa / Mastercard') || !buttonContent.includes('Apple Pay') || !buttonContent.includes('PayPal')) {
  throw new Error('VERIFY FAILED: payment method buttons were not updated correctly');
}
if (!routeContent.includes('paymentMethod') || !routeContent.includes('getPaymobPaymentMethodLabel')) {
  throw new Error('VERIFY FAILED: create-intention route was not updated correctly');
}

console.log('DONE');
console.log('VERIFIED');
