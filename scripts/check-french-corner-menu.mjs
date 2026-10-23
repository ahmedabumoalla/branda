import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url),root=process.cwd();
const target='components/menu/french-corner-menu.tsx';
let state=[],cursor=0;
const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useEffect(){},useRef(){return {current:null};}};
const stubs={
 'next/link':{__esModule:true,default:'a'},
 './bistro-menu':{ProductDetails:props=>React.createElement('div',{'data-selected':props.product.id,'data-price':props.product.price})},
 './menu-services':{MenuServices:()=>React.createElement('button',{'aria-label':'خدمات المقهى'},'خدمات')},
 './loyalty-link-content':{LoyaltyLinkContent:({className,label})=>React.createElement('span',{className},label)},
 '@/lib/analytics/public-tracking':{trackBrandEngagement:()=>{}},
 'motion/react':{AnimatePresence:({children})=>children},
};
function load(file,cache=new Map()){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','exports',output)(name=>{
  if(file===target&&name==='react')return hooks;
  if(name in stubs)return stubs[name];
  if(name.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.startsWith('.')||name.startsWith('@/')){const p=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(p+(fs.existsSync(p+'.tsx')?'.tsx':'.ts'),cache);}
  return require(name);
 },exports);return exports;
}
const {FrenchCornerMenu}=load(target);
const p=(id,name,price,categoryId='coffee')=>({id,name,price,categoryId,category:categoryId==='coffee'?'قهوة':'حلا',description:'',available:true,calories:null,ingredients:[],images:[],videos:[],promo:null});
const source={name:'مقهى الركن الفرنسي',slug:'brand-10620d3a586c',logoUrl:'/own-logo.webp',description:'قهوة وحلويات',loyaltyEnabled:true,categories:[{id:'coffee',name:'قهوة'},{id:'sweet',name:'حلا'}],products:[p('a','لاتيه',18),p('b','إسبريسو',12),p('c','كيك',25,'sweet')],contacts:{location:null,instagramUrl:null,feedbackEnabled:false}};
global.document={getElementById:()=>({scrollIntoView(){}})};
function render(menu=source,loyalty={purchasesRequired:6,rewardName:'خصم 10%'}){cursor=0;const tree=FrenchCornerMenu({menu,loyalty});return {tree,html:renderToStaticMarkup(tree)};}
function nodes(tree,predicate){const found=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}if(predicate(n))found.push(n);walk(n.props?.children);}walk(tree);return found;}
const cards=tree=>nodes(tree,n=>Boolean(n.props?.['data-product-id'])).map(n=>n.props['data-product-id']);
let checks=0;function check(name,fn){fn();checks++;console.log('PASS '+name);}
check('French identity, direct loyalty and complete catalog SSR',()=>{const {tree,html}=render();assert.deepEqual(cards(tree),['a','b','c']);assert(html.includes('atelier-v3'));assert(html.includes('/loyalty/brand-10620d3a586c?source=menu'));assert(html.includes('مقهى الركن الفرنسي'));assert(!html.includes('GOOD FOOD'));assert(!html.includes('double-b'));assert(!html.includes('الكواكب'));});
check('Search and empty state use actual customer input',()=>{let r=render();nodes(r.tree,n=>n.type==='input'&&n.props.type==='search')[0].props.onChange({target:{value:'لاتيه'}});assert.deepEqual(cards(render().tree),['a']);r=render();nodes(r.tree,n=>n.type==='input')[0].props.onChange({target:{value:'غير موجود'}});assert.deepEqual(cards(render().tree),[]);assert(render().html.includes('خلّنا نجرّب'));state=[];});
check('Category filter and price ordering retain catalog links',()=>{let r=render();nodes(r.tree,n=>n.type==='button'&&n.key==='coffee')[0].props.onClick();assert.deepEqual(cards(render().tree),['a','b']);r=render();nodes(r.tree,n=>n.type==='select')[0].props.onChange({target:{value:'low'}});assert.deepEqual(cards(render().tree),['b','a']);state=[];});
check('Compact categories expand and keep a selected later category visible after collapse',()=>{const menu={...source,categories:Array.from({length:8},(_,i)=>({id:'group'+i,name:'قسم '+i})),products:Array.from({length:8},(_,i)=>p('item'+i,'صنف '+i,10,'group'+i))};const buttons=r=>nodes(r.tree,n=>n.type==='button'&&typeof n.props['aria-pressed']==='boolean');const toggle=r=>nodes(r.tree,n=>n.type==='button'&&n.props['aria-controls']==='french-category-options')[0];let r=render(menu);assert.equal(buttons(r).length,6);assert.equal(toggle(r).props['aria-expanded'],false);toggle(r).props.onClick();r=render(menu);assert.equal(buttons(r).length,9);buttons(r).find(n=>n.key==='group7').props.onClick();r=render(menu);assert.deepEqual(cards(r.tree),['item7']);toggle(r).props.onClick();r=render(menu);assert.equal(buttons(r).length,6);assert(buttons(r).find(n=>n.key==='group7').props['aria-pressed']);assert.deepEqual(cards(r.tree),['item7']);state=[];});
check('Details follow live product edits and close when product is removed',()=>{const r=render();nodes(r.tree,n=>n.type==='button'&&n.props['aria-label']==='عرض تفاصيل لاتيه')[0].props.onClick();assert(render().html.includes('data-selected="a"'));assert(render({...source,products:source.products.map(x=>({...x,price:x.id==='a'?19:x.price}))}).html.includes('data-price="19"'));assert(!render({...source,products:source.products.slice(1)}).html.includes('data-selected'));state=[];});
check('No loyalty link without entitlement; no fabricated product photos',()=>{const {html}=render({...source,loyaltyEnabled:false});assert(!html.includes('/loyalty/'));assert(html.includes('data-no-photo="true"'));assert(html.includes('role="img"'));state=[];});
check('Uncategorized and empty catalogs remain usable',()=>{assert.deepEqual(cards(render({...source,products:[p('u','منتج',14,null)]}).tree),['u']);assert(render({...source,products:[]}).html.includes('قائمتنا قيد التحضير'));state=[];});
check('Loyalty card precedes catalog and follows live program settings',()=>{const {html}=render();assert(html.indexOf('id="french-membership"')<html.indexOf('id="french-catalog"'));assert(html.includes('٦ أختام'));assert(html.includes('خصم 10%'));const updated=render(source,{purchasesRequired:8,rewardName:'خصم 15%'}).html;assert(updated.includes('٨ أختام'));assert(updated.includes('خصم 15%'));assert(!updated.includes('خصم 10%'));const fallback=render(source,null).html;assert(!fallback.includes('٦ أختام'));assert(!fallback.includes('خصم 10%'));assert(fallback.includes('افتح بطاقة الولاء'));});
check('Salon opening retains utility controls and catalog/loyalty access without a bottom dock',()=>{const {tree,html}=render();assert(html.includes('data-french-opening="salon"'));assert(html.includes('/french-corner/salon.webp'));assert(!html.includes('اختصارات المنيو'));assert(!html.includes('french-discovery-title'));assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='البحث في المنيو').length,1);assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='مشاركة المنيو').length,1);assert(html.includes('href="#french-catalog"'));assert(html.includes('href="#french-membership"'));state=[];});
check('Active offers use discounted price and preserve original price',()=>{const {html}=render({...source,highlights:{asOf:Date.now(),items:[{id:'offer',kind:'general',title:'خصم',discountPercent:10,expiresAt:null}]}});assert(html.includes('16.2'));assert(html.includes('<del>18</del>'));});
check('Featured dessert and drink photos open live details and follow removal',()=>{
 state=[];
 const products=['دلوتشي بيكان','ايس اسبانش لاتيه','بلو اوشن','كيك دبي'].map((name,i)=>({...p('feature'+i,name,20+i,i%2?'coffee':'sweet'),images:[{url:'/photo'+i+'.webp',alt:name}]}));
 const menu={...source,products};
 const r=render(menu);const features=nodes(r.tree,n=>n.type==='button'&&n.props['data-french-feature']);
 assert.equal(features.length,4);features[0].props.onClick();
 assert(render(menu).html.includes('data-selected="feature0"'));
 assert(render({...menu,products:products.map((p,i)=>i===0?{...p,price:27}:p)}).html.includes('data-price="27"'));
 const removed=render({...menu,products:products.slice(1)});
 assert(!removed.html.includes('data-selected'));
 assert.equal(nodes(removed.tree,n=>n.type==='button'&&n.props['data-french-feature']).length,3);
 assert.equal(nodes(render({...menu,products:products.map(p=>({...p,images:[]}))}).tree,n=>n.props?.['data-french-feature']).length,0);
 state=[];
});
check('Owner supplied Snapchat and map destinations are active accessible links',()=>{
 const {html}=render();
 assert(html.includes('href="https://www.snapchat.com/add/frenchcorner26"'));
 assert(html.includes('href="https://maps.app.goo.gl/ZA1JH1LjR72skeEo7"'));
 assert(html.includes('rel="noopener noreferrer"'));assert(!html.includes('غير مضاف بعد'));
});
check('Experience card uses published offers, current prices and product details',()=>{
 state=[];const menu={...source,highlights:{asOf:Date.now(),items:[{id:'live-offer',kind:'products',productId:'a',title:'عرض لاتيه',description:'لحظة قهوة',imageUrl:'/offer.webp',discountPercent:20,code:'CAFE',showInSpotlight:true,expiresAt:Date.now()+60000}]}};
 const r=render(menu);assert(r.html.includes('id="french-offers-title"'));assert(r.html.includes('data-french-offer="live-offer"'));assert(r.html.includes('خصم 20'));assert(r.html.includes('14.4'));assert(r.html.includes('CAFE'));
 const article=nodes(r.tree,n=>n.props['data-french-offer']==='live-offer')[0];nodes(article,n=>n.type==='button')[0].props.onClick();assert(render(menu).html.includes('data-selected="a"'));
 assert(render({...menu,products:source.products.filter(p=>p.id!=='a')}).html.includes('data-french-offer="live-offer"')===false);state=[];
});
check('Experience excludes expired, hidden and unavailable linked offers without inventing discounts',()=>{
 state=[];const product={...p('photo','دلوتشي بيكان',22,'sweet'),images:[{url:'/cake.webp',alt:''}]};
 const menu={...source,products:[product],highlights:{asOf:100,items:[{id:'expired',title:'منتهي',productId:'photo',expiresAt:99},{id:'hidden',title:'مخفي',productId:'photo',showInSpotlight:false},{id:'gone',title:'محذوف',productId:'missing'},{id:'missing-reward',title:'هدية محذوفة',productId:'photo',freeProductId:'missing'}]}};
 const r=render(menu);assert(r.html.includes('data-french-offer="discover-photo"'));assert(r.html.includes('اختيار من قائمتنا'));assert(!r.html.includes('خصم 20'));for(const id of ['expired','hidden','gone','missing-reward'])assert(!r.html.includes(`data-french-offer="${id}"`));
 assert(!render({...menu,products:[]}).html.includes('id="french-offers"'));state=[];
});
check('Experience supports general campaigns and events using the French catalog anchor',()=>{
 state=[];const r=render({...source,highlights:{asOf:100,items:[{id:'general',kind:'general',title:'عرض القهوة',discountPercent:10},{id:'event',kind:'event',title:'لقاء القهوة',eventDate:'2026-10-24',eventTime:'18:00',eventLocation:'الركن الفرنسي'}]}});
 assert(r.html.includes('data-french-offer="general"'));assert(r.html.includes('data-french-offer="event"'));assert(r.html.includes('2026-10-24'));assert(r.html.includes('18:00'));assert(!r.html.includes('#rast-menu-items'));assert(!r.html.includes('RAST'));state=[];
});
const route=fs.readFileSync('app/menu/[slug]/page.tsx','utf8');assert(route.includes('menu.slug === "brand-10620d3a586c" ? <FrenchCornerMenu'));assert(route.includes('if (showcase) return <div inert>{presentation}</div>'));
console.log(`${checks} French Corner behavior groups and tenant/preview routing passed`);
