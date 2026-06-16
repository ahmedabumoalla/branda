const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}
function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, `${file}.bak-status-enum-${stamp}`);
}
function mustFile(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error(`MISSING ${rel}`);
    process.exit(1);
  }
  return file;
}

const targets = [
  'lib/data/subscription.ts',
  'lib/data/finance.ts',
].map(mustFile);

let changed = [];

for (const file of targets) {
  const original = read(file);
  let next = original;

  // Supabase enum public.subscription_status allows:
  // trialing, active, past_due, cancelled, expired
  // It does NOT allow "paid". UI can still map active/trialing to paymentStatus="paid".
  next = next.replace(/\.in\(\s*(['\"])status\1\s*,\s*\[\s*(['\"])active\2\s*,\s*(['\"])trialing\3\s*,\s*(['\"])paid\4\s*\]\s*\)/g, '.in("status", ["active", "trialing"])');
  next = next.replace(/\.in\(\s*(['\"])status\1\s*,\s*\[\s*(['\"])trialing\2\s*,\s*(['\"])active\3\s*,\s*(['\"])paid\4\s*\]\s*\)/g, '.in("status", ["trialing", "active"])');
  next = next.replace(/\[\s*(['\"])active\1\s*,\s*(['\"])trialing\2\s*,\s*(['\"])paid\3\s*\]\.includes\(String\(([^)]+)\)\)/g, '["active", "trialing"].includes(String($4))');
  next = next.replace(/\[\s*(['\"])trialing\1\s*,\s*(['\"])active\2\s*,\s*(['\"])paid\3\s*\]\.includes\(String\(([^)]+)\)\)/g, '["trialing", "active"].includes(String($4))');

  if (next !== original) {
    backup(file);
    write(file, next);
    changed.push(path.relative(root, file));
  }
}

const subscription = read(path.join(root, 'lib/data/subscription.ts'));
if (subscription.includes('.in("status", ["active", "trialing", "paid"])') || subscription.includes(".in('status', ['active', 'trialing', 'paid'])")) {
  console.error('FAILED: lib/data/subscription.ts still queries subscription_status with paid');
  process.exit(1);
}

try {
  fs.rmSync(path.join(root, '.next'), { recursive: true, force: true });
} catch {}

console.log('DONE');
console.log('VERIFIED');
console.log('Changed files:');
for (const file of changed) console.log(`- ${file}`);
if (!changed.length) console.log('- no file changed because fix was already applied');
