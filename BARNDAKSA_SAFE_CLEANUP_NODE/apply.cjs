const fs = require('fs');
const path = require('path');

const root = process.cwd();
const forceRootName = 'branda-platform';

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function sizeOf(p) {
  if (!exists(p)) return 0;
  const st = fs.statSync(p);
  if (st.isFile()) return st.size;
  if (!st.isDirectory()) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(p)) total += sizeOf(path.join(p, entry));
  return total;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const protectedRootNames = new Set([
  'app', 'components', 'lib', 'public', 'supabase', 'scripts', 'types', 'docs',
  'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
  'postcss.config.mjs', 'eslint.config.mjs', 'proxy.ts', '.env', '.env.local',
  '.env.production', '.env.development', '.gitignore', 'next-env.d.ts'
]);

const removeRootItems = [
  '.barndaksa-patch-backups',
  'audit-output',
  'paymob_final_fix_patch',
  'BARNDAKSA_ADMIN_CONTENT_PERSISTENCE_PATCH',
  'BARNDAKSA_CUSTOMER_LOGIN_LOGO_REMOVE_PATCH',
  'BARNDAKSA_FIX_CUSTOMER_LOGIN_MOJIBAKE_TEXT_PATCH',
  'BARNDAKSA_LOGIN_CORNER_LOGO_REMOVE_PATCH',
  'BARNDAKSA_LOGIN_RIGHT_PANEL_GHOST_LOGO_REMOVE_PATCH',
  'BARNDAKSA_LOYALTY_CARD_SCAN_ONLY_PATCH',
  'BARNDAKSA_LOYALTY_PURCHASE_COUNT_FINAL_FIX_PATCH',
  'BARNDAKSA_LOYALTY_QR_READER_STABLE_PATCH',
  'BARNDAKSA_LOYALTY_QR_READER_TIMEOUT_TYPE_FIX_PATCH',
  'BARNDAKSA_LOYALTY_QR_TIMEOUT_FINAL_FIX_PATCH',
  'BARNDAKSA_NEXT_CONFIG_SERVER_ACTIONS_FIX_PATCH',
  'BARNDAKSA_PAYMENT_METHOD_SELECTION_NODE',
  'BARNDAKSA_PAYMOB_NODE_ROUTE_FIX',
  'BARNDAKSA_PAYMOB_SQL',
  'BARNDAKSA_PUBLIC_CAFE_FINAL_FIX_V2_PATCH',
  'BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH',
  'BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH_V2',
  'BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH_V3',
  'BARNDAKSA_SUBSCRIPTION_NO_PENDING_HISTORY_NODE',
  'BARNDAKSA_SUBSCRIPTION_PAID_ENUM_FINAL_NODE',
  'BARNDAKSA_SUBSCRIPTION_STATUS_ENUM_FIX_NODE',
  'APPLY_BARNDAKSA_PUBLIC_CAFE_FIX.ps1',
  'APPLY_BARNDAKSA_PUBLIC_CAFE_FIX_V2.ps1',
  'APPLY_RESTORE_PUBLIC_CAFE_STABLE.ps1',
  'DELETE_OLD_THEMES.ps1',
  'BARNDAKSA_PATCH_MANIFEST.txt',
  'BARNDAKSA_STABILITY_RECOVERY_NOTES.md',
  'README_FIX.md',
  'README_FIX_V2.md',
  'ENV_KEYS_ONLY_SAFE.txt',
  'next.config.ts.bak-before-upload-limit-fix',
  'next.config.ts.bak-remove-invalid-serveractions',
  'next.config.ts.bak-server-action-upload-limit-v2',
  'tsconfig.tsbuildinfo'
];

function assertSafeName(name) {
  if (name.includes('/') || name.includes('\\')) throw new Error(`Refusing nested path: ${name}`);
  if (name === '.' || name === '..' || name.trim() === '') throw new Error(`Bad path: ${name}`);
  if (protectedRootNames.has(name)) throw new Error(`Refusing protected item: ${name}`);
  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`Refusing outside root: ${name}`);
  return resolved;
}

console.log('BARNDAKSA SAFE CLEANUP');
console.log(`Project: ${root}`);

const found = [];
for (const name of removeRootItems) {
  const target = assertSafeName(name);
  if (exists(target)) found.push({ name, target, bytes: sizeOf(target) });
}

if (found.length === 0) {
  console.log('Nothing to delete. Project is already clean.');
  console.log('DONE');
  return;
}

console.log('Deleting only safe temporary root items:');
for (const item of found) console.log(`- ${item.name} (${fmt(item.bytes)})`);

let total = 0;
for (const item of found) {
  fs.rmSync(item.target, { recursive: true, force: true });
  total += item.bytes;
}

const reportName = `cleanup-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const report = [
  'Barndaksa safe cleanup report',
  `Date: ${new Date().toISOString()}`,
  `Project: ${root}`,
  `Deleted items: ${found.length}`,
  `Approx freed: ${fmt(total)}`,
  '',
  ...found.map((i) => `${i.name} | ${fmt(i.bytes)}`),
  '',
  'Protected and NOT touched: app, components, lib, public, supabase, scripts, docs, package.json, env files, config files.'
].join('\n');
fs.writeFileSync(path.join(root, reportName), report, 'utf8');

console.log(`Deleted items: ${found.length}`);
console.log(`Approx freed: ${fmt(total)}`);
console.log(`Report: ${reportName}`);
console.log('DONE');
console.log('Now run: npm run build');
