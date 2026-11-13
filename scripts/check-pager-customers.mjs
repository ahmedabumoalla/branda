import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'lightningcss';
const require=createRequire(import.meta.url);let checks=0;
function load(file,stubs={}) {const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
new Function('require','exports',code)(name=>{if(Object.hasOwn(stubs,name))return stubs[name];if(name==='server-only')return {};if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};if(name==='next/link')return {__esModule:true,default:({children,scroll,...props})=>React.createElement('a',props,children)};if(name.startsWith('@/')||name.startsWith('./')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts',stubs);}return require(name);},exports);return exports;}
function check(value,label){assert.ok(value,label);checks++;}
const {normalizeGoogleReviewLink:normalize}=load('lib/pager/google-review-link.ts');
const {pagerPeriodRange,parsePagerPeriod}=load('lib/pager/customer-period.ts');
const reference=new Date('2026-11-13T22:00:00Z');
check(pagerPeriodRange('today',reference).from==='2026-11-13T21:00:00.000Z','today starts at Riyadh midnight, not UTC midnight');
check(pagerPeriodRange('yesterday',reference).from==='2026-11-12T21:00:00.000Z'&&pagerPeriodRange('yesterday',reference).to==='2026-11-13T21:00:00.000Z','yesterday uses complete Riyadh calendar day');
for(const [period,days]of[['today',1],['7d',7],['30d',30],['365d',365]]){const range=pagerPeriodRange(period,reference);check((Date.parse(range.to)-Date.parse(range.from))/86400000===days,'rolling period includes exact count of calendar days');}
check(pagerPeriodRange('today',new Date('2024-02-29T21:00:00Z')).from==='2024-02-29T21:00:00.000Z','leap-day rollover');
check(pagerPeriodRange('all',reference).from===null&&parsePagerPeriod('invalid')==='all'&&parsePagerPeriod(['today'])==='all','safe default for invalid URL and all-time selection');
for(const url of ['https://g.page/r/Abc_123/review','https://g.page/my-brand/review','https://search.google.com/local/writereview?placeid=ChIJ_123'])check(normalize(url)?.startsWith('https://'),'valid direct Google review link');
for(const url of ['http://g.page/r/id/review','javascript:alert(1)','https://g.page.attacker.test/r/id/review','https://g.page@attacker.test/r/id/review','https://user@g.page/r/id/review','https://g.page:444/r/id/review','https://google.com/search','https://maps.app.goo.gl/unknown','https://g.page/r/id/elsewhere'])check(normalize(url)===null,'reject unsafe or non-review link');
check(normalize('')==='','blank disables external review CTA');
check(normalize('https://g.page/r/abc/review?redirect=https://invalid.test#fragment')==='https://g.page/r/abc/review','extraneous redirects and fragments are removed');
const cafeId='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002';
let allowAdmin=true,allowPager=true,role='owner',ownerId=cafeId,rpcs=[],writes=[],dbCalls=0;
const db={async rpc(name,args){rpcs.push({name,args});return {data:{rows:[],total:0,page:0,pageSize:25,average:null},error:null};},from(table){dbCalls++;const chain={select(){return chain;},eq(key,value){assert.equal(value,cafeId);return chain;},async maybeSingle(){return {error:null,data:table==='cafes'?{name:'Brand'}:{google_review_url:'https://g.page/r/Abc/review'}};},async upsert(value){writes.push(value);return {error:null};}};return chain;}};
const stubs={'@/lib/supabase/admin':{createAdminClient:()=>{dbCalls++;return db;}},'@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!allowAdmin)throw Error('forbidden');},requireOwnerCafeContext:async()=>({id:ownerId,role})},'@/lib/data/pager':{getOwnerPagerContext:async()=>{if(!allowPager)throw Error('unavailable');return {cafeId,cafeName:'Brand'};}}};
const dal=load('lib/data/pager-customers.ts',stubs);
allowAdmin=false;await assert.rejects(()=>dal.getPagerCustomerDirectory({cafeId}),/forbidden/);check(dbCalls===0,'directory rejects unauthorized user before service access');allowAdmin=true;
await dal.getPagerCustomerDirectory({cafeId,phone:'966500000001',page:2,query:'name'});check(rpcs.at(-1).args.p_cafe===cafeId&&rpcs.at(-1).args.p_phone==='966500000001'&&rpcs.at(-1).args.p_page===2,'directory filters forwarded exactly');
await dal.getPagerCustomerDirectory({cafeId,period:'7d'});check(rpcs.at(-1).name==='pager_customer_directory_range'&&(Date.parse(rpcs.at(-1).args.p_to)-Date.parse(rpcs.at(-1).args.p_from))===7*86400000,'selected period reaches SQL as bounded timestamps');
const before=rpcs.length;await assert.rejects(()=>dal.getPagerCustomerDirectory({phone:'966500000001'}));await assert.rejects(()=>dal.getPagerCustomerDirectory({cafeId: 'invalid'}));check(rpcs.length===before,'invalid scope cannot query directory');
allowPager=false;const beforeRead=dbCalls;await assert.rejects(()=>dal.getOwnerPagerReviews(),/unavailable/);check(beforeRead===dbCalls,'package failure prevents review lookup');allowPager=true;
const reviews=await dal.getOwnerPagerReviews({rating:1});check(rpcs.at(-1).args.p_cafe===cafeId&&rpcs.at(-1).args.p_rating===1,'reviews derive brand from authorized context');check(reviews.canManage===true,'owner can edit Google link');
role='staff';await assert.rejects(()=>dal.savePagerGoogleReviewLink('https://g.page/r/abc/review'));check(writes.length===0,'staff cannot update review settings');role='owner';ownerId=otherId;await assert.rejects(()=>dal.savePagerGoogleReviewLink('https://g.page/r/abc/review'));check(writes.length===0,'changed tenant cannot update settings');ownerId=cafeId;
await assert.rejects(()=>dal.savePagerGoogleReviewLink('javascript:alert(1)'));check(writes.length===0,'unsafe URL never stored');await dal.savePagerGoogleReviewLink('https://g.page/r/abc/review');check(writes[0].cafe_id===cafeId,'settings write belongs to current owner brand');
const {PagerFeedbackForm}=load('components/pager/pager-feedback.tsx',{'@/app/actions/pager':{}});
for(const rating of [1,2,3,4,5]){const html=renderToStaticMarkup(React.createElement(PagerFeedbackForm,{token:'fixture',initialFeedback:{brandName:'Brand',invoiceNumber:'123',rating,submitted:true,notes:'',googleReviewUrl:'https://g.page/r/abc/review'}}));check(html.includes('href="https://g.page/r/abc/review"')&&html.includes('noopener noreferrer'),'every star rating receives the same voluntary Google CTA');}
const pending=renderToStaticMarkup(React.createElement(PagerFeedbackForm,{token:'fixture',initialFeedback:{brandName:'Brand',invoiceNumber:'123',rating:null,submitted:false,notes:'',googleReviewUrl:'https://g.page/r/abc/review'}}));check(!pending.includes('href="https://g.page/'),'CTA follows saving internal review');
const {CustomerSections,DirectoryPagination}=load('components/pager/customer-directory-ui.tsx');
const tabs=renderToStaticMarkup(React.createElement(CustomerSections,{pager:true}));check(tabs.includes('/admin/brand-customers?view=pager')&&!tabs.includes('/admin/pager-customers'),'both icons remain inside the brand customer section');
const pagination=renderToStaticMarkup(React.createElement(DirectoryPagination,{total:26,page:0,pageSize:25,base:'/admin/pager-customers',filters:{brand:cafeId,query:'اسم'}}));check(pagination.includes('page=1')&&pagination.includes(cafeId),'pagination preserves tenant and search');
const css=transform({filename:'customer-directory.module.css',code:fs.readFileSync('components/pager/customer-directory.module.css'),cssModules:true,minify:true});check(css.code.length>0,'responsive directory stylesheet compiles');
console.log(`PASS ${checks} pager directory authorization, URL validation, review visibility and rendered UI checks`);
const deniedRoute=load('app/admin/pager-customers/page.tsx',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{throw Error('forbidden');}},'next/navigation':{redirect:to=>{throw Error('redirect:'+to);}},'@/lib/data/pager-customers':{getPagerCustomerDirectory:async()=>assert.fail('Unauthenticated route cannot read directory')}});
await assert.rejects(()=>deniedRoute.default({searchParams:Promise.resolve({})}),/redirect:\/login/);checks++;
const rowsByMode=[
 [{},{rows:[{id:cafeId,name:'Brand <script>',customers:2,registrations:4,last_seen:'2026-11-13T10:00:00Z'}],total:1,page:0,pageSize:25},'Brand &lt;script&gt;'],
 [{brand:cafeId},{brandName:'Brand',rows:[{phone:'966500000001',full_name:'Customer',registrations:4,first_seen:'2026-11-13T10:00:00Z',last_seen:'2026-11-13T10:00:00Z'}],total:1,page:0,pageSize:25},'966500000001'],
 [{brand:cafeId,phone:'966500000001'},{brandName:'Brand',rows:[{id:'visit',invoice_number:'00017',status:'received',created_at:'2026-11-13T10:00:00Z',received_at:null,created_by:'Staff',created_station:'Desk',rating:1,notes:'<script>unsafe</script>'}],total:1,page:0,pageSize:25},'&lt;script&gt;unsafe&lt;/script&gt;'],
];
let loyaltyCalls=0,pagerCalls=0;
const unifiedStubs={'@/lib/data/cafes':{requirePlatformAdmin:async()=>{}},'next/navigation':{redirect:to=>{throw Error('redirect:'+to);}},'@/components/admin/pages/brand-customers-page':{BrandCustomersPage:()=>React.createElement('div',{},'Existing loyalty view')},'@/app/actions/brand-customers':{loadBrandCustomersAction:async()=>{loyaltyCalls++;return{};}}};
for(const [params,result,expected]of rowsByMode){const route=load('app/admin/brand-customers/page.tsx',{...unifiedStubs,'@/lib/data/pager-customers':{getPagerCustomerDirectory:async()=>{pagerCalls++;return result;}}});const html=renderToStaticMarkup(await route.default({searchParams:Promise.resolve({view:'pager',...params})}));check(html.includes(expected),'unified directory renders scoped rows with escaped content');check(!html.includes('/admin/pager-customers')&&html.includes('view=pager'),'brand and history links preserve the pager selection');check(html.includes('brand-customers')&&html.includes('aria-current="page"'),'selected directory icon remains accessible');}
check(loyaltyCalls===0&&pagerCalls===3,'pager view does not load unrelated loyalty data');
let selectedFilters;
const periodRoute=load('app/admin/brand-customers/page.tsx',{...unifiedStubs,'@/lib/data/pager-customers':{getPagerCustomerDirectory:async filters=>{selectedFilters=filters;return {...rowsByMode[1][1],total:26};}}});
const periodHtml=renderToStaticMarkup(await periodRoute.default({searchParams:Promise.resolve({view:'pager',brand:cafeId,period:'7d',query:'Customer'})}));
check(selectedFilters.period==='7d'&&periodHtml.includes('name="period" value="7d"'),'period survives search form and reaches directory');
check(periodHtml.includes('period=7d')&&periodHtml.includes('page=1')&&periodHtml.includes('phone=966500000001'),'history and pagination preserve selected period');
check(periodHtml.includes('اليوم')&&periodHtml.includes('أمس')&&periodHtml.includes('آخر ٧ أيام')&&periodHtml.includes('آخر شهر')&&periodHtml.includes('آخر سنة'),'all requested date presets render');
const unified=load('app/admin/brand-customers/page.tsx',{...unifiedStubs,'@/lib/data/pager-customers':{getPagerCustomerDirectory:async()=>assert.fail('loyalty must not query pager')}});
check(renderToStaticMarkup(await unified.default({searchParams:Promise.resolve({})})).includes('Existing loyalty view')&&loyaltyCalls===1,'default retains existing loyalty behavior');
const legacy=load('app/admin/pager-customers/page.tsx',unifiedStubs);await assert.rejects(()=>legacy.default({searchParams:Promise.resolve({brand:cafeId,phone:'966500000001',page:'2'})}),e=>e.message.includes('/admin/brand-customers?view=pager')&&e.message.includes(cafeId)&&e.message.includes('page=2'));checks++;
const sidebar=fs.readFileSync('components/admin/AdminSidebar.tsx','utf8');check(sidebar.includes('["عملاء العلامات التجارية", "/admin/brand-customers"')&&!sidebar.includes('/admin/pager-customers'),'one original sidebar section');
check(transform({filename:'brand-customers.module.css',code:fs.readFileSync('components/admin/pages/brand-customers.module.css'),cssModules:true,minify:true}).code.length>0,'existing dark responsive customer theme compiles');
console.log(`PASS ${checks} total including anonymous redirect and all directory page modes`);
