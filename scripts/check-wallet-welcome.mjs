import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'server-only') return {};
    if (name in mocks) return mocks[name];
    if (name === '@/lib/data/account-cancellation') return { brandAllowsNewWork: async () => true, brandSlugAllowsNewWork: async () => true };
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
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (String(url).includes('/getStateInstance/') && !Object.hasOwn(body, 'stateInstance')) return Response.json({ stateInstance: 'authorized' });
    return new Response(JSON.stringify(body), { status });
  };
}
respond(200, { stateInstance: 'authorized' });
assert.equal(await green.isGreenApiLoyaltyWelcomeReady(), true);
respond(200, { stateInstance: 'notAuthorized' });
assert.equal(await green.isGreenApiLoyaltyWelcomeReady(), false);
for (const [http, body, expected] of [[200, { idMessage: 'ack' }, 'queued'], [200, {}, 'unknown'], [200, { idMessage: 'a'.repeat(201) }, 'unknown'], [400, {}, 'rejected'], [429, {}, 'rejected'], [500, {}, 'unknown']]) {
  respond(http, body); const before = calls.length;
  assert.equal((await green.sendGreenApiLoyaltyWelcome({ phone: '966500000000', message: 'Test only' })).status, expected);
  assert.equal(calls.slice(before).filter(call => call.opts.method === 'POST').length, 1, 'never retry a POST');
  assert.ok(calls.at(-1).url.includes('waInstance1234567890/'), 'primary only');
  assert.equal(calls.at(-1).opts.redirect, 'error');
}
globalThis.fetch = async (url, opts) => { if (opts.method === 'POST') throw Error('timeout'); return Response.json({ stateInstance: 'authorized' }); };
assert.equal((await green.sendGreenApiLoyaltyWelcome({ phone: '966500000000', message: 'Test' })).status, 'unknown');
await assert.rejects(() => green.sendGreenApiLoyaltyWelcome({ phone: 'bad', message: 'Test' }));
// No imports, database claims or providers are reachable from the disabled worker.
const worker = load('lib/wallet/welcome.ts', {});
globalThis.fetch = async () => { throw Error('Unexpected welcome network request'); };
for (const args of [[], ['card'], ['card', 100]]) {
  assert.deepEqual(await worker.dispatchWalletWelcomes(...args), { processed: 0, queued: 0, rejected: 0, unknown: 0, deferred: false, disabled: true });
}
await worker.welcomeAfterWalletDownload('card');
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
console.log('Disabled welcome worker, retained provider transport and Apple/Google route regressions passed (no real messages)');
