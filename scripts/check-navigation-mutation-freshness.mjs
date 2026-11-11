import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const source = fs.readFileSync('app/actions/orders.ts', 'utf8');
const events = [];
let result, rejection, disabled = false;
const stubs = {
  'next/cache': { revalidatePath: path => events.push(['invalidate', path]) },
  '@/lib/platform/storefront-availability': { requireStorefrontEnabled() { events.push(['gate']); if (disabled) throw Error('disabled'); } },
  '@/lib/data/orders': {},
  '@/lib/platform/order-flow': Object.fromEntries(['acceptPickupOrder', 'rejectPickupOrder'].map(name => [name, async (...args) => {
    events.push([name, ...args]);
    if (rejection) throw rejection;
    return result;
  }])),
};
const actions = {};
new Function('require', 'exports', compile(source))(name => {
  assert.ok(name in stubs, `Unexpected import ${name}`); return stubs[name];
}, actions);
for (const [name, dataName, args] of [
  ['acceptPickupOrderAction', 'acceptPickupOrder', ['order-a', 'brand-a']],
  ['rejectPickupOrderAction', 'rejectPickupOrder', ['order-b', 'reason', 'brand-b']],
]) {
  events.length = 0; result = { ok: true, order: { id: args[0], status: 'saved' } };
  assert.equal(await actions[name](...args), result);
  assert.deepEqual(events, [['gate'], [dataName, ...args], ['invalidate', '/dashboard/orders']]);
  events.length = 0; result = { ok: false, error: 'unavailable' };
  assert.equal(await actions[name](...args), result);
  assert.deepEqual(events, [['gate'], [dataName, ...args]], 'Rejected writes leave route cache intact');
  events.length = 0; rejection = Error('database unavailable');
  await assert.rejects(actions[name](...args), /database unavailable/);
  assert.deepEqual(events, [['gate'], [dataName, ...args]], 'Thrown writes do not invalidate before success');
  rejection = null; disabled = true; events.length = 0;
  await assert.rejects(actions[name](...args), /disabled/);
  assert.deepEqual(events, [['gate']], 'Existing service gate still precedes mutations');
  disabled = false;
}

const menu = fs.readFileSync('lib/data/menu.ts', 'utf8');
const start = menu.indexOf('function invalidatePublicMenuSurfaces(');
const end = menu.indexOf('\ntype DbEventTicketSetting', start);
assert.ok(start >= 0 && end > start);
const cleared = [], paths = [];
const invalidate = new Function('clearServerMemoryCache', 'revalidatePath', compile(menu.slice(start, end)) + '\nreturn invalidatePublicMenuSurfaces;')(
  key => cleared.push(key), path => paths.push(path));
invalidate(' Brand-A ');
assert.ok(paths.includes('/dashboard/menu'), 'Saved menu must invalidate visited owner menu');
assert.ok(paths.includes('/menu/brand-a'));
assert.ok(paths.includes('/c/brand-a/products/latest'));
assert.ok(cleared.includes('public-menu:brand-a'));
assert.ok(paths.every(path => !path.includes('Brand-A') && !path.includes('brand-b')));
console.log('PASS mutation freshness: accept/reject success, refused/failed/disabled operations, and owner/public menu cache invalidation');
