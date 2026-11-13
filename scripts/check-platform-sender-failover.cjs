const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const env = {
  GREEN_API_API_URL: 'https://1100.api.greenapi.com', GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: 'fixture-primary',
  GREEN_API_MEDIA_URL: 'https://1100.media.greenapi.com',
  GREEN_API_OTP_BACKUP_API_URL: 'https://7700.api.greenapi.com', GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: 'fixture-backup',
  GREEN_API_OTP_BACKUP_MEDIA_URL: 'https://7700.media.greenapi.com', GREEN_API_TEMPORARY_BACKUP_ONLY: 'false',
};
function context(options = {}) {
  const calls = [], config = {...env, ...options.env};
  let primaryState = options.primary || 'authorized';
  let primaryReads = 0;
  const fetcher = async (url, init) => {
    calls.push({url, ...init});
    if (url.includes('getStateInstance')) {
      if (url.includes('waInstance111')) {
        primaryReads++;
        if (primaryReads <= (options.transientFailures || 0)) throw Error('transient readiness failure');
      }
      if (options.readinessTimeout && url.includes('waInstance111')) throw Error('fixture');
      return Response.json({stateInstance: url.includes('waInstance111') ? primaryState : options.backup || 'authorized'});
    }
    if (options.timeout) throw Error('fixture');
    if (options.status) return new Response('', {status:options.status});
    return Response.json({idMessage:'fixture-ack'});
  };
  function load(file, imports = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','exports','process','fetch','setTimeout',code)(n=>n==='server-only'||n.includes('green-api-partner')?{}:imports[n]??require(n),exports,{env:config},fetcher,fn=>{fn();return 0;});
    return exports;
  }
  const api=load('lib/whatsapp/green-api.ts');
  const campaign=load('lib/whatsapp/green-api-platform-campaigns.ts',{'./green-api':api});
  return {api,campaign,calls,sends:()=>calls.filter(c=>c.method==='POST'),recover:()=>{primaryState='authorized';}};
}
(async()=>{
  let checks=0;
  for (const method of ['sendGreenApiPagerMessage','sendGreenApiFinanceShiftAlert','sendGreenApiLoyaltyWelcome','sendGreenApiSupabaseOtp','sendGreenApiOwnerWelcome']) {
    for (const transientFailures of [1,2]) {
      const c=context({transientFailures});
      await c.api[method]({phone:'966500000001',phoneNormalized:'966500000001',code:'123456',message:'fixture',brandName:'Fixture',password:'fixture-only',startsTrial:false});
      assert.equal(c.sends().length,1);
      assert.match(c.sends()[0].url,/waInstance111/);
      assert.ok(c.calls.every(call=>!call.url.includes('waInstance222')),'temporary primary failure must not touch backup');
      assert.equal(c.calls.filter(call=>call.url.includes('getStateInstance')).length,transientFailures+1);
      checks++;
    }
  }
  for (const options of [{readinessTimeout:true},{primary:'notAuthorized'}]) {
    const c=context(options);
    await c.api.sendGreenApiPagerMessage({phone:'966500000001',message:'fixture'});
    assert.equal(c.calls.filter(call=>call.url.includes('getStateInstance')&&call.url.includes('waInstance111')).length,3);
    assert.match(c.calls[3].url,/waInstance222.*getStateInstance/);
    assert.equal(c.sends().length,1);
    assert.match(c.sends()[0].url,/waInstance222/);
    checks++;
  }
  {
    const c=context({transientFailures:2});
    const {primary}=c.api.getGreenApiCustomerPlatformSenders();
    assert.equal(await c.api.isGreenApiCustomerSenderReady(primary),true);
    assert.equal(c.calls.length,3);
    assert.equal(c.sends().length,0);
    checks++;
  }
  for(const method of ['sendGreenApiPagerMessage','sendGreenApiFinanceShiftAlert','sendGreenApiLoyaltyWelcome']) {
    for(const primary of ['authorized','notAuthorized','blocked','sleepMode']) {
      const c=context({primary});await c.api[method]({phone:'966500000001',message:'unchanged'});
      assert.equal(c.sends().length,1);assert.ok(c.sends()[0].url.includes(primary==='authorized'?'waInstance111':'waInstance222'));
      assert.deepEqual(JSON.parse(c.sends()[0].body),{chatId:'966500000001@c.us',linkPreview:false,message:'unchanged'});checks++;
    }
    const c=context({primary:'notAuthorized',backup:'notAuthorized'});
    await assert.rejects(()=>c.api[method]({phone:'966500000001',message:'unchanged'}));assert.equal(c.sends().length,0);checks++;
  }
  let c=context({primary:'notAuthorized'});
  assert.equal(await c.api.isGreenApiLoyaltyWelcomeReady(),true);checks++;
  await c.api.sendGreenApiFinanceReceipt({phone:'966500000001',message:'receipt',invoiceNumber:1,pdf:new TextEncoder().encode('%PDF-fixture')});
  assert.match(c.sends()[0].url,/^https:\/\/7700.media.greenapi.com\/waInstance222/);assert.equal(c.sends()[0].body.get('caption'),'receipt');checks++;
  c=context({primary:'notAuthorized',env:{GREEN_API_OTP_BACKUP_MEDIA_URL:undefined}});
  await assert.rejects(()=>c.api.sendGreenApiFinanceReceipt({phone:'966500000001',message:'receipt',invoiceNumber:1,pdf:new TextEncoder().encode('%PDF-fixture')}),/MEDIA_CONFIGURATION_MISSING/);assert.equal(c.sends().length,0);checks++;
  for(const options of [{primary:'notAuthorized'},{readinessTimeout:true},{}]) {
    c=context(options);await c.campaign.sendBrandaCampaignMessage({phone:'966500000001',body:'unchanged'});
    assert.equal(c.sends().length,1);assert.ok(c.sends()[0].url.includes(Object.keys(options).length?'waInstance222':'waInstance111'));checks++;
  }
  for(const options of [{timeout:true},{status:500},{status:408}]) {
    c=context(options);await assert.rejects(()=>c.campaign.sendBrandaCampaignMessage({phone:'966500000001',body:'unchanged'}),e=>e.uncertain===true);assert.equal(c.sends().length,1);checks++;
  }
  c=context({primary:'notAuthorized',backup:'notAuthorized'});await assert.rejects(()=>c.campaign.sendBrandaCampaignMessage({phone:'966500000001',body:'unchanged'}));assert.equal(c.sends().length,0);checks++;
  c=context({primary:'notAuthorized'});await c.api.sendGreenApiPagerMessage({phone:'966500000001',message:'first'});c.recover();await c.api.sendGreenApiPagerMessage({phone:'966500000001',message:'second'});
  assert.match(c.sends()[0].url,/waInstance222/);assert.match(c.sends()[1].url,/waInstance111/);checks++;
  c=context({primary:'notAuthorized'});const result=await c.api.sendGreenApiSubscriptionReminder({phone:'966500000001',message:'renewal'},async()=>{assert.match(c.calls.at(-1).url,/getStateInstance/);return false;});assert.equal(result.status,'skipped');assert.equal(c.sends().length,0);checks++;
  console.log(`PASS ${checks} platform primary/backup, recovery, media and no-duplicate scenarios; mocked only`);
})().catch(e=>{console.error(e);process.exitCode=1;});
