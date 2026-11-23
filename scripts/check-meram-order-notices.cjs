const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, stubs={}, env={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","exports","process",code)(name=>name==="server-only"?{}:stubs[name]??(name.startsWith("@/")?load(name.slice(2)+".ts",stubs,env):require(name)),exports,{env});
  return exports;
}

const {meramMapLink} = load("lib/commerce/meram-location.ts");
for (const valid of ["24.1, 46.1","-90،-180","https://maps.app.goo.gl/Place","https://goo.gl/maps/Place","https://www.google.com/maps/place/Test","https://maps.apple.com/?q=Riyadh","https://maps.google.com.sa/?q=24.1,46.1"]) assert.ok(meramMapLink(valid));
for (const invalid of ["91,1","5,181","Street only","https://evil.example/maps/Place","https://www.google.com.evil.example/maps/a","https://user:pass@maps.apple.com/?q=x","javascript:alert(1)","http://maps.apple.com/?q=x","https://www.google.com/url?q=x"]) assert.equal(meramMapLink(invalid),null);
const {giftOrderInputFor,giftOrderInputSchema:legacy,giftOrderDraftSchema} = load("lib/commerce/gift-orders.ts");
const giftOrderInputSchema = giftOrderInputFor("SA");
const order={slug:"brand-5fbb1397e4c4",requestId:"30000000-0000-4000-8000-000000000001",customerName:"Customer",phone:"0500000000",fulfillment:"delivery",city:"Riyadh",address:"24.1,46.1",paymentMethod:"bank_transfer",expectedTotal:50,items:[{productId:"30000000-0000-4000-8000-000000000002",quantity:1}]};
assert.ok(giftOrderInputSchema.safeParse(order).success);
assert.ok(legacy.omit({ requestId: true }).safeParse(order).success);
assert.ok(giftOrderDraftSchema.safeParse(order).success);
assert.equal(giftOrderDraftSchema.safeParse({...order,address:""}).success,false);
for (const fields of [{address:"Long address only"},{address:""},{city:""},{fulfillment:"pickup"}]) assert.equal(giftOrderInputSchema.safeParse({...order,...fields}).success,false);
assert.ok(giftOrderInputSchema.safeParse({...order,slug:"another-store",address:"Long address only"}).success);
const active={NODE_ENV:"production",VERCEL_ENV:"production",VERCEL:"1"};
const sender={idInstance:"branda-notifications"};
const job={id:"order",attempt:"attempt",number:3,customerPhone:"966590000002",reason:"المنتج غير متوفر"};
async function run(opts={}) {
  const calls=[],jobs=[job],sends=[];
  const rpc=async(fn,payload)=>{
    calls.push([fn,payload]);if(fn==="meram_order_notice_due")return {data:opts.due??true};
    if(fn==="meram_order_notice_claim")return {data:jobs.shift()??null};
    return {data:true};
  };
  const api=load("lib/commerce/meram-notifications.ts",{
    "@/lib/supabase/admin":{createAdminClient:()=>({rpc})},
    "@/lib/whatsapp/customer-routing":{selectVerifiedBrandWhatsAppSender:async id=>{assert.equal(id,"98fd33d5-522d-46e7-adeb-34b04a665f4f");return opts.privateSender??null;}},
    "@/lib/whatsapp/notification-sender":{selectNotificationSender:async()=>opts.offline?null:sender},
    "@/lib/whatsapp/green-api":{isGreenApiBackupOnly:()=>Boolean(opts.paused),sendGreenApiCustomerMessage:async (account,payload)=>{sends.push([account,payload]);if(opts.throws)throw Error("timeout");return {status:opts.status??"queued"};}},
  },opts.env??active);
  const result=await api.runMeramRejections();return {calls,sends,result};
}
(async()=>{
  for(const opts of [{env:{}},{env:{...active,VERCEL_ENV:"preview"}},{paused:true},{due:false},{offline:true}]) {
    const {calls,sends}=await run(opts);assert.equal(sends.length,0);assert.ok(!calls.some(([fn])=>fn==="meram_order_notice_claim"));
  }
  for(const [opts,expected] of [[{},"sent"],[{status:"rejected"},"failed"],[{status:"unknown"},"unknown"],[{throws:true},"unknown"]]) {
    const {calls,sends}=await run(opts);assert.equal(sends.length,1);
    assert.equal(sends[0][0],sender);assert.equal(sends[0][1].phone,job.customerPhone);
    for(const term of [job.reason,String(job.number),'برندة','ميرام']) assert.ok(sends[0][1].message.includes(term));
    assert.deepEqual(calls.find(([fn])=>fn==="meram_order_notice_claim")[1],undefined);
    assert.deepEqual(calls.find(([fn])=>fn==="meram_order_notice_finish")[1],{p_id:job.id,p_attempt:job.attempt,p_state:expected});
  }
  const privateSender={idInstance:"meram-private"};
  const privateResult=await run({privateSender,offline:true});
  assert.equal(privateResult.sends[0][0],privateSender);
  assert(!privateResult.sends[0][1].message.includes("من برندة"));
  const ambiguous=await run({privateSender,status:"unknown"});assert.equal(ambiguous.sends.length,1);
  console.log("Meram location, checkout and rejection transport checks passed (mocked provider)");
})().catch(err=>{console.error(err);process.exitCode=1});
