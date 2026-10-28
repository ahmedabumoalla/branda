const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
function load(file){
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',code)(name=>{
  if(name==='server-only')return {};
  if(name==='./brand-details-dialog')return {BrandDialog:({children})=>React.createElement('div',null,children)};
  if(name==='@/app/actions/admin-brand-onboarding')return {};
  if(name.endsWith('.css'))return {};
  if(name.startsWith('@/')||name.startsWith('./')){const p=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx');}
  return require(name);
 },exports);return exports;
}
const {AVAILABLE_BUSINESS_CATEGORY_IDS:ids,BUSINESS_CATEGORIES:categories,getDashboardPathForCategory}=load('lib/platform/business-categories.ts');
const {adminBrandAccountSchema}=load('lib/platform/brand-onboarding.ts');
assert.deepEqual(ids,['cafes_coffee','restaurants','hair_salons']);
assert.deepEqual(categories.filter(x=>x.available).map(x=>x.id),ids);
for(const id of ids)assert(adminBrandAccountSchema.shape.category.safeParse(id).success);
for(const id of ['events_conferences','beauty_centers','unknown',''])assert(!adminBrandAccountSchema.shape.category.safeParse(id).success);
assert.equal(getDashboardPathForCategory('hair_salons'),'/dashboard');
const {getBusinessCopy}=load('lib/platform/business-copy.ts');
assert.equal(getBusinessCopy('hair_salons').itemPlural,'خدمات');assert.equal(getBusinessCopy('hair_salons').loyaltyUnitPlural,'زيارات');
assert.equal(getBusinessCopy('events_conferences').kind,'events');assert.equal(getBusinessCopy('restaurants').kind,'restaurant');
const {businessHasCapability}=load('lib/platform/business-capabilities.ts');
for(const capability of ['menu','orders','loyalty','rewards','cashier'])assert(businessHasCapability('hair_salons',capability));
assert(!businessHasCapability('hair_salons','tickets'));
const {BrandAccountCreate}=load('components/admin/brand-account-create.tsx');
const html=require('react-dom/server').renderToStaticMarkup(React.createElement(BrandAccountCreate,{close(){},onCreated(){}}));
const select=html.match(/<select name="category"[^>]*>([\s\S]*?)<\/select>/)[1];
assert.deepEqual([...select.matchAll(/value="([^"]+)"/g)].map(x=>x[1]),ids);
assert(select.includes('صالونات الحلاقة الرجالية'));assert(!select.includes('events_conferences'));assert(!select.includes('فعاليات'));
console.log('PASS barbershop selectable options, server validation, dashboard capabilities, service/visit copy and legacy category compatibility');
