const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'lib', 'data', 'subscription.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR target missing lib/data/subscription.ts');
  process.exit(1);
}

const before = fs.readFileSync(target, 'utf8');
const backup = target + '.bak-paid-enum-' + new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(backup, before, 'utf8');

let after = before;

// Remove invalid Postgres enum value "paid" from Supabase filters.
// The UI may map active/trialing to paid, but DB enum does not contain paid.
after = after.replace(/\.in\((['"]status['"]),\s*\[\s*['"]active['"]\s*,\s*['"]trialing['"]\s*,\s*['"]paid['"]\s*\]\s*\)/g, '.in($1, ["active", "trialing"])');
after = after.replace(/\.in\((['"]status['"]),\s*\[\s*['"]paid['"]\s*,\s*['"]active['"]\s*,\s*['"]trialing['"]\s*\]\s*\)/g, '.in($1, ["active", "trialing"])');
after = after.replace(/\.in\((['"]status['"]),\s*\[\s*['"]active['"]\s*,\s*['"]paid['"]\s*,\s*['"]trialing['"]\s*\]\s*\)/g, '.in($1, ["active", "trialing"])');

if (after === before) {
  console.log('NO_CHANGE');
} else {
  fs.writeFileSync(target, after, 'utf8');
  console.log('DONE');
}

const finalText = fs.readFileSync(target, 'utf8');
if (finalText.includes('["active", "trialing", "paid"]') || finalText.includes('["active","trialing","paid"]') || finalText.includes("['active', 'trialing', 'paid']") || finalText.includes("['active','trialing','paid']")) {
  console.error('ERROR paid enum value still exists in subscription DB filters');
  process.exit(1);
}

console.log('VERIFIED');
console.log('Backup ' + backup);
