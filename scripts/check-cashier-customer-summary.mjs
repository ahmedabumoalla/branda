import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => load(path.join(path.dirname(relative), `${name}.ts`)), exports);
  return exports;
}
const { createCustomerSummaryController, customerSummaryIdentifier } = load("lib/loyalty/customer-summary.ts");
const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts");
const scope = { cafeId: "cafe-a", cashierId: "cashier-a" };
const summary = { customerName: "Customer A", stampsInCycle: 2, purchasesRequired: 6, availableRewards: 1 };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  let time = 0, serial = 0;
  const timers = new Map(), requests = [];
  const clock = {
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { at: time + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const controller = createCustomerSummaryController({ scope, timers: clock, fetch(url, init) {
    return new Promise((resolve, reject) => requests.push({ url, init, body: JSON.parse(init.body), resolve, reject }));
  } });
  const advance = async ms => {
    const until = time + ms;
    while (true) {
      const entry = [...timers].filter(([, t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); await flush();
    }
    time = until; await flush();
  };
  const reply = async (index, value, status = 200) => {
    requests[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => value }); await flush();
  };
  return { controller, requests, advance, reply, timers };
}
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

await check("default timers preserve the browser WebIDL receiver without injected clock", async () => {
  const originalSet=globalThis.setTimeout, originalClear=globalThis.clearTimeout;
  const scheduled=new Map();let serial=0,calls=0;
  globalThis.setTimeout=function(fn,ms){
    if(this!==globalThis)throw new TypeError("Illegal invocation");
    const id=++serial;scheduled.set(id,{fn,ms});return id;
  };
  globalThis.clearTimeout=function(id){
    if(this!==globalThis)throw new TypeError("Illegal invocation");
    scheduled.delete(id);
  };
  try {
    const c=createCustomerSummaryController({scope,fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>({ok:true,summary})};}});
    assert.doesNotThrow(()=>c.lookup("phone","0501234567",{immediate:true}));
    await flush();assert.equal(calls,1);assert.equal(c.getSnapshot().status,"ready");assert.equal(scheduled.size,0);
    assert.doesNotThrow(()=>c.clear());assert.equal(c.getSnapshot().status,"idle");
    c.lookup("code","42");const queued=[...scheduled].find(([,t])=>t.ms===150);assert(queued);
    scheduled.delete(queued[0]);queued[1].fn();await flush();assert.equal(calls,2);assert.equal(c.getSnapshot().status,"ready");
    c.clear();assert.equal(scheduled.size,0);
  } finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

await check("complete identifiers and Arabic digits; no partial-phone requests", () => {
  assert.deepEqual(customerSummaryIdentifier("code", "٤٢"), {method:"code", value:"42"});
  assert.deepEqual(customerSummaryIdentifier("code", "0501234567"), {method:"phone", value:"966501234567"});
  assert.deepEqual(customerSummaryIdentifier("phone", "+966 50 123 4567"), {method:"phone", value:"966501234567"});
  for (const value of ["", "0", "05", "0501", "050123456", "123456", "BARNDAKSA_QR:v1:bad"]) assert.equal(customerSummaryIdentifier("code", value), null, value);
  assert.equal(customerSummaryIdentifier("phone", "050123"), null);
  assert.equal(customerSummaryIdentifier("code", createBarndaksaQrPayload("customer-reward", "abcd1234")), null);
  assert.deepEqual(customerSummaryIdentifier("code", createBarndaksaQrPayload("loyalty-card", "abcd1234")), {method:"code", value:"ABCD1234"});
});
await check("debounce sends one scoped private POST and immediate submit reuses it", async () => {
  const t=setup(), c=t.controller;
  c.lookup("code","4"); await t.advance(100);
  const id=c.lookup("code","42"); await t.advance(149); assert.equal(t.requests.length,0);
  assert.equal(c.lookup("code","42",{immediate:true}),id); assert.equal(t.requests.length,1);
  await t.advance(1); assert.equal(t.requests.length,1);
  assert.equal(c.lookup("code","42",{immediate:true}),id);
  assert.deepEqual(t.requests[0].body,{...scope,method:"code",value:"42"});
  assert.equal(t.requests[0].url,"/api/loyalty/customer-summary");
  assert.equal(t.requests[0].init.cache,"no-store"); assert.equal(t.requests[0].init.credentials,"same-origin");
  await t.reply(0,{ok:true,summary});
  assert.equal(c.getSnapshot().status,"ready"); assert.deepEqual(c.getSnapshot().summary,summary);
  assert.equal(c.lookup("code","42",{immediate:true}),id); assert.equal(t.requests.length,1);
});
await check("A to B discards A even if aborted response arrives last", async () => {
  const t=setup(), c=t.controller;
  const a=c.lookup("code","42",{immediate:true});
  const b=c.lookup("code","43",{immediate:true});
  assert(t.requests[0].init.signal.aborted); assert.equal(c.getSnapshot().summary,null);
  await t.reply(1,{ok:true,summary:{...summary,customerName:"Customer B"}});
  await t.reply(0,{ok:true,summary});
  assert.equal(c.getSnapshot().id,b); assert.equal(c.getSnapshot().summary.customerName,"Customer B");
  assert.equal(c.confirm(a,summary),false);
});
await check("clear invalidates pending response and confirmation", async () => {
  const t=setup(), c=t.controller, id=c.lookup("code","42",{immediate:true});
  c.clear(); await t.reply(0,{ok:true,summary});
  assert.equal(c.getSnapshot().status,"idle"); assert.equal(c.confirm(id,summary),false); assert.equal(t.timers.size,0);
});
await check("late lookup cannot overwrite confirmed post-stamp balances", async () => {
  const t=setup(), c=t.controller, id=c.lookup("code","42",{immediate:true});
  assert(c.confirm(id,{...summary,stampsInCycle:3})); await t.reply(0,{ok:true,summary});
  assert.equal(c.getSnapshot().summary.stampsInCycle,3); assert.equal(c.getSnapshot().confirmed,true);
  const snapshot=c.getSnapshot(); assert(c.confirm(id,{...summary,stampsInCycle:3})); assert.equal(c.getSnapshot(),snapshot);
});
await check("slow feedback and bounded timeout do not retain stale name", async () => {
  const t=setup(), c=t.controller;
  c.lookup("code","42",{immediate:true}); await t.advance(499); assert.equal(c.getSnapshot().status,"loading");
  await t.advance(1); assert.equal(c.getSnapshot().status,"slow");
  await t.advance(1300); assert.equal(c.getSnapshot().status,"unavailable"); assert(t.requests[0].init.signal.aborted);
  await t.reply(0,{ok:true,summary}); assert.equal(c.getSnapshot().summary,null); assert.equal(t.timers.size,0);
});
await check("network errors and malformed response never invent balances", async () => {
  for (const payload of [{ok:true,summary:{...summary,stampsInCycle:-1}}, {ok:true,summary:{...summary,purchasesRequired:0}}, {ok:true,summary:{...summary,availableRewards:Infinity}}, null]) {
    const t=setup(); t.controller.lookup("code","42",{immediate:true}); await t.reply(0,payload);
    assert.equal(t.controller.getSnapshot().status,"unavailable"); assert.equal(t.controller.getSnapshot().summary,null);
  }
  const t=setup(); t.controller.lookup("code","42",{immediate:true}); t.requests[0].reject(new Error("offline")); await flush();
  assert.equal(t.controller.getSnapshot().status,"unavailable"); assert.equal(t.timers.size,0);
});
await check("not found and expired session remain distinct from a zero balance", async () => {
  for (const [payload,status,expected] of [[{ok:false,code:"not_found"},404,"not_found"],[{ok:false,code:"session_invalid"},401,"unauthorized"]]) {
    const t=setup(); t.controller.lookup("code","42",{immediate:true}); await t.reply(0,payload,status);
    assert.equal(t.controller.getSnapshot().status,expected); assert.equal(t.controller.getSnapshot().summary,null);
  }
});
await check("same phone canonical key deduplicates tabs and subscriber cleanup works", async () => {
  const t=setup(), c=t.controller; let changed=0;
  const unsubscribe=c.subscribe(()=>changed++);
  const id=c.lookup("phone","0501234567");
  assert.equal(c.lookup("code","966501234567",{immediate:true}),id); assert.equal(t.requests.length,1);
  unsubscribe(); const before=changed; await t.reply(0,{ok:true,summary}); assert.equal(changed,before);
  c.clear(); assert.equal(c.getSnapshot().summary,null);
});
async function withOutboxHook(run) {
  const originalWindow = globalThis.window, originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator"), originalNow = Date.now;
  let now=1000, serial=0, cleanup;
  const timers=new Map(), events=new Map();
  const outbox={rows:[], authPaused:false, syncCalls:0, blockers:[], block:false,
    async list() { return structuredClone(this.rows); },
    async sync() { this.syncCalls++; if(this.block) await new Promise(resolve=>this.blockers.push(resolve)); },
    async save(){ throw new Error("not used"); }};
  globalThis.window={
    setTimeout(fn,ms){const id=++serial;timers.set(id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);},
    addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);},
  };
  Object.defineProperty(globalThis,"navigator",{value:{onLine:true},configurable:true});
  Date.now=()=>now;
  try {
    const react={useMemo:fn=>fn(),useState:initial=>[initial,()=>{}],useEffect:fn=>{cleanup=fn();}};
    const source=fs.readFileSync(path.join(root,"components/rast-loyalty/use-read-outbox.ts"),"utf8");
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports={};new Function("require","exports",output)(name=>name==="react"?react:name.includes("read-outbox")?{
      createReadOutbox:()=>outbox,createIndexedReadStore:()=>({}),readScopeKey:()=>"scope-a",
    }:{},exports);
    exports.useReadOutbox(scope);await flush();
    const advance=async ms=>{const until=now+ms;while(true){const entry=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();await flush();}now=until;await flush();};
    await run({outbox,advance,timers,events,cleanup:()=>cleanup(),wake:()=>events.get("branda-loyalty-read-saved")(),nextDelay:()=>Math.min(...[...timers.values()].map(t=>t.at-now))});
  } finally {
    cleanup?.();Date.now=originalNow;
    if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);else delete globalThis.navigator;
  }
}
await check("outbox confirms recent pending stamps promptly then returns to idle cadence",()=>withOutboxHook(async t=>{
  assert.equal(t.nextDelay(),10000);
  t.outbox.rows=[{requestId:"a",operation:{status:"pending"}}];t.wake();await flush();
  assert.equal(t.nextDelay(),750);const before=t.outbox.syncCalls;
  await t.advance(749);assert.equal(t.outbox.syncCalls,before);
  await t.advance(1);assert.equal(t.outbox.syncCalls,before+1);
  t.outbox.rows[0].operation.status="succeeded";await t.advance(750);
  assert.equal(t.nextDelay(),10000);
}));
await check("outbox never overlaps ticks and wakes immediately after a save during sync",()=>withOutboxHook(async t=>{
  t.outbox.rows=[{requestId:"a",operation:{status:"pending"}}];t.outbox.block=true;t.wake();await flush();
  const before=t.outbox.syncCalls;t.wake();t.wake();await flush();assert.equal(t.outbox.syncCalls,before);
  assert.equal(t.outbox.blockers.length,1);t.outbox.block=false;t.outbox.blockers.shift()();await flush();
  assert.equal(t.outbox.syncCalls,before+1);assert.equal(t.timers.size,1);
  t.cleanup();assert.equal(t.timers.size,0);assert.equal(t.events.size,0);
}));
await check("outbox fast polling is bounded and pauses with offline/auth states",()=>withOutboxHook(async t=>{
  t.outbox.rows=[{requestId:"a",operation:{status:"pending"}}];t.wake();await flush();
  await t.advance(15000);assert.equal(t.nextDelay(),10000);
  navigator.onLine=false;t.wake();await flush();assert.equal(t.nextDelay(),10000);
  navigator.onLine=true;t.outbox.authPaused=true;t.wake();await flush();assert.equal(t.nextDelay(),10000);
}));
console.log(`Customer summary: ${checks} focused checks passed`);
