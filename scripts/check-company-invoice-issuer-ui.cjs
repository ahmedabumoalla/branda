const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript');
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const file = 'components/finance/use-company-invoice-issuer.ts';
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fresh = { name: 'Central business', vatNumber: '300000000000003', address: 'Central address 123' };
const old = { name: 'Draft business', vatNumber: '', address: 'Draft address 123' };
const fallback = { name: 'Legacy business', vatNumber: '311111111111113', address: 'Legacy address 456' };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let cursor = 0, effects = [], slug = 'brand-a', name = 'Brand A'; const slots = [], requests = [], out = {};
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  const actions = { companyInvoiceIssuerAction(value) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ slug: value, resolve, reject }); return promise; } };
  new Function('require', 'exports', code)(key => key === 'react' ? react : actions, out);
  return { requests, fields: out.invoiceIssuerFields,
    render(nextSlug = slug, nextName = name) { slug = nextSlug; name = nextName; cursor = 0; effects = []; const result = out.useCompanyInvoiceIssuer(slug, name); effects.forEach(effect => effect()); return result; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
async function resolve(f, index, issuer, canonical) { f.requests[index].resolve({ ok: true, data: { ...issuer, fromAccountSettings: canonical } }); await flush(); }
(async () => {
  for (const lookupFirst of [true, false]) {
    const f = fixture(); let state = f.render();
    eq(state.issuer, { name: 'Brand A', vatNumber: '', address: '' }, 'Initial identity has no invented VAT');
    if (lookupFirst) await resolve(f, 0, fresh, true);
    state.restoreIssuer(old); state = f.render();
    if (!lookupFirst) { eq(state.issuer, old, 'Draft remains available while lookup is pending'); await resolve(f, 0, fresh, true); }
    state = f.render(); eq(state.issuer, fresh, 'Canonical Account Settings wins in either completion order');
    eq(/^3[0-9]{13}3$/.test(state.issuer.vatNumber) && state.issuer.address.length >= 8, true, 'Stale blank VAT cannot leave issuance readiness blocked');
    state.restoreIssuer({ ...old, vatNumber: fallback.vatNumber }); eq(f.render().issuer, fresh, 'Opening another stale draft cannot replace central identity');
    state.restoreIssuer(undefined); eq(f.render().issuer, fresh, 'A draft without identity retains central settings');
    eq(Object.keys(f.render().issuer).sort(), ['address', 'name', 'vatNumber'], 'Strict saved document excludes response metadata');
  }
  for (const lookupFirst of [true, false]) {
    const f = fixture(); let state = f.render();
    if (lookupFirst) await resolve(f, 0, fallback, false);
    state.restoreIssuer(old);
    if (!lookupFirst) await resolve(f, 0, fallback, false);
    state = f.render(); eq(state.issuer, old, 'Existing legacy draft identity is preserved without central settings');
    state.restoreIssuer(undefined); eq(f.render().issuer, fallback, 'Draft without issuer uses legacy lookup');
  }
  const empty = fixture(); empty.render().restoreIssuer(fallback); await resolve(empty, 0, { ...fresh, vatNumber: '' }, true);
  eq(empty.render().issuer.vatNumber, '', 'Removing central VAT cannot revive a stale draft VAT');
  const failure = fixture(); failure.render().restoreIssuer(old); failure.requests[0].reject(new Error('offline')); await flush(); eq(failure.render().issuer, old, 'Failed lookup is handled and preserves draft identity');
  const denied = fixture(); denied.render(); denied.requests[0].resolve({ ok: false, message: 'denied' }); await flush(); eq(denied.render().issuer.vatNumber, '', 'Denied lookup cannot fabricate identity');
  const race = fixture(); const first = race.render();
  const second = race.render('brand-b', 'Brand B'); eq(second.issuer, { name: 'Brand B', vatNumber: '', address: '' }, 'Tenant switch immediately clears previous identity');
  second.restoreIssuer(fallback); first.restoreIssuer(old); eq(race.render().issuer, fallback, 'Late draft restoration from another tenant cannot replace current draft');
  await resolve(race, 0, fresh, true); eq(race.render().issuer, fallback, 'Late Account Settings response from previous tenant is ignored');
  await resolve(race, 1, { ...fresh, name: 'Business B' }, true); eq(race.render().issuer.name, 'Business B', 'Current tenant canonical response is used');
  eq(race.render('brand-c', 'Brand C').issuer.vatNumber, '', 'Another tenant never inherits canonical VAT');
  race.unmount(); await resolve(race, 2, fresh, true); eq(race.render().issuer.vatNumber, '', 'Response after unmount is ignored');
  eq(fixture().fields({ ...fresh, fromAccountSettings: true, secret: 'excluded' }), fresh, 'Field whitelist strips all extra response keys');
  const form = fs.readFileSync('components/finance/finance-sale-form.tsx', 'utf8');
  assert(form.includes('useCompanyInvoiceIssuer(data.cafe.slug, data.cafe.name)') && form.includes('restoreIssuer(draft.payload.issuer)')); checks++;
  const inputs = [file, 'components/finance/finance-sale-form.tsx', 'components/finance/recurring-invoice-editor.tsx', 'scripts/check-company-invoice-issuer-ui.cjs', 'package-lock.json'];
  fs.mkdirSync('output/mind-central-tax-20261114', { recursive: true });
  fs.writeFileSync('output/mind-central-tax-20261114/issuer-ui-verification.json', JSON.stringify({ at: new Date().toISOString(), runtime: process.version, passed: true, checks, scope: 'Issuer hook async order/tenant isolation/strict field projection; mocked actions only', inputs: inputs.map(path => ({ path, sha256: crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex') })) }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }));
})().catch(error => { console.error(error); process.exitCode = 1; });
