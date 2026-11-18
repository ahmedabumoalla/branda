const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
async function scenario(slow, cardLinks=false) {
  const code = ts.transpileModule(fs.readFileSync(cardLinks?'lib/loyalty/read-card-links.ts':'lib/wallet/birthday.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let now=0,claimed=0,sent=0,finished=0;
  const admin={rpc:async name=>{
    if(name==='claim_loyalty_birthday_greeting'||name==='claim_stamp_card_link_v2'){claimed++;return{data:{id:'fixture',claimToken:'fixture',cafeId:'fixture',brandName:'Fixture',brandSlug:'fixture',customerName:null,phone:'966500000001',googleIssued:false}};}
    if(name==='finish_loyalty_birthday_greeting'||name==='finish_stamp_card_link_v2'){finished++;return{data:true};}
    throw Error('Unexpected RPC');
  }};
  const stubs={
    'server-only':{},'@/lib/data/account-cancellation':{brandAllowsNewWork:async()=>true},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/auth/loyalty-session-token':{createLoyaltySessionToken:()=> 'fixture',loyaltyIdentityHash:()=> 'fixture'},
    '@/lib/whatsapp/customer-routing':{selectLocoLoyaltySender:async()=>null,selectBrandLoyaltySender:async()=>null},
    '@/lib/whatsapp/brand-connection-types':{LOCO_CAFE_ID:'loco',WAHED_MASOUB_CAFE_ID:'wahed'},
    '@/lib/wallet/google':{getGoogleWalletSaveState:async()=>false},
    '@/lib/whatsapp/green-api':{isGreenApiLoyaltyWelcomeReady:async()=>{now+=slow?100000:0;return true;},sendGreenApiLoyaltyWelcome:async()=>{now+=slow?110000:1;sent++;return{status:'queued'};}},
  };
  const result={};new Function('require','exports','Date',code)(n=>{if(n in stubs)return stubs[n];throw Error('Unmocked dependency '+n);},result,{now:()=>now});
  const outcome=await (cardLinks?result.dispatchStampCardLinks(5):result.dispatchBirthdayGreetings(5));
  assert.equal(claimed,slow?1:5);assert.equal(sent,claimed);assert.equal(finished,claimed);assert.equal(outcome.queued,claimed);assert(now<300000);
}
(async()=>{for(const cardLinks of [false,true]){await scenario(false,cardLinks);await scenario(true,cardLinks);}console.log('PASS healthy throughput and slow-provider budget for birthdays and card links; no messages');})().catch(e=>{console.error(e);process.exitCode=1;});
