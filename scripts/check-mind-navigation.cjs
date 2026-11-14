'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript');
const inputs = new Set();
function load(file) {
  inputs.add(file); const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
    return require(name);
  }, exports); return exports;
}
let assertions = 0;
function check(condition, label) { assert.ok(condition, label); assertions++; }
const { mindErpNavigationVisible, mindTopNavigationVisible, mindCafeSettingsLink } = load('lib/platform/mind-navigation.ts');
const { integratedSystemGroupsForBrand, integratedSystemGroups, systemItemHref } = load('components/dashboard/integrated-system-navigation.ts');
const slug = 'mind-hospital';
const groups = integratedSystemGroupsForBrand(slug);
const hiddenGroups = ['store', 'manufacturing', 'tasks', 'bookings', 'contracting', 'installments', 'targets', 'rentals', 'work-orders', 'workflows', 'credits', 'loyalty', 'memberships', 'customer-attendance', 'insurance', 'time', 'organization', 'attendance', 'payroll', 'templates', 'branches'];
for (const id of hiddenGroups) check(!groups.some(group => group.id === id), `MIND hides requested ${id} group`);
for (const id of ['sales', 'pos', 'customers', 'inventory', 'purchases', 'finance', 'accounting', 'reports', 'settings']) check(groups.some(group => group.id === id), `MIND retains ${id}`);
for (const key of ['store', 'manufacturing', 'tasks', 'bookings', 'contracting', 'installments', 'commissions', 'rentals', 'work_orders', 'workflows', 'credits', 'loyalty', 'memberships', 'customer_attendance', 'insurance', 'time', 'organization', 'attendance', 'payroll', 'templates', 'branches']) check(!mindErpNavigationVisible(slug, key), `Staff presentation hides ${key}`);
check(mindErpNavigationVisible(slug, 'customers') && mindErpNavigationVisible(slug, 'inventory'), 'Staff operational access remains visible');
for (const key of ['settings', 'loyalty', 'branches']) check(!mindTopNavigationVisible(slug, key), `Top sidebar hides moved/removed ${key}`);
check(mindTopNavigationVisible(slug, 'menu') && mindTopNavigationVisible(slug, 'finance'), 'Menu editing and finance entry retained');
const settings = groups.find(group => group.id === 'settings');
check(settings.items.some(item => item.href === '/dashboard/settings' && item.label === 'إعدادات الكوفي'), 'Existing coffee settings moved under integrated settings');
const context = { cafeSlug: slug, enabledFeatures: ['settings'], isSalon: false, isGifts: false };
check(systemItemHref(mindCafeSettingsLink, context) === '/dashboard/settings', 'Moved settings retain original existing destination');
check(systemItemHref(mindCafeSettingsLink, { ...context, enabledFeatures: [] }) === null, 'Moved settings retain feature entitlement gate');
check(integratedSystemGroupsForBrand('brand-8ad185ee82e3') === integratedSystemGroups, 'Dabab original account unchanged');
check(mindErpNavigationVisible('brand-8ad185ee82e3', 'manufacturing') && mindTopNavigationVisible('brand-8ad185ee82e3', 'settings'), 'Similarly related source account retains navigation');
check(integratedSystemGroupsForBrand('khayal-aldeem').some(group => group.id === 'manufacturing'), 'Aldeem lab/manufacturing unaffected');
check(integratedSystemGroupsForBrand('brand-1c2b6f7e028f').some(group => group.id === 'store'), 'Fawasel store unaffected');
const sources = Object.fromEntries(['components/dashboard/DashboardSidebar.tsx', 'components/erp/staff-shell.tsx', 'components/erp/settings/workspace.tsx', 'app/finance/[slug]/system/[[...parts]]/page.tsx'].map(file => { inputs.add(file); return [file, fs.readFileSync(file, 'utf8')]; }));
check(sources['components/dashboard/DashboardSidebar.tsx'].includes('mindTopNavigationVisible(settings.cafeSlug, "branches")'), 'Standalone branch entry scoped in actual sidebar');
check(sources['components/erp/settings/workspace.tsx'].includes('isHospitalStore(initial.slug)&&<ErpLink href={mindCafeSettingsLink.href}'), 'Settings workspace exposes original settings entry only for MIND');
check(sources['components/erp/staff-shell.tsx'].includes('domains.filter(d=>mindErpNavigationVisible(slug,d.key))'), 'Staff navigation uses presentation filter');
const routing = sources['app/finance/[slug]/system/[[...parts]]/page.tsx'];
check(routing.includes('const domain=shell.domains.find') && routing.includes('if(module&&!domain)notFound()'), 'Existing route authorization remains based on original authorized domains');
check(routing.includes('visibleDomains.map') && routing.includes('!visibleDomains.length'), 'Staff landing hides same sections and handles empty presentation');
check(fs.existsSync('app/dashboard/settings/page.tsx'), 'Moved destination actually exists');
inputs.add('package.json'); inputs.add('package-lock.json');
const evidence = { at: new Date().toISOString(), command: 'node scripts/check-mind-navigation.cjs', runtime: process.version, assertions, passed: true, target: { id: 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef', slug, name: 'مايند' }, inputs: Object.fromEntries([...inputs].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), limits: ['Presentation-only changes', 'No authorization mutation, database writes, browser or production deployment'] };
fs.mkdirSync('output/mind-navigation', { recursive: true }); fs.writeFileSync('output/mind-navigation/verification.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ passed: true, assertions, at: evidence.at }));
