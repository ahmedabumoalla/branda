const fs=require('node:fs');const migration='supabase/migrations/20261113153148_erp_sales_display_numbers.sql';
const source=fs.readFileSync(migration,'utf8').trim().replace(/^BEGIN;/,'').replace(/COMMIT;$/,'');
fs.writeFileSync('output/erp-database/sales-numbering-probe.sql','BEGIN;\nSET LOCAL statement_timeout=\'60s\';\n'+source+'\n'+fs.readFileSync('scripts/sales-display-numbers-cases.sql','utf8')+'\nROLLBACK;\n');
