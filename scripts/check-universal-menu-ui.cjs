const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
let forcedPanel=null, hook=0;
function load(relative, overrides={}, cache=new Map()) {
  if(cache.has(relative)) return cache.get(relative);
  const source=overrides[relative]??fs.readFileSync(path.join(root,relative),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};cache.set(relative,exports);
  new Function('require','exports',compiled)(name=>{
    if(name==='react'&&relative==='components/menu/menu-services.tsx') return {...React,useState(value){const state=React.useState(value);return hook++===0&&forcedPanel?[forcedPanel,()=>{}]:state;}};
    if(name.endsWith('.css')) return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(name.startsWith('@/')||name.startsWith('.')) {const target=name.startsWith('@/')?name.slice(2):path.join(path.dirname(relative),name);return load(fs.existsSync(path.join(root,target+'.tsx'))?target+'.tsx':target+'.ts',overrides,cache);}
    return require(name);
  },exports);
  return exports;
}
const product={id:'p1',name:'Actual product',description:'Actual description',price:20,available:true,category:'Drinks',categoryId:'drinks',ingredients:[],images:[],videos:[],promo:null};
const base={slug:'basilico',name:'Independent Brand',logoUrl:null,description:null,products:[product],categories:[{id:'drinks',name:'Drinks',description:null}],contacts:{feedbackEnabled:false,instagramUrl:null,location:null}};
const {MenuServices}=load('components/menu/menu-services.tsx');
const services=(menu,panel)=>{hook=0;forcedPanel=panel;return renderToStaticMarkup(React.createElement(MenuServices,{menu}));};
let html=services(base,'about');
assert(!html.includes('/loyalty/')&&!html.includes('اكتشف عروضنا الحالية'));
const active={id:'offer',kind:'general',title:'Active offer',description:'Offer details',imageUrl:null,productId:null,discountPercent:20,code:'BRAND20',expiresAt:null};
const enabled={...base,loyaltyEnabled:true,highlights:{asOf:Date.now(),items:[active]}};
html=services(enabled,'about');assert(html.includes('/loyalty/basilico'));assert(html.includes('اكتشف عروضنا الحالية'));assert(!html.includes('/loyalty/rast'));
html=services(enabled,'offers');assert(html.includes('Active offer')&&html.includes('BRAND20')&&html.includes('20'));
html=services({...enabled,highlights:{asOf:Date.now(),items:[{...active,expiresAt:1}]}},'offers');assert(!html.includes('Active offer'));assert(html.includes('لا توجد عروض سارية'));
html=services({...enabled,highlights:{asOf:Date.now(),items:[{...active,kind:'event',discountPercent:null,eventDate:'2026-12-01',eventTime:'19:30',eventLocation:'Own branch'}]}},'offers');assert(html.includes('Own branch')&&html.includes('2026-12-01')&&html.includes('19:30'));
forcedPanel=null;
const {BistroMenu}=load('components/menu/bistro-menu.tsx');
const render=menu=>{hook=0;return renderToStaticMarkup(React.createElement(BistroMenu,{menu}));};
for(const slug of ['basilico','new-brand','double-b-bistro']) {html=render({...base,slug});assert(!html.includes('rast-spotlight-title'));assert(html.includes('menu-catalog'));assert(html.includes('Actual product'));}
html=render({...enabled,slug:'basilico'});assert(!html.includes('rast-spotlight-title'));assert(html.includes('16'));
const kath={...base,slug:'kat-coffe',name:'مقهى كاث kath',logoUrl:'/menu-logos/kath-transparent-v1.webp',products:[{...product,name:'قهوة كاث',images:[{url:'https://images.test/kath-coffee.webp',alt:'قهوة كاث'}]}]};
html=render(kath);
assert(html.includes('rast-spotlight-title')&&html.includes('قائمة مقهى كاث')&&html.includes('بطاقة ولاء مقهى كاث'));
assert(html.includes('kath-transparent-v1.webp')&&html.includes('images.test/kath-coffee.webp'));
assert(html.includes('بطاقة الولاء غير متاحة حاليًا')&&!html.includes('/loyalty/'));
assert(!/KAWAKIB|الكواكب|rast-coffee-editorial|kawakib-transparent|966532751005|pr6HtT5/.test(html),'Kath must never inherit Kawakib identity, photos or contacts');
html=render({...kath,loyaltyEnabled:true,highlights:{asOf:Date.now(),items:[active]}});
assert(html.includes('/loyalty/kat-coffe?source=menu')&&!html.includes('/loyalty/rast'));
assert(html.includes('Active offer')&&html.includes('BRAND20'));
html=render({...kath,logoUrl:'/own-replacement-logo.png',products:[{...product,name:'Updated dashboard product',price:33}]});
assert(html.includes('/own-replacement-logo.png')&&!html.includes('kath-transparent-v1.webp'));
assert(html.includes('Updated dashboard product')&&html.includes('33')&&!html.includes('قهوة كاث'));
html=render({...kath,products:[]});assert(html.includes('قائمتنا قيد التحضير')&&!html.includes('rast-spotlight-title'));
if(process.env.KATH_LIVE_FIXTURE) {
  const live=JSON.parse(fs.readFileSync(process.env.KATH_LIVE_FIXTURE,'utf8'));
  assert.equal(live.slug,'kat-coffe');html=render(live);
  assert.equal((html.match(/aria-label="عرض تفاصيل /g)||[]).length,live.products.length);
  assert(html.includes('heroPhoto')&&!html.includes('rastHeroBackdrop'),'Kath photo is independent of background scrims');
  assert(html.includes('/_next/image?url=')&&html.includes('srcSet=')&&html.includes('loading="lazy"'),'Kath publishes optimized responsive lazy images');
  assert(!/الكواكب|KAWAKIB|\/loyalty\/rast|rast-coffee-editorial/.test(html));
  console.log(`PASS Kath live fixture: ${live.products.length} own products, original logo and actual loyalty availability`);
}
if(process.env.MENU_BASELINE_FILE) {
  const {BistroMenu:Previous}=load('components/menu/bistro-menu.tsx',{'components/menu/bistro-menu.tsx':fs.readFileSync(process.env.MENU_BASELINE_FILE,'utf8')});
  for(const slug of ['basilico','new-brand','double-b-bistro','rast']) for(const fixture of [base,enabled]) {const menu={...fixture,slug};hook=0;const previous=renderToStaticMarkup(React.createElement(Previous,{menu}));assert.equal(render(menu),previous,`Preserve ${slug} full menu markup with optional services ${Boolean(fixture.loyaltyEnabled)}`);}
  console.log('PASS eight complete standalone menu SSR baselines unchanged with services on and off');
}
console.log('PASS universal menu service gates own-brand links offers expiry event details existing layout and published pricing');
console.log('PASS Kath editorial identity, own loyalty gates, dashboard data replacement and empty catalog');
