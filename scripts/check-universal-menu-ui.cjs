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
for(const slug of ['rast','kat-coffe','test-cafe','basilico']) {
  const credit=render({...base,slug}).match(/<a[^>]*class="platformCredit"[\s\S]*?<\/a>/)?.[0];
  assert(credit?.includes('href="https://barndaksa.com"')&&credit.includes('/brand/barndaksa-footer-v1.webp')&&credit.includes('alt="برندة"'),'Every menu credits Branda with its real linked logo');
}
for(const slug of ['basilico','new-brand','double-b-bistro']) {html=render({...base,slug});assert(!html.includes('rast-spotlight-title'));assert(html.includes('menu-catalog'));assert(html.includes('Actual product'));}
html=render({...enabled,slug:'basilico'});assert(!html.includes('rast-spotlight-title'));assert(html.includes('16'));
const kath={...base,slug:'kat-coffe',name:'مقهى كاث kath',logoUrl:'/menu-logos/kath-transparent-v1.webp',products:[{...product,name:'قهوة كاث',images:[{url:'https://images.test/kath-coffee.webp',alt:'قهوة كاث'}]}]};
html=render(kath);
assert(html.includes('rast-spotlight-title')&&html.includes('قائمة مقهى كاث')&&html.includes('بطاقة ولاء مقهى كاث'));
assert(html.includes('kath-transparent-v1.webp')&&html.includes('images.test/kath-coffee.webp'));
assert(html.includes('بطاقة الولاء غير متاحة حاليًا')&&!html.includes('/loyalty/'));
assert(!/KAWAKIB|الكواكب|rast-coffee-editorial|kawakib-transparent|966532751005|pr6HtT5/.test(html),'Kath must never inherit Kawakib identity, photos or contacts');
const kathSocial=html.match(/<section[^>]+aria-label="مقهى كاث على منصات التواصل"[\s\S]*?<\/section>/)?.[0];
assert(kathSocial,'Kath exposes the same social icon strip');
for(const name of ['سناب شات','تيك توك','إنستقرام','واتساب'])assert(kathSocial.includes(name));
assert(!kathSocial.includes('href=')&&!kathSocial.includes('<button'),'unconfigured social icons have no invented destinations or empty actions');
assert(html.includes('placeholder="ابحث عن صنف"')&&html.includes('compactTools'),'Kath has a compact search row');
assert(html.includes('aria-label="عرض الشبكة" title="عرض الشبكة" aria-pressed="true"')&&html.includes('aria-label="عرض القائمة" title="عرض القائمة" aria-pressed="false"'),'both layout choices are visible before opening filters');
assert(!html.includes('id="menu-filters"')&&(html.match(/aria-label="طريقة عرض المنيو"/g)||[]).length===1,'layout choice is outside the collapsed filter panel, without duplicates');
html=render({...kath,loyaltyEnabled:true,highlights:{asOf:Date.now(),items:[active]}});
assert(html.includes('/loyalty/kat-coffe?source=menu')&&!html.includes('/loyalty/rast'));
assert(html.includes('Active offer')&&html.includes('BRAND20'));
html=render({...kath,logoUrl:'/own-replacement-logo.png',products:[{...product,name:'Updated dashboard product',price:33}]});
assert(html.includes('/own-replacement-logo.png')&&!html.includes('kath-transparent-v1.webp'));
assert(html.includes('Updated dashboard product')&&html.includes('33')&&!html.includes('قهوة كاث'));
html=render({...kath,products:[]});assert(html.includes('قائمتنا قيد التحضير')&&!html.includes('rast-spotlight-title'));
const shahi={...kath,slug:'shahi-w-hail',name:'شاهي وهيل',logoUrl:'/menu-logos/shahi-transparent-v2.webp',loyaltyEnabled:true,products:[{...product,name:'شاي احمر',images:[{url:'https://images.test/shahi-tea.webp',alt:'شاي احمر'}]}]};
html=render(shahi);
assert(html.includes('shahi-tea-atmosphere-v2.webp')&&html.includes('TEA &amp; HEEL')&&html.includes('قائمة شاهي وهيل'));
assert(html.includes('/loyalty/shahi-w-hail?source=menu')&&html.includes('بطاقة ولاء شاهي وهيل')&&html.includes('compactTools'));
assert(!/KAWAKIB|الكواكب|مقهى كاث|KATH|kath-coffee|rast-coffee|966532751005/.test(html));
assert(html.includes('شاهي يُـروّق')&&html.includes('وهيل يطيّب الخاطر')&&html.includes('shahi-tea-atmosphere-v2.webp')&&!html.includes('rastHeroBackdrop'),'Shahi has an independent tea atmosphere composition');
assert(html.includes('aria-label="عرض القائمة" title="عرض القائمة" aria-pressed="true"'),'Shahi starts with the readable menu list');
assert(!html.includes('rast-spotlight-title'),'Do not repeat a fallback product before Shahi catalog');
html=render({...shahi,highlights:{asOf:Date.now(),items:[active]}});assert(html.includes('Active offer')&&html.includes('BRAND20'),'Published offers remain visible in Shahi');
for(const name of ['سناب شات','تيك توك','إنستقرام','واتساب'])assert(html.includes(name));
html=render({...shahi,loyaltyEnabled:false});assert(!html.includes('/loyalty/')&&html.includes('بطاقة الولاء غير متاحة حاليًا'));
html=render({...shahi,logoUrl:'/owner-new-logo.png',products:[{...product,name:'Own tea update',price:17}]});
assert(html.includes('/owner-new-logo.png')&&html.includes('Own tea update')&&html.includes('17'));
if(process.env.KATH_LIVE_FIXTURE) {
  const live=JSON.parse(fs.readFileSync(process.env.KATH_LIVE_FIXTURE,'utf8'));
  assert.equal(live.slug,'kat-coffe');html=render(live);
  assert.equal((html.match(/aria-label="عرض تفاصيل /g)||[]).length,live.products.length);
  assert(html.includes('rastHeroBackdrop')&&html.includes('kath-coffee-editorial-v1.webp')&&!html.includes('kath-latte-cutout'),'Kath uses its own full-bleed scene behind the opening');
  assert(html.includes('/_next/image?url=')&&html.includes('srcSet=')&&html.includes('loading="lazy"'),'Kath publishes optimized responsive lazy images');
  assert(!/الكواكب|KAWAKIB|\/loyalty\/rast|rast-coffee-editorial/.test(html));
  console.log(`PASS Kath live fixture: ${live.products.length} own products, original logo and actual loyalty availability`);
}
const taza={...base,slug:'taza',name:'تازا',logoUrl:'/menu-logos/taza-extracted-20261014.webp',loyaltyEnabled:true};
html=render(taza);
assert(html.includes('قائمة تازا')&&html.includes('TAZA COFFEE')&&html.includes('/loyalty/taza?source=menu'));
assert(!/KAWAKIB|الكواكب|مقهى كاث|شاهي وهيل|kath-coffee|rast-coffee/.test(html),'Taza identity stays isolated');
assert(html.includes('aria-label="العروض"')&&html.includes('compactTools'));
html=render({...taza,loyaltyEnabled:false,products:[]});
assert(!html.includes('/loyalty/')&&html.includes('قائمتنا قيد التحضير'));
html=render({...taza,logoUrl:'/owner-taza-logo.png',products:[{...product,name:'Owner Taza update',price:37}]});
assert(html.includes('/owner-taza-logo.png')&&html.includes('Owner Taza update')&&html.includes('37'));
if(process.env.TAZA_LIVE_FIXTURE) {
  const live=JSON.parse(fs.readFileSync(process.env.TAZA_LIVE_FIXTURE,'utf8'));
  assert.equal(live.slug,'taza');html=render(live);
  assert.equal((html.match(/aria-label="عرض تفاصيل /g)||[]).length,live.products.length);
  for(const product of live.products) assert(html.includes(`data-product-id="${product.id}"`));
  assert(html.includes('srcSet=')&&html.includes('loading="lazy"'));
  console.log(`PASS Taza live fixture: ${live.products.length} products, own identity, dashboard updates, service gates and empty states`);
}
if(process.env.SHAHI_LIVE_FIXTURE) {
  const live=JSON.parse(fs.readFileSync(process.env.SHAHI_LIVE_FIXTURE,'utf8'));
  assert.equal(live.slug,'shahi-w-hail');html=render(live);
  assert.equal((html.match(/aria-label="عرض تفاصيل /g)||[]).length,live.products.length);
  for(const product of live.products) assert(html.includes(`data-product-id="${product.id}"`));
  assert(html.includes('srcSet=')&&html.includes('loading="lazy"'));
  console.log(`PASS Shahi live fixture: ${live.products.length} original products, independent layout, original logo and working service gates`);
}
if(process.env.MENU_BASELINE_FILE) {
  const {BistroMenu:Previous}=load('components/menu/bistro-menu.tsx',{'components/menu/bistro-menu.tsx':fs.readFileSync(process.env.MENU_BASELINE_FILE,'utf8')});
  const withoutCredit=html=>html.replace(/<a[^>]*class="platformCredit"[\s\S]*?<\/a>|<span>بواسطة <b>برندة<\/b><\/span>/g,'BRANDA_CREDIT');
  for(const slug of ['basilico','new-brand','double-b-bistro','rast','kat-coffe']) for(const fixture of [base,enabled]) {const menu={...fixture,slug};hook=0;const previous=renderToStaticMarkup(React.createElement(Previous,{menu}));assert.equal(withoutCredit(render(menu)),withoutCredit(previous),`Preserve ${slug} full menu markup except requested shared credit with optional services ${Boolean(fixture.loyaltyEnabled)}`);}
  console.log('PASS ten standalone menu SSR baselines unchanged outside the requested shared footer credit');
}
console.log('PASS universal menu service gates own-brand links offers expiry event details existing layout and published pricing');
console.log('PASS Kath editorial identity, own loyalty gates, dashboard data replacement and empty catalog');
