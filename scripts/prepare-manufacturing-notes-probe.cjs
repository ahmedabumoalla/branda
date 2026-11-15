'use strict';
const fs = require('node:fs'), crypto = require('node:crypto');
const file = 'supabase/migrations/20261113171653_erp_manufacturing_notes.sql';
const source = fs.readFileSync(file, 'utf8');
const cases = fs.readFileSync('scripts/manufacturing-notes-live-cases.sql', 'utf8');
if (!/^BEGIN;/m.test(source) || !/COMMIT;\s*$/.test(source) || !/ROLLBACK;\s*$/.test(cases)) throw Error('Transaction boundaries missing');
fs.mkdirSync('output/erp-database', { recursive: true });
fs.writeFileSync('output/erp-database/manufacturing-notes-live-probe.sql', source.replace(/COMMIT;\s*$/, '') + '\n' + cases);
console.log(JSON.stringify({ file, md5: crypto.createHash('md5').update(source).digest('hex') }));
