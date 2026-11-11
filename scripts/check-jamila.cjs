const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={};
  new Function('require','exports',code)(name => {
    if (name in stubs) return stubs[name];
    if(name.endsWith('.css')) return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(name==='next/image') return {__esModule:true,default:({unoptimized,...props})=>React.createElement('img',props)};
    if(name==='next/link') return {__esModule:true,default:'a'};
    return require(name);
  },exports);
  return exports;
}
(async()=>{
  const {JamilaMenu,JAMILA_SLUG,JAMILA_LOGO}=load('components/menu/jamila-menu.tsx');
  const menu={slug:JAMILA_SLUG,name:'Jamila',logoUrl:null,products:[],categories:[],loyaltyEnabled:true};
  let html=renderToStaticMarkup(React.createElement(JamilaMenu,{menu,loyalty:null}));
  check(html.includes('قائمتنا قريبًا') && html.includes('dir="rtl"'),'Honest RTL empty menu');
  check(html.includes(JAMILA_LOGO) && !html.includes('/loyalty/'),'Logo and disabled loyalty');
  html=renderToStaticMarkup(React.createElement(JamilaMenu,{menu,loyalty:{purchasesRequired:6,rewardName:'مشروب مجاني'}}));
  check(html.includes(`/loyalty/${JAMILA_SLUG}/qr`) && html.includes('6') && html.includes('مشروب مجاني'),'Existing reward and working enrollment link');
  const {loyaltyTheme}=load('components/rast-loyalty/loyalty-theme.ts');
  const theme=loyaltyTheme({slug:JAMILA_SLUG,cardBackground:'#5c5c5c',cardForeground:'#ffe8c5',cardAccent:'#ffe8c5'});
  check(theme['--card-background']==='#5c5c5c' && theme['--card-foreground']==='#ffe8c5','Brand card colors retain contrast');
  check(theme['--card-logo-filter']==='none' && theme['--card-logo-width']==='144px','Original logo colors and readable size');
  check(loyaltyTheme({slug:'rast'})===undefined,'Kawakib unchanged');
  check(!('--brand-logo-background' in loyaltyTheme({slug:'other'})),'Other brands unchanged');
  const {approvedLoyaltyColors}=load('lib/loyalty/approved-design.ts');
  assert.deepEqual(approvedLoyaltyColors(JAMILA_SLUG,{primary:'#5c5c5c',text:'#ffe8c5',secondary:'#ffe8c5'}),{background:'#5c5c5c',foreground:'#ffe8c5',accent:'#ffe8c5'}); checks++;
  assert.deepEqual(approvedLoyaltyColors(JAMILA_SLUG,null),{background:'#5c5c5c',foreground:'#ffe8c5',accent:'#ffe8c5'});checks++;
  check(approvedLoyaltyColors(JAMILA_SLUG,{primary:'#112233',text:'#ffffff',secondary:'#dddddd'}).background==='#112233','Future saved identity overrides brand defaults');
  const routeSource=fs.readFileSync(path.join(root,'app/menu/[slug]/page.tsx'),'utf8');
  check(routeSource.includes('menu.slug === JAMILA_SLUG && menu.products.length === 0'),'Published products restore normal catalog');
  check(routeSource.indexOf('if (!menu) notFound()') < routeSource.indexOf('const jamila ='),'Publication guards remain before presentation');
  let currentMenu=menu, landing=null, showcase=false;
  const marker=name=>()=>React.createElement('div',{'data-view':name});
  const route=load('app/menu/[slug]/page.tsx',{
    react:{cache:fn=>fn},
    'next/navigation':{notFound:()=>{throw Error('not-found');},redirect:()=>{throw Error('redirect');}},
    '@/lib/data/standalone-menu':{getStandaloneMenu:async()=>currentMenu},
    '@/lib/data/loyalty-cards':{getPublicLoyaltyProgramBySlug:async()=>({enabled:true,purchasesRequired:6,rewardName:'مشروب مجاني'})},
    '@/lib/data/loyalty-landing':{getPublicLoyaltyLanding:async()=>landing},
    '@/lib/data/public-home-catalog':{isPublicHomeMenuSlug:async()=>showcase},
    '@/lib/menu/signature-brands':{signatureBrand:()=>null},
    '@/lib/menu/default-signature':{defaultSignatureBrand:()=>({key:'default'})},
    '@/lib/menu/loco-brand':{isLocoMenu:()=>false},
    '@/lib/data/gift-orders':{getGiftStoreSettings:async()=>null},
    '@/components/menu/jamila-menu':{JamilaMenu,JAMILA_SLUG},
    '@/components/menu/tea-bakery-menu':{TeaBakeryMenu:marker('tea')},
    '@/components/menu/signature-menu':{SignatureMenu:marker('signature')},
    '@/components/menu/bistro-menu':{BistroMenu:marker('bistro')},
    '@/components/menu/french-corner-menu':{FrenchCornerMenu:marker('french')},
    '@/components/menu/loco-menu':{LocoMenu:marker('loco')},
    '@/components/store/together-store':{TogetherStore:marker('store')},
    '@/components/analytics/public-page-analytics':{PublicPageAnalytics:()=>null},
    '@/components/menu/menu-auto-refresh':{MenuAutoRefresh:()=>null},
  });
  const props={params:Promise.resolve({slug:JAMILA_SLUG}),searchParams:Promise.resolve({})};
  check(renderToStaticMarkup(await route.default(props)).includes('قائمتنا قريبًا'),'Empty Jamila route renders its identity');
  currentMenu={...menu,products:[{id:'published'}]};
  check(renderToStaticMarkup(await route.default(props)).includes('data-view="signature"'),'Future products remain visible through catalog');
  currentMenu={...menu,slug:'other'};
  check(!renderToStaticMarkup(await route.default(props)).includes('قائمتنا قريبًا'),'Other menus unchanged');
  currentMenu=null;
  await assert.rejects(()=>route.default(props),/not-found/);checks++;
  currentMenu=menu;
  await assert.rejects(()=>route.default({...props,searchParams:Promise.resolve({showcase:'1'})}),/not-found/);checks++;
  landing={identity:{slug:JAMILA_SLUG}};
  await assert.rejects(()=>route.default(props),/redirect/);checks++;
  check((await route.generateViewport(props)).themeColor==='#5c5c5c','Jamila browser theme matches identity');
  let ownerSlug=JAMILA_SLUG, storedPath=null, ownerRole='cafe_owner', authenticated=true;
  const storedLogo='https://barndaksa.com'+JAMILA_LOGO;
  const db={auth:{getUser:async()=>({data:{user:authenticated?{id:'owner'}:null}})},from(table){return{select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='profiles'?{role:ownerRole,status:'active'}:{logo_url:storedLogo,logo_storage_path:storedPath}};}}}};
  const settings=load('lib/data/settings.ts',{
    '@/lib/supabase/server':{createClient:async()=>db},
    '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'jamila-id',slug:ownerSlug,name:'Jamila',businessCategory:'cafes_coffee'})},
    '@/lib/platform/maintenance':{readMaintenanceSessionCookie:async()=>null},
    '@/lib/data/mappers':{mapDbSettingsToCafeSettings:()=>({})},
    '@/lib/storage/resolve-storage-url':{storageBucketForLogo:()=> 'cafe-logos',resolvePublishedStoragePathToUrl:async()=> 'https://storage.example/new-owner-logo.png'},
  });
  check((await settings.getOwnerCafeSettings()).logoDataUrl===storedLogo,'Owner sidebar receives stored Jamila logo URL');
  storedPath='jamila-id/new-logo.png';
  check((await settings.getOwnerCafeSettings()).logoDataUrl==='https://storage.example/new-owner-logo.png','New owner upload takes priority');
  storedPath=null;ownerSlug='other';
  check((await settings.getOwnerCafeSettings()).logoDataUrl===undefined,'Other owner account behavior unchanged');
  ownerSlug=JAMILA_SLUG;ownerRole='platform_admin';
  await assert.rejects(()=>settings.getOwnerCafeSettings(),/الصيانة/);checks++;
  authenticated=false;
  await assert.rejects(()=>settings.getOwnerCafeSettings(),/سجل دخولك/);checks++;
  const css=fs.readFileSync(path.join(root,'components/menu/jamila-menu.module.css'),'utf8');
  check(css.includes('max-width: 600px') && css.includes(':focus-visible') && css.includes('prefers-reduced-motion'),'Responsive keyboard and reduced-motion styles');
  const image=await sharp(path.join(root,'public/menu-art/jamila/logo-v1.png')).metadata();
  check(image.hasAlpha && image.width>1000 && image.height>300,'Transparent production logo');
  console.log(`Jamila: ${checks} checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
