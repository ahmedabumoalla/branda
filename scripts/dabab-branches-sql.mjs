// Pure compiler for the reviewed, brand-scoped Dabab branch catalog migration.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export const CAFE_ID='3813425d-db13-4d30-8b82-9d41aad12e36';
export const BRAND_SLUG='brand-8ad185ee82e3';
export const MIGRATION='20261106090916_dabab_three_branch_catalog';
export const q=v=>v==null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(v).replaceAll("'","''")}'`;
const lit=v=>v!==null&&typeof v==='object'?`${q(JSON.stringify(v))}::jsonb`:q(v);
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const uuid=key=>{const h=sha(`dabab-branches-20261106/${key}`);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`;
const scope=`cafe_id=${q(CAFE_ID)}`;
export function buildDababBranches({source,backup,assets}){
 assert.equal(source.reviewComplete,true,'Source review incomplete');
 assert.equal(source.products.length,79);assert.equal(source.categories.length,17);
 assert.equal(new Set(source.products.map(p=>p.sourceId)).size,79);
 assert.equal(source.products.filter(p=>p.available).length,77);
 assert.equal(backup.products.length,28);assert.equal(backup.categories.length,1);
 assert(backup.products.every(p=>p.branch_id===null)&&backup.categories.every(c=>c.branch_id===null),'Bar catalog already branched');
 assert.equal(Object.keys(assets).length,79,'Every source item needs a reviewed image');
 const branches=[['bar','بار ضباب'],['coffee','فرع الكوفي'],['hospital','فرع المستشفى']].map(([slug,name],index)=>({id:uuid(`branch/${slug}`),cafe_id:CAFE_ID,name,menu_slug:slug,is_primary:index===0,active:true,sort_order:index,address:null,city:null,phone:null,lat:null,lng:null,hours:null,welcome_message:null}));
 const categories=[],products=[];
 for(const branch of branches.slice(1)){
  for(const [index,name] of source.categories.entries())categories.push({id:uuid(`category/${branch.menu_slug}/${index}`),cafe_id:CAFE_ID,branch_id:branch.id,name,description:null,sort_order:index,visible:true});
  for(const [index,p] of source.products.entries()){
   assert(/^[a-z0-9-]+$/.test(p.sourceId));assert(p.price===null?!p.available&&p.ownerOnly===true:Number.isFinite(p.price)&&p.price>0,'Invalid source price');
   const category=categories.find(c=>c.branch_id===branch.id&&c.name===p.category),asset=assets[p.sourceId];assert(category&&asset);
   assert.equal(asset.path,`${CAFE_ID}/dabab-branches/${p.sourceId}.webp`);assert.equal(asset.bucket,'menu-products');assert(/^[a-f0-9]{64}$/.test(asset.sha256));
   assert(Array.isArray(p.variants));for(const v of p.variants)assert(typeof v.name==='string'&&Number.isFinite(v.price)&&v.price>0);
   const hotAndCold=p.variants.some(v=>v.name==='حار')&&p.variants.some(v=>v.name==='بارد');
   products.push({id:uuid(`product/${branch.menu_slug}/${p.sourceId}`),cafe_id:CAFE_ID,branch_id:branch.id,category_id:category.id,name:p.name,
    description:hotAndCold?[p.description,'متوفر حار وبارد'].filter(Boolean).join('\n'):p.description??'',price:p.price??0,price_options:`{${[...new Set(p.variants.map(v=>v.price))].sort((a,b)=>a-b).join(',')}}`,calories:p.calories??null,
    sort_order:index,available:p.available===true,catalog_kind:'product',image_storage_path:asset.path,image_url:null,gallery_storage_paths:'{}',
    commerce_details:p.variants.length?{options:p.variants.map((v,i)=>({id:`variant-${i+1}`,label:v.name,price:v.price,available:true}))}:{}});
  }
 }
 const protectedTables=backup.protectedTables.filter(t=>t!=='audit_logs');
 assert(protectedTables.every(t=>/^\w+$/.test(t)));
 const extraReferences=[...new Set(backup.references.map(f=>f.table))].filter(t=>!['branches','menu_products','menu_categories',...protectedTables].includes(t));
 assert(extraReferences.every(t=>/^\w+$/.test(t)));
 const hashQuery=(table,where='')=>`(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${table} t ${where})`;
 const snapshot=`SELECT jsonb_object_agg(k,v) FROM(VALUES ${[
  ...protectedTables.map(t=>`(${q(t)},${hashQuery(t)})`),...extraReferences.map(t=>`(${q(t)},${hashQuery(t)})`),`('cafes',${hashQuery('cafes')})`,
  ...['branches','menu_products','menu_categories'].map(t=>`(${q('other_'+t)},${hashQuery(t,`WHERE cafe_id<>${q(CAFE_ID)}`)})`)
 ].join(',')}) AS h(k,v)`;
 const relationState=`SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE conrelid IN('public.branches'::regclass,'public.menu_products'::regclass,'public.menu_categories'::regclass)`;
 let sql=`-- Dabab: preserve the existing Bar catalog and add two independent coffee menus
-- Reviewed source SHA256: ${source.sourceSha256}
-- No brand identity, customer, loyalty, subscription, finance or wallet changes
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
LOCK TABLE public.branches,public.menu_categories,public.menu_products IN SHARE ROW EXCLUSIVE MODE;
DO $scope$ BEGIN
 PERFORM 1 FROM public.cafes WHERE id=${q(CAFE_ID)} AND slug=${q(BRAND_SLUG)} AND name='ضباب' AND status='active' AND is_public AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dabab identity changed';END IF;
 IF NOT COALESCE(platform_access_private.service_enabled(${q(CAFE_ID)},'menu'),false) THEN RAISE EXCEPTION 'Menu service unavailable';END IF;
 IF EXISTS(SELECT 1 FROM public.branches WHERE ${scope}) THEN RAISE EXCEPTION 'Dabab branches changed since review';END IF;
 IF(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM public.menu_products p WHERE ${scope}) IS DISTINCT FROM ${q(backup.hashes.products)} OR(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM public.menu_categories c WHERE ${scope}) IS DISTINCT FROM ${q(backup.hashes.categories)} THEN RAISE EXCEPTION 'Bar catalog changed since review';END IF;
 IF(${relationState}) IS DISTINCT FROM ${lit(backup.constraints)} THEN RAISE EXCEPTION 'Catalog constraints changed since review';END IF;
END $scope$;
`;
 for(const t of backup.triggers.filter(t=>t.name==='menu_product_branch_category'||t.name==='menu_category_branch_move'))sql+=`DO $trigger$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=${q(`public.${t.table}`)}::regclass AND tgname=${q(t.name)} AND tgenabled='O' AND md5(pg_get_functiondef(tgfoid))=${q(t.functionMd5)}) THEN RAISE EXCEPTION 'Branch guard changed since review';END IF;END $trigger$;\n`;
 sql+=`CREATE TEMP TABLE dabab_branches_before ON COMMIT DROP AS SELECT (${snapshot}) AS snapshot;\n`;
 sql+=`CREATE TEMP TABLE dabab_bar_products ON COMMIT DROP AS SELECT * FROM public.menu_products WHERE ${scope};\nCREATE TEMP TABLE dabab_bar_categories ON COMMIT DROP AS SELECT * FROM public.menu_categories WHERE ${scope};\n`;
 sql+=`DO $assets$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='menu-products' AND public=false) THEN RAISE EXCEPTION 'Private menu bucket required';END IF;END $assets$;\n`;
 for(const a of Object.values(assets))sql+=`DO $asset$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='menu-products' AND name=${q(a.path)}) THEN RAISE EXCEPTION 'Reviewed private image missing';END IF;END $asset$;\n`;
 for(const [table,rows,key] of [['branches',branches,'branches'],['menu_categories',categories,'categories'],['menu_products',products,'products']])sql+=`CREATE TEMP TABLE dabab_expected_${key} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n${rows.map(row=>insert(`dabab_expected_${key}`,row)).join('\n')}\n`;
 sql+=`${branches.map(row=>insert('public.branches',row)).join('\n')}\n`;
 sql+=`-- Keep both existing branch/category guards enabled throughout the atomic move
UPDATE public.menu_products SET category_id=NULL,branch_id=${q(branches[0].id)} WHERE ${scope};
UPDATE public.menu_categories SET branch_id=${q(branches[0].id)} WHERE ${scope};
UPDATE public.menu_products p SET category_id=b.category_id FROM dabab_bar_products b WHERE p.id=b.id AND p.cafe_id=${q(CAFE_ID)};
`;
 for(const [table,rows,key] of [['menu_categories',categories,'categories'],['menu_products',products,'products']]){const cols=Object.keys(rows[0]).join(',');sql+=`INSERT INTO public.${table}(${cols}) SELECT ${cols} FROM dabab_expected_${key};\n`;}
 sql+=`DO $verify$ DECLARE current_snapshot jsonb;BEGIN
 ${snapshot} INTO current_snapshot;
 IF current_snapshot IS DISTINCT FROM(SELECT snapshot FROM dabab_branches_before) THEN RAISE EXCEPTION 'Protected records changed';END IF;
 IF EXISTS(SELECT to_jsonb(p)-'branch_id'-'updated_at' FROM public.menu_products p WHERE branch_id=${q(branches[0].id)} EXCEPT SELECT to_jsonb(b)-'branch_id'-'updated_at' FROM dabab_bar_products b) OR EXISTS(SELECT to_jsonb(b)-'branch_id'-'updated_at' FROM dabab_bar_products b EXCEPT SELECT to_jsonb(p)-'branch_id'-'updated_at' FROM public.menu_products p WHERE branch_id=${q(branches[0].id)}) THEN RAISE EXCEPTION 'Original Bar product details changed';END IF;
 IF EXISTS(SELECT to_jsonb(c)-'branch_id'-'updated_at' FROM public.menu_categories c WHERE branch_id=${q(branches[0].id)} EXCEPT SELECT to_jsonb(b)-'branch_id'-'updated_at' FROM dabab_bar_categories b) OR EXISTS(SELECT to_jsonb(b)-'branch_id'-'updated_at' FROM dabab_bar_categories b EXCEPT SELECT to_jsonb(c)-'branch_id'-'updated_at' FROM public.menu_categories c WHERE branch_id=${q(branches[0].id)}) THEN RAISE EXCEPTION 'Original Bar category changed';END IF;
 IF(SELECT count(*) FROM public.menu_products WHERE ${scope})<>186 OR(SELECT count(*) FROM public.menu_categories WHERE ${scope})<>35 OR EXISTS(SELECT 1 FROM public.menu_products WHERE ${scope} AND branch_id IS NULL) THEN RAISE EXCEPTION 'Unexpected catalog totals';END IF;
`;
 for(const [table,rows,key,filter] of [['branches',branches,'branches',scope],['menu_categories',categories,'categories',`${scope} AND branch_id<>${q(branches[0].id)}`],['menu_products',products,'products',`${scope} AND branch_id<>${q(branches[0].id)}`]]){const cols=Object.keys(rows[0]).join(',');sql+=`IF(SELECT count(*) FROM public.${table} WHERE ${filter})<>${rows.length} OR EXISTS(SELECT ${cols} FROM public.${table} WHERE ${filter} EXCEPT SELECT ${cols} FROM dabab_expected_${key}) OR EXISTS(SELECT ${cols} FROM dabab_expected_${key} EXCEPT SELECT ${cols} FROM public.${table} WHERE ${filter}) THEN RAISE EXCEPTION 'Branch ${key} differs from reviewed source';END IF;\n`;}
 sql+=`END $verify$;\nCOMMIT;\n`;
 return {sql,branches,categories,products,protectedTables,extraReferences,snapshot};
}
