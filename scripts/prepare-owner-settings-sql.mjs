import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='output/settings-name',file='supabase/migrations/20261106082023_owner_settings_atomic_name.sql';
fs.mkdirSync(dir,{recursive:true});const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const body=source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
const start=`BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261106082023') THEN RAISE EXCEPTION 'Migration already applied';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36' AND slug='brand-8ad185ee82e3' AND name IN('ضباب','بار ضباب') AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Brand changed since review';END IF;
END $guard$;
CREATE TEMP TABLE settings_before ON COMMIT DROP AS SELECT
 (SELECT to_jsonb(c)-'name'-'updated_at' FROM public.cafes c WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36') AS cafe,
 (SELECT to_jsonb(s)-'updated_at' FROM public.cafe_settings s WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36') AS settings;
`;
const verify=`DO $check$ DECLARE actor uuid;result jsonb; BEGIN
 IF has_function_privilege('anon','public.save_owner_cafe_settings(uuid,jsonb)','EXECUTE') OR has_function_privilege('service_role','public.save_owner_cafe_settings(uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('authenticated','public.save_owner_cafe_settings(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected RPC grants';END IF;
 SELECT owner_user_id INTO actor FROM public.cafes WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36';
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF auth.uid() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Actor context unavailable';END IF;
 result:=public.save_owner_cafe_settings('3813425d-db13-4d30-8b82-9d41aad12e36',jsonb_build_object('cafe_name','بار ضباب'));
 IF result->'cafe'->>'name'<>'بار ضباب' THEN RAISE EXCEPTION 'Saved name not returned';END IF;
 IF (SELECT to_jsonb(c)-'name'-'updated_at' FROM public.cafes c WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36') IS DISTINCT FROM (SELECT cafe FROM settings_before) OR
 (SELECT to_jsonb(s)-'updated_at' FROM public.cafe_settings s WHERE cafe_id='3813425d-db13-4d30-8b82-9d41aad12e36') IS DISTINCT FROM (SELECT settings FROM settings_before) THEN RAISE EXCEPTION 'Unrequested fields changed';END IF;
END $check$;
SELECT jsonb_build_object('name',name,'slug',slug,'settingsPreserved',true) AS validation FROM public.cafes WHERE id='3813425d-db13-4d30-8b82-9d41aad12e36';
`;
const history=`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261106082023','owner_settings_atomic_name',ARRAY[$source$${source}$source$]);\n`;
fs.writeFileSync(dir+'/rollback.sql',start+body+verify+'ROLLBACK;');
fs.writeFileSync(dir+'/apply.sql',start+body+verify+history+'COMMIT;');
fs.writeFileSync(dir+'/migration.json',JSON.stringify({file,version:'20261106082023',sourceMd5:crypto.createHash('md5').update(source).digest('hex')},null,2));
console.log('Prepared guarded owner-settings migration and requested Dabab name-only correction');
