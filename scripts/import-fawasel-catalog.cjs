'use strict';
// Default is a read-only preflight. --apply requires the reviewed source hash.
// Insert-only with deterministic tenant-scoped IDs: never deletes or overwrites.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Parser } = require('htmlparser2');
const ROOT = path.resolve(__dirname, '..');
const TENANT = 'ec398cf0-1ff5-47c7-bf98-9653dbe7e8e0';
const SLUG = 'brand-1c2b6f7e028f';
const INPUT = path.join(ROOT, 'output/fawasel-import-20261114/catalog.json');
const OUT = path.join(ROOT, 'output/fawasel-import-20261114/import');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stableId = key => { const v = hash(`${TENANT}:fawasell.com:${key}`).slice(0,32).split(''); v[12]='5'; v[16]='a'; const s=v.join(''); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
const round = v => Math.round(v * 100) / 100;
function plainHtml(html) {
  let result = '', ignored = 0;
  const block = /^(p|div|li|ul|ol|h[1-6]|section|article|table|tr|blockquote)$/;
  const parser = new Parser({
    onopentag(name) { if (['script','style'].includes(name)) ignored++; if (!ignored && (block.test(name) || name === 'br')) result += '\n'; },
    ontext(value) { if (!ignored) result += value; },
    onclosetag(name) { if (['script','style'].includes(name)) ignored--; if (!ignored && block.test(name)) result += '\n'; },
  }, {decodeEntities:true});
  parser.write(String(html || '')); parser.end();
  return result.replace(/\r/g,'').replace(/[\t \u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function sourceImage(url) {
  if (!url) return null;
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['cdn.salla.sa','cdn.assets.salla.network','cdn.files.salla.network'].includes(u.hostname)) throw Error(`Unrecognized source image host: ${u.hostname}`);
  return u.href;
}
function combinations(groups) {
  return groups.reduce((rows, group) => rows.flatMap(row => group.details.map(choice => [...row,{group,choice}])) ,[[]]);
}
function variantAvailable(combo) {
  if (combo.some(({choice}) => choice.is_out === true)) return false;
  // Intersect SKU identifiers before interpreting per-SKU availability.
  const matrices = combo.map(({choice}) => choice.skus_availability).filter(v => v && !Array.isArray(v) && Object.keys(v).length);
  if (!matrices.length) return true;
  return Object.keys(matrices[0]).some(id => matrices.every(v => v[id] === true));
}
function mapCatalog(catalog, snapshot = {}) {
  const categories = new Map(), products = [], issues = [], blocked = [], sourceRecords = [];
  const seen = new Set(), existingCategories = snapshot.categories || [], existingProducts = snapshot.products || [];
  for (const [index,p] of [...catalog].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true})).entries()) {
    if (!/^\d+$/.test(String(p.id)) || seen.has(String(p.id))) throw Error('Invalid or duplicate source product ID');
    seen.add(String(p.id));
    const source = new URL(p.canonicalUrl || p.source);
    if (source.hostname !== 'fawasell.com' || source.protocol !== 'https:') throw Error('Unexpected product source');
    if (p.currency !== 'SAR' || !Number.isFinite(p.price) || p.price < 0) throw Error(`Invalid price/currency ${p.id}`);
    const title = plainHtml(p.name);
    const categoryName = plainHtml(p.category?.title || p.eventProduct?.category || p.metadata?.['product:category'] || 'منتجات أخرى');
    const matchingCategories = existingCategories.filter(c=>c.name === categoryName && !c.branch_id);
    if (matchingCategories.length > 1 || matchingCategories.some(c=>c.deleted_at)) throw Error(`Existing category requires manual review: ${categoryName}`);
    const categoryId = matchingCategories[0]?.id || stableId(`category:${categoryName.normalize('NFC')}`);
    if (!categories.has(categoryId)) categories.set(categoryId,{id:categoryId,cafe_id:TENANT,branch_id:null,name:categoryName,description:null,visible:true,sort_order:categories.size});
    const rawOptions = p.options || [];
    const unsupported = rawOptions.filter(o => !['single-option','thumbnail','text','textarea','date','file','image'].includes(o.type));
    const conditional = rawOptions.some(o=>o.visibility_condition && o.visibility_condition.operator !== '=');
    const reason = unsupported.length || conditional ? 'هذا المنتج يحتاج إرفاق ملف أو تحديد موعد وتأكيد تفاصيل التخصيص قبل الطلب' : '';
    if (reason) blocked.push({sourceId:p.id,name:title,reason,requirements:rawOptions.filter(o=>unsupported.includes(o)||o.visibility_condition).map(o=>({name:o.name,type:o.type,required:o.required,condition:o.visibility_condition||null}))});
    const selectionGroups = rawOptions.filter(o=>['single-option','thumbnail'].includes(o.type));
    if (selectionGroups.some(o=>!o.required || !o.details.length)) issues.push({sourceId:p.id,field:'options',reason:'Optional or empty selection group needs explicit mapping'});
    const combos = selectionGroups.length ? combinations(selectionGroups) : [];
    const options = combos.map(combo=>({
      id:`v_${combo.map(({choice})=>choice.id).join('_')}`,
      label:combo.map(({group,choice})=>`${plainHtml(group.name)}: ${plainHtml(choice.name)}`).join(' / '),
      price:round(p.price+combo.reduce((sum,{choice})=>sum+Number(choice.additional_price || 0),0)),
      available:variantAvailable(combo), stock:null,
    }));
    const optionGroups = rawOptions.filter(o=>['text','textarea','date','file','image'].includes(o.type)).map(o=>{
      const condition=o.visibility_condition;
      const optionIds=condition?combos.map((combo,i)=>combo.some(({group,choice})=>String(group.id)===String(condition.option)&&String(choice.id)===String(condition.value))?options[i].id:null).filter(Boolean):null;
      if(condition && !optionIds.length) issues.push({sourceId:p.id,field:'showWhen',reason:'Condition does not match a source variant'});
      return {id:`g_${o.id}`,label:plainHtml(o.name),type:o.type==='textarea'?'text':o.type,required:Boolean(o.required),hint:plainHtml(o.placeholder||''),...(condition?{showWhen:{optionIds}}:{}),...(['image','file'].includes(o.type)?{accept:o.type==='file'?['image/png']:['image/png','image/jpeg','image/webp']}: {})};
    });
    const attributes = [];
    if (reason) attributes.push({label:'الطلب المخصص',value:reason});
    if (p.oldPrice != null && p.oldPrice > p.price) attributes.push({label:'السعر قبل التخفيض',value:`${p.oldPrice} ريال`});
    const sourceImport = {provider:'fawasell.com',sourceId:String(p.id),retrievedAt:p.retrievedAt,snapshotSha256:hash(JSON.stringify(p)),availability:p.availability,status:p.status,currency:p.currency,originalPrice:p.price,originalOldPrice:p.oldPrice ?? null,sourceOptions:rawOptions,blockedReason:reason || null};
    const details = {sourceUrl:source.href,stock:null,attributes,options,optionGroups,sourceImport};
    const gallery = [], seenImages = new Set();
    const pushImage = (url,alt) => {const resolved=sourceImage(url);if(resolved&&!seenImages.has(resolved)){seenImages.add(resolved);gallery.push({type:'image',imageDataUrl:resolved,alt:plainHtml(alt||title)});}};
    for (const i of [...p.images].sort((a,b)=>Number(b.main)-Number(a.main))) pushImage(i.url,i.alt);
    for (const group of rawOptions) for (const choice of group.details || []) pushImage(choice.image,`${title} — ${group.name}: ${choice.name}`);
    const available = p.availability === 'https://schema.org/InStock' && !reason && (!options.length || options.some(o=>o.available));
    const product = {id:stableId(`product:${p.id}`),cafe_id:TENANT,branch_id:null,category_id:categoryId,legacy_category:categoryName,name:title,description:plainHtml(p.descriptionHtml || p.description || ''),price:round(p.price),catalog_kind:'product',commerce_details:details,available,available_for_pickup:available,loyalty_points:0,redeemable_with_points:false,ingredients:[],image_variant:'product',image_url:gallery[0]?.imageDataUrl || null,image_storage_path:null,image_gallery:gallery,gallery_storage_paths:[],sort_order:index};
    if (!title || title.length > 240) issues.push({sourceId:p.id,field:'name',length:title.length});
    if (options.length>100) issues.push({sourceId:p.id,field:'options',length:options.length,max:100});
    if (Buffer.byteLength(JSON.stringify(details))>100000) issues.push({sourceId:p.id,field:'commerce_details',bytes:Buffer.byteLength(JSON.stringify(details)),max:100000});
    sourceRecords.push({sourceId:p.id,productId:product.id,source:source.href,retrievedAt:p.retrievedAt,snapshotSha256:sourceImport.snapshotSha256,sourceImageCount:p.images.length,galleryImageCount:gallery.length,optionCount:options.length,orderable:available,blockedReason:reason||null});
    const existing = existingProducts.filter(row=>row.id===product.id||row.commerce_details?.sourceImport?.sourceId===String(p.id)||row.commerce_details?.sourceUrl===source.href);
    if (existing.length>1 || existing.some(row=>row.id!==product.id || row.deleted_at || row.cafe_id!==TENANT)) issues.push({sourceId:p.id,field:'identity',reason:'Existing product requires manual review'});
    products.push(product);
  }
  return {categories:[...categories.values()],products,issues,blocked,sourceRecords};
}
async function api(resource, init={}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || new URL(url).hostname !== 'kpguwjfkkylrdlvzeezz.supabase.co') throw Error('Expected Supabase project credentials required');
  const r=await fetch(`${url}/rest/v1/${resource}`,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(init.headers||{})}});
  if(!r.ok) throw Error(`Database request failed ${r.status} ${resource.split('?')[0]}`);
  return r.status===204?null:r.json();
}
async function allRows(table,select='*') {
  let result=[];
  for(let offset=0;;offset+=500){const rows=await api(`${table}?select=${select}&cafe_id=eq.${TENANT}&order=id&offset=${offset}&limit=500`);result.push(...rows);if(rows.length<500)return result;}
}
async function readSnapshot() {
  const [cafe,products,categories,branches,settings,loyalty]=await Promise.all([
    api(`cafes?select=id,slug,name,business_category,status&id=eq.${TENANT}`),
    allRows('menu_products','id,cafe_id,branch_id,name,commerce_details,deleted_at,updated_at'),
    allRows('menu_categories','id,cafe_id,branch_id,name,deleted_at,updated_at'),
    allRows('branches','id,name,is_primary,active,menu_slug'),
    api(`gift_store_settings?select=enabled,delivery_enabled,pickup_enabled,delivery_fee,payment_methods&cafe_id=eq.${TENANT}`),
    api(`cafe_loyalty_programs?select=enabled,purchases_required,reward_name,card_background,card_foreground,card_accent,wallet_enabled&cafe_id=eq.${TENANT}`),
  ]);
  if(cafe.length!==1||cafe[0].slug!==SLUG||cafe[0].business_category!=='clothing_stores') throw Error('Tenant identity/category mismatch');
  return {readAt:new Date().toISOString(),cafe:cafe[0],products,categories,branches,settings,loyalty};
}
function validate(plan) {
  // Compile only the existing schema module, not application/server code.
  const ts=require('typescript'), Module=require('node:module'), filename=path.join(ROOT,'lib/commerce/product-details.ts');
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(compiled,filename);
  for(const p of plan.products){const r=mod.exports.commerceDetailsSchema.safeParse(p.commerce_details);if(!r.success)plan.issues.push({sourceId:p.commerce_details.sourceImport.sourceId,field:'commerce_details',validation:r.error.issues});}
  return plan.issues.length===0;
}
async function apply(plan,snapshot) {
  if(plan.issues.length) throw Error('Resolve dry-run issues before import');
  if(snapshot.branches.length) throw Error('Branch assignment requires explicit review before importing unbranched products');
  // Existing rows are preserved, even if source changes. Updates need separate review.
  for(const [table,rows,existing] of [['menu_categories',plan.categories,snapshot.categories],['menu_products',plan.products,snapshot.products]]) {
    const known=new Set(existing.map(r=>r.id));
    const pending=rows.filter(row=>!known.has(row.id));
    for(let offset=0;offset<pending.length;offset+=50){
      const batch=pending.slice(offset,offset+50);
      const collisions=await api(`${table}?select=id,cafe_id&id=in.(${batch.map(r=>r.id).join(',')})`);
      if(collisions.some(r=>r.cafe_id!==TENANT))throw Error('Cross-tenant identifier collision');
      await api(`${table}?on_conflict=id`,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(batch)});
    }
  }
}
function selfTest() {
  assert.equal(plainHtml('<p>أول <b>سطر</b></p><p>ثاني<br>ثالث</p>'),'أول سطر\n\nثاني\nثالث');
  assert.equal(plainHtml('<script>alert(1)</script><p>&#x641;&#x648;&#x627;&#x635;&#x644;</p>'),'فواصل');
  assert.equal(stableId('product:1'),stableId('product:1'));
  assert.notEqual(stableId('product:1'),stableId('product:2'));
  assert.equal(variantAvailable([{choice:{skus_availability:{a:true}}},{choice:{skus_availability:{b:true}}}]),false);
  assert.equal(variantAvailable([{choice:{skus_availability:{a:true,b:true}}},{choice:{skus_availability:{b:true}}}]),true);
  assert.equal(variantAvailable([{choice:{is_out:true,skus_availability:{a:true}}}]),false);
  assert.equal(variantAvailable([{choice:{skus_availability:[]}}]),true);
  assert.throws(()=>sourceImage('https://example.com/photo.png'));
  const original = {id:'1',name:'منتج',source:'https://fawasell.com/ar/item/p1',retrievedAt:'2026-11-14T00:00:00Z',currency:'SAR',price:10,availability:'https://schema.org/InStock',images:[{url:'https://cdn.salla.sa/a.jpg'}],options:[],descriptionHtml:'<p>أول</p><p>ثاني</p>'};
  const a=mapCatalog([original]);
  assert.equal(validate(a),true);
  assert.equal(a.products[0].commerce_details.stock,null);
  assert.equal(a.products[0].description,'أول\n\nثاني');
  const b=mapCatalog([original],{categories:a.categories,products:a.products});
  assert.deepEqual(a.products,b.products);
  assert.equal(b.issues.length,0);
  assert.throws(()=>mapCatalog([original,original]));
  const special=mapCatalog([{...original,options:[{id:2,type:'audio',name:'ملف',required:true,details:[]}]}]);
  assert.equal(special.products[0].available,false);
  assert.equal(special.products[0].commerce_details.attributes[0].label,'الطلب المخصص');
  assert.equal(special.products[0].commerce_details.sourceImport.sourceOptions[0].type,'audio');
  const conflict=mapCatalog([original],{products:[{...a.products[0],cafe_id:'other'}]});
  assert.equal(conflict.issues[0].field,'identity');
  console.log('Importer unit checks: 19 passed');
}
async function main() {
  if(process.argv.includes('--self-test')){selfTest();return;}
  const source=fs.readFileSync(INPUT), sourceSha256=hash(source), catalog=JSON.parse(source);
  const snapshot=process.argv.includes('--offline')?{products:[],categories:[],branches:[],offline:true}:await readSnapshot();
  const plan=mapCatalog(catalog,snapshot);validate(plan);
  const summary={generatedAt:new Date().toISOString(),tenant:TENANT,slug:SLUG,sourceSha256,sourceCount:catalog.length,categories:plan.categories.length,products:plan.products.length,photos:plan.products.reduce((n,p)=>n+p.image_gallery.length,0),orderable:plan.products.filter(p=>p.available).length,blocked:plan.blocked,issues:plan.issues,existing:{products:snapshot.products.length,categories:snapshot.categories.length},maxima:{options:Math.max(...plan.products.map(p=>p.commerce_details.options.length)),commerceBytes:Math.max(...plan.products.map(p=>Buffer.byteLength(JSON.stringify(p.commerce_details)))),descriptionLength:Math.max(...plan.products.map(p=>p.description.length)),gallery:Math.max(...plan.products.map(p=>p.image_gallery.length))},mode:'dry-run',unknownStock:'null, never event quantity',coverage:`${catalog.length} source products mapped; consult source coverage.json for completeness`,snapshots:'Original catalog retained with per-product hash and retrieval time',limits:['Source prices and availability are a dated snapshot, not live synchronization','Customization file/date requirements and conditional visibility preserved','Insert-only: existing rows are never overwritten or removed']};
  fs.mkdirSync(OUT,{recursive:true});
  for(const [name,value] of Object.entries({'plan.json':plan,'preflight.json':snapshot,'summary.json':summary}))fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2));
  if(process.argv.includes('--apply')){
    if(snapshot.offline||process.env.FAWASEL_IMPORT_APPROVED_SHA256!==sourceSha256)throw Error('Apply requires online preflight and exact reviewed source hash');
    if(hash(fs.readFileSync(INPUT))!==sourceSha256)throw Error('Source catalog changed during preflight');
    await apply(plan,snapshot);
    const after=await readSnapshot();summary.mode='applied';summary.after={products:after.products.length,categories:after.categories.length};
    fs.writeFileSync(path.join(OUT,'after.json'),JSON.stringify(after,null,2));fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2));
  }
  console.log(JSON.stringify({...summary,blocked:summary.blocked.length,issues:summary.issues.length}));
  if(plan.issues.length)process.exitCode=1;
}
module.exports={plainHtml,stableId,variantAvailable,mapCatalog,validate,TENANT,SLUG};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
