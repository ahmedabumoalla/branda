const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks={}){const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',source)(name=>{if(name in mocks)return mocks[name];if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})};if(name.startsWith('@/'))return load(name.slice(2)+'.ts',mocks);return require(name)},exports);return exports}
const Empty=()=>null,mocks={'next/link':({children,...props})=>React.createElement('a',props,children),'./bistro-menu':{ProductDetails:Empty},'./product-offer-details':{ProductOfferBadge:Empty,ProductOfferDetails:Empty},'./menu-services':{MenuServices:Empty},'./loyalty-link-content':{LoyaltyLinkContent:({label})=>label},'@/lib/analytics/public-tracking':{trackBrandEngagement:Empty},'@/lib/menu/menu-entry-scroll':{startMenuAtTop:Empty,menuEntryUrl:(origin,slug)=>`${origin}/menu/${slug}`}};
mocks['./brand-loyalty-entry']=load('components/menu/brand-loyalty-entry.tsx',{...mocks,'next/image':input=>{const props={...input};delete props.unoptimized;return React.createElement('img',props);}});
const {LocoMenu}=load('components/menu/loco-menu.tsx',mocks);
const product={id:'one',name:'أمريكانو',description:'',categoryId:'coffee',category:'القهوة',price:12,priceOptions:[12,13],available:true,images:[{url:'https://example.test/loco.webp',alt:'قهوة'}],videos:[],ingredients:[]};
const menu={name:'LOCO',slug:'brand-9a8c97305195',logoUrl:'/loco/logo.svg',description:null,loyaltyEnabled:true,products:[product,{...product,id:'two',name:'كوكيز',price:10,priceOptions:[]}],categories:[{id:'coffee',name:'القهوة',description:null}],contacts:{feedbackEnabled:false,instagramUrl:null,location:null},branch:{id:'drive',slug:'drive-thru',name:'الدرايف ثرو'},branches:[{id:'main',slug:'murooj',name:'فرع المروج'},{id:'drive',slug:'drive-thru',name:'الدرايف ثرو'}],highlights:{asOf:100,items:[{id:'expired',title:'EXPIRED OFFER',productId:'one',expiresAt:90},{id:'current',title:'CURRENT OFFER',productId:'one',expiresAt:200,imageUrl:'https://example.test/offer.webp'},{id:'hidden',title:'HIDDEN OFFER',productId:'one',showInSpotlight:false}]}};
const render=(props={})=>renderToStaticMarkup(React.createElement(LocoMenu,{menu,loyalty:{purchasesRequired:6,rewardName:'خصم 10%'},...props}));
let html=render();for(const token of ['12 / 13','CURRENT OFFER','loco-catalog','loco-loyalty','editorial-v3','heroIdentity','heroLogo','data-loyalty-layout="compact"'])assert(html.includes(token),token);assert(!html.includes('EXPIRED OFFER')&&!html.includes('HIDDEN OFFER'));assert(!html.includes('class="stamps"')&&!html.includes('خصم 10%'),'Promotional entry never fabricates a pass balance or promises a reward');
assert(html.includes('/loyalty/brand-9a8c97305195?source=menu')&&html.includes('--loyalty-entry-background:var(--loco-ink)'),'Compact entry retains the LOCO destination and palette');
assert(render({menu:{...menu,logoUrl:'/owner-updated-loco.webp'}}).includes('/owner-updated-loco.webp'),'Promotional entry follows the current owner logo');
assert(!html.includes('branch=murooj')&&!html.includes('branch=drive-thru')&&!html.includes('aria-label="الفروع"'),'Public menu has no branch navigation');
assert(!html.includes('الدرايف ثرو')&&!html.includes('فرع المروج'),'Branch labels do not enter the public composition');
assert(html.indexOf('id="loco-offers"')<html.indexOf('id="loco-loyalty"')&&html.indexOf('id="loco-loyalty"')<html.indexOf('id="loco-catalog"'),'Loyalty sits between spotlight and catalog');
assert(/class="heroLogo"[^>]+src="\/loco\/logo.svg"|src="\/loco\/logo.svg"[^>]+class="heroLogo"/.test(html),'The original SVG is the central brand mark');
const branchOfferHtml=render({menu:{...menu,highlights:{asOf:100,items:[{...menu.highlights.items[1],description:'اكتشف الدونات في الدرايف ثرو'}]}}});
assert(branchOfferHtml.includes('اكتشف الدونات')&&!branchOfferHtml.includes('في الدرايف ثرو'),'Legacy promotional branch suffixes stay out of the public copy');
html=render({loyalty:null});assert(!html.includes('id="loco-loyalty"'));html=render({menu:{...menu,loyaltyEnabled:false}});assert(!html.includes('id="loco-loyalty"'));html=render({menu:{...menu,products:[],highlights:{asOf:100,items:[]}}});assert(html.includes('المنيو يتجهّز لك'));
// Execute actual search, category reset, offer navigation and product selection callbacks.
let slots=[],cursor=0;const hookReact={...React,useEffect(){},useRef:value=>({current:value}),useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]}};
const Interactive=load('components/menu/loco-menu.tsx',{...mocks,react:hookReact,'motion/react':{useReducedMotion:()=>true,motion:{button:'button',article:'article'},AnimatePresence:React.Fragment}}).LocoMenu;
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)],draw=()=>{cursor=0;return Interactive({menu,loyalty:{purchasesRequired:6,rewardName:'خصم 10%'}})};
let tree=draw();nodes(tree).find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'كوكيز'}});tree=draw();assert.equal(nodes(tree).filter(n=>n.type==='article'&&n.props.className==='product').length,1);
nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'غير موجود'}});tree=draw();assert.equal(nodes(tree).filter(n=>n.type==='article'&&n.props.className==='product').length,0);const reset=nodes(tree).find(n=>n.type==='button'&&n.props.children==='عرض كل الأصناف');assert(reset);reset.props.onClick();tree=draw();assert.equal(nodes(tree).filter(n=>n.type==='article'&&n.props.className==='product').length,2);
nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='تفاصيل أمريكانو').props.onClick();tree=draw();assert(nodes(tree).some(n=>n.props?.product?.id==='one'&&typeof n.props.close==='function'));
// Experiences and promotions belong above the catalog, never inside its product grid.
const experience={...product,id:'art',categoryId:'experiences',category:'تجارب لوكو',name:'تجربة الرسم',price:45,priceOptions:[]};
html=render({menu:{...menu,products:[...menu.products,experience],categories:[...menu.categories,{id:'experiences',name:'تجارب لوكو',description:null}]}});
assert(html.indexOf('id="loco-offers"')<html.indexOf('id="loco-catalog"'));
const catalog=html.slice(html.indexOf('<section class="catalog"'),html.indexOf('<footer class="footer"'));
assert(!catalog.includes('تجربة الرسم')&&!catalog.includes('CURRENT OFFER')&&!catalog.includes('عرض مخصص'));
assert(html.includes('تجربة الرسم'));assert.equal((catalog.match(/class="product"/g)||[]).length,2);
assert(html.includes('خذ مزاجك')&&html.includes('معك'));
const mainHtml=render({menu:{...menu,branch:menu.branches[0],products:[{...product,name:'صنف المروج فقط'}]}});
assert(mainHtml.includes('خذ وقتك')&&!mainHtml.includes('فرع المروج'));
assert(mainHtml.includes('صنف المروج فقط')&&!mainHtml.includes('كوكيز'),'Each public branch renders only its supplied products');
assert(mainHtml.indexOf('id="loco-offers"')<mainHtml.indexOf('id="loco-loyalty"')&&mainHtml.indexOf('id="loco-loyalty"')<mainHtml.indexOf('id="loco-catalog"'));
// Real spotlight callbacks: next/back, direct selection, detail opening and automatic rotation guards.
let effectFns=[],interval,cleared=0,observeCallback,disconnected=0,reduced=false,selectedOffer;
const carouselReact={...hookReact,useRef:()=>({current:{}}),useEffect(fn){effectFns.push(fn)}};
const Spotlight=load('components/menu/loco-menu.tsx',{...mocks,react:carouselReact,'motion/react':{useReducedMotion:()=>reduced,motion:{article:'article'},AnimatePresence:React.Fragment}}).LocoSpotlight;
const spotlightOffers=[{id:'a',title:'الأول',productId:'one'},{id:'b',title:'الثاني',productId:'two'}];
global.IntersectionObserver=class{constructor(cb){observeCallback=cb}observe(){}disconnect(){disconnected++}};
global.window={setInterval(fn,ms){assert.equal(ms,7000);interval=fn;return 1},clearInterval(){cleared++}};global.document={hidden:false};
slots=[];const drawSpotlight=()=>{cursor=0;effectFns=[];return Spotlight({offers:spotlightOffers,menu,onSelect:id=>selectedOffer=id})};
tree=drawSpotlight();const disconnect=effectFns[0]();observeCallback([{isIntersecting:true}]);tree=drawSpotlight();const stop=effectFns[1]();assert.equal(typeof interval,'function');interval();tree=drawSpotlight();assert(nodes(tree).some(n=>n.props?.children==='الثاني'));
nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='العرض السابق').props.onClick();tree=drawSpotlight();assert(nodes(tree).some(n=>n.props?.children==='الأول'));assert.equal(effectFns[1](),undefined,'manual navigation pauses rotation');
nodes(tree).find(n=>n.type==='button'&&n.props.className==='offerAction').props.onClick();assert.equal(selectedOffer,'one');
nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='تشغيل تبديل العروض').props.onClick();tree=drawSpotlight();tree.props.onFocusCapture();tree=drawSpotlight();assert.equal(effectFns[1](),undefined,'focus pauses rotation');
slots=[];tree=drawSpotlight();effectFns[0]();observeCallback([{isIntersecting:true}]);reduced=true;tree=drawSpotlight();assert.equal(effectFns[1](),undefined,'reduced motion disables automatic changes');assert(!nodes(tree).some(n=>n.props?.['aria-label']==='إيقاف تبديل العروض'));
stop();disconnect();assert(cleared&&disconnected);delete global.window;delete global.document;delete global.IntersectionObserver;
async function checkBranchShare(){
 const originalNavigator=Object.getOwnPropertyDescriptor(global,'navigator'),originalTimeout=global.setTimeout;let sharedUrl;
 global.window={location:{origin:'https://barndaksa.com'}};Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async url=>{sharedUrl=url}}},configurable:true});global.setTimeout=()=>1;
 try{slots=[];tree=draw();await nodes(tree).find(n=>n.props?.['aria-label']==='مشاركة المنيو').props.onClick();assert.equal(sharedUrl,`https://barndaksa.com/menu/${menu.slug}?branch=drive-thru`,'Share retains the independent branch destination');}
 finally{global.setTimeout=originalTimeout;delete global.window;if(originalNavigator)Object.defineProperty(global,'navigator',originalNavigator);else delete global.navigator;}
 console.log('PASS LOCO centered original logo, hidden public branch labels, branch-scoped sharing/products, loyalty between offers/catalog, search/details, carousel navigation/pause/focus/reduced motion and timer cleanup');
}
checkBranchShare().catch(error=>{console.error(error);process.exitCode=1});
