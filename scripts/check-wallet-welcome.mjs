import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'server-only') return {};
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency ' + name);
  }, module, module.exports);
  return module.exports;
}
process.env.GREEN_API_API_URL = 'https://api.green-api.com';
process.env.GREEN_API_ID_INSTANCE = '1234567890';
process.env.GREEN_API_API_TOKEN_INSTANCE = 'test_token_only';
process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE = '9876543210';
const green = load('lib/whatsapp/green-api.ts', {});
let calls = [];
function respond(status, body) {
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify(body), { status }); };
}
respond(200, { stateInstance: 'authorized' });
assert.equal(await green.isGreenApiLoyaltyWelcomeReady(), true);
respond(200, { stateInstance: 'notAuthorized' });
assert.equal(await green.isGreenApiLoyaltyWelcomeReady(), false);
for (const [http, body, expected] of [[200, { idMessage: 'ack' }, 'queued'], [200, {}, 'unknown'], [200, { idMessage: 'a'.repeat(201) }, 'unknown'], [400, {}, 'rejected'], [429, {}, 'rejected'], [500, {}, 'unknown']]) {
  respond(http, body); const before = calls.length;
  assert.equal((await green.sendGreenApiLoyaltyWelcome({ phone: '966500000000', message: 'Test only' })).status, expected);
  assert.equal(calls.length, before + 1, 'never retry a POST');
  assert.ok(calls.at(-1).url.includes('waInstance1234567890/'), 'primary only');
  assert.equal(calls.at(-1).opts.redirect, 'error');
}
globalThis.fetch = async () => { throw Error('timeout'); };
assert.equal((await green.sendGreenApiLoyaltyWelcome({ phone: '966500000000', message: 'Test' })).status, 'unknown');
await assert.rejects(() => green.sendGreenApiLoyaltyWelcome({ phone: 'bad', message: 'Test' }));
let ready = false, rpcCalls = [], sends = [], jobs = [], saved = true, outcome = { status: 'queued', providerMessageId: 'ack' };
const worker = load('lib/wallet/welcome.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
    rpcCalls.push({ name, args }); return { data: name === 'claim_wallet_welcome' ? jobs.shift() ?? null : saved, error: null };
  } }) },
  '@/lib/whatsapp/green-api': { isGreenApiLoyaltyWelcomeReady: async () => ready, sendGreenApiLoyaltyWelcome: async input => { sends.push(input); return outcome; } },
});
assert.equal((await worker.dispatchWalletWelcomes()).deferred, true);
assert.equal(rpcCalls.length, 0, 'disconnected sender cannot consume a claim');
ready = true;
const job = { id: 'job', claimToken: 'token', phone: '966500000000', brandName: 'Test Brand', stamps: 6, reward: '10%' };
jobs = [job];
assert.equal((await worker.dispatchWalletWelcomes('card')).queued, 1);
assert.equal(rpcCalls[0].args.p_card_id, 'card');
assert.equal(rpcCalls[1].args.p_token, 'token');
assert.ok(sends[0].message.includes('Test Brand') && sends[0].message.includes('6') && sends[0].message.includes('10%'));
assert.equal((await worker.dispatchWalletWelcomes('card')).processed, 0);
assert.equal(sends.length, 1, 'consumed claim never sent again');
jobs = [job]; outcome = { status: 'unknown' };
assert.equal((await worker.dispatchWalletWelcomes()).unknown, 1);
assert.equal(rpcCalls.at(-1).args.p_status, 'unknown');
jobs = Array(8).fill(job); outcome = { status: 'rejected' };
assert.equal((await worker.dispatchWalletWelcomes(undefined, 100)).processed, 5, 'bounded cron batch');
jobs = [job]; saved = false;
await assert.rejects(() => worker.dispatchWalletWelcomes(), /result_unavailable/);
// Execute the real handlers against isolated dependencies: no customer pass or send.
for (const provider of ['apple', 'google']) {
  let authorized = true, issueFails = false, scheduled = [], welcomed = [];
  const route = load(`app/api/wallet/${provider}/[cardCode]/route.ts`, {
    'next/server': { after: callback => scheduled.push(callback), NextResponse: { json: Response.json, redirect: (url, init) => new Response(null, { ...init, headers: { location: url } }) } },
    '@/lib/data/loyalty-experience': { getAuthorizedWalletMember: async () => authorized ? { card: { id: 'card' }, program: { appleWalletEnabled: true, googleWalletEnabled: true } } : null },
    '@/lib/wallet': { getWalletReadiness: () => ({ apple: true, google: true }), issueApplePass: async () => { if (issueFails) throw Error('failed'); return new Uint8Array([1]); }, issueGoogleSaveUrl: async () => { if (issueFails) throw Error('failed'); return 'https://pay.google.com/test'; } },
    '@/lib/wallet/welcome': { welcomeAfterWalletDownload: async id => welcomed.push(id) },
  });
  const invoke = () => route.GET(new Request('https://example.test'), { params: Promise.resolve({ cardCode: 'code' }) });
  assert.equal((await invoke()).status, provider === 'apple' ? 200 : 303);
  assert.equal(welcomed.length, 0, 'wallet response is not delayed by sending');
  await scheduled[0](); assert.deepEqual(welcomed, ['card']);
  scheduled = []; issueFails = true;
  assert.equal((await invoke()).status, 503); assert.equal(scheduled.length, 0);
  authorized = false;
  assert.equal((await invoke()).status, 404); assert.equal(scheduled.length, 0);
}
console.log('Wallet welcome sender, dedupe worker and Apple/Google route regressions passed (no real messages)');
