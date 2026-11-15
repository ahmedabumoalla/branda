// Explicit single-file application. Never pushes unrelated pending migrations.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const filename=process.argv[2];
if(!/^20261113\d{6}_erp_[a-z_]+\.sql$/.test(filename||'')&&filename!=='20261113145158_brand_account_cancellation.sql')throw Error('Choose an explicit current ERP or authorized brand cancellation migration');
const source=fs.readFileSync(path.join(root,'supabase/migrations',filename),'utf8');
const linked=JSON.parse(fs.readFileSync(path.join(root,'supabase/.temp/linked-project.json'),'utf8')).ref;
const env=fs.readFileSync(path.join(root,'.env.local'),'utf8');
const url=env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
if(!url||new URL(url).hostname!==linked+'.supabase.co'||linked!=='kpguwjfkkylrdlvzeezz')throw Error('Linked project and application target differ');
const version=filename.split('_')[0],name=filename.slice(15,-4),tag='$erp_source_'+version+'$';
if(source.includes(tag))throw Error('SQL literal delimiter collision');
const body=source.replace(/^\s*BEGIN;\s*/i,'').replace(/\s*COMMIT;\s*$/i,'');
const sql=`BEGIN;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='120s';\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN RAISE EXCEPTION 'Migration version already exists'; END IF; END $$;\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[${tag}${source}${tag}]);\nCOMMIT;\nSELECT version,name,md5(statements[1]) AS source_md5 FROM supabase_migrations.schema_migrations WHERE version='${version}';\n`;
const folder=path.join(root,'output/erp-database');fs.mkdirSync(folder,{recursive:true});
const prepared=path.join(folder,filename+'.apply.sql');fs.writeFileSync(prepared,sql);
const cli='C:/Users/pc/AppData/Local/npm-cache/_npx/91eb58246759989d/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
// Run outside the repository: its obsolete .env.local management token otherwise
// overrides the user's newly verified CLI login. No secrets are copied or logged.
const childEnv={...process.env};delete childEnv.SUPABASE_ACCESS_TOKEN;
const startedAt=new Date().toISOString();
const r=cp.spawnSync(cli,['db','query','--linked','--project-ref',linked,'--file',prepared,'--output','json'],{cwd:os.tmpdir(),env:childEnv,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
const result={startedAt,finishedAt:new Date().toISOString(),project:linked,file:filename,sha256:crypto.createHash('sha256').update(source).digest('hex'),md5:crypto.createHash('md5').update(source).digest('hex'),exitCode:r.status,error:r.error?.code||null,stdout:r.stdout,stderr:r.stderr};
fs.writeFileSync(path.join(folder,filename+'.result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({file:filename,exitCode:r.status,error:r.error?.code||null,stdout:r.stdout,stderr:r.stderr}));process.exitCode=r.status===0&&!r.error?0:1;
