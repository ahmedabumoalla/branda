const fs = require('fs');
const path = require('path');

const root = process.cwd();
const patchDir = __dirname;
const files = [
  'BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL_FIXED.sql',
  'BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL.sql',
];

const backupDir = path.join(root, 'BARNDAKSA_PATCH_BACKUPS', `plans-db-return-type-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(backupDir, { recursive: true });

for (const file of files) {
  const src = path.join(patchDir, file);
  const dest = path.join(root, file);
  if (fs.existsSync(dest)) {
    fs.copyFileSync(dest, path.join(backupDir, file));
  }
  fs.copyFileSync(src, dest);
  console.log(`wrote ${file}`);
}

console.log('\nتم تجهيز SQL المصحح. شغل هذا الملف في Supabase SQL Editor:');
console.log('BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL_FIXED.sql');
