const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}

async function main() {
  const { FinanceReceipt } = load('components/finance/finance-ui.tsx');
  const snapshot = { cafe: { name: 'Brand', slug: 'brand' }, parties: [{ id: 'customer', name: 'PRIVATE CUSTOMER', phone: 'PRIVATE PHONE', tax_number: 'PRIVATE TAX' }], accounts: [{ id: 'cash', kind: 'cash', name: 'Cash' }], documents: [] };
  const document = { id: 'sale', number: 7, kind: 'sale', party_id: 'customer', account_id: 'cash', subtotal: 100, discount: 0, tax: 15, total: 100, paid: 100, outstanding: 0, refunded: false, reference_id: null, note: 'NO SUGAR', vat_rate: 15, tax_inclusive: true, created_at: '2026-10-24T09:30:00Z', lines: [{ id: 'line', name: '<script>alert(1)</script>', quantity: 20, unit_price: 5, net: 85, tax: 15 }] };
  snapshot.documents.push(document);
  const brand = { name: 'BRAND LOGO', logoUrl: '/brand/logo.png', color: '#3a2117' };
  const html = renderToStaticMarkup(React.createElement(FinanceReceipt, { document, snapshot, brand }));
  assert(html.includes('data-finance-receipt'));
  assert(html.includes('/brand/logo.png'));
  assert(html.includes('PRIVATE CUSTOMER'));
  assert(!html.includes('رقم العميل:'));
  const phoneDocument = { ...document, customer_phone: '+966500000001' };
  const phoneReceipt = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: phoneDocument, snapshot, brand }));
  assert(phoneReceipt.includes('+966500000001'));
  assert(phoneReceipt.includes('رقم العميل:'));
  const phonePrep = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: phoneDocument, snapshot, brand, copy: 'preparation' }));
  assert(!phonePrep.includes('+966500000001'));
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
  const prep = renderToStaticMarkup(React.createElement(FinanceReceipt, { document, snapshot, brand, copy: 'preparation' }));
  assert(prep.includes('NO SUGAR'));
  assert(!prep.includes('PRIVATE'));
  assert(!prep.includes('سعر الوحدة'));
  assert(!prep.includes('الإجمالي'));
  assert(!prep.includes('ضريبة'));
  const refund = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: { ...document, id: 'refund', kind: 'refund', number: 8, reference_id: 'sale', total: 5, paid: 2, outstanding: 3 }, snapshot, brand, copy: 'preparation' }));
  assert(refund.includes('فاتورة مرتجع'));
  assert(refund.includes('#7'));
  assert(refund.includes('المبلغ المعاد للعميل'));
  assert(refund.includes('تخفيض الرصيد الآجل'));
  assert(!refund.includes('المتبقي'));
  const partial = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: { ...document, refunded_total: 5 }, snapshot, brand }));
  assert(partial.includes('مرتجع جزئي'));
  assert(partial.includes('صافي المدفوع بعد المرتجع'));

  const { createFinanceReceiptPreview } = load('lib/finance/receipt-preview.ts');
  const products = [0.33, 12.75, 25].map((price, index) => ({ id: `product-${index}`, itemId: null, name: `Product ${index}`, price }));
  const previewInput = { lines: products.map(product => ({ product, quantity: 3 })), settings: { vat_rate: 15, tax_inclusive: true, currency: 'SAR' }, discount: 7.23, paymentKind: 'cash', accountId: 'cash', partyId: 'customer', customerPhone: '+966500000001', note: 'NO SUGAR', createdAt: '2026-10-26T10:00:00Z' };
  const originalInput = JSON.stringify(previewInput);
  for (const inclusive of [true, false]) {
    const draft = createFinanceReceiptPreview({ ...previewInput, settings: { ...previewInput.settings, tax_inclusive: inclusive } });
    assert.equal(Math.round(draft.lines.reduce((sum, line) => sum + line.net + line.tax, 0) * 100), Math.round(draft.total * 100), 'Preview line allocation reconciles to total');
    assert.equal(Math.round(draft.lines.reduce((sum, line) => sum + line.tax, 0) * 100), Math.round(draft.tax * 100));
    assert.equal(draft.subtotal, 114.24);
    assert.equal(draft.total, inclusive ? 107.01 : 123.06);
    assert.equal(draft.tax, inclusive ? 13.96 : 16.05);
    const previewHtml = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: draft, snapshot, brand, preview: true }));
    assert(previewHtml.includes('معاينة فقط لم تُسجل الفاتورة'));
    assert(previewHtml.includes('معاينة فقط وليست إثبات دفع'));
    assert(previewHtml.includes('المبلغ المتوقع تحصيله'));
    assert(!previewHtml.includes('#0'));
    assert(previewHtml.includes('+966500000001'));
    const previewPrep = renderToStaticMarkup(React.createElement(FinanceReceipt, { document: draft, snapshot, brand, preview: true, copy: 'preparation' }));
    assert(previewPrep.includes('معاينة فقط'));
    assert(!previewPrep.includes('+966500000001'));
    assert(!previewPrep.includes('الإجمالي'));
  }
  assert.equal(JSON.stringify(previewInput), originalInput, 'Preview must not mutate checkout input');
  const inclusive48 = createFinanceReceiptPreview({ ...previewInput, lines: [{ product: { ...products[0], price: 48 }, quantity: 1 }], discount: 0 });
  assert.equal(inclusive48.total, 48, 'Inclusive VAT never adds to the entered price');
  assert.equal(inclusive48.tax, 6.26);
  assert.equal(Math.round((inclusive48.total - inclusive48.tax) * 100), 4174);
  const creditPreview = createFinanceReceiptPreview({ ...previewInput, paymentKind: 'credit' });
  assert.equal(creditPreview.paid, 0);
  assert.equal(creditPreview.outstanding, creditPreview.total);
  assert.equal(creditPreview.account_id, null);
  assert.throws(() => createFinanceReceiptPreview({ ...previewInput, lines: [] }));
  assert.throws(() => createFinanceReceiptPreview({ ...previewInput, discount: 999 }));
  const tinyPreview = createFinanceReceiptPreview({ ...previewInput, lines: products.map(product => ({ product: { ...product, price: .01 }, quantity: 1 })), discount: 0 });
  assert.equal(Math.round(tinyPreview.lines.reduce((sum, line) => sum + line.net + line.tax, 0) * 100), 3);

  let access = false, admins = 0, signed = 0, logoPath = 'tenant/logo.png', queryError = false;
  const getBrand = load('lib/data/finance-receipt-brand.ts', {
    '@/lib/data/brand-finance': { getBrandFinanceContext: async slug => { assert.equal(slug, 'brand'); if (!access) throw Error('Denied'); return { cafe: { id: 'tenant', name: 'Brand' } }; } },
    '@/lib/supabase/admin': { createAdminClient: () => { admins++; return {
      from: table => ({ select: columns => { assert(!columns.includes('*')); return { eq: (key, value) => { assert.equal(key, 'cafe_id'); assert.equal(value, 'tenant'); return { maybeSingle: async () => ({ error: queryError ? {} : null, data: table === 'cafe_settings' ? { logo_storage_path: logoPath, logo_url: null } : { palette: { primary: '#123456' } } }) }; } }; } }),
      storage: { from: bucket => { assert.equal(bucket, 'cafe-logos'); return { createSignedUrl: async (source, ttl) => { signed++; assert.equal(source, 'tenant/logo.png'); assert.equal(ttl, 600); return { data: { signedUrl: 'https://storage.example/logo?token=safe' } }; } }; } },
    }; } },
  }).getFinanceReceiptBrand;
  await assert.rejects(getBrand('brand')); assert.equal(admins, 0, 'Tenant authorization must precede service-role access');
  access = true;
  assert.deepEqual(await getBrand('brand'), { name: 'Brand', logoUrl: 'https://storage.example/logo?token=safe', color: '#123456' });
  for (const invalid of ['other/logo.png', 'tenant/../secret', 'tenant/%2e%2e/secret']) { logoPath = invalid; await assert.rejects(getBrand('brand')); }
  assert.equal(signed, 1);
  logoPath = null; assert.equal((await getBrand('brand')).logoUrl, null);
  queryError = true; await assert.rejects(getBrand('brand'));
  let allowed = false;
  const { GET } = load('app/api/finance/[slug]/receipt-brand/route.ts', { '@/lib/data/finance-receipt-brand': { getFinanceReceiptBrand: async slug => { assert.equal(slug, 'brand'); if (!allowed) throw Error('Denied'); return brand; } } });
  const request = new Request('https://example.test/api/finance/brand/receipt-brand?path=other/secret');
  const params = { params: Promise.resolve({ slug: 'brand' }) };
  assert.equal((await GET(request, params)).status, 403);
  allowed = true; const response = await GET(request, params);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Vary'), 'Cookie');
  assert.deepEqual(await response.json(), brand);

  const { thermalReceiptCss, printThermalReceipt, claimAutomaticReceiptPrint } = load('components/finance/finance-receipt-print.ts');
  assert(thermalReceiptCss('auto').includes('@page{size:auto;margin:2mm}'));
  assert(thermalReceiptCss('58').includes('max-width:54mm'));
  assert(thermalReceiptCss('80').includes('max-width:76mm'));
  assert(!thermalReceiptCss('auto').includes('18px'));
  assert(thermalReceiptCss('80').includes('page-break-before:always'));
  let printed = 0, removed = 0, frame, releaseFonts, failFonts = false;
  const fonts = new Promise(resolve => { releaseFonts = resolve; });
  const image = { complete: false, naturalWidth: 0, remove() { this.removed = true; } };
  const originalDocument = global.document, originalWindow = global.window, originalSetTimeout = global.setTimeout;
  const originalAnimationFrame = global.requestAnimationFrame, originalCancelAnimationFrame = global.cancelAnimationFrame;
  try {
    global.setTimeout = (callback, delay) => { const timer = originalSetTimeout(callback, delay); timer.unref(); return timer; };
    const session = new Map();
    global.window = { location: { origin: 'https://example.test' }, sessionStorage: { getItem: key => session.get(key), setItem: (key, value) => session.set(key, value) } };
    global.document = {
      createElement: tag => { assert.equal(tag, 'iframe'); frame = { style: {}, setAttribute() {}, remove() { removed++; }, contentWindow: { focus() {}, print() { printed++; } }, contentDocument: { body: { style: {} }, fonts: { ready: fonts, load: () => failFonts ? Promise.reject(Error('offline font')) : fonts }, images: [image] } }; return frame; },
      body: { appendChild: value => { assert.equal(value, frame); queueMicrotask(() => frame.onload()); } },
    };
    const element = { matches: () => true, outerHTML: '<article data-finance-receipt>SAFE RECEIPT</article>' };
    const pending = printThermalReceipt(element, '58');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(printed, 0, 'Printing waits for logo and fonts');
    releaseFonts([]); await new Promise(resolve => setImmediate(resolve)); assert.equal(printed, 0);
    image.naturalWidth = 150; image.onload(); await pending; assert.equal(printed, 1);
    assert(frame.srcdoc.includes('SAFE RECEIPT')); assert(frame.srcdoc.includes('max-width:54mm'));
    frame.contentWindow.onafterprint(); assert.equal(removed, 1, 'Print or cancel cleans up without mutating financial state');
    image.complete = true; image.naturalWidth = 0;
    const fallback = await printThermalReceipt(element);
    assert.equal(fallback.usedAssetFallback, true, 'Offline broken logo is reported without blocking printing');
    assert.equal(image.removed, true); assert.equal(printed, 2);
    const paired = { matches: () => false, querySelectorAll: () => [{ outerHTML: phoneReceipt }, { outerHTML: phonePrep }] };
    await printThermalReceipt(paired, '80', { allCopies: true });
    assert.equal(printed, 3, 'Both copies use one print call');
    assert.equal((frame.srcdoc.match(/data-finance-receipt="/g) || []).length, 2);
    assert.equal((frame.srcdoc.match(/\+966500000001/g) || []).length, 1, 'Phone only belongs to customer copy in paired print');
    failFonts = true; image.naturalWidth = 150;
    const fontFallback = await printThermalReceipt(element);
    assert.equal(fontFallback.usedAssetFallback, true);
    assert.equal(frame.contentDocument.body.style.fontFamily, 'Arial, sans-serif', 'Offline fonts fall back to an installed font');
    assert.equal(printed, 4); failFonts = false;
    assert.equal(claimAutomaticReceiptPrint('brand', 'one'), true);
    assert.equal(claimAutomaticReceiptPrint('brand', 'one'), false, 'Rerender/retry never automatically prints twice');
    const remounted = load('components/finance/finance-receipt-print.ts');
    assert.equal(remounted.claimAutomaticReceiptPrint('brand', 'one'), false, 'Session guard survives module remount');
    assert.equal(remounted.claimAutomaticReceiptPrint('another-brand', 'one'), true, 'Guard isolates brands');
    assert.equal(claimAutomaticReceiptPrint('brand', 'two'), true, 'A different sale prints normally');
    global.window.sessionStorage = { getItem() { throw Error('restricted'); }, setItem() { throw Error('restricted'); } };
    assert.equal(claimAutomaticReceiptPrint('brand', 'restricted'), true);
    assert.equal(claimAutomaticReceiptPrint('brand', 'restricted'), false);
    await assert.rejects(printThermalReceipt(null));

    // Exercise the dialog effect itself under Strict Mode's repeated effect invocation.
    const effects = [], calls = [];
    let animationId = 0;
    const pendingAnimations = new Set();
    global.requestAnimationFrame = callback => { const id = ++animationId; pendingAnimations.add(id); queueMicrotask(() => { if (pendingAnimations.delete(id)) callback(); }); return id; };
    global.cancelAnimationFrame = id => pendingAnimations.delete(id);
    let refIndex = 0;
    const mockedReact = { ...React, useState: initial => [initial, () => {}], useCallback: callback => callback, useEffect: callback => effects.push(callback), useRef: initial => ({ current: refIndex++ % 3 === 0 ? initial : refIndex % 3 === 0 ? paired : element }) };
    const { FinanceReceiptDialog } = load('components/finance/finance-receipt-dialog.tsx', {
      react: mockedReact,
      './finance-ui': { FinanceReceipt },
      './finance-receipt-print': { claimAutomaticReceiptPrint, printThermalReceipt: async (...args) => { calls.push(args); return { usedAssetFallback: false }; } },
      '@/components/dashboard/ui/modal': { Modal: () => null },
    });
    function runDialog(props) { effects.length = 0; refIndex = 0; FinanceReceiptDialog({ document: { ...document, id: 'dialog-one' }, snapshot, onClose() {}, receiptBrand: brand, ...props }); for (const effect of effects) { const cleanup = effect(); if (typeof cleanup === 'function') cleanup(); effect(); } }
    runDialog({ autoPrint: true }); await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], paired); assert.equal(calls[0][2].allCopies, true);
    runDialog({ autoPrint: true }); await Promise.resolve(); assert.equal(calls.length, 1, 'Dialog remount keeps one automatic attempt');
    runDialog({ document: { ...document, id: 'preview' }, autoPrint: true, preview: true });
    runDialog({ document: { ...document, id: 'history' }, autoPrint: false });
    runDialog({ document: { ...document, id: 'refund-effect', kind: 'refund' }, autoPrint: true });
    assert.equal(calls.length, 1, 'Preview, history and refunds do not start automatic paired sale printing');
    runDialog({ document: { ...document, id: 'offline-sale' }, receiptBrand: null, autoPrint: true });
    await Promise.resolve(); assert.equal(calls.length, 2, 'Offline fallback identity permits automatic printing without fetching');
    const deviceCalls = [];
    runDialog({ document: { ...document, id: 'bridge-sale' }, autoPrint: true, onPrint: async (...args) => { deviceCalls.push(args); return { usedAssetFallback: false, submittedToDevice: true }; } });
    await Promise.resolve(); assert.equal(deviceCalls.length, 1); assert.equal(deviceCalls[0][2].allCopies, true); assert.equal(calls.length, 2, 'Configured device transport replaces browser printing');
    // Background checkout renders receipt DOM without opening or trapping focus in a modal.
    let states = [], stateIndex = 0, closed = 0;
    const ModalMock = function Modal() {};
    const backgroundReact = { ...mockedReact, useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } };
    const BackgroundDialog = load('components/finance/finance-receipt-dialog.tsx', { react: backgroundReact, './finance-ui': { FinanceReceipt }, './finance-receipt-print': { claimAutomaticReceiptPrint, printThermalReceipt: async () => ({ usedAssetFallback: false }) }, '@/components/dashboard/ui/modal': { Modal: ModalMock } }).FinanceReceiptDialog;
    function background(props) { effects.length = 0; refIndex = 0; stateIndex = 0; return BackgroundDialog({ document: { ...document, id: 'background-success' }, snapshot, receiptBrand: brand, autoPrint: true, backgroundAutoPrint: true, onClose: () => closed++, ...props }); }
    let finish;
    const transport = () => new Promise(resolve => { finish = resolve; });
    let backgroundTree = background({ onPrint: transport });
    assert.equal(backgroundTree.type, 'div'); assert.equal(backgroundTree.props.hidden, true);
    for (const effect of effects) effect(); await Promise.resolve();
    assert.equal(closed, 0, 'Wait for transport acceptance before consuming the queue');
    finish({ usedAssetFallback: false, submittedToDevice: true }); await Promise.resolve(); await Promise.resolve();
    assert.equal(closed, 1, 'Accepted job closes without an invoice modal');
    states = [];
    const failing = { document: { ...document, id: 'background-error' }, onPrint: async () => { throw Error('Printer disconnected'); } };
    background(failing); for (const effect of effects) effect(); await Promise.resolve(); await Promise.resolve();
    backgroundTree = background(failing);
    assert.equal(backgroundTree.type, ModalMock, 'A failed or uncertain transport exposes manual recovery');
    assert.equal(closed, 1, 'Failed job is retained');
    assert.match(JSON.stringify(backgroundTree), /Printer disconnected/);
    const recoverable = { ...failing, onPrint: async () => ({ usedAssetFallback: false, submittedToDevice: true }) };
    backgroundTree = background(recoverable);
    backgroundTree.props.footer.props.children[0].props.onClick(); await Promise.resolve(); await Promise.resolve();
    assert.equal(background(recoverable).type, ModalMock, 'Manual retry keeps the recovery window available until explicitly closed');
    states = [];
    assert.equal(background({ autoPrint: false }).type, ModalMock, 'History and disabled automatic printing remain explicit');
    assert.equal(background({ preview: true }).type, ModalMock, 'Explicit preview is still visible');
  } finally { global.document = originalDocument; global.window = originalWindow; global.setTimeout = originalSetTimeout; global.requestAnimationFrame = originalAnimationFrame; global.cancelAnimationFrame = originalCancelAnimationFrame; }
  console.log('PASS thermal receipts: branded escaped receipt, preparation privacy, refunds, tenant authorization, preview/VAT, paired one-job printing, page breaks, once-per-sale auto effects, offline asset fallback, history/preview guards and print cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
