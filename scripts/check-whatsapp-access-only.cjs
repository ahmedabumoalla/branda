// Checks the incident switch BRANDA_ACCESS_MESSAGES_ONLY: while it is on, only verification codes and the login
// message an administrator sends to a brand owner leave Branda's own numbers. No live request is made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const base = {
  GREEN_API_API_URL: 'https://1100.api.greenapi.com', GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: 'primary-secret',
  GREEN_API_MEDIA_URL: 'https://1100.media.greenapi.com',
  GREEN_API_OTP_BACKUP_API_URL: 'https://7700.api.greenapi.com', GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: 'backup-secret',
  GREEN_API_OTP_BACKUP_MEDIA_URL: 'https://7700.media.greenapi.com',
};
const paused = { ...base, BRANDA_ACCESS_MESSAGES_ONLY: 'true' };

function load(file, env, fetcher, stubs = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolve = name => {
    if (name in stubs) return stubs[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', env, fetcher, stubs);
    return require(name);
  };
  new Function('require', 'exports', 'process', 'fetch', 'setTimeout', code)(resolve, exports, { env }, fetcher, fn => { fn(); return 0; });
  return exports;
}

function api(env, { primary = 'authorized', backup = 'authorized' } = {}) {
  const calls = [];
  const module = load('lib/whatsapp/green-api.ts', env, async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('getStateInstance')) return Response.json({ stateInstance: url.includes('waInstance222') ? backup : url.includes('waInstance111') ? primary : 'authorized' });
    return Response.json({ idMessage: 'ack' });
  });
  return { module, calls, posts: () => calls.filter(call => call.method === 'POST') };
}

const phone = '966500000001';
const pdf = new TextEncoder().encode('%PDF-1.7 fixture');
const trial = { phone, brandName: 'Example', password: 'fixture-only', startsTrial: false };

(async () => {
  let checks = 0;
  for (const state of ['authorized','notAuthorized']) {
    const service = api(paused, { primary: state });
    const result = await service.module.sendSignupNoticeFromPrimary('Internal signup fixture');
    const accepted = state === 'authorized';
    assert.equal(result, accepted ? 'sent' : 'pending');
    assert.equal(service.posts().length, accepted ? 1 : 0);
    assert(service.calls.every(call => call.url.includes('waInstance111')));
    if (accepted) assert.equal(service.posts()[0].body.chatId, '966508424401@c.us');
    checks++;
  }
  {
    const service = api(paused);
    await service.module.sendGreenApiOwnerCompanionGuide(phone, 'setup', true);
    assert.match(service.posts()[0].body.caption, /تم تفعيل حسابك/);
    assert.equal(service.posts()[0].body.chatId, phone+'@c.us');
    checks++;
  }


  // Validate every supported country at the final provider boundary, with network fully mocked
  const countries = load('lib/auth/arab-phone-rules.ts', paused, () => { throw new Error('Unexpected network'); }).default;
  for (const country of countries) {
    const recipient = country.callingCode + country.example;
    const x = api(paused);
    await x.module.sendGreenApiOtp({ phoneNormalized: recipient, code: '123456', brandName: 'Example' });
    assert.equal(x.posts().length, 1);
    assert.equal(x.posts()[0].body.chatId, recipient+'@c.us'); checks++;
    await x.module.sendGreenApiOwnerCompanionGuide(recipient, 'setup');
    assert.equal(x.posts()[1].body.chatId, recipient+'@c.us');
    assert.ok(x.posts()[1].url.includes('waInstance111/sendFileByUrl')); checks++;
  }

  // Verification codes still go out, from the primary and from the standby when the primary is restricted
  for (const method of ['sendGreenApiSupabaseOtp', 'sendGreenApiOtp']) {
    const x = api(paused);
    await x.module[method]({ phoneNormalized: phone, code: '123456', brandName: 'Example' });
    assert.equal(x.posts().length, 1); assert.ok(x.posts()[0].url.includes('waInstance111')); checks++;
    const y = api(paused, { primary: 'blocked' });
    await y.module[method]({ phoneNormalized: phone, code: '123456', brandName: 'Example' });
    assert.equal(y.posts().length, 1); assert.ok(y.posts()[0].url.includes('waInstance222'), 'standby carries the code'); checks++;
  }

  // The login message an administrator sends to a brand owner still goes out, also through the standby
  {
    const x = api(paused);
    await x.module.sendGreenApiOwnerWelcome(trial);
    assert.equal(x.posts().length, 1); assert.ok(x.posts()[0].url.includes('/sendMessage/')); assert.equal(x.posts()[0].body.urlFile, undefined); checks++;
    const y = api(paused, { primary: 'blocked' });
    await y.module.sendGreenApiOwnerWelcome(trial);
    assert.equal(y.posts().length, 1); assert.ok(y.posts()[0].url.includes('waInstance222')); checks++;
  }
  // Verified self-registration tutorials only use the primary sender
  for (const guide of ['setup', 'cashier', 'customer']) {
    const x = api(paused);
    await x.module.sendGreenApiOwnerCompanionGuide(phone, guide);
    assert.equal(x.posts().length, 1); assert.ok(x.posts()[0].url.includes('waInstance111/sendFileByUrl'));
    const blocked = api(paused, { primary: 'blocked' });
    await assert.rejects(() => blocked.module.sendGreenApiOwnerCompanionGuide(phone, guide), /OWNER_GUIDE_PRIMARY_UNAVAILABLE/);
    assert.equal(blocked.posts().length, 0); checks++;
  }
  {
    const x = api(paused);
    await assert.rejects(() => x.module.sendGreenApiOwnerCompanionGuide(phone, 'unknown'), /OWNER_WELCOME_REJECTED/);
    assert.equal(x.calls.length, 0); checks++;
  }

  // Everything else is refused before any request, so neither number is touched
  const refused = [
    ['sendGreenApiLoyaltyWelcome', { phone, message: 'card link' }],
    ['sendGreenApiFinanceShiftAlert', { phone, message: 'shift' }],
    ['sendGreenApiFinanceReceipt', { phone, message: 'receipt', pdf, invoiceNumber: 7 }],
    ['sendGreenApiPagerMessage', { phone, message: 'order ready' }],
    ['sendGreenApiSalesCashierWelcome', { phone, fullName: 'Fixture', brandName: 'Example', slug: 'example', password: 'fixture-only' }],
    ['sendGreenApiLinkedSalesCashierWelcome', { phone, fullName: 'Fixture', brandName: 'Example' }],
    ['sendGreenApiCashierWelcome', { phone: `+${phone}`, fullName: 'Fixture', brandName: 'Example' }],
    ['sendGreenApiMenuFeedback', { recipient: phone, brandName: 'Example', rating: 5, notes: 'fixture' }],
    ['selectGreenApiPlatformSender'],
  ];
  for (const [method, ...args] of refused) {
    for (const state of [{}, { primary: 'blocked' }]) {
      const x = api(paused, state);
      await assert.rejects(() => x.module[method](...args), error => {
        assert.match(error.message, /MESSAGING_TEMPORARILY_PAUSED/, method);
        return true;
      });
      assert.equal(x.calls.length, 0, `${method} must not contact any sender`); checks++;
    }
  }
  {
    const x = api(paused, { primary: 'blocked' });
    assert.deepEqual(await x.module.sendGreenApiSubscriptionReminder({ phone, message: 'renewal' }, async () => true), { status: 'not_sent' });
    assert.equal(await x.module.isGreenApiLoyaltyWelcomeReady(), false);
    assert.equal(x.calls.length, 0); checks++;
  }

  // Customer messages through an explicit sender: Branda's two numbers refuse, a brand-owned sender still sends
  {
    const x = api(paused);
    const { primary, backup } = x.module.getGreenApiCustomerPlatformSenders();
    assert.equal(x.module.isGreenApiPlatformSender(primary), true); assert.equal(x.module.isGreenApiPlatformSender(backup), true);
    for (const sender of [primary, backup]) await assert.rejects(() => x.module.sendGreenApiCustomerMessage(sender, { phone, message: 'invoice' }), /MESSAGING_TEMPORARILY_PAUSED/);
    assert.equal(x.calls.length, 0); checks++;
    assert.equal((await x.module.sendGreenApiCustomerMessage(primary, { phone, message: 'code 123456' }, 10_000, 'otp')).status, 'queued');
    assert.equal(x.posts().length, 1); checks++;
    const brand = { apiUrl: 'https://3300.api.greenapi.com', idInstance: '333', apiTokenInstance: 'brand-secret' };
    assert.equal(x.module.isGreenApiPlatformSender(brand), false);
    assert.equal((await x.module.sendGreenApiCustomerMessage(brand, { phone, message: 'card link' })).status, 'queued');
    assert.ok(x.posts()[1].url.includes('waInstance333')); checks++;
  }

  // Tax invoices never leave Branda's numbers either
  {
    const x = api(paused);
    const green = x.module;
    const documents = load('lib/whatsapp/company-document.ts', paused, async () => { throw Error('Unexpected network'); }, {
      './green-api': green, './customer-routing': { selectBrandCustomerSender: async () => green.getGreenApiCustomerPlatformSenders().backup },
      './brand-connection-types': { supportsPrivateWhatsApp: id => id === 'private-brand' },
    });
    assert.equal(await documents.selectCompanyDocumentSender('ordinary-brand'), null);
    assert.equal(await documents.selectCompanyDocumentSender('private-brand'), null, 'a private brand must not fall back to the standby number');
    await assert.rejects(() => documents.sendCompanyDocument(green.getGreenApiCustomerPlatformSenders().primary, { phone, pdf, draftId: '00000000-0000-4000-8000-000000000000' }), /MESSAGING_TEMPORARILY_PAUSED/);
    assert.equal(x.calls.length, 0); checks++;
  }

  // With the switch off, ordinary messages are sent as before
  for (const env of [base, { ...base, BRANDA_ACCESS_MESSAGES_ONLY: 'false' }]) {
    const x = api(env);
    assert.equal(x.module.isPlatformAccessOnly(), false);
    assert.equal((await x.module.sendGreenApiLoyaltyWelcome({ phone, message: 'card link' })).status, 'queued');
    assert.equal(x.posts().length, 1); checks++;
  }

  // Card link jobs of Branda's numbers are claimed and closed as skipped, never sent and never left waiting
  {
    const source = fs.readFileSync('lib/loyalty/read-card-links.ts', 'utf8');
    assert.match(source, /const paused = process\.env\.BRANDA_ACCESS_MESSAGES_ONLY\?\.trim\(\) === "true";/);
    assert.match(source, /p_primary_ready: claimPlatform/);
    // Since 2026-11-22 the notifications number carries these links; they are closed unsent only when it is unavailable
    assert.match(source, /const drain = platformOff \|\| \(paused && !notifySender\);/);
    // The exceptions are a stamp that completes the card and the one brand the user named on 2026-11-22:
    // scripts/check-minimal-platform-messages.cjs covers both
    assert.match(source, /if \(drain && usesPlatformNumber && !earnedReward && !namedLink\) \{ await finish\("skipped"\); continue; \}/);
    assert.ok(source.indexOf('if (drain && usesPlatformNumber && !earnedReward && !namedLink)') < source.indexOf('const input = { phone: job.phone'), 'the skip happens before any message is built or sent');
    assert.ok(source.indexOf(': notifySender ? await sendGreenApiCustomerMessage(notifySender, input)') < source.indexOf(': primaryReady ? await sendGreenApiLoyaltyWelcome(input)'), 'the notifications number is tried before Branda\'s primary');
    checks++;
  }

  const config = fs.readFileSync('next.config.ts', 'utf8');
  const state = /env: \{ BRANDA_ACCESS_MESSAGES_ONLY: "(true|false)"[,} ]/.exec(config)?.[1];
  assert.ok(state, 'The incident switch must stay declared in next.config.ts as "true" or "false"');
  console.log(`WhatsApp access-only switch: ${checks} checks passed; switch in next.config.ts is ${state === 'true' ? 'ON (codes, administrator owner login signup team notices and activated owner tutorials leave Branda numbers)' : 'OFF (normal sending)'}`);
})().catch(error => { console.error(error); process.exit(1); });
