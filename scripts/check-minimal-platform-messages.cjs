// Checks the user's plan of 2026-11-22 for what Branda's own numbers send: a reward notice instead of the card
// link, no cashier welcome, no welcome or clips on self-registration, tutorials inside the dashboard instead.
// No live request is made and nothing is sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const read = file => fs.readFileSync(file, 'utf8');

function worker({ env, notify, jobs, saved = false }) {
  const finished = [], sent = [];
  const queue = [...jobs];
  const exports = {};
  new Function('require', 'exports', 'process', transpile('lib/loyalty/read-card-links.ts'))(name => ({
    'server-only': {},
    '@/lib/data/account-cancellation': { brandAllowsNewWork: async () => true },
    '@/lib/supabase/admin': { createAdminClient: () => ({ async rpc(fn, args) {
      if (fn === 'claim_stamp_card_link_v2') return { data: args.p_primary_ready ? queue.shift() ?? null : null, error: null };
      finished.push([args.p_id, args.p_status]); return { data: true, error: null };
    } }) },
    '@/lib/auth/loyalty-session-token': { createLoyaltySessionToken: () => 'fixture-token', loyaltyIdentityHash: () => 'fixture' },
    '@/lib/whatsapp/green-api': {
      isGreenApiLoyaltyWelcomeReady: async () => false,
      sendGreenApiLoyaltyWelcome: async input => { sent.push(['platform', input.message]); return { status: 'queued', providerMessageId: 'p' }; },
      sendGreenApiCustomerMessage: async (sender, input) => { sent.push([sender.idInstance, input.message]); return { status: 'queued', providerMessageId: 'n' }; },
    },
    '@/lib/whatsapp/customer-routing': { selectLocoLoyaltySender: async () => null, selectBrandLoyaltySender: async () => null },
    '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: 'loco', WAHED_MASOUB_CAFE_ID: 'wahed' },
    '@/lib/whatsapp/notification-sender': { selectNotificationSender: async () => notify },
    '@/lib/wallet/google': { getGoogleWalletSaveState: async () => saved },
  })[name] ?? (() => { throw new Error(`Unmocked dependency ${name}`); })(), exports, { env });
  return { exports, finished, sent };
}
const job = (id, extra = {}) => ({ id, claimToken: 't', cafeId: 'brand', profileId: 'p', cardId: 'c', brandSlug: 'example', brandName: 'قهوة المثال', phone: '966500000001', cardCreated: false, googleIssued: false, stampsInCycle: 3, purchasesRequired: 6, rewardName: 'قهوة مجانية', ...extra });
const notify = { idInstance: 'notify' };
const live = { BRANDA_ACCESS_MESSAGES_ONLY: 'true', BRANDA_PLATFORM_CARD_LINKS: 'off', BRANDA_REWARD_NOTICES: 'on' };

(async () => {
  let checks = 0;

  // The reward notice: only the stamp that completes the card, from the notifications number, in the brand's name
  {
    const x = worker({ env: live, notify, jobs: [job('a'), job('b', { stampsInCycle: 0 }), job('c', { stampsInCycle: 1, cardCreated: true }), job('d', { stampsInCycle: 5 })] });
    const result = await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.finished, [['a', 'skipped'], ['b', 'queued'], ['c', 'skipped'], ['d', 'skipped']]);
    assert.equal(x.sent.length, 1); assert.equal(x.sent[0][0], 'notify'); assert.equal(result.queued, 1); assert.equal(result.skipped, 3);
    const lines = x.sent[0][1].split('\n\n');
    assert.deepEqual(lines, [
      'مبروك، استحقيت مكافأة من قهوة المثال',
      'مكافأتك: قهوة مجانية',
      'حمّل بطاقتك من الرابط واعرضها للكاشير عند الاستلام',
      'https://barndaksa.com/loyalty/example/access?token=fixture-token',
      'قيّم تجربتك مع قهوة المثال من 1 إلى 5 بالرد برقم',
    ]);
    assert.equal((x.sent[0][1].match(/https?:\/\//g) ?? []).length, 1, 'one link only, the customer card');
    for (const line of lines) assert.doesNotMatch(line, /[.،,]$/, 'no trailing punctuation');
    checks++;
  }
  // No reward name still reads well; control characters cannot break the message
  {
    const { rewardNoticeMessage } = worker({ env: live, notify, jobs: [] }).exports;
    assert.match(rewardNoticeMessage(job('x', { rewardName: null })), /مكافأتك جاهزة في بطاقة الولاء/);
    assert.doesNotMatch(rewardNoticeMessage(job('x', { rewardName: 'قهوة\nمجانية', brandName: 'علامة\r\nاختبار' })).split('\n\n')[0], /[\r\n]/);
    assert.throws(() => rewardNoticeMessage(job('x', { phone: '0500000001' })), /invalid_card_link_job/);
    checks++;
  }
  // Not sent when: the switch for notices is off, the notifications number is unavailable, the count is missing,
  // or the customer already keeps the card in a wallet
  for (const [label, options, extra] of [
    ['notices off', { env: { ...live, BRANDA_REWARD_NOTICES: 'off' }, notify }, {}],
    ['notices not declared', { env: { BRANDA_ACCESS_MESSAGES_ONLY: 'true', BRANDA_PLATFORM_CARD_LINKS: 'off' }, notify }, {}],
    ['notifications number unavailable', { env: live, notify: null }, {}],
    ['count missing', { env: live, notify }, { stampsInCycle: undefined }],
    ['count not zero', { env: live, notify }, { stampsInCycle: 6 }],
    ['card already in a wallet', { env: live, notify, saved: true }, { googleIssued: true }],
  ]) {
    const x = worker({ ...options, jobs: [job('r', { stampsInCycle: 0, ...extra })] });
    await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, [], label); assert.deepEqual(x.finished, [['r', 'skipped']], label); checks++;
  }
  // The normal send budget still applies to notices
  {
    const x = worker({ env: live, notify, jobs: ['a', 'b', 'c', 'd'].map(id => job(id, { stampsInCycle: 0 })) });
    await x.exports.dispatchStampCardLinks(2);
    assert.equal(x.sent.length, 2); checks++;
  }

  // User decision of 2026-11-22: Bolingo alone gets its card link back, from the notifications number, closing
  // with a rating. Every other brand on Branda's numbers is still closed unsent
  const bolingo = 'dbe942ba-dfa4-422b-a9f6-9527c3b27cc9';
  {
    const x = worker({ env: live, notify, jobs: [job('other'), job('known', { cafeId: bolingo, brandName: 'بولينقو' }), job('new', { cafeId: bolingo, brandName: 'بولينقو', cardCreated: true }), job('other2', { cardCreated: true })] });
    assert.deepEqual([...x.exports.PLATFORM_CARD_LINK_CAFE_IDS], [bolingo], 'one named brand only');
    const result = await x.exports.dispatchStampCardLinks(5);
    assert.deepEqual(x.finished, [['other', 'skipped'], ['known', 'queued'], ['new', 'queued'], ['other2', 'skipped']]);
    assert.deepEqual(x.sent.map(([sender]) => sender), ['notify', 'notify']); assert.equal(result.queued, 2);
    assert.deepEqual(x.sent[0][1].split('\n\n'), [
      'يا هلا فيك في بولينقو',
      'تم تحديث رصيدك في بطاقة الولاء',
      'افتح الرابط لعرض بطاقتك وتحميلها إلى المحفظة',
      'https://barndaksa.com/loyalty/example/access?token=fixture-token',
      'قيّم تجربتك مع بولينقو من 1 إلى 5 بالرد برقم',
    ]);
    assert.equal(x.sent[1][1].split('\n\n')[1], 'بطاقة الولاء جاهزة باسمك');
    for (const [, message] of x.sent) {
      assert.equal((message.match(/https?:\/\//g) ?? []).length, 1, 'one link only, the customer card');
      for (const line of message.split('\n\n')) assert.doesNotMatch(line, /[.،,]$/, 'no trailing punctuation');
    }
    checks++;
  }
  // A card on points shows zero stamps: the named brand still gets the card link, never a false reward notice
  {
    const x = worker({ env: live, notify, jobs: [job('zero', { cafeId: bolingo, stampsInCycle: 0 })] });
    await x.exports.dispatchStampCardLinks(2);
    assert.equal(x.sent.length, 1); assert.doesNotMatch(x.sent[0][1], /مبروك|مكافأ/); assert.match(x.sent[0][1], /تم تحديث رصيدك/); checks++;
  }
  // The named brand is not sent to when the notifications number is unavailable (never from the primary or the
  // first standby) or when the customer already keeps the card in a wallet, and the send budget still applies
  for (const [label, options, extra] of [
    ['notifications number unavailable', { env: live, notify: null }, {}],
    ['card already in a wallet', { env: live, notify, saved: true }, { googleIssued: true }],
  ]) {
    const x = worker({ ...options, jobs: [job('b', { cafeId: bolingo, ...extra })] });
    await x.exports.dispatchStampCardLinks(2);
    assert.deepEqual(x.sent, [], label); assert.deepEqual(x.finished, [['b', 'skipped']], label); checks++;
  }
  {
    const x = worker({ env: live, notify, jobs: ['a', 'b', 'c', 'd'].map(id => job(id, { cafeId: bolingo })) });
    await x.exports.dispatchStampCardLinks(2);
    assert.equal(x.sent.length, 2, 'send budget'); checks++;
  }
  // Brands with their own sender keep the original text, with no rating line
  {
    const { stampCardLinkMessage } = worker({ env: live, notify, jobs: [] }).exports;
    const lines = stampCardLinkMessage(job('own')).split('\n\n');
    assert.equal(lines.length, 5); assert.equal(lines[1], 'تم تسجيل ختمك في بطاقة الولاء'); assert.equal(lines[4], 'في زيارتك القادمة اعرض بطاقتك للكاشير لتسجيل ختمك');
    assert.throws(() => stampCardLinkMessage(job('x', { phone: '0500000001' }), { rating: true }), /invalid_card_link_job/);
    checks++;
  }

  // Cashier added: no welcome message while the switch is on, the owner is told to share the link
  {
    const source = read('lib/data/loyalty-cards.ts');
    assert.match(source, /if \(process\.env\.BRANDA_ACCESS_MESSAGES_ONLY\?\.trim\(\) === "true"\) whatsappStatus = "code_only";\s*else if \(isGreenApiConfigured\(\)\) \{/);
    const page = read('components/dashboard/pages/operational-cashier-page.tsx');
    assert.match(page, /result\.whatsappStatus === "code_only"\s*\? "تم إنشاء حساب الموظف شارك رابط الكاشير معه ويدخل برقم جواله ورمز التحقق الذي يصله على واتساب"/);
    checks++;
  }
  // Self-registration: no welcome and no clips while the switch is on, and the owner lands on the tutorials
  {
    const source = read('lib/auth/owner-onboarding.ts');
    assert.match(source, /const tutorialsInApp = process\.env\.BRANDA_ACCESS_MESSAGES_ONLY\?\.trim\(\) === "true";/);
    assert.match(source, /if \(!tutorialsInApp\) after\(async \(\) => \{\s*try \{ await sendGreenApiOwnerSignupWelcome/);
    assert.match(source, /redirectTo: tutorialsInApp \? "\/dashboard\/loyalty\/guide\?start=1" : "\/dashboard"/);
    checks++;
  }
  // The tutorials page: three videos that exist on disk, shown on the guide page, with a way out for accounts without loyalty
  {
    const component = read('components/dashboard/tutorial-videos.tsx');
    const sources = [...component.matchAll(/src: "(\/guides\/[^"]+\.mp4)"/g)].map(match => match[1]);
    assert.equal(sources.length, 3);
    for (const source of sources) assert.ok(fs.existsSync(`public${source}`), source);
    for (const title of ['كيف تضبط حسابك', 'كيف يسجل الموظف الختم', 'كيف يحمل العميل البطاقة']) assert.ok(component.includes(`title: "${title}"`), title);
    assert.match(component, /preload="metadata"/);
    const page = read('app/dashboard/loyalty/guide/page.tsx');
    assert.match(page, /<TutorialVideos welcome=\{welcome\} \/>/);
    assert.match(page, /if \(welcome\) redirect\("\/dashboard"\);/);
    checks++;
  }
  // The administrator's login message invites a reply, and its clips are allowed with it
  {
    const green = read('lib/whatsapp/green-api.ts');
    assert.match(green, /"قدرت تدخل حسابك؟ رد علينا بكلمة تم",\s*\]\.join\("\\n"\), "owner_handoff"\);/);
    assert.match(green, /return sendOwnerVideo\(phone, clip\.url, clip\.filename, clip\.caption, "owner_handoff"\);/);
    checks++;
  }

  const config = read('next.config.ts');
  const notices = /BRANDA_REWARD_NOTICES: "(on|off)"/.exec(config)?.[1] ?? 'not declared';
  console.log(`Minimal platform messages: ${checks} checks passed; reward notices in next.config.ts: ${notices}; nothing sent`);
})().catch(error => { console.error(error); process.exit(1); });
