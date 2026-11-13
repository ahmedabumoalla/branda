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
new Function('require','exports',code)(name=>{if(Object.hasOwn(stubs,name))return stubs[name];if(name==='server-only')return {};if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};if(name.startsWith('@/')||name.startsWith('./')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts',stubs);}return require(name);},exports);return exports;}
function check(value,label){assert.ok(value,label);checks++;}
const {normalizeGoogleReviewLink:normalize}=load('lib/pager/google-review-link.ts');
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
const before=rpcs.length;await assert.rejects(()=>dal.getPagerCustomerDirectory({phone:'966500000001'}));await assert.rejects(()=>dal.getPagerCustomerDirectory({cafeId: 'invalid'}));check(rpcs.length===before,'invalid scope cannot query directory');
allowPager=false;const beforeRead=dbCalls;await assert.rejects(()=>dal.getOwnerPagerReviews(),/unavailable/);check(beforeRead===dbCalls,'package failure prevents review lookup');allowPager=true;
const reviews=await dal.getOwnerPagerReviews({rating:1});check(rpcs.at(-1).args.p_cafe===cafeId&&rpcs.at(-1).args.p_rating===1,'reviews derive brand from authorized context');check(reviews.canManage===true,'owner can edit Google link');
role='staff';await assert.rejects(()=>dal.savePagerGoogleReviewLink('https://g.page/r/abc/review'));check(writes.length===0,'staff cannot update review settings');role='owner';ownerId=otherId;await assert.rejects(()=>dal.savePagerGoogleReviewLink('https://g.page/r/abc/review'));check(writes.length===0,'changed tenant cannot update settings');ownerId=cafeId;
await assert.rejects(()=>dal.savePagerGoogleReviewLink('javascript:alert(1)'));check(writes.length===0,'unsafe URL never stored');await dal.savePagerGoogleReviewLink('https://g.page/r/abc/review');check(writes[0].cafe_id===cafeId,'settings write belongs to current owner brand');
const {PagerFeedbackForm}=load('components/pager/pager-feedback.tsx',{'@/app/actions/pager':{}});
for(const rating of [1,2,3,4,5]){const html=renderToStaticMarkup(React.createElement(PagerFeedbackForm,{token:'fixture',initialFeedback:{brandName:'Brand',invoiceNumber:'123',rating,submitted:true,notes:'',googleReviewUrl:'https://g.page/r/abc/review'}}));check(html.includes('href="https://g.page/r/abc/review"')&&html.includes('noopener noreferrer'),'every star rating receives the same voluntary Google CTA');}
const pending=renderToStaticMarkup(React.createElement(PagerFeedbackForm,{token:'fixture',initialFeedback:{brandName:'Brand',invoiceNumber:'123',rating:null,submitted:false,notes:'',googleReviewUrl:'https://g.page/r/abc/review'}}));check(!pending.includes('href="https://g.page/'),'CTA follows saving internal review');
const {CustomerSections,DirectoryPagination}=load('components/pager/customer-directory-ui.tsx');
const tabs=renderToStaticMarkup(React.createElement(CustomerSections,{pager:true}));check(tabs.includes('/admin/brand-customers')&&tabs.includes('/admin/pager-customers'),'both customer sections preserve current loyalty destination');
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
for(const [params,result,expected]of rowsByMode){const route=load('app/admin/pager-customers/page.tsx',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{}},'next/navigation':{},'@/lib/data/pager-customers':{getPagerCustomerDirectory:async()=>result}});const html=renderToStaticMarkup(await route.default({searchParams:Promise.resolve(params)}));check(html.includes(expected),'actual directory page renders scoped rows with escaped content');}
console.log(`PASS ${checks} total including anonymous redirect and all directory page modes`);
