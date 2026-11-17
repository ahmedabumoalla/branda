const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={},cache=new Map()) { file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>{
 if(Object.hasOwn(stubs,name))return stubs[name];if(name==='server-only')return {};if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
 if(name.startsWith('@/')||name.startsWith('.')){const target=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);return load(target+(fs.existsSync(target+'.tsx')?'.tsx':'.ts'),stubs,cache);}return require(name);
},exports);return exports;}
const image=({unoptimized,priority,...props})=>React.createElement('img',props);
const stubs={'next/image':{__esModule:true,default:image},'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},'@/app/actions/contact-requests':{submitHomeContactAction:async()=>{throw Error('No contact messages allowed in render test');}}};
const {BrandaHome}=load('components/marketing/branda-home-redesign.tsx',stubs);
const {homeBrands}=load('lib/marketing/home-brands.ts');
const props={contacts:{whatsapp:'0508333556'},featuredBrandSlugs:homeBrands.map(b=>b.slug)};
const html=renderToStaticMarkup(React.createElement(BrandaHome,props));
assert.equal((html.match(/data-brand=/g)||[]).length,9);
assert(html.includes('data-brand="brand-9010051467ed"'));
assert(html.includes('/menu-art/tea-bakery/logo-v1.png'));
assert(html.indexOf('id="clients"')<html.indexOf('id="features"'));
const logos=html.split('class="logoViewport"')[1].split('</section>')[0];
assert(!logos.includes('<p')&&!logos.includes('<h3')&&!logos.includes('<figcaption'),'Logos only, no visible captions');
for(const brand of homeBrands){assert(logos.includes(brand.slug));if(brand.image)assert(fs.existsSync('public'+brand.image));}
assert(!html.includes('/brand-home/reference-')&&!html.includes('+650')&&!html.includes('dashboardScene')&&!html.includes('partnerTrack'));
assert(html.includes('data-home-design="branda-business-journey"')&&html.includes('href="/login"'));
assert(html.includes('aria-controls="home-navigation"')&&html.includes('aria-pressed="true"')&&html.includes('href="#pricing"'));
assert.equal((logos.match(/class="logoGroup"/g)||[]).length,2);
assert(logos.includes('aria-hidden="true" data-copy="1"'));
const signed=renderToStaticMarkup(React.createElement(BrandaHome,{...props,account:{href:'/dashboard',name:'Owner'}}));assert(signed.includes('href="/dashboard"'));
const empty=renderToStaticMarkup(React.createElement(BrandaHome,{...props,featuredBrandSlugs:[]}));assert(!empty.includes('id="clients"'));
const plan={id:'pro',name:'Saved plan',description:'Saved description',priceMonthly:123,trialDays:0,features:[{id:'menu',label:'Menu'}],durations:[]};
const pricing=renderToStaticMarkup(React.createElement(BrandaHome,{...props,plans:[plan]}));assert(pricing.includes('Saved plan')&&pricing.includes('123')&&pricing.includes('data-plan-id="pro"'));
// Exercise button and language state without sending requests or opening a browser
let values=[],cursor=0;const reactMock={...React,useEffect(){},useRef:()=>({current:null}),useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return[values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];}};
const Interactive=load('components/marketing/branda-home-redesign.tsx',{...stubs,react:reactMock}).BrandaHome;
function walk(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const result=walk(child,predicate);if(result)return result;}return null;}
cursor=0;let tree=Interactive(props);walk(tree,node=>node.type==='button'&&node.props['aria-controls']==='journey-detail'&&node.props.children[1].props.children[0].props.children==='خلّ الزيارة تتكرر').props.onClick();
cursor=0;tree=Interactive(props);assert(walk(tree,node=>node.type==='h3'&&node.props.children==='خلّ الزيارة تتكرر'));
walk(tree,node=>node.type==='button'&&node.props.className==='logoPause').props.onClick();cursor=0;tree=Interactive(props);assert(walk(tree,node=>node.props?.className==='logoTrack'&&node.props['data-paused']===true));
walk(tree,node=>node.type==='button'&&node.props['aria-label']==='Switch to English').props.onClick();cursor=0;tree=Interactive(props);assert.equal(tree.props.dir,'ltr');assert.equal(tree.props.lang,'en');

(async()=>{
 let hookIndex=0,hookValues=[],calls=[],finish;
 const hooks={...React,useRef(initial){const index=hookIndex++;hookValues[index]??={current:initial};return hookValues[index];},useState(initial){const index=hookIndex++;if(!(index in hookValues))hookValues[index]=initial;return[hookValues[index],value=>hookValues[index]=value];}};
 const {HomeContactForm}=load('components/marketing/branda-home-contact.tsx',{react:hooks,'@/app/actions/contact-requests':{submitHomeContactAction:input=>{calls.push(input);return new Promise(resolve=>finish=resolve);}}});
 const renderForm=()=>{hookIndex=0;return HomeContactForm({t:ar=>ar,whatsapp:'966501234567',selectedPlan:'Saved plan'});};
 const originalFormData=global.FormData;let resetCount=0,focusCount=0;
 const fields={fullName:'Fixture Name',phone:'٠٥٠١٢٣٤٥٦٧',business:'Fixture Business',type:'Cafe',website:''};
 global.FormData=class{get(key){return fields[key];}};
 const event={preventDefault(){},currentTarget:{reset(){resetCount++;},querySelector(){return{focus(){focusCount++;}};}}};
 try {
   const sending=renderForm().props.onSubmit(event);await renderForm().props.onSubmit(event);assert.equal(calls.length,1);assert.equal(calls[0].phone,'0501234567');assert.equal(calls[0].selectedPlan,'Saved plan');assert.equal(renderForm().props['aria-busy'],true);
   finish({ok:false,reason:'unavailable'});await sending;assert.equal(resetCount,0);
   const retry=renderForm().props.onSubmit(event);assert.equal(calls[1].requestId,calls[0].requestId);finish({ok:true});await retry;assert.equal(resetCount,1);
   fields.phone='123';await renderForm().props.onSubmit(event);assert.equal(calls.length,2);assert.equal(focusCount,1);
 } finally {global.FormData=originalFormData;}
 const active={status:'active',started_at:'2020-01-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',platform_plans:{active:true,price_sar:100}};
 let rows=[{slug:'eligible',subscriptions:[active]},{slug:'trial',subscriptions:[{...active,status:'trialing'}]},{slug:'free',subscriptions:[{...active,platform_plans:{active:true,price_sar:0}}]},{slug:'expired',subscriptions:[{...active,expires_at:'2020-01-01T00:00:00Z'}]},{slug:'future',subscriptions:[{...active,started_at:'2099-01-01T00:00:00Z'}]},{slug:'inactive-plan',subscriptions:[{...active,platform_plans:{active:false,price_sar:100}}]}],failure=false,filters=[];
 const db={from(table){assert.equal(table,'cafes');const chain={select(columns){assert(!columns.includes('*'));return chain;},in(...args){filters.push(args);return chain;},eq(...args){filters.push(args);return chain;},is(...args){filters.push(args);return chain;},then(resolve){return Promise.resolve({data:rows,error:failure?new Error('offline'):null}).then(resolve);}};return chain;}};
 const dal=load('lib/data/home-featured-brands.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db}});
 assert.deepEqual(await dal.getHomeFeaturedBrandSlugs(),['eligible']);assert(filters.some(([key,value])=>key==='is_public'&&value===true));assert(filters.some(([key,value])=>key==='slug'&&value.length===9));
 rows=[{slug:'brand-9010051467ed',subscriptions:[{...active,status:'trialing',platform_plans:{active:true,price_sar:0}}]},{slug:'brand-9a8c97305195',subscriptions:[{...active,status:'trialing'}]}];
 assert.deepEqual(await dal.getHomeFeaturedBrandSlugs(),['brand-9010051467ed']);
 for(const override of [{status:'cancelled'},{expires_at:'2020-01-01T00:00:00Z'},{started_at:'2099-01-01T00:00:00Z'},{platform_plans:{active:false,price_sar:0}}]) {
   rows=[{slug:'brand-9010051467ed',subscriptions:[{...active,status:'trialing',...override}]}];
   assert.deepEqual(await dal.getHomeFeaturedBrandSlugs(),[],'Explicit showcase trial still requires a current available subscription');
 }
 failure=true;assert.deepEqual(await dal.getHomeFeaturedBrandSlugs(),[]);
 console.log('PASS logo-only curated brands, empty/error states, saved pricing/account links, workflow/language interaction, contact retry/idempotency/validation, non-trial/current subscription eligibility');
})().catch(error=>{console.error(error);process.exitCode=1});
