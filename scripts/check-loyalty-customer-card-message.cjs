// Checks the manual card message a brand can copy from a customer's file: authorisation first, the same message
// builder as the automatic send, the right wording, and a WhatsApp link to the customer's own number. Nothing is sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, stubs) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', stubs);
    return require(name);
  }, exports);
  return exports;
}

function scenario({ phone = '0500000001', stamps = 1, card = true, denied = false } = {}) {
  const events = [];
  const jobs = [];
  const queries = [];
  const chain = { select(columns) { queries.push(['select', columns]); return chain; }, eq(column, value) { queries.push([column, value]); return chain; },
    async maybeSingle() { return { data: card ? { stamps_in_cycle: stamps } : null }; } };
  const module = load('lib/data/loyalty-customer-card-message.ts', {
    '@/lib/data/loyalty-customers': { async getOwnerLoyaltyCustomerDetail(id, downloadedOnly) {
      events.push(['authorise', id, downloadedOnly]);
      if (denied) throw new Error('Customer directory access denied');
      return { id, name: 'عميل الاختبار', phone };
    } },
    '@/lib/data/cafes': { async requireOwnerCafeContext() { events.push(['brand']); return { id: 'cafe-1', slug: 'example-brand', name: 'علامة الاختبار', role: 'owner' }; } },
    '@/lib/supabase/server': { async createClient() { events.push(['database']); return { from(table) { queries.push(['from', table]); return chain; } }; } },
    '@/lib/loyalty/read-card-links': { stampCardLinkMessage(job) { events.push(['message']); jobs.push(job); return `رسالة ${job.cardCreated ? 'بطاقة جديدة' : 'ختم'}\nhttps://barndaksa.com/loyalty/${job.brandSlug}/access?token=t`; } },
  });
  return { module, events, jobs, queries };
}

(async () => {
  let checks = 0;

  {
    const x = scenario();
    const result = await x.module.getOwnerLoyaltyCustomerCardMessage('customer-1', true);
    assert.deepEqual(x.events.map(event => event[0]), ['authorise', 'brand', 'database', 'message'], 'the directory authorisation runs before anything else');
    assert.deepEqual(x.events[0], ['authorise', 'customer-1', true], 'the directory variant is passed through');
    assert.equal(x.jobs[0].phone, '966500000001'); assert.equal(x.jobs[0].profileId, 'customer-1');
    assert.equal(x.jobs[0].cafeId, 'cafe-1'); assert.equal(x.jobs[0].brandSlug, 'example-brand'); assert.equal(x.jobs[0].brandName, 'علامة الاختبار');
    assert.deepEqual(x.queries, [['from', 'loyalty_cards'], ['select', 'stamps_in_cycle'], ['cafe_id', 'cafe-1'], ['customer_profile_id', 'customer-1'], ['status', 'active']]);
    assert.ok(result.whatsappUrl.startsWith('https://wa.me/966500000001?text='));
    assert.equal(decodeURIComponent(result.whatsappUrl.split('?text=')[1]), result.message);
    checks++;
  }

  // Wording follows the card: first stamp or no card row reads as a new card, a card further along as a stamp
  for (const [input, created] of [[{ stamps: 0 }, true], [{ stamps: 1 }, true], [{ card: false }, true], [{ stamps: 2 }, false], [{ stamps: 6 }, false]]) {
    const x = scenario(input);
    await x.module.getOwnerLoyaltyCustomerCardMessage('customer-1');
    assert.equal(x.jobs[0].cardCreated, created, JSON.stringify(input)); checks++;
  }

  // Phone formats saved in a customer's file all resolve to the same number, and a missing one stops before any link
  for (const phone of ['+966500000001', '966500000001', '00966500000001', '500000001']) {
    const x = scenario({ phone });
    assert.ok((await x.module.getOwnerLoyaltyCustomerCardMessage('customer-1')).whatsappUrl.startsWith('https://wa.me/966500000001?')); checks++;
  }
  for (const phone of [null, '', '12345', '+971500000001']) {
    const x = scenario({ phone });
    await assert.rejects(() => x.module.getOwnerLoyaltyCustomerCardMessage('customer-1'), /customer_phone_unavailable/);
    assert.deepEqual(x.events.map(event => event[0]), ['authorise'], 'no brand read and no link for an unusable phone'); checks++;
  }

  // A caller the directory refuses never reaches the link builder
  {
    const x = scenario({ denied: true });
    await assert.rejects(() => x.module.getOwnerLoyaltyCustomerCardMessage('customer-1'), /access denied/);
    assert.deepEqual(x.events.map(event => event[0]), ['authorise']); checks++;
  }

  // The action never leaks an internal error and keeps the interface copy free of trailing punctuation
  {
    const action = fs.readFileSync('app/actions/loyalty-customer-card-message.ts', 'utf8');
    assert.match(action, /^"use server";/);
    assert.match(action, /catch \(error\)/);
    for (const text of ['لا يوجد رقم جوال صحيح لهذا العميل', 'تعذر تجهيز رسالة البطاقة أعد المحاولة']) assert.ok(action.includes(`"${text}"`));
    const component = fs.readFileSync('components/loyalty/customer-card-message.tsx', 'utf8');
    assert.match(component, /rel="noopener noreferrer"/);
    assert.match(component, /navigator\.clipboard\.writeText\(ready\.message\)/);
    assert.doesNotMatch(component, /[.،]"\s*[}<]/, 'interface copy has no trailing period or comma');
    const directory = fs.readFileSync('components/loyalty/customer-directory.tsx', 'utf8');
    assert.match(directory, /\{detail\?\.phone && <CustomerCardMessage customerId=\{customer\.id\} downloadedOnly=\{downloadedOnly\} \/>\}/);
    checks++;
  }

  console.log(`Loyalty customer card message: ${checks} checks passed; nothing sent`);
})().catch(error => { console.error(error); process.exit(1); });
