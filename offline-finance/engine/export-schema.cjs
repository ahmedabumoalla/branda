// Read-only pg_catalog schema export. Never exports business rows or credentials.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'output/erp-database/offline-finance-schema-read.sql');
const sql=fs.readFileSync(file,'utf8');if(!sql.startsWith('-- Read-only DDL export'))throw Error('Unexpected query');
const env={...process.env};delete env.SUPABASE_ACCESS_TOKEN;
const startedAt=new Date().toISOString();const r=cp.spawnSync('C:/Users/pc/AppData/Local/npm-cache/_npx/91eb58246759989d/node_modules/@supabase/cli-windows-x64/bin/supabase.exe',['db','query','--linked','--project-ref','kpguwjfkkylrdlvzeezz','--file',file,'--output','json'],{cwd:os.tmpdir(),env,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
if(r.status!==0||r.error)throw Error(r.error?.code||r.stderr);
const data=JSON.parse(r.stdout).rows[0].schema;fs.mkdirSync(path.join(__dirname,'schema'),{recursive:true});
const destination=path.join(__dirname,'schema/finance-schema.json');fs.writeFileSync(destination,JSON.stringify(data,null,2));
const evidence={startedAt,finishedAt:new Date().toISOString(),querySha256:crypto.createHash('sha256').update(sql).digest('hex'),sha256:crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex'),tables:data.tables.length,functions:data.functions.length,scope:'pg_catalog DDL only, finance and existing ERP wrapper dependencies, no business rows'};
fs.writeFileSync(path.join(__dirname,'schema/provenance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
