const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,stubs={},cache=new Map()) {
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',source)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name==='server-only')return {};
    if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
    if(name.startsWith('@/')||name.startsWith('.')) { const target=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);return load(fs.existsSync(target+'.tsx')?target+'.tsx':target+'.ts',stubs,cache); }
    return require(name);
  },exports);return exports;
}
const Image=({unoptimized,priority,onError,...props})=>React.createElement('img',props);
const Link=({children,...props})=>React.createElement('a',props,children);
const plans=Array.from({length:7},(_,i)=>({id:'plan-'+i,name:'Original '+i,description:'Saved description',priceMonthly:70+i*100,trialDays:0,features:[{id:'menu',label:'Menu'}],durations:[{months:3,totalAmount:(70+i*100)*2.7,discountPercent:10}]}));
const base={'next/image':{__esModule:true,default:Image},'next/link':{__esModule:true,default:Link},'./use-branda-home-motion':{useBrandaHomeMotion(){}},'@/app/actions/contact-requests':{submitHomeContactAction:async()=>({ok:true})}};
const {BrandaHome}=load('components/marketing/branda-home.tsx',base);
const props={contacts:{whatsapp:'0508333556'},plans};
const guest=renderToStaticMarkup(React.createElement(BrandaHome,props));
assert.equal((guest.match(/data-plan-id=/g)||[]).length,7);
for(const plan of plans)assert(guest.includes(plan.name));
assert(guest.includes('tel:+966508333556')&&guest.includes('https://wa.me/966508333556'));
assert(guest.includes('/deli-cake/logo.webp')&&guest.includes('+650')&&!guest.includes('Chuck E. Cheese')&&!guest.includes('+6000'));
assert(!guest.includes('⃁'),'Currency must use SVG rather than a font-dependent glyph');
assert(guest.includes('lucide-saudi-riyal'));
assert(!guest.includes('id="ownapp"')&&!guest.includes('تطبيق باسمك'),'Custom app promotion removed');
const requestedOrder=['pro','starter','plan-b523d348','plan-2690ddc7','finance','plan-e544dced'];
const orderedFixture=requestedOrder.slice().reverse().map((id,index)=>({...plans[index],id,features:id==='finance'?[{id:'finance',label:'Branda Finance'}]:plans[index].features}));
const orderedHtml=renderToStaticMarkup(React.createElement(BrandaHome,{...props,plans:orderedFixture}));
assert.deepEqual([...orderedHtml.matchAll(/data-plan-id="([^"]+)"/g)].map(match=>match[1]),requestedOrder);
for(const detail of ['المبيعات وكاشير نقطة البيع','المشتريات وفواتير الموردين','الخزينة وأرصدة البنوك والنقدية','الورديات والعهد','الدفاتر والتقارير المحاسبية','إدارة الفريق والصلاحيات']) assert(orderedHtml.includes(detail));
assert.equal(orderedFixture[0].id,'plan-e544dced','Presentation ordering does not mutate the catalog');
const signed=renderToStaticMarkup(React.createElement(BrandaHome,{...props,account:{href:'/admin',name:'My Name',avatarUrl:'https://example.com/profile.png'},accountHref:'/admin'}));
assert(signed.includes('https://example.com/profile.png')&&signed.includes('accountAvatar'));
assert(!signed.includes('تسجيل الدخول'),'Signed-in account replaces login copy');
const fallback=renderToStaticMarkup(React.createElement(BrandaHome,{...props,account:{href:'/dashboard',name:'My Name',avatarUrl:null},accountHref:'/dashboard'}));
assert(fallback.includes('accountAvatar')&&!fallback.includes('تسجيل الدخول'));

async function main(){
  let index=0,values=[],calls=[],release;
  const hooks={...React,useEffect(){},useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>values[i]=value];},useRef(initial){const i=index++;if(!(i in values))values[i]={current:initial};return values[i];}};
  const custom=load('components/marketing/branda-home.tsx',{...base,react:hooks,'@/app/actions/contact-requests':{submitHomeContactAction:input=>{calls.push(input);return new Promise(resolve=>release=resolve);}}});
  const nodes=x=>!x||typeof x!=='object'?[]:[x,...React.Children.toArray(x.props?.children).flatMap(nodes)];
  const formElement=nodes(custom.BrandaHome(props)).find(node=>node.type?.name==='ContactForm');
  values=[];index=0;
  const render=()=>{index=0;return formElement.type({...formElement.props,selectedPlan:'Original 1'});};
  const original=global.FormData;
  let reset=0,focus=0;const input={fullName:'Test Name',phone:'٠٥٠١٢٣٤٥٦٧',business:'Test Business',type:'Cafe',website:''};
  global.FormData=class {get(key){return input[key];}};
  const event={preventDefault(){},currentTarget:{reset(){reset++},querySelector(){return {focus(){focus++}}}}};
  try {
    const sending=render().props.onSubmit(event);
    await render().props.onSubmit(event);assert.equal(calls.length,1,'Double clicks must save once');
    assert.equal(render().props['aria-busy'],true);
    assert.equal(calls[0].phone,'0501234567');assert.equal(calls[0].selectedPlan,'Original 1');
    release({ok:false,reason:'unavailable'});await sending;assert.equal(reset,0,'Failure preserves fields');
    const retry=render().props.onSubmit(event);assert.equal(calls[1].requestId,calls[0].requestId,'Retry keeps idempotency key');
    release({ok:true});await retry;assert.equal(reset,1);assert.equal(render().props['aria-busy'],false);
    input.phone='123';await render().props.onSubmit(event);assert.equal(calls.length,2);assert.equal(focus,1);
  } finally {global.FormData=original;}
  let rpcCalls=0,authorized=false,created=0;
  const data=load('lib/data/contact-requests.ts',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!authorized)throw Error('Denied');}},'@/lib/supabase/admin':{createAdminClient:()=>{created++;return {rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'submit_home_contact_request');assert.equal(args.p_phone,'966501234567');return {error:null};}};}}});
  const request={requestId:'00000000-0000-4000-8000-000000000001',fullName:'Test Name',phone:'٠٥٠١٢٣٤٥٦٧',business:'Test Business',businessType:'Cafe',selectedPlan:'Original 1'};
  assert.equal((await data.submitHomeContactRequest(request)).ok,true);
  assert.equal((await data.submitHomeContactRequest({...request,website:'bot'})).ok,false);
  assert.equal((await data.submitHomeContactRequest({...request,phone:'123'})).ok,false);assert.equal(rpcCalls,1);
  const before=created;await assert.rejects(()=>data.getAdminContactRequests(),/Denied/);await assert.rejects(()=>data.updateContactRequestStatus(request.requestId,'closed'),/Denied/);assert.equal(created,before,'Authorization precedes privileged reads and writes');
  console.log('PASS live-plan SSR, account avatar/guest/fallback, SVG currency, Deli/650, contact links, form success/failure/retry/duplicate/phone validation, server validation and admin authorization');
}
main().catch(error=>{console.error(error);process.exitCode=1});
