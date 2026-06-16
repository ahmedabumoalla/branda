const fs = require('fs');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const target = path.join(root, 'components', 'loyalty', 'barcode-camera-scanner.tsx');

if (!fs.existsSync(target)) {
  console.error(`Target file not found: ${target}`);
  process.exit(1);
}

const original = fs.readFileSync(target, 'utf8');
let next = original;

// Fix build failure on Vercel/Node typings where ReturnType<typeof setTimeout> or NodeJS.Timeout resolves to Timeout,
// while window.setTimeout returns number in the browser.
next = next.replace(/let\s+timer\s*:\s*NodeJS\.Timeout\s*\|\s*null\s*=\s*null\s*;/g, 'let timer: number | null = null;');
next = next.replace(/let\s+timer\s*:\s*ReturnType<\s*typeof\s+setTimeout\s*>\s*\|\s*null\s*=\s*null\s*;/g, 'let timer: number | null = null;');
next = next.replace(/let\s+timer\s*:\s*ReturnType<\s*typeof\s+window\.setTimeout\s*>\s*\|\s*null\s*=\s*null\s*;/g, 'let timer: number | null = null;');

// If a different timer variable declaration still exists, normalize only the obvious one in this scanner file.
next = next.replace(/let\s+timer\s*:\s*[^;\n]+\|\s*null\s*=\s*null\s*;/g, 'let timer: number | null = null;');

if (next === original) {
  // If no declaration was changed, still verify whether the file already has the expected type.
  if (!/let\s+timer\s*:\s*number\s*\|\s*null\s*=\s*null\s*;/.test(original)) {
    console.error('Could not find timer declaration to fix in components/loyalty/barcode-camera-scanner.tsx');
    process.exit(1);
  }
  console.log('No changes needed; timer is already typed as number | null.');
  process.exit(0);
}

const backup = `${target}.bak-timeout-type-${Date.now()}`;
fs.writeFileSync(backup, original, 'utf8');
fs.writeFileSync(target, next, 'utf8');
console.log('Fixed: components/loyalty/barcode-camera-scanner.tsx');
console.log(`Backup: ${path.relative(root, backup)}`);
