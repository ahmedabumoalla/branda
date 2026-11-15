const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
const React = require('react');

const file = 'app/menu/[slug]/page.tsx';
const HospitalMenu = () => null;
const MenuAutoRefresh = () => null;
let menu, program, unavailable, calls;
const defaults = new Proxy({}, { get: () => () => null });
const mocks = {
  react: { ...React, cache: fn => fn },
  'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error('REDIRECT ' + url); } },
  '@/lib/data/standalone-menu': { getStandaloneMenu: async (...args) => { calls.push(['menu', ...args]); return menu; } },
  '@/lib/data/loyalty-cards': { getPublicLoyaltyProgramBySlug: async slug => { calls.push(['program', slug]); if (unavailable) throw Error('UNAVAILABLE'); return program; } },
  '@/lib/data/public-home-catalog': { isPublicHomeMenuSlug: async () => true },
  '@/lib/data/loyalty-landing': { getPublicLoyaltyLanding: async () => null },
  '@/lib/commerce/hospital-profile': { isHospitalStore: slug => slug === 'mind-hospital' },
  '@/components/menu/hospital-menu': { HospitalMenu },
  '@/components/menu/menu-auto-refresh': { MenuAutoRefresh },
};
const exported = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText)(name => name in mocks ? mocks[name] : name.startsWith('@/') ? defaults : require(name), exported);
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];

async function main() {
  let assertions = 0;
  const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
  const cases = [];
  for (const scenario of [
    { name: 'active feature and active program', feature: true, enabled: true, shown: true },
    { name: 'active feature but disabled program', feature: true, enabled: false, shown: false },
    { name: 'disabled feature even with active program', feature: false, enabled: true, shown: false },
    { name: 'missing program', feature: true, missing: true, shown: false },
    { name: 'program read failure', feature: true, failure: true, shown: false },
    { name: 'showcase stays inert', feature: true, enabled: true, shown: true, showcase: true },
  ]) {
    calls = [];
    menu = { slug: 'mind-hospital', loyaltyEnabled: scenario.feature };
    program = scenario.missing ? null : { enabled: scenario.enabled, purchasesRequired: 6, rewardName: 'Coffee', privateField: 'not-passed' };
    unavailable = scenario.failure;
    const tree = await exported.default({ params: Promise.resolve({ slug: menu.slug }), searchParams: Promise.resolve({ branch: 'hospital', ...(scenario.showcase ? { showcase: '1' } : {}) }) });
    const hospital = nodes(tree).find(node => node.type === HospitalMenu);
    check(!!hospital, true, scenario.name + ': menu renders');
    check(hospital.props.menu, menu, scenario.name + ': menu identity preserved');
    check(hospital.props.loyalty, scenario.shown ? { purchasesRequired: 6, rewardName: 'Coffee' } : null, scenario.name + ': exact gated public props');
    check(calls.filter(call => call[0] === 'program'), scenario.feature ? [['program', 'mind-hospital']] : [], scenario.name + ': no program lookup without feature');
    check(calls.find(call => call[0] === 'menu'), ['menu', 'mind-hospital', !!scenario.showcase, 'hospital'], scenario.name + ': existing branch forwarding preserved');
    check(nodes(tree).some(node => node.type === MenuAutoRefresh), !scenario.showcase, scenario.name + ': existing refresh/showcase behavior');
    if (scenario.showcase) check(tree.props.inert, true, 'Showcase interactions stay disabled');
    cases.push({ name: scenario.name, passed: true });
  }
  const inputs = [file, 'components/menu/hospital-menu.tsx', 'lib/data/loyalty-cards.ts', 'lib/commerce/hospital-profile.ts', 'scripts/check-hospital-menu-loyalty.cjs', 'package.json', 'package-lock.json'];
  const report = { at: new Date().toISOString(), runtime: process.version, passed: true, command: 'node scripts/check-hospital-menu-loyalty.cjs', assertions, cases, limits: ['Actual route logic with mocked data readers; no HTTP, database writes or messages', 'Program settings are never changed; disabled or missing programs remain hidden'], inputs: Object.fromEntries(inputs.map(input => [input, crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex')])) };
  fs.mkdirSync('output/mind-ui-review-20261115', { recursive: true });
  fs.writeFileSync('output/mind-ui-review-20261115/hospital-menu-loyalty-check.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, assertions, cases: cases.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
