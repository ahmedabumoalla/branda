const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'zod' || name === 'node:crypto') return require(name);
    if (name === 'server-only') return {};
    throw Error('Unexpected dependency ' + name);
  }, exports);
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const lease = '33333333-3333-4333-8333-333333333333';
(async () => {
  const shared = load('lib/finance/pos-customer.ts');
  const phone = '966500000001';
  for (const value of ['0500000001', '+966 50 000 0001', '00966500000001', '500000001', '\u0660\u0665\u0660\u0660\u0660\u0660\u0660\u0660\u0660\u0661', '\u06f0\u06f5\u06f0\u06f0\u06f0\u06f0\u06f0\u06f0\u06f0\u06f1']) assert.equal(shared.normalizePosCustomerPhone(value), phone);
  for (const value of ['', ' ', '050000000', '05000000010', 'abc0500000001', '966400000001', null, '0'.repeat(31)]) assert.equal(shared.normalizePosCustomerPhone(value), null);
  let keyReads = 0;
  const server = load('lib/finance/pos-customer-server.ts', { './pos-customer': shared, '@/lib/barndaksa/env': { getSupabaseServiceRoleKey: () => { keyReads++; return 'test-key'; } } });
  for (const customerPhone of [undefined, null, '', '  ']) { const payload = { customerPhone, pagerFeedbackHash: 'forged' }; server.prepareFinancePosCustomerPayload(payload, id); assert.deepEqual(payload, {}); }
  assert.equal(keyReads, 0);
  assert.throws(() => server.prepareFinancePosCustomerPayload({ redeemRewardId: orderId }, id));
  assert.throws(() => server.prepareFinancePosCustomerPayload({ customerPhone: phone, redeemRewardId: 'forged' }, id));
  const payload = { customerPhone: '0500000001', redeemRewardId: orderId, pagerFeedbackHash: 'forged' };
  server.prepareFinancePosCustomerPayload(payload, id);
  const token = crypto.createHmac('sha256', 'test-key').update(`branda:pager:feedback:v1:${id}`).digest('hex');
  assert.equal(payload.pagerFeedbackHash, crypto.createHash('sha256').update(token).digest('hex'));
  const first = { ...payload }; server.prepareFinancePosCustomerPayload(payload, id); assert.deepEqual(payload, first);
  assert(!JSON.stringify(payload).includes(token), 'Raw feedback capability never sent to SQL');

  let calls = [], contexts = [], data, error = null;
  const context = async slug => { contexts.push(slug); return { cafe: { id, role: 'cashier' }, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } } }; };
  const dal = load('lib/data/finance-pos-customer.ts', { './brand-finance': { getBrandFinanceContext: context }, '@/lib/finance/pos-customer': shared });
  const afterJobs = []; let pagerRuns = 0;
  const actions = load('app/actions/finance-pos-customer.ts', { 'next/server': { after: callback => afterJobs.push(callback) }, '@/lib/platform/action-result': load('lib/platform/action-result.ts'), '@/lib/data/finance-pos-customer': dal, '@/lib/pager/worker': { runPagerMessageJobs: async n => { pagerRuns += n; } } });
  assert.equal((await actions.fetchFinancePosCustomerAction('bad')).ok, false); assert.equal(calls.length, 0);
  data = { phone, loyaltyEnabled: true, pagerEnabled: true, member: true, customerName: 'Customer', stampsInCycle: 3, purchasesRequired: 5, rewards: [{ id: orderId, title: 'Reward', expiresAt: null }], cardCode: 'SECRET_CARD_CODE' };
  const customer = await actions.fetchFinancePosCustomerAction('0500000001', 'brand');
  assert.equal(customer.ok, true); assert.equal(customer.data.member.targetStamps, 5); assert.equal(customer.data.member.rewardsReady, 1);
  assert(!JSON.stringify(customer).includes('SECRET_CARD_CODE'));
  assert.deepEqual(calls.at(-1), { name: 'brand_finance_pos_customer', args: { p_cafe_id: id, p_phone: phone } }); assert.equal(contexts.at(-1), 'brand');
  data = { ...data, phone: '966500000002' }; assert.equal((await actions.fetchFinancePosCustomerAction(phone)).ok, false);
  data = { phone, loyaltyEnabled: false, pagerEnabled: false, member: false, purchasesRequired: null, rewards: [] }; assert.equal((await dal.getFinancePosCustomer(phone)).member, null);
  const row = { id: orderId, cafe_id: id, invoice_number: '19', phone, status: 'waiting', created_at: '2026-10-25T00:00:00Z', created_by: 'Employee', created_station: 'POS', message_count: 0 };
  data = { orders: [row], total: 1, page: 0, pageSize: 25, metrics: { total: 1 } };
  assert.equal((await dal.getFinancePosPager({ status: 'all', query: ' 19 ' }, 'brand')).orders[0].invoiceNumber, '19');
  assert.deepEqual(calls.at(-1).args, { p_cafe_id: id, p_page: 0, p_status: 'all', p_query: '19' });
  const before = calls.length; for (const filter of [{ page: -1 }, { page: 1.5 }, { status: 'forged' }, { query: 'x'.repeat(121) }, { cafeId: orderId }]) await assert.rejects(() => dal.getFinancePosPager(filter));
  assert.equal(calls.length, before);
  data = { ...row, status: 'ready' }; assert.equal((await actions.updateFinancePosPagerAction(orderId, 'ready', 'brand')).ok, true); assert.equal(afterJobs.length, 1); assert.equal(pagerRuns, 0); await afterJobs.pop()(); assert.equal(pagerRuns, 5);
  assert.deepEqual(calls.at(-1).args, { p_cafe_id: id, p_order_id: orderId, p_status: 'ready' });
  error = { code: '42501', message: 'private SQL text' };
  assert.equal((await actions.updateFinancePosPagerAction(orderId, 'ready')).ok, false); assert.equal(afterJobs.length, 0);
  assert(!(await actions.fetchFinancePosCustomerAction(phone)).message.includes('SQL')); error = null;
  data = { ...row, cafe_id: orderId }; await assert.rejects(() => dal.transitionFinancePosPager(orderId, 'ready'));

  let configured = true, sent = [], workerCalls = [], finishThrows = false, providerStatus = 'queued', walletCalls = [], walletFailure = false, deliveryOrder = [];
  const receipt = {brandName:'Brand',number:19,createdAt:'2026-10-27T01:00:00Z',localReference:null,subtotal:11.5,discount:0,tax:1.5,total:11.5,paid:11.5,vatRate:15,taxInclusive:true,paymentMethod:'cash',lines:[{name:'Coffee',quantity:1,unitPrice:11.5,net:10,tax:1.5}]};
  let pdfFailure=false; const pdf=new TextEncoder().encode('%PDF-test');
  const job = { receipt, id, leaseToken: lease, phone, brandName: 'Brand', slug: 'brand', invoiceNumber: 19, loyaltyStatus: 'stamped', cardCode: 'PRIVATE_CARD_CODE' };
  let jobs = [job];
  const worker = load('lib/data/finance-pos-customer-messages.ts', { '@/lib/finance/customer-receipt':load('lib/finance/customer-receipt.ts'), './finance-customer-receipt':{createFinanceCustomerReceiptPdf:async input=>{assert.deepEqual(input,receipt);if(pdfFailure)throw Error('PDF unavailable');return pdf;}}, '@/lib/wallet': { syncWalletCardByCode: async code => { deliveryOrder.push('wallet'); walletCalls.push(code); if (walletFailure) throw Error('wallet unavailable'); } }, '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { workerCalls.push({ name, args }); if (name.includes('_claim_')) return { data: jobs, error: null }; deliveryOrder.push('finish'); if (finishThrows) throw Error('persist failed'); return { data: true, error: null }; } }) }, '@/lib/whatsapp/green-api': { isGreenApiConfigured: () => configured, sendGreenApiFinanceReceipt: async input => { deliveryOrder.push('send'); sent.push(input); if (providerStatus === 'throw') throw Error('timeout'); return { status: providerStatus, ...(providerStatus === 'queued' ? { providerMessageId: 'provider-id' } : {}) }; } } });
  configured = false; assert.equal((await worker.dispatchFinancePosCustomerMessages(id)).claimed, 0); assert.equal(workerCalls.length, 0); configured = true;
  const result = await worker.dispatchFinancePosCustomerMessages(id); assert.equal(result.queued, 1); assert.equal(sent.length, 1);
  assert.equal(sent[0].pdf,pdf); assert.equal(sent[0].invoiceNumber,19); assert(sent[0].message.includes('نسخة فاتورتك مرفقة'));
  assert.deepEqual(walletCalls, ['PRIVATE_CARD_CODE']); assert(!JSON.stringify(sent).includes('PRIVATE_CARD_CODE'));
  assert.deepEqual(deliveryOrder, ['send', 'finish', 'wallet']);
  assert(sent[0].message.includes('https://barndaksa.com/loyalty/brand')); assert(!sent[0].message.includes(phone)); assert(!sent[0].message.includes('localhost'));
  assert.deepEqual(workerCalls[0], { name: 'brand_finance_claim_customer_messages', args: { p_cafe_id: id, p_limit: 5 } });
  assert.equal(workerCalls.at(-1).args.p_status, 'queued'); assert.equal(workerCalls.at(-1).args.p_lease_token, lease);
  deliveryOrder = []; const walletBeforeBatch = walletCalls.length;
  jobs = [job, { ...job, id: orderId }]; assert.equal((await worker.dispatchFinancePosCustomerMessages()).queued, 2);
  assert.deepEqual(deliveryOrder, ['send', 'finish', 'send', 'finish', 'wallet']); assert.equal(walletCalls.length, walletBeforeBatch + 1, 'Same card syncs once per claimed batch'); jobs = [job];
  walletFailure = true; assert.equal((await worker.dispatchFinancePosCustomerMessages()).queued, 1, 'Wallet outage cannot suppress committed sale WhatsApp'); walletFailure = false;
  jobs = [{ ...job, loyaltyStatus: 'pending_enrollment', cardCode: null }]; const walletBefore = walletCalls.length;
  assert.equal((await worker.dispatchFinancePosCustomerMessages()).queued, 1); assert.equal(walletCalls.length, walletBefore, 'New customer follows normal enrollment before wallet sync'); jobs = [job];
  finishThrows = true; const previous = sent.length; assert.equal((await worker.dispatchFinancePosCustomerMessages()).needsReview, 1); assert.equal(sent.length, previous + 1, 'No immediate retry after successful send and failed completion'); finishThrows = false;
  providerStatus = 'throw'; assert.equal((await worker.dispatchFinancePosCustomerMessages()).needsReview, 1); assert.equal(workerCalls.at(-1).args.p_status, 'unknown');
  jobs = [{ ...job, slug: '../evil' }]; const sentBefore = sent.length; assert.equal((await worker.dispatchFinancePosCustomerMessages()).needsReview, 1); assert.equal(sent.length, sentBefore); assert.equal(workerCalls.at(-1).args.p_status, 'rejected');
  assert.throws(() => worker.financePosCustomerMessage({ ...job, slug: 'https://evil' }));
  jobs=[{...job,receipt:{...receipt,number:20}}]; const beforeMismatch=sent.length; await worker.dispatchFinancePosCustomerMessages(); assert.equal(sent.length,beforeMismatch,'Mismatched invoice cannot be sent');
  jobs=[job]; pdfFailure=true; await worker.dispatchFinancePosCustomerMessages(); assert.equal(sent.length,beforeMismatch,'Failed PDF cannot be marked sent'); pdfFailure=false;
  assert(worker.financePosCustomerMessage({...job,brandName:'B'.repeat(300),receipt:{...receipt,brandName:'B'.repeat(300)},slug:'s'.repeat(120)}).length<=1024,'Provider caption limit even for maximum brand/slug');

  let saleError = null, customerDispatches = 0, financeRpcCalls = [], deferred = [];
  const finance = load('lib/data/brand-finance.ts', { '@/lib/finance/permissions':load('lib/finance/permissions.ts'),
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id } } }) }, rpc: async (name, args) => {
      financeRpcCalls.push({ name, args });
      return name === 'brand_finance_context' ? { data: { id, slug: 'brand', role: 'cashier' }, error: null } : { data: { id: orderId, number: 19 }, error: saleError };
    } }) },
    '@/lib/data/cafes': { requireOwnerCafeContext: async () => ({ slug: 'brand' }) }, '@/lib/menu/standalone-menu': {},
    './finance-shifts': { getFinanceMaintenanceActor: async () => null }, 'next/server': { after: callback => deferred.push(callback) },
    './finance-shift-alerts': { dispatchShiftAlerts: async () => {} }, '@/lib/finance/pos-customer-server': server,
    './finance-pos-customer-messages': { dispatchFinancePosCustomerMessages: async cafeId => { assert.equal(cafeId, id); customerDispatches++; } },
  });
  await finance.executeBrandFinanceCommand({ operation: 'sale', requestId: id, payload: { customerPhone: '0500000001', pagerFeedbackHash: 'forged' } }, 'brand');
  assert.equal(deferred.length, 1); assert.equal(customerDispatches, 0); assert.equal(financeRpcCalls.at(-1).args.p_payload.customerPhone, phone);
  assert.equal(financeRpcCalls.at(-1).args.p_payload.pagerFeedbackHash, payload.pagerFeedbackHash); await deferred.pop()(); assert.equal(customerDispatches, 1);
  saleError = { code: '23505', message: 'rejected transaction' };
  await assert.rejects(() => finance.executeBrandFinanceCommand({ operation: 'sale', requestId: id, payload: { customerPhone: phone } }, 'brand')); assert.equal(deferred.length, 0);
  saleError = null;
  await finance.executeBrandFinanceCommand({ operation: 'sale', requestId: id, payload: {} }, 'brand'); assert.equal(deferred.length, 0, 'Cash sale without phone has no customer side effects');

  let shiftCalls = 0, customerCalls = 0; process.env.CRON_SECRET = 'x'.repeat(32);
  const route = load('app/api/finance/jobs/route.ts', { '@/lib/data/finance-shift-alerts': { dispatchShiftAlerts: async () => { shiftCalls++; throw Error('down'); } }, '@/lib/data/finance-pos-customer-messages': { dispatchFinancePosCustomerMessages: async () => { customerCalls++; return { queued: 0 }; } } });
  assert.equal((await route.GET(new Request('https://local/api/finance/jobs'))).status, 401); assert.equal(customerCalls, 0);
  const cron = await route.GET(new Request('https://local/api/finance/jobs', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })); assert.equal(cron.status, 503); assert.equal(customerCalls, 1); assert.equal(shiftCalls, 1); assert.deepEqual((await cron.json()).posCustomer, { queued: 0 });
  console.log('PASS POS customer services: phone normalization, scoped RPCs, no public card capability, shared pager postcommit, HMAC retry, private validation, durable message outcomes and isolated cron failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
