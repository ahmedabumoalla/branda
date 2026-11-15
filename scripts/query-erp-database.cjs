'use strict';
// Explicit SQL file runner for reviewed ERP probes. Credentials are never logged.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.resolve(root,process.argv[2]||''),directory=path.join(root,'output','erp-database');
if(path.dirname(file)!==directory||!file.endsWith('.sql'))throw Error('Use a reviewed SQL file in output/erp-database');
const project=JSON.parse(fs.readFileSync(path.join(root,'supabase/.temp/linked-project.json'),'utf8')).ref;
if(project!=='kpguwjfkkylrdlvzeezz')throw Error('Unexpected linked project');
const source=fs.readFileSync(file,'utf8'),env={...process.env};delete env.SUPABASE_ACCESS_TOKEN;
const startedAt=new Date().toISOString();
const r=cp.spawnSync('C:/Users/pc/AppData/Local/npm-cache/_npx/91eb58246759989d/node_modules/@supabase/cli-windows-x64/bin/supabase.exe',['db','query','--linked','--project-ref',project,'--file',file,'--output','json'],{cwd:os.tmpdir(),env,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
const result={startedAt,finishedAt:new Date().toISOString(),project,file:path.relative(root,file),sha256:crypto.createHash('sha256').update(source).digest('hex'),exitCode:r.status,error:r.error?.code||null,stdout:r.stdout,stderr:r.stderr};
fs.writeFileSync(file.replace(/\.sql$/,'.result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({file:path.relative(root,file),exitCode:r.status,error:result.error,stdout:r.stdout,stderr:r.stderr}));process.exitCode=r.status===0&&!r.error?0:1;
