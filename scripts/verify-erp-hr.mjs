import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const scan=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
const paths=['lib/erp/hr.ts','lib/data/erp-hr.ts','app/actions/erp-hr.ts',...scan('components/erp/hr'),...scan('app/dashboard/system/employees'),'lib/erp/organization.ts','components/erp/organization/organization-workspace.tsx','lib/erp/files.ts','app/actions/erp-files.ts','components/erp/files.tsx','lib/data/erp-assets-import.ts','supabase/migrations/20261113092500_erp_hr.sql','supabase/migrations/20261113083421_erp_organization.sql','supabase/migrations/20261113075342_erp_tasks.sql','supabase/migrations/20261113081149_erp_files.sql','scripts/check-erp-hr-db.mjs','scripts/verify-erp-hr.mjs','package.json','package-lock.json','tsconfig.json','next-env.d.ts'];
const fingerprint=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before=fingerprint(),startedAt=new Date().toISOString();
const commands=[['scripts/check-erp-hr-db.mjs'],['node_modules/typescript/bin/tsc','--noEmit','--pretty','false'],['node_modules/eslint/bin/eslint.js',...paths.filter(p=>/\.(ts|tsx)$/.test(p)&&p!=='next-env.d.ts')],['scripts/check-text-integrity.mjs']];
const checks=[];
for(const args of commands){const at=new Date().toISOString(),result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:20*1024*1024});checks.push({at,command:[process.execPath,...args],exitCode:result.status,stdout:result.stdout,stderr:result.stderr});console.log(JSON.stringify({command:args[0],exitCode:result.status,output:result.stdout?.slice(-2000),error:result.stderr?.slice(-1000)}));}
const after=fingerprint(),stable=JSON.stringify(before)===JSON.stringify(after),passed=stable&&checks.every(c=>c.exitCode===0);
writeFileSync('output/integrated-system/erp-hr-verification.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),runtime:process.version,passed,stable,inputs:after,checks,limits:['No browser inspection or application deployment','Database application and live checks recorded separately','Existing-account linking does not provision a new login','Attendance and custom permissions are separate integrations']},null,2));
process.exitCode=passed?0:1;
