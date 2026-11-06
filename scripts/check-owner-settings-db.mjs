import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
const migrationPath="supabase/migrations/20261106082023_owner_settings_atomic_name.sql";
const schemaPath="supabase/migrations/001_branda_production_schema.sql";
const migration=await readFile(migrationPath,"utf8"),schema=await readFile(schemaPath,"utf8");
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const q=(sql,args=[])=>db.query(sql,args);
const value=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0]??{})[0];
const results=[];
const check=(condition,message)=>{assert(condition,message);results.push(message);};
const denied=async(run,message,code)=>{await assert.rejects(run,error=>!code||error.code===code);results.push(message);};
const login=async(actor,role="authenticated")=>{await db.exec("RESET ROLE");await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor?id(actor):""]);await db.exec(`SET ROLE ${role}`);};
const save=(payload,cafe=10)=>value("SELECT save_owner_cafe_settings($1,$2::jsonb)",[id(cafe),JSON.stringify(payload)]);
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
 CREATE TABLE public.cafes(id uuid PRIMARY KEY,slug text,name text NOT NULL,owner_user_id uuid,status text,deleted_at timestamptz,business_category text);
 CREATE TABLE public.cafe_members(cafe_id uuid,user_id uuid,role text,permissions jsonb DEFAULT '{}');
 CREATE TABLE public.cafe_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),owner_name text,owner_email text,owner_phone text,logo_url text,logo_storage_path text,tax_number text,commercial_register text,maroof_certificate text,instagram text,whatsapp text,description text,custom_domain text,domain_status text DEFAULT 'unlinked',purchased_domain text,purchased_domain_status text,theme_id text NOT NULL DEFAULT 'soft-cream-3d',unrelated_setting jsonb DEFAULT '{"keep":true}');
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 GRANT SELECT,UPDATE ON public.cafes TO authenticated;
 ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
 CREATE POLICY cafes_read ON public.cafes FOR SELECT TO authenticated USING(true);`);
 for(const name of ["is_platform_admin","is_cafe_owner","has_cafe_permission"]) {
  const start=schema.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert(start>=0);const end=schema.indexOf("$$;",start)+3;await db.exec(schema.slice(start,end));
 }
 await db.exec("CREATE POLICY cafes_admin_write ON public.cafes FOR UPDATE TO authenticated USING(public.is_platform_admin()) WITH CHECK(public.is_platform_admin())");
 for(const [actor,role,status] of [[1,"cafe_owner","active"],[2,"cafe_owner","active"],[3,"cafe_staff","active"],[4,"platform_admin","active"],[5,"cafe_staff","active"],[6,"cafe_staff","active"],[7,"cafe_owner","suspended"],[8,"platform_admin","suspended"]]) await q("INSERT INTO profiles VALUES($1,$2,$3)",[id(actor),role,status]);
 for(const [brand,owner] of [[10,1],[11,2],[12,1],[13,7]]) await q("INSERT INTO cafes VALUES($1,$2,'Old name',$3,'active',null,'cafes_coffee')",[id(brand),`brand-${brand}`,id(owner)]);
 await q("INSERT INTO cafe_members VALUES($1,$2,'staff','{}'),($1,$3,'manager','{}'),($1,$4,'staff','{\"settings\":true}')",[id(10),id(3),id(5),id(6)]);
 await q("INSERT INTO cafe_settings(cafe_id,owner_name,owner_email,description,logo_storage_path,theme_id) VALUES($1,'Existing owner','owner@example.test','Original description','brand/logo.webp','editorial'),($2,'Other owner','other@example.test','Other description','other/logo.webp','other-theme')",[id(10),id(11)]);
 const snapshot=await value("SELECT jsonb_agg(to_jsonb(s) ORDER BY cafe_id) FROM cafe_settings s");
 await db.exec(migration);
 check(JSON.stringify(snapshot)===JSON.stringify(await value("SELECT jsonb_agg(to_jsonb(s) ORDER BY cafe_id) FROM cafe_settings s")),"Migration changes no existing settings rows");
 for(const role of ["anon","service_role"]) {await login(1,role);await denied(()=>save({cafe_name:"Denied"}),`${role} cannot execute privileged settings RPC`,"42501");}
 await login(null);await denied(()=>save({cafe_name:"Denied"}),"Authenticated role without an actual user is denied","42501");
 for(const actor of [2,3,7,8,999]) {await login(actor);await denied(()=>save({cafe_name:"Denied"}),`Foreign, unauthorized or inactive actor ${actor} denied`,"42501");}
 await login(7);await denied(()=>save({cafe_name:"Denied"},13),"Inactive actual owner remains denied","42501");
 await login(1);
 check((await q("UPDATE cafes SET name='False success' WHERE id=$1 RETURNING id",[id(10)])).rows.length===0,"Reproduces original owner name UPDATE RLS returning zero rows");
 const renamed=await save({cafe_name:"  بار ضباب  "});
 check(renamed.cafe.name==="بار ضباب"&&renamed.cafe.slug==="brand-10","Actual saved trimmed Arabic name is returned with unchanged slug");
 check(await value("SELECT name FROM cafes WHERE id=$1",[id(10)])==="بار ضباب","Fresh independent read retains the updated name");
 check(JSON.stringify(renamed.settings)===JSON.stringify(snapshot.find(r=>r.cafe_id===id(10))),"Name-only save preserves every settings field including unrelated columns");
 const full=await save({cafe_name:"New name",owner_name:"New owner",description:"Changed description",logo_storage_path:"brand/new-logo.webp",owner_email:null});
 check(full.settings.owner_name==="New owner"&&full.settings.description==="Changed description"&&full.settings.owner_email===null,"Name and requested settings persist together");
 check(full.settings.theme_id==="editorial"&&full.settings.unrelated_setting.keep===true,"Omitted theme and future settings remain untouched");
 for(const payload of [null,[],{cafe_name:null},{cafe_name:""},{cafe_name:"   "},{cafe_name:"x".repeat(161)},{cafe_name:"bad\nname"},{cafe_name:123},{cafe_name:"Valid",slug:"stolen"},{cafe_name:"Valid",owner_user_id:id(2)},{cafe_name:"Valid",business_category:"changed"},{cafe_name:"Valid",cafe_id:id(11)},{cafe_name:"Valid",description:{}},{cafe_name:"Valid",status:"suspended"}]) await denied(()=>save(payload),"Malformed name or non-allowlisted field rejected","22023");
 await denied(()=>save({cafe_name:"Partial update must fail",theme_id:null}),"Settings failure aborts the complete rename transaction","23502");
 check(await value("SELECT name FROM cafes WHERE id=$1",[id(10)])==="New name","Settings failure leaves original name intact");
 for(const actor of [5,6]) {await login(actor);check((await save({cafe_name:`Authorized ${actor}`})).cafe.name===`Authorized ${actor}`,`Existing settings permission is preserved for actor ${actor}`);}
 await login(4);check((await save({cafe_name:"Admin saved"})).cafe.name==="Admin saved","Active admin may save selected brand through existing settings permission");
 await denied(()=>save({cafe_name:"Missing"},99),"Missing brand fails instead of returning false success","P0002");
 await db.exec("RESET ROLE");await q("UPDATE cafes SET deleted_at=now() WHERE id=$1",[id(10)]);await login(4);
 await denied(()=>save({cafe_name:"Deleted"}),"Deleted brand cannot be changed","P0002");
 await db.exec("RESET ROLE");await q("UPDATE cafes SET deleted_at=null WHERE id=$1",[id(10)]);
 await db.exec("CREATE FUNCTION skip_settings_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL;END $$;CREATE TRIGGER skip_settings_write BEFORE UPDATE ON cafe_settings FOR EACH ROW EXECUTE FUNCTION skip_settings_write()");
 await login(1);await denied(()=>save({cafe_name:"Skipped settings"}),"Zero-row settings update fails and rolls back rename","P0002");
 check(await value("SELECT name FROM cafes WHERE id=$1",[id(10)])==="Admin saved","Suppressed settings trigger cannot leave a partial rename");
 await db.exec("RESET ROLE;DROP TRIGGER skip_settings_write ON cafe_settings;CREATE TRIGGER skip_cafe_write BEFORE UPDATE ON cafes FOR EACH ROW EXECUTE FUNCTION skip_settings_write()");
 await login(1);await denied(()=>save({cafe_name:"Skipped cafe"}),"Zero-row name update fails instead of reporting success","P0002");
 await db.exec("RESET ROLE;DROP TRIGGER skip_cafe_write ON cafes");await login(1);
 const created=await save({cafe_name:"First settings"},12);
 check(created.settings.cafe_id===id(12)&&created.settings.theme_id==="soft-cream-3d","Missing settings row is created with actual database defaults");
 await db.exec("RESET ROLE");
 check(JSON.stringify(await value("SELECT to_jsonb(s) FROM cafe_settings s WHERE cafe_id=$1",[id(11)]))===JSON.stringify(snapshot.find(r=>r.cafe_id===id(11))),"Other brand settings remain exactly unchanged");
 check(await value("SELECT name='Old name' AND slug='brand-11' FROM cafes WHERE id=$1",[id(11)]),"Other brand display name and identity remain unchanged");
 await db.exec("CREATE OR REPLACE FUNCTION public.has_cafe_permission(p_cafe_id uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::boolean $$");
 await login(1);await denied(()=>save({cafe_name:"Nullable permission denied"}),"Null permission helper fails closed","42501");
 await mkdir("output/owner-settings",{recursive:true});
 const files=[migrationPath,schemaPath,"scripts/check-owner-settings-db.mjs"];
 const inputs=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash("sha256").update(await readFile(file)).digest("hex")])));
 await writeFile("output/owner-settings/database-checks.json",JSON.stringify({executedAt:new Date().toISOString(),runtime:process.version,checks:results.length,results,inputs,scope:"Local PGlite only; no live DB or network"},null,2)+"\n");
 console.log(`Owner settings SQL: ${results.length} checks passed`);
} finally {await db.close();}
