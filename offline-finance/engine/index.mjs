import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const ident=value=>'"'+String(value).replaceAll('"','""')+'"';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const qualified=t=>ident(t.schema)+'.'+ident(t.name);
const scalar=result=>result.rows.length?Object.values(result.rows[0])[0]:null;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function createEngine({dataDir,modulePath=process.env.PGLITE_MODULE,loadDataDir}={}){
 if(!dataDir)throw Error('Local database directory is required');
 if(loadDataDir){let entries;try{entries=await fs.readdir(dataDir);}catch(error){if(error.code!=='ENOENT')throw error;entries=[];}if(entries.length)throw Error('Archive import requires a new or empty directory');}
 let PGlite;
 if(modulePath)({PGlite}=await import(pathToFileURL(modulePath).href));
 else {try{({PGlite}=await import('@electric-sql/pglite'));}catch{({PGlite}=await import(pathToFileURL(path.join(os.tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href));}}
 await fs.mkdir(dataDir,{recursive:true});
 const {citext}=await import('@electric-sql/pglite/contrib/citext');
 const {pgcrypto}=await import('@electric-sql/pglite/contrib/pgcrypto');
 const {uuid_ossp}=await import('@electric-sql/pglite/contrib/uuid_ossp');
 const db=new PGlite({dataDir:path.join(dataDir,'postgres'),loadDataDir,extensions:{citext,pgcrypto,uuid_ossp}});
 await db.waitReady;
 const exists=scalar(await db.query("SELECT to_regclass('public.local_finance_meta') IS NOT NULL"));
 if(!exists){try{await db.transaction(tx=>bootstrap(tx));}catch(error){await db.close();throw error;}}
 const meta=scalar(await db.query('SELECT value FROM public.local_finance_meta WHERE key=$1',['identity']));
 let identity=meta;
 let pending=Promise.resolve();
 const serial=work=>{const result=pending.then(work);pending=result.catch(()=>{});return result;};
 async function querySystem(sql,params=[]){return serial(()=>db.query(sql,params));}
 async function queryAs(userId,sql,params=[]){
  if(!UUID.test(userId||''))throw Error('A local user identity is required');
  return serial(()=>db.transaction(async tx=>{
   await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[userId]);
   await tx.exec('SET LOCAL ROLE authenticated');
   return tx.query(sql,params);
  }));
 }
 async function rpc(userId,name,args={}){
  if(!/^(brand_finance_|erp_)[a-z0-9_]+$/.test(name))throw Error('Unsupported local RPC');
  const keys=Object.keys(args);if(keys.some(k=>!/^p_[a-z0-9_]+$/.test(k)))throw Error('Invalid RPC arguments');
  const sql=`SELECT public.${ident(name)}(${keys.map((k,i)=>`${ident(k)} => $${i+1}`).join(',')}) AS result`;
  return scalar(await queryAs(userId,sql,keys.map(k=>args[k])));
 }
 async function actorInfo(userId){
  if(!identity)return null;
  const user=(await querySystem('SELECT u.id,u.email,p.full_name AS name FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=$1 AND p.status=$2',[userId,'active'])).rows[0];
  if(!user)return null;
  const cafe=await rpc(userId,'brand_finance_context',{p_slug:identity.slug});
  return {...user,cafeId:cafe.id,cafe:{...cafe,businessCategory:cafe.businessCategory??'butcher_shops'},role:cafe.role};
 }
 async function setupOwner({id=crypto.randomUUID(),email,name,company,cafeId=crypto.randomUUID(),slug='local-finance',businessCategory='butcher_shops'}){
  if(identity)throw Error('The local company is already initialized');
  if(!UUID.test(id)||!UUID.test(cafeId))throw Error('Invalid local identifiers');
  const next={ownerId:id,cafeId,slug};
  await serial(()=>db.transaction(async tx=>{
   if(identity)throw Error('The local company is already initialized');
   await tx.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,email]);
   await tx.query("INSERT INTO public.profiles(id,full_name,role,status) VALUES($1,$2,'cafe_owner','active')",[id,name]);
   await tx.query("INSERT INTO public.cafes(id,slug,name,owner_user_id,status,business_category) VALUES($1,$2,$3,$4,'active',$5)",[cafeId,slug,company,id,businessCategory]);
   await tx.query('INSERT INTO public.cafe_settings(cafe_id) VALUES($1)',[cafeId]);
   await tx.query('INSERT INTO public.local_finance_meta(key,value) VALUES($1,$2)',['identity',next]);
   await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
   await tx.exec('SET LOCAL ROLE authenticated');
   await tx.query('SELECT public.brand_finance_snapshot($1)',[cafeId]);
   await tx.exec('RESET ROLE');
   await tx.query('INSERT INTO brand_finance_private.gl_rollout(cafe_id,enabled) VALUES($1,true) ON CONFLICT(cafe_id) DO UPDATE SET enabled=true',[cafeId]);
  }));
  identity=next;
  return actorInfo(id);
 }
 async function provisionUser({id=crypto.randomUUID(),email,name,role='cashier',active=true}){
  if(!identity)throw Error('Set up the local company first');
  if(!UUID.test(id)||!['manager','cashier','accountant','warehouse','auditor'].includes(role))throw Error('Invalid local user role');
  if(id===identity.ownerId)throw Error('Owner role cannot be reassigned');
  await serial(()=>db.transaction(async tx=>{
   await tx.query('INSERT INTO auth.users(id,email) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET email=excluded.email',[id,email]);
   await tx.query("INSERT INTO public.profiles(id,full_name,role,status) VALUES($1,$2,'customer',$3) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,status=excluded.status",[id,name,active?'active':'suspended']);
   await tx.query('INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cafe_id,user_id) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active',[identity.cafeId,id,name,role,active]);
  }));
  return {id,email,name,role,active,cafeId:identity.cafeId};
 }
 async function snapshot(userId){const result=await rpc(userId,'brand_finance_snapshot',{p_cafe_id:identity?.cafeId});result.ownerUserId=identity.ownerId;result.canManageCashiers=result.canAdminister;result.canResetBalances=false;return result;}
 async function execute(userId,{operation,payload={},requestId=crypto.randomUUID()}){return rpc(userId,'brand_finance_execute',{p_cafe_id:identity?.cafeId,p_operation:operation,p_payload:payload,p_request_id:requestId});}
 return {querySystem,queryAs,rpc,actorInfo,setupOwner,provisionUser,snapshot,execute,identity:()=>identity,exportArchive:()=>serial(async()=>{await db.exec('CHECKPOINT');await db.syncToFs();return db.dumpDataDir('gzip');}),close:()=>serial(()=>db.close())};
}

async function bootstrap(db){
 const schema=JSON.parse(await fs.readFile(path.join(here,'schema/finance-schema.json'),'utf8'));
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA extensions;CREATE SCHEMA platform_access_private;
 CREATE EXTENSION citext;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'role',auth.role()) $$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 SET check_function_bodies=false;
 `);
 const namespaces=new Set([...schema.tables.map(t=>t.schema),...schema.functions.map(f=>f.schema),...(schema.enums||[]).map(e=>e.schema),'brand_cancellation_private']);
 for(const namespace of namespaces)await db.exec(`CREATE SCHEMA IF NOT EXISTS ${ident(namespace)}`);
 for(const type of schema.enums||[])await db.exec(`CREATE TYPE ${qualified(type)} AS ENUM (${type.values.map(literal).join(',')})`);
 const identitySequences=new Set(schema.tables.flatMap(t=>t.columns.filter(c=>c.identity).map(c=>t.schema+'.'+t.name+'_'+c.name+'_seq')));
 for(const sequence of schema.sequences||[])if(!identitySequences.has(sequence.schema+'.'+sequence.name))await db.exec(`CREATE SEQUENCE ${qualified(sequence)} AS ${sequence.type}`);
 for(const table of schema.tables){
  const columns=table.columns.map(c=>`${ident(c.name)} ${c.type}${c.identity?` GENERATED ${c.identity==='a'?'ALWAYS':'BY DEFAULT'} AS IDENTITY`:c.generated?` GENERATED ALWAYS AS (${c.default}) STORED`:''}${c.notNull?' NOT NULL':''}`);
  try{await db.exec(`CREATE TABLE ${qualified(table)} (${columns.join(',')})`);}catch(error){throw new Error('Create table '+qualified(table)+': '+error.message);}
 }
 for(const type of ['p','u','c'])for(const table of schema.tables)for(const constraint of table.constraints||[])if(constraint.type===type)try{await db.exec(`ALTER TABLE ${qualified(table)} ADD CONSTRAINT ${ident(constraint.name)} ${constraint.ddl}`);}catch(error){throw new Error('Constraint '+table.name+'.'+constraint.name+': '+error.message);}
 for(const table of schema.tables)for(const ddl of table.indexes||[])await db.exec(ddl);
 for(const table of schema.tables)for(const constraint of table.constraints||[])if(constraint.type==='f')try{await db.exec(`ALTER TABLE ${qualified(table)} ADD CONSTRAINT ${ident(constraint.name)} ${constraint.ddl}`);}catch(error){throw new Error('Constraint '+table.name+'.'+constraint.name+': '+error.message);}
 for(const f of schema.functions)try{await db.exec(f.ddl);}catch(error){throw new Error('Function '+f.identity+': '+error.message);}
 let pending=(schema.views||[]).filter(v=>schema.tables.some(t=>t.name===v.name));
 for(let pass=0;pending.length;pass++){const next=[];let lastError;for(const view of pending){try{await db.exec(`CREATE VIEW ${qualified(view)}${view.options?.length?' WITH ('+view.options.join(',')+')':''} AS ${view.ddl}`);}catch(error){lastError=error;next.push(view);}}if(next.length===pending.length)throw new Error('Views could not resolve: '+lastError.message);pending=next;}
 for(const table of schema.tables)for(const c of table.columns)if(c.default&&!c.identity&&!c.generated)await db.exec(`ALTER TABLE ${qualified(table)} ALTER COLUMN ${ident(c.name)} SET DEFAULT ${c.default}`);
 const financeTable=t=>t.name.startsWith('bf_')||t.name.startsWith('erp_')||t.schema!=='public';
 for(const table of schema.tables)for(const trigger of table.triggers||[]){
  if(!/^(brand_finance_private\.|erp_[a-z_]+\.|brand_cancellation_private\.|set_updated_at\()/.test(trigger.function))continue;
  if(!financeTable(table)&&!/(butcher|erp_|brand_finance|bf_)/.test(trigger.function))continue;
  try{await db.exec(trigger.functionDdl);await db.exec(trigger.ddl);}catch(error){throw new Error('Trigger '+table.name+'.'+trigger.name+': '+error.message);}
 }
 await db.exec(await fs.readFile(path.join(here,'local-boundary.sql'),'utf8'));
 for(const f of schema.functions){await db.exec(`REVOKE ALL ON FUNCTION ${f.identity} FROM PUBLIC,anon,authenticated,service_role`);if(f.authenticated)await db.exec(`GRANT EXECUTE ON FUNCTION ${f.identity} TO authenticated`);if(f.service)await db.exec(`GRANT EXECUTE ON FUNCTION ${f.identity} TO service_role`);}
 for(const table of schema.tables){
  if(!financeTable(table))continue;
  if(table.rls)await db.exec(`ALTER TABLE ${qualified(table)} ENABLE ROW LEVEL SECURITY`);
  if(table.force)await db.exec(`ALTER TABLE ${qualified(table)} FORCE ROW LEVEL SECURITY`);
  for(const p of table.policies||[]){const command={'*':'ALL',r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE'}[p.command];try{await db.exec(`CREATE POLICY ${ident(p.name)} ON ${qualified(table)} AS ${p.permissive?'PERMISSIVE':'RESTRICTIVE'} FOR ${command} TO ${p.roles.map(ident).join(',')}${p.using?' USING ('+p.using+')':''}${p.check?' WITH CHECK ('+p.check+')':''}`);}catch(error){throw new Error('Policy '+table.name+'.'+p.name+': '+error.message);}}
 }
 for(const g of schema.grants||[])if(/^(bf_|erp_)/.test(g.table))await db.exec(`GRANT ${g.privilege} ON ${ident(g.schema)}.${ident(g.table)} TO ${ident(g.role)}`);
 await db.exec('CREATE TABLE public.local_finance_meta(key text PRIMARY KEY,value jsonb NOT NULL);REVOKE ALL ON public.local_finance_meta FROM PUBLIC,anon,authenticated,service_role;');
 await db.query('INSERT INTO public.local_finance_meta VALUES($1,$2)',['schema',{version:1,initializedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex')}]);
}
