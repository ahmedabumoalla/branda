'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const inputs = new Set(), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  inputs.add(file); const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.endsWith('.css')) { const f = path.join(path.dirname(file), name); inputs.add(f); return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; }
    if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (name === '@/app/actions/gift-orders') return { submitGiftOrderAction() { throw Error('No live orders in render checks'); }, trackGiftOrderAction() { throw Error('No tracking requests in render checks'); } };
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
    return require(name);
  }, exports); return exports;
}
let assertions = 0;
function check(value, label) { assert.ok(value, label); assertions++; }
const { FawaselStore } = load('components/store/fawasel-store.tsx');
const { FawaselLoyaltyCard } = load('components/store/fawasel-loyalty-card.tsx');
const { productMinimumPrice, giftProductAvailable } = load('lib/commerce/storefront-cart.ts');
const product = { id:'00000000-0000-4000-8000-000000000001', name:'حذاء أبيض', category:'أحذية', categoryId:'shoes', description:'خامة شبكية', price:100, ingredients:[], available:true, images:[{url:'https://example.test/shoe.jpg',alt:'حذاء أبيض'}], videos:[], commerceDetails:{ options:[{id:'40',label:'40 / أبيض',price:120,available:true,stock:null},{id:'41',label:'41 / أبيض',price:130,available:false,stock:0}] } };
const menu = { name:'فواصل',slug:'brand-1c2b6f7e028f',businessCategory:'clothing_stores',logoUrl:null,description:null,loyaltyEnabled:true,categories:[{id:'shoes',name:'أحذية',description:null}],products:[product],contacts:{feedbackEnabled:false,instagramUrl:null,location:null} };
const html = renderToStaticMarkup(React.createElement(FawaselStore,{menu,settings:null,loyalty:{purchasesRequired:3,rewardName:'خصم 20%'}}));
for (const value of ['فواصل','حضورك','حذاء أبيض','120','نادي فواصل','/loyalty/brand-1c2b6f7e028f','/fawasel/brand-reference.jpeg','fawasell6','vamos_sa1']) check(html.includes(value), `SSR ${value}`);
check(!html.includes('غرسَتك'), 'No plant branding in retail storefront');
check(productMinimumPrice(product) === 120, 'Hero uses available variant price');
check(!giftProductAvailable({...product,commerceDetails:{options:product.commerceDetails.options.map(o=>({...o,available:false}))}}), 'Sold-out variants cannot be advertised available');
const card = renderToStaticMarkup(React.createElement(FawaselLoyaltyCard,{customerName:'عميل فواصل',stamps:2,required:3,rewardName:'خصم 20%',preview:true}));
check(card.includes('عميل فواصل') && card.includes('خصم 20%'), 'Card uses actual member/reward values');
check((card.match(/aria-label="الختم/g)||[]).length === 3, 'Actual loyalty goal preserved');
check((card.match(/ مكتمل"/g)||[]).length === 2, 'Collected stamps preserved');
check(!card.includes('رمز بطاقة'), 'Preview never invents member code');
const empty = renderToStaticMarkup(React.createElement(FawaselStore,{menu:{...menu,products:[],categories:[],loyaltyEnabled:false},settings:null,loyalty:null}));
check(empty.includes('ما لقينا منتج') && !empty.includes('نادي فواصل'), 'Empty catalog and disabled loyalty handled');
const css = fs.readFileSync('components/store/fawasel-store.module.css','utf8');
check(css.includes('prefers-reduced-motion') && css.includes(':focus-visible'), 'Motion and focus styles');
check(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'), 'Narrow product layout');
inputs.add('package.json'); inputs.add('package-lock.json'); inputs.add('public/fawasel/brand-reference.jpeg');
const evidence={finishedAt:new Date().toISOString(),runtime:process.version,command:'node scripts/check-fawasel-storefront.cjs',assertions,passed:true,inputs:Object.fromEntries([...inputs].sort().map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),limits:['SSR and source checks, no browser or real checkout']};
fs.mkdirSync('output/fawasel-import-20261114',{recursive:true});fs.writeFileSync('output/fawasel-import-20261114/storefront-checks.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({assertions,passed:true}));
