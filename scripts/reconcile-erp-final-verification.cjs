'use strict';
// Reuse successful application checks only against unchanged actual inputs.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const dir = 'output/integrated-system', baselinePath = `${dir}/erp-final-verification.json`;
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]) : [];
const roots = ['app','components','lib','types','public/fonts'];
const configs = ['package.json','package-lock.json','next.config.ts','tsconfig.json','next-env.d.ts','postcss.config.mjs','eslint.config.mjs','scripts/check-erp-navigation-coverage.cjs','scripts/verify-erp-final.cjs'];
const relevant = file => roots.some(root => file.startsWith(root+'/')) || configs.includes(file);
const currentFiles = [...roots.flatMap(walk), ...configs.filter(f=>fs.existsSync(f))];
const files = [...new Set([...currentFiles,...Object.keys(baseline.inputs).filter(relevant)])].sort();
const changed = files.filter(file => !fs.existsSync(file) || digest(file)!==baseline.inputs[file]);
if (changed.length) throw Error('Application input changes require affected verification: '+changed.join(', '));
if (process.version !== baseline.runtime) throw Error('Runtime changed');
for (const name of ['typescript','lint','navigation','build']) {
 const check = baseline.checks.find(x=>x.name===name);
 if (!check || check.exitCode!==0 || digest(check.log)!==check.logSha256) throw Error('Invalid application check evidence '+name);
}
const integrityPath = `${dir}/erp-applied-source-integrity.json`, integrity = JSON.parse(fs.readFileSync(integrityPath,'utf8'));
if (!integrity.passed || integrity.count<68) throw Error('Final live migration integrity missing');
for (const row of integrity.results) if (md5(`supabase/migrations/${row.file}`)!==row.appliedMd5) throw Error('Applied SQL changed '+row.file);
const local = fs.readdirSync('supabase/migrations').filter(file=>/^20261113\d+_(erp_|brand_account_cancellation)/.test(file));
const unapplied = local.filter(file=>!integrity.results.some(row=>row.file===file));
if (unapplied.length) throw Error('Unapplied scope migrations '+unapplied.join(', '));
const handoffs = ['ابدأ-هنا-تسليم-خريطة-النظام.md','docs/BARNDAKSA_HANDOFF/ERP_CURRENT_EXECUTION_20261113.md'];
const missingLinks = [];
for (const file of handoffs) for (const match of fs.readFileSync(file,'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
 const target=match[1].split('#')[0];
 if (target && !/^https?:/.test(target) && !fs.existsSync(path.resolve(path.dirname(file),decodeURIComponent(target)))) missingLinks.push({file,target});
}
if (missingLinks.length) throw Error('Missing handoff link '+JSON.stringify(missingLinks));
const startedAt = new Date().toISOString();
const text = cp.spawnSync(process.execPath,['scripts/check-text-integrity.mjs'],{encoding:'utf8',windowsHide:true});
const log=`${dir}/final-reconciled-text.log`;fs.writeFileSync(log,(text.stdout||'')+(text.stderr||''));
if (text.status!==0) throw Error('Final text integrity failed: '+log);
const endFiles=[...new Set([...roots.flatMap(walk),...configs.filter(f=>fs.existsSync(f))])].sort();
if(JSON.stringify(endFiles)!==JSON.stringify(files)||endFiles.some(file=>digest(file)!==baseline.inputs[file]))throw Error('Application changed during reconciliation');
const report={passed:true,at:new Date().toISOString(),runtime:process.version,applicationInputsUnchanged:true,applicationInputs:Object.fromEntries(files.map(file=>[file,digest(file)])),reusedFrom:baselinePath,originalWrapperPassed:baseline.passed,originalChangedInputs:baseline.changedDuringChecks,reusedChecks:baseline.checks.filter(x=>['typescript','lint','navigation','build'].includes(x.name)),database:{source:integrityPath,sha256:digest(integrityPath),count:integrity.count,checkedAt:integrity.at,localScopeMigrationsAllApplied:true},text:{startedAt,finishedAt:new Date().toISOString(),exitCode:text.status,log,sha256:digest(log)},handoffLinksValid:true,handoffInputs:Object.fromEntries(handoffs.map(file=>[file,digest(file)])),published:false,explanation:'Original wrapper correctly reported a concurrent SQL change. Application files, dependencies, configuration, verification commands and runtime match all successful checks; final applied SQL independently matches live history and current source. Text and handoff links checked again.'};
fs.writeFileSync(`${dir}/erp-final-reconciled-verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,reusedApplicationChecks:report.reusedChecks.length,appliedMigrations:integrity.count,textPassed:true,handoffLinksValid:true,published:false}));
