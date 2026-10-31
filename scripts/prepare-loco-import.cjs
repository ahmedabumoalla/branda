// Reviewed 2026-11-01 LOCO source catalog. No database mutation; --upload uploads only scoped immutable assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js');
const source=JSON.parse(fs.readFileSync('data/imports/loco-20261101.json','utf8'));
const cafe=source.cafeId,dir='output/loco';
const uuid=s=>{const h=crypto.createHash('sha256').update(`loco-20261101:${s}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`};
const quote=s=>s===null?'NULL':typeof s==='boolean'?String(s):typeof s==='number'?String(s):"'"+String(s).replaceAll("'","''")+"'";
const insert=(table,row)=>`INSERT INTO public.${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(v=>quote(Array.isArray(v)||v&&typeof v==='object'?JSON.stringify(v):v)).join(',')});`;
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},realtime:{transport:require('next/dist/compiled/ws')}});
async function read(query){const {data,error}=await query;if(error)throw Error(error.message);return data}
async function upload(bucket,file,data,type){
 const {data:exists,error}=await client.storage.from(bucket).download(file);
 if(!error){assert(Buffer.from(await exists.arrayBuffer()).equals(data),'Existing immutable asset differs');return}
 const result=await client.storage.from(bucket).upload(file,data,{contentType:type,upsert:false,cacheControl:'31536000'});if(result.error)throw Error(result.error.message);
}
(async()=>{
 const brand=await read(client.from('cafes').select('id,slug,status').eq('id',cafe).single());assert.equal(brand.slug,source.slug);assert.equal(brand.status,'active');
 const assets={},tasks=[];
 for(const branch of source.branches)for(const cat of branch.categories)for(const p of cat.products){if(p.photo)tasks.push(`photo-${String(p.photo).padStart(2,'0')}`);if(p.art)tasks.push(p.art)}
 for(const key of [...new Set(tasks)]){
  const input=fs.existsSync(`${dir}/${key}.webp`)?`${dir}/${key}.webp`:`${dir}/${key}.png`;
  const bytes=await sharp(input).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:87}).toBuffer();
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  assets[key]={path:`${cafe}/loco-20261101/${key}-${hash.slice(0,12)}.webp`,sha256:hash,bytes:bytes.length};
  fs.writeFileSync(`${dir}/${key}-upload.webp`,bytes);
  if(process.argv.includes('--upload'))await upload('menu-products',assets[key].path,bytes,'image/webp');
 }
 const logo=fs.readFileSync(`${dir}/logo.png`),logoHash=crypto.createHash('sha256').update(logo).digest('hex'),logoPath=`${cafe}/loco-20261101/logo-${logoHash.slice(0,12)}.png`;
 if(process.argv.includes('--upload'))await upload('cafe-logos',logoPath,logo,'image/png');
 const rows={branches:[],categories:[],products:[],offers:[]};
 for(const [bi,branch]of source.branches.entries()){
  const branchId=uuid(branch.slug);rows.branches.push({id:branchId,cafe_id:cafe,name:branch.name,menu_slug:branch.slug,is_primary:!!branch.primary,active:true,sort_order:bi});
  for(const [ci,cat]of branch.categories.entries()){
   const categoryId=uuid(`${branch.slug}/${cat.name}`);rows.categories.push({id:categoryId,cafe_id:cafe,branch_id:branchId,name:cat.name,sort_order:ci,visible:true});
   for(const [pi,p]of cat.products.entries()){
    const id=uuid(`${branch.slug}/${cat.name}/${p.name}`),key=p.photo?`photo-${String(p.photo).padStart(2,'0')}`:p.art;
    rows.products.push({id,cafe_id:cafe,branch_id:branchId,category_id:categoryId,name:p.name,description:p.priceOptions?'':p.description||'',price:p.price,price_options:`{${(p.priceOptions||[]).join(',')}}`,sort_order:ci*100+pi,available:true,image_storage_path:key?assets[key].path:null});
    if(p.spotlight)rows.offers.push({id:uuid(`offer/${id}`),cafe_id:cafe,branch_id:branchId,title:p.name,description:p.description||`اكتشف ${p.name} في ${branch.name}`,offer_type:'عرض مخصص',status:'active',placement:'both',visible_in_cafe:true,target_type:'products',linked_product_id:id,offer_rules:{selectedProductIds:[id],packageDescription:p.description||''}});
   }
  }
 }
 assert.equal(rows.branches.length,2);assert.equal(rows.products.length,72);assert.equal(rows.offers.length,5);
 const snapshot=`SELECT jsonb_build_object('products',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM menu_products t WHERE cafe_id<>${quote(cafe)}),'categories',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM menu_categories t WHERE cafe_id<>${quote(cafe)}),'branches',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM branches t WHERE cafe_id<>${quote(cafe)}),'offers',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM offers t WHERE cafe_id<>${quote(cafe)}),'programs',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text) FROM cafe_loyalty_programs t WHERE cafe_id<>${quote(cafe)}),'identity',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text) FROM cafe_custom_identity t WHERE cafe_id<>${quote(cafe)}),'settings',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text) FROM cafe_settings t WHERE cafe_id<>${quote(cafe)}))`;
 let sql=`-- LOCO owner-authorized two independent menus and 6 stamps / 10% reward\nBEGIN;SET LOCAL lock_timeout='5s';\nCREATE TEMP TABLE loco_before AS ${snapshot} snapshot;\nDO $guard$ BEGIN\nIF NOT EXISTS(SELECT 1 FROM cafes WHERE id=${quote(cafe)} AND slug=${quote(source.slug)} AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'LOCO identity changed'; END IF;\nIF EXISTS(SELECT 1 FROM menu_products WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM menu_categories WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM branches WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM offers WHERE cafe_id=${quote(cafe)}) OR EXISTS(SELECT 1 FROM cafe_loyalty_programs WHERE cafe_id=${quote(cafe)}) THEN RAISE EXCEPTION 'LOCO already configured; inspect before changing data';END IF;\nEND $guard$;\n`;
 for(const [table,key]of [['branches','branches'],['menu_categories','categories'],['menu_products','products'],['offers','offers']])sql+=rows[key].map(r=>insert(table,r)).join('\n')+'\n';
 sql+=`UPDATE cafe_settings SET logo_storage_path=${quote(logoPath)},logo_url=null,description='قهوة وحلا ومزاج لوكو',updated_at=now() WHERE cafe_id=${quote(cafe)};\n`;
 const identity={cafe_id:cafe,logo_storage_path:logoPath,logo_url:null,palette:{primary:'#fff8e3',secondary:'#ee2330',accent:'#ee2330',text:'#4c171c',background:'#fffdf7'}};
 sql+=insert('cafe_custom_identity',identity).replace(/;$/,` ON CONFLICT(cafe_id) DO UPDATE SET logo_storage_path=excluded.logo_storage_path,logo_url=excluded.logo_url,palette=excluded.palette,updated_at=now();`)+'\n';
 sql+=insert('cafe_loyalty_programs',{cafe_id:cafe,enabled:true,purchases_required:6,reward_name:'خصم 10%',card_title:'بطاقة ولاء لوكو',card_subtitle:'كل زيارة تقرّب مكافأتك',stamp_label:'الأختام',terms:'اجمع 6 أختام واحصل على خصم 10%',card_background:'#fff8e3',card_foreground:'#4c171c',card_accent:'#ee2330',wallet_enabled:true,apple_wallet_enabled:true,google_wallet_enabled:true,card_design:{layoutVersion:'brand-stamps-v1',stampStyle:'ceramic'}})+'\n';
 sql+=`DO $verify$ DECLARE actual jsonb; BEGIN ${snapshot} INTO actual; IF actual IS DISTINCT FROM (SELECT snapshot FROM loco_before) THEN RAISE EXCEPTION 'Another brand changed';END IF;IF (SELECT count(*) FROM menu_products WHERE cafe_id=${quote(cafe)})<>72 THEN RAISE EXCEPTION 'Catalog count mismatch';END IF;END $verify$;\nCOMMIT;\n`;
 fs.writeFileSync(`${dir}/import.sql`,sql);fs.writeFileSync(`${dir}/import-rollback.sql`,sql.replace(/COMMIT;\s*$/,'ROLLBACK;'));
 fs.writeFileSync(`${dir}/import-plan.json`,JSON.stringify({sourceSha256:crypto.createHash('sha256').update(fs.readFileSync('data/imports/loco-20261101.json')).digest('hex'),assets,logoPath,logoHash,rows},null,2));
 console.log(JSON.stringify({mode:process.argv.includes('--upload')?'assets uploaded':'prepared',branches:rows.branches.map(b=>({name:b.name,slug:b.menu_slug,count:rows.products.filter(p=>p.branch_id===b.id).length})),offers:rows.offers.length,assets:Object.keys(assets).length,missingPhotos:rows.products.filter(p=>!p.image_storage_path).map(p=>p.name)}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
