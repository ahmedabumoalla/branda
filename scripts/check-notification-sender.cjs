// Checks Branda's notifications number (second standby): it is found by its phone on the partner account, used only
// when authorised, and carries the loyalty card link while the primary and first standby stay on access messages.
// No live request is made and nothing is sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const PHONE = '966558891694';
function transpile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function selector({ rows, accounts, env = { GREEN_API_ID_INSTANCE: '111', GREEN_API_OTP_BACKUP_ID_INSTANCE: '222' }, inventoryFails = false }) {
  const asked = [];
  const exports = {};
  new Function('require', 'exports', 'process', transpile('lib/whatsapp/notification-sender.ts'))(name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/whatsapp/green-api-partner') return { async getGreenApiPartnerInstanceRecords() { if (inventoryFails) throw new Error('GREEN_API_PARTNER_REQUEST_FAILED'); return rows; } };
    if (name === '@/lib/whatsapp/green-api-marketing') return { async getGreenApiMarketingAccount(credentials) {
      asked.push(credentials.idInstance);
      const account = accounts[credentials.idInstance];
      if (!account || account.state !== 'authorized') throw new Error('GREEN_API_MARKETING_ACCOUNT_NOT_AUTHORIZED');
      return { phone: account.phone };
    } };
    throw new Error(`Unmocked dependency ${name}`);
  }, exports, { env });
  return { ...exports, asked };
}
const row = (id, extra = {}) => ({ idInstance: id, name: `Instance ${id}`, tariff: 'PARTNER', isPartner: true, deleted: false, isExpired: false, apiTokenInstance: `token-${id}-fixture`, apiUrl: 'https://7700.api.greenapi.com', ...extra });

function worker({ paused, notify, primaryReady = false, jobs }) {
  const finished = [], sent = [], claims = [];
  const queue = [...jobs];
  const exports = {};
  new Function('require', 'exports', 'process', transpile('lib/loyalty/read-card-links.ts'))(name => ({
    'server-only': {},
    '@/lib/data/account-cancellation': { brandAllowsNewWork: async () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({ async rpc(fn, args) {
      if (fn === 'claim_stamp_card_link_v2') { claims.push(args); return { data: args.p_primary_ready ? queue.shift() ?? null : null, error: null }; }
      finished.push([args.p_id, args.p_status]); return { data: true, error: null };
    } }) },
    '@/lib/auth/loyalty-session-token': { createLoyaltySessionToken: () => 'fixture', loyaltyIdentityHash: () => 'fixture' },
    '@/lib/whatsapp/green-api': {
      isGreenApiLoyaltyWelcomeReady: async () => primaryReady,
      sendGreenApiLoyaltyWelcome: async input => { sent.push(['platform', input.phone]); return { status: 'queued', providerMessageId: 'p' }; },
      sendGreenApiCustomerMessage: async (sender, input) => { sent.push([sender.idInstance, input.phone]); return { status: 'queued', providerMessageId: 'n' }; },
    },
    '@/lib/whatsapp/customer-routing': { selectLocoLoyaltySender: async () => null, selectBrandLoyaltySender: async () => null },
    '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: 'loco', WAHED_MASOUB_CAFE_ID: 'wahed' },
    '@/lib/whatsapp/notification-sender': { selectNotificationSender: async () => notify },
    '@/lib/wallet/google': { getGoogleWalletSaveState: async () => false },
  })[name] ?? (() => { throw new Error(`Unmocked dependency ${name}`); })(), exports, { env: paused ? { BRANDA_ACCESS_MESSAGES_ONLY: 'true' } : {} });
  return { exports, finished, sent, claims };
}
const job = id => ({ id, claimToken: 't', cafeId: 'brand', profileId: 'p', cardId: 'c', brandSlug: 'brand', brandName: 'Brand', phone: '966500000001', cardCreated: true, googleIssued: false });

(async () => {
  let checks = 0;

  // Found by the phone WhatsApp reports, whatever the instance is called
  {
    const x = selector({ rows: [row(900), row(770022809698), row(901)], accounts: { 900: { state: 'authorized', phone: '966500000009' }, 770022809698: { state: 'authorized', phone: PHONE }, 901: { state: 'authorized', phone: '966500000008' } } });
    assert.equal(x.NOTIFICATION_SENDER_PHONE, PHONE);
    const sender = await x.selectNotificationSender(1_000);
    assert.deepEqual(sender, { apiUrl: 'https://7700.api.greenapi.com', idInstance: '770022809698', apiTokenInstance: 'token-770022809698-fixture' });
    assert.deepEqual(x.asked, ['900', '770022809698'], 'the search stops at the match'); checks++;
    // Cached for three minutes, then read again
    await x.selectNotificationSender(1_000 + 179_000); assert.equal(x.asked.length, 2);
    await x.selectNotificationSender(1_000 + 181_000); assert.equal(x.asked.length, 4); checks++;
  }

  // Not used when it is not authorised, expired, deleted, not a partner instance, or holds another phone
  for (const [label, rows, accounts] of [
    ['not authorised', [row(770022809698)], { 770022809698: { state: 'notAuthorized', phone: PHONE } }],
    ['blocked', [row(770022809698)], { 770022809698: { state: 'blocked', phone: PHONE } }],
    ['expired', [row(770022809698, { isExpired: true })], { 770022809698: { state: 'authorized', phone: PHONE } }],
    ['deleted', [row(770022809698, { deleted: true })], { 770022809698: { state: 'authorized', phone: PHONE } }],
    ['not partner', [row(770022809698, { isPartner: false })], { 770022809698: { state: 'authorized', phone: PHONE } }],
    ['other phone', [row(770022809698)], { 770022809698: { state: 'authorized', phone: '966500000007' } }],
    ['no key', [row(770022809698, { apiTokenInstance: undefined })], { 770022809698: { state: 'authorized', phone: PHONE } }],
  ]) {
    const x = selector({ rows, accounts });
    assert.equal(await x.selectNotificationSender(1_000), null, label);
    // A miss is rechecked after one minute, not three
    const before = x.asked.length;
    await x.selectNotificationSender(1_000 + 61_000);
    assert.ok(label === 'expired' || label === 'deleted' || label === 'not partner' || label === 'no key' ? x.asked.length === before : x.asked.length > before, label); checks++;
  }

  // Branda's primary and first standby are never chosen, even if someone linked this phone to them
  {
    const x = selector({ rows: [row(111), row(222)], accounts: { 111: { state: 'authorized', phone: PHONE }, 222: { state: 'authorized', phone: PHONE } } });
    assert.equal(await x.selectNotificationSender(1_000), null); assert.deepEqual(x.asked, []); checks++;
  }
  // A partner outage never breaks the worker
  {
    const x = selector({ rows: [], accounts: {}, inventoryFails: true });
    assert.equal(await x.selectNotificationSender(1_000), null); checks++;
  }

  const notify = { apiUrl: 'https://7700.api.greenapi.com', idInstance: 'notify', apiTokenInstance: 'fixture-token' };
  // Access-only switch on and the notifications number ready: card links go out from it, never from Branda's primary
  {
    const x = worker({ paused: true, notify, jobs: [job('a'), job('b'), job('c')] });
    const result = await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, [['notify', '966500000001'], ['notify', '966500000001']], 'the normal send budget applies');
    assert.deepEqual(x.finished, [['a', 'queued'], ['b', 'queued']]); assert.equal(result.queued, 2); assert.equal(result.skipped, 0); checks++;
  }
  // Access-only switch on and the notifications number unavailable: jobs are closed unsent, nothing waits
  {
    const x = worker({ paused: true, notify: null, jobs: [job('a'), job('b'), job('c')] });
    const result = await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, []); assert.deepEqual(x.finished, [['a', 'skipped'], ['b', 'skipped'], ['c', 'skipped']]); assert.equal(result.skipped, 3); checks++;
  }
  // Switch off: the notifications number still carries card links; the primary is only the fallback
  {
    const x = worker({ paused: false, notify, primaryReady: true, jobs: [job('a')] });
    await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, [['notify', '966500000001']]); checks++;
    const y = worker({ paused: false, notify: null, primaryReady: true, jobs: [job('a')] });
    await y.exports.dispatchStampCardLinks(2);
    assert.deepEqual(y.sent, [['platform', '966500000001']]); checks++;
    const z = worker({ paused: false, notify: null, primaryReady: false, jobs: [job('a')] });
    await z.exports.dispatchStampCardLinks(2);
    assert.deepEqual(z.sent, []); assert.deepEqual(z.claims, [], 'nothing is claimed when no sender is ready'); checks++;
  }

  // The notifications number is not one of the two numbers held to access messages, and it never carries codes
  {
    const green = fs.readFileSync('lib/whatsapp/green-api.ts', 'utf8');
    assert.match(green, /\[process\.env\.GREEN_API_ID_INSTANCE\?\.trim\(\), process\.env\.GREEN_API_OTP_BACKUP_ID_INSTANCE\?\.trim\(\)\]\.includes\(sender\.idInstance\)/);
    for (const file of ['lib/auth/otp-delivery.ts', 'lib/whatsapp/customer-routing.ts', 'lib/whatsapp/green-api.ts']) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /notification-sender/, `${file} must not route through the notifications number`);
    const users = ['lib/loyalty/read-card-links.ts'];
    for (const file of users) assert.match(fs.readFileSync(file, 'utf8'), /selectNotificationSender\(\)/);
    checks++;
  }

  console.log(`Notifications number: ${checks} checks passed; nothing sent`);
})().catch(error => { console.error(error); process.exit(1); });
