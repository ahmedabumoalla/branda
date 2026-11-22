const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { z } = require('zod');

const inputs = new Set();
const cache = new Map();
const reads = [];
const arrays = new Set(['records', 'documents', 'items', 'units', 'accounts', 'parties', 'customers', 'branches', 'types', 'catalog', 'saved', 'rules', 'periods', 'templates', 'services', 'sources', 'employees', 'assetOptions', 'settingsSections']);
let fixture;
fixture = new Proxy({ slug: 'mind-hospital', name: 'Navigation audit', id: '00000000-0000-4000-8000-000000000001', role: 'owner', branchScope: { branchId: null, revision: 0 }, canConfigure: true, canWrite: true, canSettings: true, canCreate: true, canAll: true, revision: 1 }, {
  get(target, key) {
    if (key === 'then') return undefined;
    if (key in target) return target[key];
    if (key === 'client') return { rpc: async () => ({ data: fixture, error: null }) };
    if (arrays.has(key)) return [];
    if (['snapshot', 'cafe', 'finance', 'settings', 'lookups'].includes(key)) return fixture;
    if (key === 'permissions') return {};
    return [];
  },
});
const componentMocks = new Proxy({ __esModule: true, default: () => null }, { get: (target, key) => key in target ? target[key] : () => null });
const dataMocks = new Proxy({}, { get: (_, key) => String(key).endsWith('Schema') ? z.any() : async () => {
  reads.push(String(key));
  return /OptionalDocumentTemplates/.test(String(key)) ? [] : fixture;
} });

function load(file) {
  file = file.replaceAll('\\', '/');
  if (cache.has(file)) return cache.get(file);
  inputs.add(file);
  const exports = {};
  cache.set(file, exports);
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name === 'next/navigation') return { notFound() { throw Error('NOT_FOUND'); }, redirect(to) { throw Error('REDIRECT ' + to); } };
    if (name === '@/app/actions/finance-invoice-settings') return { getFinanceInvoiceSettings: async () => { reads.push('getFinanceInvoiceSettings'); return { ok: true, data: fixture }; } };
    if (name.startsWith('@/lib/data/')) return dataMocks;
    if (name === '@/components/finance/finance-navigation') return load('components/finance/finance-navigation.ts');
    if (name.startsWith('@/components/') || name === 'next/link') return componentMocks;
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      const target = [base, base + '.ts', base + '.tsx', base + '/index.ts'].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw Error('MISSING_IMPORT ' + base);
      return load(target);
    }
    return require(name);
  }, exports);
  return exports;
}

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name).replaceAll('\\', '/')]);
const pages = [...walk('app/dashboard'), ...walk('app/finance')].filter(file => file.endsWith('/page.tsx'));
function resolve(url) {
  const parts = url.split('?')[0].split('/').filter(Boolean);
  return pages.map(file => {
    const route = file.slice(4, -9).split('/').filter(Boolean);
    const params = {};
    let index = 0;
    let score = 0;
    for (const part of route) {
      if (part.startsWith('(')) continue;
      if (part.startsWith('[[...')) { params[part.slice(5, -2)] = parts.slice(index); index = parts.length; break; }
      if (part.startsWith('[...')) { if (index >= parts.length) return null; params[part.slice(4, -1)] = parts.slice(index); index = parts.length; break; }
      if (part.startsWith('[')) { if (index >= parts.length) return null; params[part.slice(1, -1)] = parts[index++]; score++; }
      else { if (parts[index++] !== part) return null; score += 10; }
    }
    return index === parts.length ? { file, params, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score)[0];
}

async function main() {
  let assertions = 0;
  const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
  const nav = load('components/dashboard/integrated-system-navigation.ts');
  const finance = load('components/finance/finance-navigation.ts');
  const { erpHref } = load('lib/erp/navigation.ts');
  const groups = nav.integratedSystemGroupsForBrand('mind-hospital');
  for (const href of ['/dashboard/branches', '/dashboard/settings', '/dashboard/subscription']) {
    check(nav.isIntegratedDashboardRoute(href, true), true, 'Moved route retains finance navigation');
    check(nav.isIntegratedDashboardRoute(href + '/edit', true), true, 'Nested moved route retains navigation');
    check(nav.isIntegratedDashboardRoute(href, false), false, 'Nonfinancial brands retain original navigation');
    check(nav.isIntegratedDashboardRoute(href + '-other', true), false, 'Route boundary remains exact');
    check(groups.flatMap(group => group.items).filter(item => item.href === href).length, href === '/dashboard/branches' ? 0 : 1, 'Removed branches stay hidden and retained settings links appear once');
  }
  const hidden = ['store', 'manufacturing', 'tasks', 'bookings', 'contracting', 'installments', 'targets', 'rentals', 'work-orders', 'workflows', 'credits', 'memberships', 'time', 'requests', 'organization', 'attendance', 'payroll', 'templates', 'reports', 'branches'];
  for (const id of hidden) check(groups.some(group => group.id === id), false, 'Hidden group remains hidden: ' + id);
  check(groups.find(group => group.id === 'sales').items.map(item => item.id), ['sales', 'sales-returns', 'sales-payments'], 'MIND simplified sales');
  check(groups.find(group => group.id === 'pos').items.filter(item => item.section === 'pos-settings').length, 1, 'POS settings appears once');
  check(nav.integratedSystemGroupsForBrand('another-brand').length, nav.integratedSystemGroups.length, 'Other brands retain all groups');
  // User decision 2026-11-22: ال كافيه is shown the options open for MIND, without the two hospital entries
  const second = nav.integratedSystemGroupsForBrand('l-cafe-59cfdc54');
  check(second.map(group => group.id), groups.map(group => group.id), 'Second brand shows the same sections as MIND');
  for (const group of groups.filter(group => !['pos', 'loyalty'].includes(group.id))) check(second.find(item => item.id === group.id).items.map(item => item.label), group.items.map(item => item.label), 'Second brand shows the same entries: ' + group.id);
  check(second.flatMap(group => group.items).some(item => item.section === 'pos-settings'), false, 'POS settings with the WhatsApp invoice switch stay with the hospital account');
  check(second.find(group => group.id === 'pos').items.map(item => item.label), nav.integratedSystemGroups.find(group => group.id === 'pos').items.map(item => item.label), 'Second brand keeps the standard POS entries');
  check(second.find(group => group.id === 'loyalty').items.some(item => item.href === '/dashboard/loyalty/customers'), true, 'Second brand keeps its loyalty registry link');
  check(second.find(group => group.id === 'sales').items.map(item => item.id), ['sales', 'sales-returns', 'sales-payments'], 'Second brand has the MIND sales entries');
  for (const item of second.flatMap(group => group.items)) { const url = nav.systemItemHref(item, { cafeSlug: 'l-cafe-59cfdc54', enabledFeatures: ['finance', 'menu', 'loyalty', 'settings'], isSalon: false, isGifts: false }); check(Boolean(url && resolve(url)), true, 'Second brand entry opens a real page: ' + item.label); }

  const cashier = groups.find(group => group.id === 'loyalty').items.find(item => item.href === '/dashboard/cashier');
  const featureCases = [
    { features: ['finance', 'loyalty'], expected: '/dashboard/cashier' },
    { features: ['finance', 'pager'], expected: '/dashboard/cashier' },
    { features: ['finance', 'loyalty', 'cashier'], expected: '/dashboard/cashier' },
    { features: ['finance'], expected: null },
    { features: ['finance', 'cashier'], expected: null },
    { features: [], expected: null },
  ];
  for (const entry of featureCases) check(nav.systemItemHref(cashier, { cafeSlug: 'mind-hospital', enabledFeatures: entry.features, isSalon: false, isGifts: false }), entry.expected, 'Cashier navigation matches original server entitlement');
  for (const view of ['create', 'quotes', 'quote-create', 'credit-notes', 'recurring', 'sales-settings']) check(nav.systemItemHref({ section: 'sales', view }, { cafeSlug: 'mind-hospital', enabledFeatures: ['finance'], isSalon: false, isGifts: false }), null, 'Hidden sale cannot be reintroduced: ' + view);

  const staffFile = 'app/finance/[slug]/system/[[...parts]]/page.tsx';
  const staffSource = fs.readFileSync(staffFile, 'utf8');
  inputs.add(staffFile);
  const dispatch = new Set([...staffSource.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map(match => match[1]));
  const rows = [];
  for (const group of groups) for (const item of group.items) {
    const url = nav.systemItemHref(item, { cafeSlug: 'mind-hospital', enabledFeatures: ['finance', 'menu', 'loyalty', 'settings'], isSalon: false, isGifts: false });
    const row = { group: group.id, label: item.label, url };
    rows.push(row);
    if (!url) { row.error = 'NO_DESTINATION'; continue; }
    const resolved = resolve(url);
    row.ownerPage = resolved?.file;
    if (!resolved) { row.error = 'MISSING_OWNER_PAGE'; continue; }
    inputs.add(resolved.file);
    if (item.section) {
      check(finance.financeSections.some(section => section.id === item.section), true, 'Known financial section');
      row.routeGuard = 'actual navigation model accepted; financial workspace rendering reviewed separately';
    } else if (url.startsWith('/dashboard/system/')) {
      const module = url.split('/')[3];
      row.staff = dispatch.has(module) ? 'dispatched' : ['roles', 'settings'].includes(module) ? 'owner-only authorization' : 'MISSING_DISPATCH';
      reads.length = 0;
      try {
        await load(resolved.file).default({ params: Promise.resolve(resolved.params), searchParams: Promise.resolve({}) });
        row.routeGuard = 'accepted with mocked authorized data readers';
        row.readers = [...new Set(reads)];
      } catch (error) { row.error = String(error.message); }
    } else row.routeGuard = 'existing legacy or POS page resolves; no live action invoked';
    if (row.staff === 'dispatched' || item.section) {
      row.staffUrl = erpHref(url, 'mind-hospital');
      check(row.staffUrl.startsWith('/finance/mind-hospital'), true, 'Staff route preserves tenant');
    }
  }
  for (const href of ['/dashboard/system/inventory/items?view=menu', '/dashboard/system/inventory/items?view=stock', '/dashboard/finance?section=sales&view=payments#payment']) {
    check(erpHref(href, 'mind-hospital'), href.replace('/dashboard/system', '/finance/mind-hospital/system').replace('/dashboard/finance', '/finance/mind-hospital'), 'Query and hash preserved');
  }
  check(erpHref('/dashboard/systematic', 'mind-hospital'), '/dashboard/systematic', 'Boundary is exact');
  check(erpHref('/dashboard/system', '../other'), '/dashboard/system', 'Invalid tenant cannot rewrite');
  check(erpHref('https://example.test/dashboard/system', 'mind-hospital'), 'https://example.test/dashboard/system', 'External URL preserved');

  for (const file of ['scripts/check-mind-navigation.cjs', 'components/dashboard/finance-sidebar-menu.tsx', 'components/dashboard/DashboardSidebar.tsx', 'components/erp/navigation.tsx', 'app/dashboard/cashier/page.tsx']) inputs.add(file);
  const errors = rows.filter(row => row.error || row.staff === 'MISSING_DISPATCH');
  const report = {
    at: new Date().toISOString(), runtime: process.version, passed: errors.length === 0,
    scope: 'All retained MIND integrated-sidebar destinations, actual owner ERP route guards with mocked data, finance section model, staff tenant rewrite and loyalty cashier entitlement',
    groups: groups.length, destinations: rows.length, assertions, rows, featureCases,
    fix: 'Use shared server-equivalent featureCodesAllow for integrated sidebar capabilities; loyalty/pager entitlement restores cashier link without granting a new entitlement',
    decisions: ['Keep valid report pages for hidden operating groups: hiding operating navigation did not revoke historical reporting', 'Retain owner-only settings and roles routes; staff ERP deliberately does not dispatch these'],
    stateTrace: ['Sidebar disclosure changes only disclosure/open-group state', 'In-workspace finance navigation uses history.pushState then closes mobile navigation; original workspace and drafts stay mounted', 'ERP Link and router push/replace/prefetch rewrite only owner ERP/finance prefixes into current tenant', 'Branch context full reload after revision/broadcast is intentional; unchanged'],
    limits: ['No live business writes, database migrations, messages, deployment or browser execution', 'Server page data readers are mocked; route acceptance does not prove live permissions or persistence', 'Actual button mutation logic outside navigation is covered by the parent review'],
    inputs: Object.fromEntries([...inputs].sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
  };
  fs.mkdirSync('output/mind-followup-20261115', { recursive: true });
  fs.writeFileSync('output/mind-followup-20261115/navigation-review.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, groups: report.groups, destinations: report.destinations, assertions, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
