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

function loadAuthHelper(name) {
  const exports = {};
  new Function('require', 'exports', transpile(name.slice(2) + '.ts'))(loadAuthHelper, exports);
  return exports;
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

function worker({ paused, notify, primaryReady = false, jobs, off = false, loco = null }) {
  const finished = [], sent = [], claims = [];
  const queue = [...jobs];
  const exports = {};
  new Function('require', 'exports', 'process', transpile('lib/loyalty/read-card-links.ts'))(name => ({
    'server-only': {},
    '@/lib/auth/brand-phone': loadAuthHelper('@/lib/auth/brand-phone'),
    '@/lib/data/account-cancellation': { brandAllowsNewWork: async () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({ async rpc(fn, args) {
      if (fn === 'claim_stamp_card_link_v3') { claims.push(args); return { data: args.p_primary_ready ? queue.shift() ?? null : null, error: null }; }
      finished.push([args.p_id, args.p_status]); return { data: true, error: null };
    } }) },
    '@/lib/auth/loyalty-session-token': { createLoyaltySessionToken: () => 'fixture', loyaltyIdentityHash: () => 'fixture' },
    '@/lib/whatsapp/green-api': {
      isGreenApiLoyaltyWelcomeReady: async () => primaryReady,
      sendGreenApiLoyaltyWelcome: async input => { sent.push(['platform', input.phone]); return { status: 'queued', providerMessageId: 'p' }; },
      sendGreenApiCustomerMessage: async (sender, input) => { sent.push([sender.idInstance, input.phone]); return { status: 'queued', providerMessageId: 'n' }; },
    },
    '@/lib/whatsapp/customer-routing': { selectLocoLoyaltySender: async () => loco, selectBrandLoyaltySender: async () => null },
    '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: 'loco', WAHED_MASOUB_CAFE_ID: 'wahed' },
    '@/lib/whatsapp/notification-sender': { selectNotificationSender: async () => notify },
    '@/lib/wallet/google': { getGoogleWalletSaveState: async () => false },
  })[name] ?? (() => { throw new Error(`Unmocked dependency ${name}`); })(), exports, { env: { ...(paused ? { BRANDA_ACCESS_MESSAGES_ONLY: 'true' } : {}), ...(off ? { BRANDA_PLATFORM_CARD_LINKS: 'off' } : {}) } });
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
  // Only a verified new cashier-by-phone issue gets the Meram invitation.
  {
    const meram = { ...job('new'), cafeId: '98fd33d5-522d-46e7-adeb-34b04a665f4f', meramCashierPhoneIssue: true };
    const repeat = { ...meram, id: 'repeat', cardCreated: false, meramCashierPhoneIssue: false };
    const pager = { ...meram, id: 'pager', meramCashierPhoneIssue: false };
    const x = worker({ paused: true, off: true, notify, primaryReady: true, jobs: [meram, repeat, pager] });
    await x.exports.dispatchStampCardLinks(3);
    assert.deepEqual(x.sent, [['notify', meram.phone]]);
    assert.deepEqual(x.finished, [['new', 'queued'], ['repeat', 'skipped'], ['pager', 'skipped']]);
    const offline = worker({ paused: true, off: true, notify: null, primaryReady: true, jobs: [meram] });
    await offline.exports.dispatchStampCardLinks(1);
    assert.deepEqual(offline.sent, []);
    assert.deepEqual(offline.finished, [['new', 'deferred']]); checks++;
  }

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
  // User decision of 2026-11-22, BRANDA_PLATFORM_CARD_LINKS "off": no Branda number sends a card link, whatever is
  // connected and whatever the access-only switch says; waiting jobs are closed unsent; a brand's own number still sends
  for (const paused of [true, false]) {
    const x = worker({ paused, off: true, notify, primaryReady: true, jobs: [job('a'), job('b'), job('c')] });
    const result = await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, [], 'nothing leaves the notifications number or the primary');
    assert.deepEqual(x.finished, [['a', 'skipped'], ['b', 'skipped'], ['c', 'skipped']]); assert.equal(result.skipped, 3); checks++;
    const own = { idInstance: 'loco-own' };
    const y = worker({ paused, off: true, notify, primaryReady: true, loco: own, jobs: [job('a'), { ...job('l'), cafeId: 'loco' }, job('b')] });
    await y.exports.dispatchStampCardLinks(2);
    assert.deepEqual(y.sent, [['loco-own', '966500000001']], 'the brand with its own sender is not affected');
    assert.deepEqual(y.finished, [['a', 'skipped'], ['l', 'queued'], ['b', 'skipped']]); checks++;
  }
  {
    const config = fs.readFileSync('next.config.ts', 'utf8');
    assert.match(config, /BRANDA_PLATFORM_CARD_LINKS: "off"/, 'the card link from Branda numbers stays off until the user asks otherwise');
    checks++;
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
    assert.deepEqual(z.sent, []); assert.deepEqual(z.claims, [{p_primary_ready:false,p_loco_ready:false}], 'check only for eligible private senders when the platform is unavailable'); assert.deepEqual(z.finished, []); checks++;
  }

  // Verification codes (user decision 2026-11-22): the notifications number first, Branda's primary and first
  // standby only when it is not connected or refuses, and never the same code twice
  const env = {
    GREEN_API_API_URL: 'https://1100.api.greenapi.com', GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: 'primary-secret',
    GREEN_API_OTP_BACKUP_API_URL: 'https://7700.api.greenapi.com', GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: 'backup-secret',
  };
  const codeSender = { apiUrl: 'https://7700.api.greenapi.com', idInstance: '333', apiTokenInstance: 'notify-secret' };
  function green({ notifySender = codeSender, notifyState = 'authorized', notifyPost = 'ok', primary = 'authorized', settings = env } = {}) {
    const calls = [];
    const load = file => {
      const exports = {};
      new Function('require', 'exports', 'process', 'fetch', 'setTimeout', transpile(file))(name => {
        if (name === 'server-only') return {};
        if (name === '@/lib/whatsapp/notification-sender') return { selectNotificationSender: async () => notifySender };
        if (name.includes('owner-guide-delivery')) return { queueOwnerCompanionGuides: async () => {} };
        if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
        return require(name);
      }, exports, { env: settings }, async (url, init = {}) => {
        const instance = /waInstance(\d+)/.exec(url)[1];
        const post = (init.method ?? 'GET') === 'POST';
        calls.push(`${post ? 'POST' : 'GET'} ${instance}`);
        if (!post) return Response.json({ stateInstance: instance === '333' ? notifyState : instance === '111' ? primary : 'authorized' });
        if (instance === '333') {
          if (notifyPost === 'timeout') throw new Error('timeout with secret URL');
          if (notifyPost === 'malformed') return Response.json({});
          if (typeof notifyPost === 'number') return new Response('', { status: notifyPost });
        }
        return Response.json({ idMessage: `ack-${instance}` });
      }, fn => { fn(); return 0; });
      return exports;
    };
    return { module: load('lib/whatsapp/green-api.ts'), calls, posts: () => calls.filter(call => call.startsWith('POST')) };
  }
  const code = { phoneNormalized: '966500000001', code: '123456', brandName: 'Example' };
  const palestinian = green({ settings: env });
  assert.deepEqual(await palestinian.module.sendGreenApiOtp({ ...code, phoneNormalized: '970591234567' }), { providerMessageId: 'ack-333' });
  assert.deepEqual(palestinian.calls, ['GET 333', 'POST 333']); checks++;
  for (const method of ['sendGreenApiSupabaseOtp', 'sendGreenApiOtp']) {
    for (const settings of [env, { ...env, BRANDA_ACCESS_MESSAGES_ONLY: 'true' }]) {
      const x = green({ settings });
      assert.deepEqual(await x.module[method](code), { providerMessageId: 'ack-333' });
      assert.deepEqual(x.calls, ['GET 333', 'POST 333'], 'state read then one send; the primary is not even probed'); checks++;
    }
    // Not connected: nothing is posted to it, because the provider would queue the code for later
    for (const notifyState of ['notAuthorized', 'yellowCard', 'blocked']) {
      const x = green({ notifyState });
      assert.deepEqual(await x.module[method](code), { providerMessageId: 'ack-111' });
      assert.deepEqual(x.posts(), ['POST 111']); checks++;
    }
    // No notifications number at all: the earlier behaviour, primary then first standby
    {
      const x = green({ notifySender: null });
      await x.module[method](code); assert.deepEqual(x.posts(), ['POST 111']);
      const y = green({ notifySender: null, primary: 'blocked' });
      assert.deepEqual(await y.module[method](code), { providerMessageId: 'ack-222' }); assert.deepEqual(y.posts(), ['POST 222']); checks++;
    }
    // A sender whose settings fail validation is refused before any request, so the code still goes out
    {
      const x = green({ notifySender: { apiUrl: 'https://7700.api.greenapi.com', idInstance: '333', apiTokenInstance: 'bad token with spaces' } });
      assert.deepEqual(await x.module[method](code), { providerMessageId: 'ack-111' });
      assert.deepEqual(x.posts(), ['POST 111']); checks++;
    }
    // An explicit refusal moves on to Branda's numbers; an uncertain outcome never sends the code a second time
    for (const status of [401, 403, 429, 466]) {
      const x = green({ notifyPost: status });
      assert.deepEqual(await x.module[method](code), { providerMessageId: 'ack-111' });
      assert.deepEqual(x.posts(), ['POST 333', 'POST 111']); checks++;
    }
    for (const notifyPost of [500, 502, 408, 'timeout', 'malformed']) {
      const x = green({ notifyPost });
      await assert.rejects(() => x.module[method](code), /OTP_SEND_OUTCOME_UNKNOWN/);
      assert.deepEqual(x.posts(), ['POST 333'], `no second send after ${notifyPost}`); checks++;
    }
  }
  // The administrator's owner login and every other message never use the notifications number here
  {
    const x = green();
    await x.module.sendGreenApiOwnerWelcome({ phone: '966500000001', brandName: 'Example', password: 'fixture-only', startsTrial: false });
    await x.module.sendGreenApiPagerMessage({ phone: '966500000001', message: 'order ready' });
    assert.ok(x.calls.every(call => !call.endsWith(' 333')), 'only codes and card links may use it'); assert.equal(x.posts().length, 2); checks++;
  }
  // Customer codes of a brand with a private connection: its own number, then the notifications number, then the platform
  {
    const route = ({ linked = null, notifySender = codeSender, notifyReady = true }) => {
      const exports = {};
      new Function('require', 'exports', transpile('lib/whatsapp/customer-routing.ts'))(name => ({
        'server-only': {},
    '@/lib/auth/brand-phone': loadAuthHelper('@/lib/auth/brand-phone'),
        '@/lib/data/brand-whatsapp': { getLocoCustomerWhatsAppCredentials: async () => null, getBrandCustomerWhatsAppCredentials: async () => linked },
        '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: 'loco', WAHED_MASOUB_CAFE_ID: 'brand', supportsPrivateWhatsApp: () => true },
        '@/lib/whatsapp/green-api': { isGreenApiBackupOnly: () => false, getGreenApiCustomerPlatformSenders: () => ({ primary: { idInstance: '111' }, backup: { idInstance: '222' } }),
          isGreenApiCustomerSenderReady: async sender => sender.idInstance === '333' ? notifyReady : true },
        '@/lib/whatsapp/green-api-marketing': { getGreenApiMarketingAccount: async () => ({ phone: '966500000005' }) },
        '@/lib/whatsapp/notification-sender': { selectNotificationSender: async () => notifySender },
      })[name] ?? (() => { throw new Error(`Unmocked dependency ${name}`); })(), exports);
      return exports;
    };
    const own = { idInstance: '444', expectedPhone: '966500000005' };
    assert.equal((await route({ linked: own }).selectBrandOtpSender('brand')).idInstance, '444');
    assert.equal((await route({}).selectBrandOtpSender('brand')).idInstance, '333');
    assert.equal((await route({ notifyReady: false }).selectBrandOtpSender('brand')).idInstance, '111');
    assert.equal((await route({ notifySender: null }).selectBrandOtpSender('brand')).idInstance, '111');
    assert.equal(await route({}).selectBrandOtpSender('new-brand'), null, 'the caller keeps its existing platform OTP fallbacks');
    // Documents keep their own selection and never reach the notifications number
    assert.equal((await route({}).selectBrandCustomerSender('brand')).idInstance, '111'); checks++;
  }
  {
    const greenSource = fs.readFileSync('lib/whatsapp/green-api.ts', 'utf8');
    assert.match(greenSource, /\[process\.env\.GREEN_API_ID_INSTANCE\?\.trim\(\), process\.env\.GREEN_API_OTP_BACKUP_ID_INSTANCE\?\.trim\(\)\]\.includes\(sender\.idInstance\)/);
    assert.match(greenSource, /if \(notify && await probeSenderReady\(notify\)\) \{/, 'the state is read right before a code is sent');
    assert.match(fs.readFileSync('lib/auth/otp-delivery.ts', 'utf8'), /await selectBrandOtpSender\(job\.cafe_id!\)/);
    assert.match(fs.readFileSync('lib/whatsapp/company-document.ts', 'utf8'), /selectBrandCustomerSender\(cafeId\)/);
    assert.match(fs.readFileSync('lib/loyalty/read-card-links.ts', 'utf8'), /selectNotificationSender\(\)/);
    // Meram rejection notices join the existing approved verification and loyalty routes.
    assert.match(fs.readFileSync('lib/commerce/meram-notifications.ts', 'utf8'), /await selectNotificationSender\(\)/);
    const users = [];
    const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(entry.name) && /whatsapp\/notification-sender"/.test(fs.readFileSync(file, 'utf8'))) users.push(file);
    });
    ['app', 'lib', 'components'].forEach(walk);
    assert.deepEqual(users.sort(), ['lib/commerce/meram-notifications.ts', 'lib/loyalty/read-card-links.ts', 'lib/salon/worker.ts', 'lib/whatsapp/customer-routing.ts', 'lib/whatsapp/green-api.ts']);
    checks++;
  }

  console.log(`Notifications number: ${checks} checks passed; nothing sent`);
})().catch(error => { console.error(error); process.exit(1); });
