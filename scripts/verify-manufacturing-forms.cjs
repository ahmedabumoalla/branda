'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const directory='output/integrated-system';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const previous=JSON.parse(fs.readFileSync(`${directory}/manufacturing-forms-ui-ssr-verification.json`,'utf8'));
const sources=[...new Set([...Object.keys(previous.inputs).map(p=>p.replaceAll('\\','/')),
 'app/actions/erp-manufacturing-forms.ts','lib/data/erp-manufacturing.ts','lib/erp/files.ts','lib/erp/branches.ts','lib/platform/action-result.ts',
 'components/erp/manufacturing/manufacturing-workspace.tsx','components/erp/manufacturing/manufacturing.module.css',
 'components/erp/manufacturing/manufacturing-note.tsx','components/erp/fields/fields.module.css','components/erp/files.tsx',
 'supabase/migrations/20261113171648_erp_manufacturing_forms.sql','scripts/manufacturing-forms-live-cases.sql',
 'scripts/check-manufacturing-forms-ui.cjs','scripts/verify-manufacturing-forms.cjs','eslint.config.mjs',
 'docs/BARNDAKSA_HANDOFF/ERP_MANUFACTURING_FORMS_20261113.md',
])].filter(p=>fs.existsSync(p)).sort();
const inputs=()=>Object.fromEntries(sources.map(p=>[p,hash(p)]));
const report={startedAt:new Date().toISOString(),runtime:process.version,inputs:inputs(),checks:[],database:{candidateApplied:false,probe:'output/erp-database/manufacturing-forms-live-probe.result.json',cleanup:'output/erp-database/manufacturing-forms-rollback-readback.result.json'}};
const lint=['app/actions/erp-manufacturing-forms.ts','lib/data/erp-manufacturing.ts','lib/erp/manufacturing.ts','lib/erp/manufacturing-forms.ts','lib/erp/files.ts','components/erp/manufacturing/manufacturing-forms.tsx','components/erp/manufacturing/manufacturing-settings.tsx','components/erp/manufacturing/manufacturing-workspace.tsx'];
for(const [name,args] of [['ui',['scripts/check-manufacturing-forms-ui.cjs']],['lint',['node_modules/eslint/bin/eslint.js',...lint]],['text',['scripts/check-text-integrity.mjs']]]){
 const startedAt=new Date().toISOString(),result=cp.spawnSync(process.execPath,args,{windowsHide:true,encoding:'utf8'}),log=`${directory}/manufacturing-forms-${name}.log`;
 fs.writeFileSync(log,(result.stdout||'')+(result.stderr||''));
 report.checks.push({name,command:[process.execPath,...args],startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,log,sha256:hash(log)});
 console.log(JSON.stringify({name,exitCode:result.status,log}));
}
const after=inputs();report.changedDuringChecks=sources.filter(p=>report.inputs[p]!==after[p]);report.passed=report.changedDuringChecks.length===0&&report.checks.every(c=>c.exitCode===0);report.finishedAt=new Date().toISOString();
fs.writeFileSync(`${directory}/manufacturing-forms-verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,changedDuringChecks:report.changedDuringChecks}));if(!report.passed)process.exitCode=1;
