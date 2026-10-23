import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const requests = new AsyncLocalStorage();
// Model React's documented request cache boundary; all database/auth code below is real source.
function cache(fn) {
  return (...args) => {
    const request = requests.getStore();
    if (!request) return fn(...args);
    if (!request.cache.has(fn)) request.cache.set(fn, new Map());
    const memo = request.cache.get(fn), key = JSON.stringify(args);
    if (!memo.has(key)) memo.set(key, fn(...args));
    return memo.get(key);
  };
}
function load(source, stubs) {
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'exports', compiled)(name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), exports);
  return exports;
}
function query(table, owner) {
  const filters = {};
  const builder = {
    select() { return builder; }, is() { return builder; }, order() { return builder; }, limit() { return builder; },
    eq(key, value) { filters[key] = value; return builder; },
    async maybeSingle() {
      owner.counts[table] = (owner.counts[table] ?? 0) + 1;
      if (table === 'profiles') return { data: owner.role ? { role: owner.role } : null };
      if (table === 'cafes') return { data: {
        id: owner.cafeId, slug: filters.slug ?? owner.cafeId, name: owner.cafeId,
        status: owner.publicStatus ?? 'active', business_category: 'cafes_coffee',
      } };
      return { data: null };
    },
  };
  return builder;
}
function client() {
  const request = requests.getStore();
  return {
    auth: { async getUser() { request.counts.auth++; return { data: { user: request.userId ? { id: request.userId } : null } }; } },
    from: table => query(table, request),
  };
}
const stubs = {
  react: { cache }, '@/lib/supabase/server': { createClient: async () => client() },
  '@/lib/supabase/admin': { createAdminClient: client },
  '@/lib/platform/maintenance': { readMaintenanceSessionCookie: async () => requests.getStore().maintenance ?? null },
};
const current = load(fs.readFileSync('lib/data/cafes.ts', 'utf8'), stubs);
const baselineRef = process.env.NAVIGATION_BASELINE ?? '2e60729000d60034cd54f616d69619b60842acbe';
const baseline = load(execFileSync('git', ['show', `${baselineRef}:lib/data/cafes.ts`], { encoding: 'utf8' }), stubs);
function inRequest(options, fn) {
  const state = { userId: 'user-a', role: 'cafe_owner', cafeId: 'cafe-a', counts: { auth: 0 }, cache: new Map(), ...options };
  return requests.run(state, async () => { await fn(state); return state.counts; });
}
let groups = 0;
async function check(name, fn) { await fn(); groups++; console.log('PASS ' + name); }
let beforeAdmin, afterAdmin, beforeOwner, afterOwner;
await check('Parallel admin loaders authenticate once per request', async () => {
  const exercise = module => inRequest({ role: 'platform_admin' }, async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => module.requirePlatformAdmin()));
    assert(users.every(user => user.id === 'user-a'));
    await module.requirePlatformAdmin();
  });
  beforeAdmin = await exercise(baseline); afterAdmin = await exercise(current);
  assert.equal(beforeAdmin.auth, 6); assert.equal(afterAdmin.auth, 1); assert.equal(afterAdmin.profiles, 1);
});
await check('Owner layout, permission guard and page share context lookup', async () => {
  const exercise = module => inRequest({}, async () => {
    const contexts = await Promise.all([module.getOwnerCafeContext(), module.requireOwnerCafeContext(), module.requireOwnerCafeContext()]);
    assert(contexts.every(context => context.id === 'cafe-a'));
  });
  beforeOwner = await exercise(baseline); afterOwner = await exercise(current);
  assert.equal(beforeOwner.auth, 3); assert.equal(afterOwner.auth, 1); assert.equal(afterOwner.cafes, 1);
});
await check('Concurrent accounts and later requests never share permissions or tenants', async () => {
  await Promise.all(['alpha', 'beta'].map(id => inRequest({ userId: id, cafeId: id }, async () => {
    const context = await current.requireOwnerCafeContext(); assert.equal(context.id, id);
    await assert.rejects(current.requirePlatformAdmin(), /Forbidden/);
  })));
  const next = await inRequest({ userId: 'user-a', cafeId: 'changed' }, async () => {
    assert.equal((await current.requireOwnerCafeContext()).id, 'changed');
  });
  assert.equal(next.auth, 1);
});
await check('Anonymous and non-admin requests still fail closed', async () => {
  await inRequest({ userId: null }, async () => {
    assert.equal(await current.getOwnerCafeContext(), null);
    await assert.rejects(current.requireOwnerCafeContext(), /Unauthorized/);
    await assert.rejects(current.requirePlatformAdmin(), /Unauthorized/);
  });
  await inRequest({ role: null }, async () => { await assert.rejects(current.requirePlatformAdmin(), /Forbidden/); });
});
await check('Maintenance tenant selection retains identity and expiry checks', async () => {
  await inRequest({ role: 'platform_admin', cafeId: 'maintained', maintenance: { adminUserId: 'user-a', cafeId: 'maintained', expiresAt: Date.now() + 10000 } }, async () => {
    const context = await current.requireOwnerCafeContext(); assert.equal(context.id, 'maintained'); assert.equal(context.role, 'platform_admin');
  });
});
await check('Public tenant lookup deduplicates only within a request and keeps publication gate', async () => {
  const counts = await inRequest({}, async () => {
    await Promise.all([current.getPublicCafeBySlugAdmin('alpha'), current.getPublicCafeBySlugAdmin('alpha')]);
    await current.getPublicCafeBySlugAdmin('beta');
  });
  assert.equal(counts.cafes, 2);
  await inRequest({ publicStatus: 'suspended' }, async () => { assert.equal(await current.getPublicCafeBySlugAdmin('alpha'), null); });
});
await check('Dashboard layout renders before slow analytics and passes captured request client', async () => {
  const queued = [], captured = {}, calls = [];
  let finish;
  const slow = new Promise(resolve => { finish = resolve; });
  const module = load(fs.readFileSync('app/dashboard/layout.tsx', 'utf8'), {
    '@/components/dashboard/dashboard-app-layout': { DashboardAppLayout: () => null },
    '@/lib/data/cafes': { getOwnerCafeContext: async () => ({ id: 'tenant' }) },
    'next/navigation': { redirect: () => { throw Error('Unexpected redirect'); } },
    '@/lib/data/operation-events': { recordCurrentBrandDashboardEntry: (...args) => { calls.push(args); return slow; } },
    '@/lib/platform/maintenance': { getCurrentMaintenanceSession: async () => null },
    '@/lib/supabase/server': { createClient: async () => captured },
    'next/font/google': { IBM_Plex_Sans_Arabic: () => ({ className: 'font' }) },
    'next/server': { after: callback => queued.push(callback) },
  });
  const tree = await module.default({ children: 'page' });
  assert(tree); assert.equal(calls.length, 0); assert.equal(queued.length, 1);
  const completion = queued[0](); assert.deepEqual(calls[0], ['/dashboard', captured]);
  finish(); await completion;
});
await check('Deferred analytics uses captured identity and retains deduplication and suspended-user checks', async () => {
  for (const scenario of ['active', 'suspended', 'anonymous', 'duplicate']) {
    const writes = [];
    const admin = { from: () => ({
      select() { return this; }, eq() { return this; },
      gte: async () => ({ count: scenario === 'duplicate' ? 1 : 0 }),
      insert: async data => { writes.push(data); return { error: null }; },
    }) };
    const captured = {
      auth: { getUser: async () => ({ data: { user: scenario === 'anonymous' ? null : { id: '11111111-1111-4111-8111-111111111111' } } }) },
      from: table => ({
        select() { return this; }, eq() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: table === 'profiles'
          ? { role: 'cafe_owner', status: scenario === 'suspended' ? 'suspended' : 'active' }
          : { cafe_id: 'tenant-a', cafes: { id: 'tenant-a' } } }),
      }),
    };
    const module = load(fs.readFileSync('lib/data/operation-events.ts', 'utf8'), {
      '@/lib/supabase/server': { createClient: () => { throw Error('Request API used after render'); } },
      '@/lib/supabase/admin': { createAdminClient: () => admin },
    });
    await module.recordCurrentBrandDashboardEntry('/dashboard', captured);
    assert.equal(writes.length, scenario === 'active' ? 1 : 0);
    if (writes.length) { assert.equal(writes[0].cafe_id, 'tenant-a'); assert.equal(writes[0].event_type, 'brand_login'); }
  }
});
await check('Global speculative request burst is removed; native links and loading boundaries remain', async () => {
  const root = fs.readFileSync('app/layout.tsx', 'utf8');
  assert(!root.includes('RoutePrefetcher')); assert(!fs.existsSync('components/performance/route-prefetcher.tsx'));
  for (const file of ['app/loading.tsx', 'app/admin/loading.tsx', 'app/dashboard/loading.tsx', 'app/menu/[slug]/loading.tsx']) assert(fs.readFileSync(file, 'utf8').includes('role="status"'));
  for (const file of ['components/admin/AdminSidebar.tsx', 'components/dashboard/DashboardSidebar.tsx']) assert(fs.readFileSync(file, 'utf8').includes('import Link from "next/link"'));
});
console.log(JSON.stringify({ groups, measurement: 'deterministic loader calls, not production latency', adminAuthCalls: { before: beforeAdmin.auth, after: afterAdmin.auth }, ownerAuthCalls: { before: beforeOwner.auth, after: afterOwner.auth } }));
