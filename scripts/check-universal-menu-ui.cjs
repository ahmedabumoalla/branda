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
if(process.env.MENU_BASELINE_FILE) {
  const {BistroMenu:Previous}=load('components/menu/bistro-menu.tsx',{'components/menu/bistro-menu.tsx':fs.readFileSync(process.env.MENU_BASELINE_FILE,'utf8')});
  for(const slug of ['basilico','new-brand','double-b-bistro','rast']) {const menu={...base,slug};hook=0;const previous=renderToStaticMarkup(React.createElement(Previous,{menu}));assert.equal(render(menu),previous,`Preserve ${slug} full menu markup when optional services are inactive`);}
  console.log('PASS four complete standalone menu SSR baselines unchanged');
}
console.log('PASS universal menu service gates own-brand links offers expiry event details existing layout and published pricing');
