import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(fs.existsSync(`${next}.tsx`) ? `${next}.tsx` : `${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}


const status = load(path.resolve("lib/platform/coupon-status.ts"));
const now = Date.parse("2026-10-10T12:00:00Z");
const coupon = {id:"00000000-0000-4000-8000-000000000011",code:"MONTH20",title:"Monthly campaign",discountPercent:20,active:true,redeemedCount:0,eligiblePlanIds:[],eligibleDurationMonths:[1],validUntil:"2026-10-10T20:59:59.999Z",createdAt:new Date(now).toISOString()};
assert.equal(status.couponDateBoundary("2026-10-10",true),"2026-10-10T20:59:59.999Z");
assert.equal(status.couponSaudiDate(coupon.validUntil),"2026-10-10");
assert.throws(()=>status.couponDateBoundary("2026-02-31"));
assert.equal(status.couponStatus(coupon,now),"active");
assert.equal(status.couponStatus(coupon,now+86400000),"expired");
assert.equal(status.couponStatus({...coupon,active:false},now),"paused");
assert.equal(status.couponStatus({...coupon,maxRedemptions:1,redeemedCount:1},now),"exhausted");
assert.equal(status.couponStatus({...coupon,validFrom:"2026-10-10T15:00:00Z"},now),"scheduled");
const nodes = tree => !tree || typeof tree!=="object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree,...nodes(tree.props?.children)];
const text = tree => tree==null || typeof tree==="boolean" ? "" : Array.isArray(tree) ? tree.map(text).join("") : typeof tree==="object" ? text(tree.props?.children) : String(tree);
const button = (tree,label) => nodes(tree).find(node=>node.type==='button' && text(node)===label);
let writes=[], finishSave;
const values=[];let index=0;
const hooks={...React,useEffect(){},useMemo:fn=>fn(),useState(initial){const slot=index++;if(!(slot in values))values[slot]=typeof initial==='function'?initial():initial;return[values[slot],next=>values[slot]=typeof next==='function'?next(values[slot]):next]},useRef(initial){const slot=index++;if(!(slot in values))values[slot]={current:initial};return values[slot]}};
const {AdminPlatformCouponsPage}=load(path.resolve('components/admin/pages/admin-platform-coupons-page.tsx'),{react:hooks,'@/app/actions/admin':{savePlatformDiscountCouponAction:payload=>{writes.push(payload);return new Promise(resolve=>{finishSave=resolve})}},'@/lib/export/admin-report-export':{exportRowsToExcel(){},exportRowsToPdf(){}}});
globalThis.requestAnimationFrame=fn=>fn();
const render=()=>{index=0;return AdminPlatformCouponsPage({coupons:[coupon],plans:[{id:'paid',name:'Paid plan',priceMonthly:115,active:true}],referenceTime:now})};
let tree=render();let html=renderToStaticMarkup(tree);
assert.ok(html.includes('مدد الاشتراك المشمولة') && html.includes('سنة'));
assert.ok(!html.includes('alert('));
button(tree,'تعديل').props.onClick();
tree=render();
const endInput=nodes(tree).find(node=>node.type==='input' && node.props.type==='date' && node.props.required);
assert.equal(endInput.props.value,'2026-10-10','end-of-day edit preserves Saudi date');
const durationLabels=nodes(tree).filter(node=>node.type==='label' && ['شهر واحد','ثلاثة أشهر','ستة أشهر','سنة'].includes(text(node)));
assert.equal(durationLabels.length,4);
for(const label of durationLabels) assert.equal(nodes(label).find(node=>node.type==='input').props.checked,text(label)==='شهر واحد');
const form=nodes(tree).find(node=>node.type==='form');
form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});
assert.equal(writes.length,1,'duplicate save prevented');
assert.deepEqual(writes[0].eligibleDurationMonths,[1]);
finishSave({ok:false,message:'تعذر الحفظ حاول مجددًا'});await new Promise(resolve=>setImmediate(resolve));
assert.ok(renderToStaticMarkup(render()).includes('تعذر الحفظ حاول مجددًا'));
assert.equal(nodes(render()).find(node=>node.type==='input' && node.props.dir==='ltr').props.value,'MONTH20','draft retained on failure');
nodes(render()).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
finishSave({ok:true,data:[coupon]});await new Promise(resolve=>setImmediate(resolve));
assert.equal(writes.length,2,'retry succeeds');
assert.equal(nodes(render()).find(node=>node.type==='input' && node.props.dir==='ltr').props.value,'','success resets draft');
nodes(render()).find(node=>node.type==='select').props.onChange({target:{value:'expired'}});
assert.ok(renderToStaticMarkup(render()).includes('لا توجد نتائج مطابقة'));
const css=fs.readFileSync('components/admin/pages/admin-platform-coupons-page.module.css','utf8');
for(const [,name] of fs.readFileSync('components/admin/pages/admin-platform-coupons-page.tsx','utf8').matchAll(/styles\.([a-zA-Z]+)/g))assert.ok(css.includes(`.${name}`),name);
assert.ok(css.includes(':focus-visible')&&css.includes('max-width:520px')&&css.includes('prefers-reduced-motion'));
let adminAllowed=true,saved;
const adminClient={from(){return{upsert:async payload=>{saved=payload;return {error:null}}}}};
const data=load(path.resolve('lib/data/platform-coupons.ts'),{'@/lib/supabase/admin':{createAdminClient:()=>adminClient},'@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!adminAllowed)throw Error('Forbidden')}}});
await data.savePlatformDiscountCoupon({...coupon,validUntil:'2026-10-10'});
assert.equal(saved.valid_until,'2026-10-10T20:59:59.999Z');
assert.deepEqual(saved.eligible_duration_months,[1]);
await assert.rejects(()=>data.savePlatformDiscountCoupon({...coupon,eligibleDurationMonths:[]}));
await assert.rejects(()=>data.savePlatformDiscountCoupon({...coupon,eligibleDurationMonths:[24]}));
await assert.rejects(()=>data.savePlatformDiscountCoupon({...coupon,validUntil:undefined}));
await assert.rejects(()=>data.savePlatformDiscountCoupon({...coupon,validFrom:'2026-10-11',validUntil:'2026-10-10'}));
adminAllowed=false;await assert.rejects(()=>data.savePlatformDiscountCoupon(coupon));
console.log('PASS marketing coupons: duration selection, date boundaries, status filters, SSR, save lock/error/retry, admin authorization, validation, responsive CSS');
