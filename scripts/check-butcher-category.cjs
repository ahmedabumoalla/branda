(async () => {
const {default:assert}=await import('node:assert/strict');
const {default:fs}=await import('node:fs');
const {default:path}=await import('node:path');
const {default:ts}=await import('typescript');
const {default:React}=await import('react');
const {renderToStaticMarkup}=await import('react-dom/server');
const {createRequire}=await import('node:module');
const requireDependency=createRequire(__filename),root=path.resolve(__dirname,'..');
function load(file,stubs={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name==='server-only'||name.endsWith('.css'))return {};
    if(name.startsWith('@/')||name.startsWith('./')){const p=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(path.join(root,p+'.ts'))?p+'.ts':p+'.tsx',stubs);}
    return requireDependency(name);
  },exports);return exports;
}
let count=0;
async function test(name,run){await run();count++;console.log('PASS '+name);}
const categories=load('lib/platform/business-categories.ts');
const copy=load('lib/platform/business-copy.ts');
const capabilities=load('lib/platform/business-capabilities.ts');
const onboarding=load('lib/platform/brand-onboarding.ts');
const signature=load('lib/menu/default-signature.ts');
const input={requestId:'91a5942a-0a84-4459-a5c3-997ea46ce511',brandName:'ملحمة اختبار',brandNameEn:'',slug:'test-butcher',category:'butcher_shops',ownerName:'',phone:'',email:'',password:''};

await test('butcher is an available dashboard category without reopening disabled industries',()=>{
  assert(categories.AVAILABLE_BUSINESS_CATEGORY_IDS.includes('butcher_shops'));
  const row=categories.BUSINESS_CATEGORIES.find(c=>c.id==='butcher_shops');assert(row?.available);assert.equal(row.label,'ملحمة');assert.equal(row.icon,'Beef');
  assert.equal(categories.getDashboardPathForCategory('butcher_shops'),'/dashboard');
  for(const id of ['cafes_coffee','restaurants','hair_salons','gifts_flowers'])assert(categories.AVAILABLE_BUSINESS_CATEGORY_IDS.includes(id));
  for(const id of ['events_conferences','beauty_centers','unknown'])assert(!categories.AVAILABLE_BUSINESS_CATEGORY_IDS.includes(id));
});
await test('full onboarding validation accepts butcher and preserves rejection boundaries',()=>{
  const parsed=onboarding.adminBrandAccountSchema.safeParse(input);assert(parsed.success);assert.equal(parsed.data.category,'butcher_shops');
  for(const category of ['butcher_shop','BUTCHER_SHOPS','butcher_shops ','unknown','events_conferences',''])assert(!onboarding.adminBrandAccountSchema.safeParse({...input,category}).success,category);
  assert(!onboarding.adminBrandAccountSchema.safeParse({...input,brandName:'م'}).success);
  assert(!onboarding.adminBrandAccountSchema.safeParse({...input,phone:'123'}).success);
});
await test('real creation dropdown exposes butcher and retains available labels only',()=>{
  const {BrandAccountCreate}=load('components/admin/brand-account-create.tsx',{
    './brand-details-dialog':{BrandDialog:({children})=>React.createElement('div',null,children)},
    '@/app/actions/admin-brand-onboarding':{},
  });
  const html=renderToStaticMarkup(React.createElement(BrandAccountCreate,{close(){},onCreated(){}}));
  const select=html.match(/<select name="category"[^>]*>([\s\S]*?)<\/select>/)?.[1];assert(select);
  assert.match(select,/<option value="butcher_shops">ملحمة<\/option>/);
  const options=[...select.matchAll(/value="([^"]+)"/g)].map(m=>m[1]);assert.equal(options.filter(x=>x==='butcher_shops').length,1);
  assert.deepEqual(options,[...categories.AVAILABLE_BUSINESS_CATEGORY_IDS]);
  assert(!select.includes('events_conferences'));assert(select.includes('صالونات الحلاقة الرجالية'));assert(select.includes('متاجر الهدايا والورود'));
});
await test('public contact form offers butcher as a real submitted business-type value',()=>{
  const {BrandaHome}=load('components/marketing/branda-home.tsx',{
    'next/image':()=>null,
    'next/link':({children,href})=>React.createElement('a',{href},children),
    './use-branda-home-motion':{useBrandaHomeMotion(){}},
    './branda-home-pricing':{BrandaHomePricing:()=>null},
    '@/app/actions/contact-requests':{},
  });
  const html=renderToStaticMarkup(React.createElement(BrandaHome,{contacts:{whatsapp:'966500000000'},plans:[]}));
  const select=html.match(/<select name="type"[^>]*>([\s\S]*?)<\/select>/)?.[1];assert(select);
  assert.match(select,/<option value="ملحمة">ملحمة<\/option>/);
  assert.equal((select.match(/value="ملحمة"/g)||[]).length,1);
});
await test('butcher copy and capabilities do not inherit coffee cups or event operations',()=>{
  const value=copy.getBusinessCopy('butcher_shops');assert.equal(value.kind,'butcher');assert.equal(value.categoryId,'butcher_shops');assert.equal(value.brandNoun,'ملحمة');
  assert.equal(value.itemSingular,'منتج');assert.equal(value.itemPlural,'منتجات');assert.equal(value.loyaltyUnitPlural,'أختام');
  assert(value.menuSearchPlaceholder.includes('لحم'));assert(!JSON.stringify(value).includes('أكواب'));assert(!copy.isRestaurantCategory('butcher_shops'));assert(!copy.isEventsCategory('butcher_shops'));
  for(const capability of ['menu','orders','loyalty','rewards','cashier'])assert(capabilities.businessHasCapability('butcher_shops',capability),capability);
  for(const capability of ['tickets','ticket_orders','checkin','experience_rewards'])assert(!capabilities.businessHasCapability('butcher_shops',capability),capability);
  assert.equal(copy.getBusinessCopy('hair_salons').itemPlural,'خدمات');assert.equal(copy.getBusinessCopy('restaurants').kind,'restaurant');assert.equal(copy.getBusinessCopy('gifts_flowers').kind,'gifts');
});
await test('new butcher accounts use approved signature menu while rollout and category boundaries remain',()=>{
  const boundary=Date.parse(signature.SIGNATURE_MENU_ROLLOUT_AT);
  assert(signature.usesDefaultSignatureMenu('butcher_shops',new Date(boundary).toISOString()));
  assert(!signature.usesDefaultSignatureMenu('butcher_shops',new Date(boundary-1).toISOString()));
  for(const date of [null,undefined,'invalid'])assert(!signature.usesDefaultSignatureMenu('butcher_shops',date));
  for(const category of ['hair_salons','gifts_flowers','events_conferences'])assert(!signature.usesDefaultSignatureMenu(category,new Date(boundary).toISOString()));
  for(const category of ['cafes_coffee','restaurants'])assert(signature.usesDefaultSignatureMenu(category,new Date(boundary).toISOString()));
  const menu={slug:'test-butcher',name:'ملحمة اختبار',businessCategory:'butcher_shops',presentation:'signature',description:'منتجات اللحوم',appearance:{}};
  assert.equal(signature.defaultSignatureBrand(menu)?.key,'default');assert.equal(signature.defaultSignatureBrand(menu)?.name,menu.name);
  assert.equal(signature.defaultSignatureBrand({...menu,presentation:'legacy'}),null);
});
await test('server onboarding sends butcher category unchanged into guarded persistence RPC',async()=>{
  const calls=[];
  const dao=load('lib/data/admin-brand-onboarding.ts',{
    '@/lib/data/cafes':{requirePlatformAdmin:async()=>({id:'admin-fixture'})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{cafeId:'created-fixture'},error:null};}})},
    '@/lib/auth/brand-welcome-secret':{accountFingerprint:()=> 'fingerprint-fixture',sealWelcomePassword:()=> 'sealed-fixture'},
    '@/lib/whatsapp/green-api':{},
  });
  assert.equal(await dao.createAdminBrandAccount(input),'created-fixture');assert.equal(calls.length,1);
  assert.equal(calls[0].name,'admin_prepare_brand_account');assert.equal(calls[0].args.p_draft.category,'butcher_shops');assert.equal(calls[0].args.p_actor,'admin-fixture');
  assert.equal(calls[0].args.p_draft.brandName,'ملحمة اختبار');assert(!Object.hasOwn(calls[0].args.p_draft,'password'));
  await assert.rejects(()=>dao.createAdminBrandAccount({...input,category:'unknown'}));assert.equal(calls.length,1,'Invalid category must not reach persistence');
});
await test('unauthorized callers cannot reach category persistence',async()=>{
  let accesses=0;const dao=load('lib/data/admin-brand-onboarding.ts',{
    '@/lib/data/cafes':{requirePlatformAdmin:async()=>{throw Error('Unauthorized');}},
    '@/lib/supabase/admin':{createAdminClient:()=>{accesses++;throw Error('Unexpected persistence');}},
    '@/lib/auth/brand-welcome-secret':{},'@/lib/whatsapp/green-api':{},
  });
  await assert.rejects(()=>dao.createAdminBrandAccount(input),/Unauthorized/);assert.equal(accesses,0);
});
const surfaces={};for(const name of ['BistroMenu','FrenchCornerMenu','LocoMenu','TogetherStore','SignatureMenu'])surfaces[name]=()=>React.createElement('div',{'data-surface':name});
let menu={slug:'test-butcher',name:'ملحمة اختبار',businessCategory:'butcher_shops',presentation:'signature',description:'منتجات اللحوم',loyaltyEnabled:false,appearance:{},categories:[],products:[]};
const args=[];
const page=load('app/menu/[slug]/page.tsx',{
  'next/navigation':{redirect:url=>{throw Error('REDIRECT '+url);},notFound:()=>{throw Error('NOT_FOUND');}},
  '@/lib/data/standalone-menu':{getStandaloneMenu:async(...values)=>{args.push(values);return menu;}},
  '@/lib/data/loyalty-cards':{getPublicLoyaltyProgramBySlug:async()=>{throw Error('Disabled loyalty must not load');}},
  '@/components/menu/bistro-menu':{BistroMenu:surfaces.BistroMenu},'@/components/menu/french-corner-menu':{FrenchCornerMenu:surfaces.FrenchCornerMenu},
  '@/components/menu/loco-menu':{LocoMenu:surfaces.LocoMenu},'@/lib/menu/loco-brand':{isLocoMenu:()=>false},
  '@/components/analytics/public-page-analytics':{PublicPageAnalytics:()=>null},'@/components/menu/menu-auto-refresh':{MenuAutoRefresh:()=>null},
  '@/lib/data/public-home-catalog':{isPublicHomeMenuSlug:async()=>false},'@/components/store/together-store':{TogetherStore:surfaces.TogetherStore},
  '@/lib/data/gift-orders':{getGiftStoreSettings:async()=>{throw Error('Butcher must not use gift settings');}},
  '@/lib/data/loyalty-landing':{getPublicLoyaltyLanding:async()=>null},'@/lib/menu/signature-brands':{signatureBrand:()=>null},
  '@/components/menu/signature-menu':{SignatureMenu:surfaces.SignatureMenu},
});
await test('public butcher URL renders signature products without salon redirect or gift-store loading',async()=>{
  const props={params:Promise.resolve({slug:'test-butcher'}),searchParams:Promise.resolve({branch:'north'})};
  const tree=await page.default(props);const html=renderToStaticMarkup(tree);assert(html.includes('data-surface="SignatureMenu"'));assert.deepEqual(args.at(-1),['test-butcher',false,'north']);
  const metadata=await page.generateMetadata(props);assert(metadata.title.includes('ملحمة اختبار'));assert(metadata.title.includes('منتجات'));assert(!metadata.description.includes('هديتك'));
  menu={...menu,businessCategory:'hair_salons'};await assert.rejects(()=>page.default(props),/REDIRECT \/salon\/test-butcher/);
});
console.log(`Butcher category: ${count} groups passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
