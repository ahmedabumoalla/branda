const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/wallet/birthday.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(slow) {
  let now=0,claimed=0,sent=0,finished=0;
  const admin={rpc:async name=>{
    if(name==='claim_loyalty_birthday_greeting'){claimed++;return{data:{id:'fixture',claimToken:'fixture',cafeId:'fixture',brandName:'Fixture',customerName:null,phone:'966500000001'}};}
    if(name==='finish_loyalty_birthday_greeting'){finished++;return{data:true};}
    throw Error('Unexpected RPC');
  }};
  const stubs={
    'server-only':{},'@/lib/data/account-cancellation':{brandAllowsNewWork:async()=>true},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/whatsapp/green-api':{isGreenApiLoyaltyWelcomeReady:async()=>{now+=slow?100000:0;return true;},sendGreenApiLoyaltyWelcome:async()=>{now+=slow?110000:1;sent++;return{status:'queued'};}},
  };
  const result={};new Function('require','exports','Date',code)(n=>{if(n in stubs)return stubs[n];throw Error('Unmocked dependency '+n);},result,{now:()=>now});
  const outcome=await result.dispatchBirthdayGreetings(5);
  assert.equal(claimed,slow?1:5);assert.equal(sent,claimed);assert.equal(finished,claimed);assert.equal(outcome.queued,claimed);assert(now<300000);
}
(async()=>{await scenario(false);await scenario(true);console.log('PASS healthy throughput and slow-provider batch budget; no messages');})().catch(e=>{console.error(e);process.exitCode=1;});
