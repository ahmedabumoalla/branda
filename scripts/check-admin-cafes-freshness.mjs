import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('components/admin/pages/admin-cafes-page.tsx', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const component = name => Object.assign(() => null, { displayName: name });
const Directory = component('directory'), Dialog = component('dialog'), Controls = component('controls');
const Create = component('create'), Cleanup = component('cleanup'), Card = component('card');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
function harness(initial) {
  const values = []; let cursor = 0, changed = false, props = initial, refreshes = 0;
  let updateStatus = async () => {}, addPlans = async () => ({ ok: true, data: { planName: 'saved plan' } });
  const hooks = { ...React,
    useState(initialValue) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [values[slot], update => {
        const next = typeof update === 'function' ? update(values[slot]) : update;
        if (next !== values[slot]) { values[slot] = next; changed = true; }
      }];
    },
    useMemo: fn => fn(), useTransition: () => [false, fn => fn()],
  };
  const stubs = {
    react: hooks, 'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    '@/components/admin/brand-details-dialog': { BrandDetailsDialog: Dialog, BrandFeatureControls: Controls },
    '@/components/admin/brand-directory': { BrandDirectory: Directory },
    '@/components/admin/brand-deletion-control': { PendingBrandDeletionCleanup: Cleanup },
    '@/components/admin/brand-account-create': { BrandAccountCreate: Create },
    '@/components/ui/design-system': { BentoCard: Card },
    '@/app/actions/admin': {
      updateCafeStatusAction: (...args) => updateStatus(...args),
      addCafePlansAction: (...args) => addPlans(...args),
      removeCafePlansAction: async () => ({ ok: true, data: { planName: 'removed plan' } }),
      saveCafeFeatureOverridesAction: async (_id, rows) => rows.map(row => ({ featureId: row.featureId, enabled: row.override === 'enabled' })),
    },
    '@/lib/platform/feature-access': {
      getBrandFeatureOverrides: cafe => cafe.featureOverrides ?? [],
      getPlanIncludedFeatures: (id, plans) => plans.find(plan => plan.id === id)?.features ?? [],
      getEffectiveBrandFeatureAccess: (features, overrides) => [{ feature: { id: 'loyalty' },
        planIncluded: features.includes('loyalty'), override: overrides.find(row => row.featureId === 'loyalty')?.enabled === false ? 'disabled' : 'default' }],
    },
    '@/lib/format': { formatSar: value => String(value) },
  };
  const exports = {};
  new Function('require', 'exports', output)(name => name in stubs ? stubs[name] : require(name), exports);
  function render() {
    let tree;
    for (let n = 0; n < 10; n++) {
      changed = false; cursor = 0; tree = exports.AdminCafesPage(props);
      if (!changed) return tree;
    }
    throw Error('Render did not settle');
  }
  const find = type => nodes(render()).find(node => node.type === type);
  return { render, find, refresh(next) { props = { ...props, ...next }; return render(); },
    delayStatus(fn) { updateStatus = fn; }, delayPlans(fn) { addPlans = fn; },
    get refreshes() { return refreshes; } };
}
const cafe = { id: 'brand-a', name: 'Original', status: 'active', planId: 'pro', hasActivePlan: true, featureOverrides: [] };
const initial = { initialCafes: [cafe], initialPlans: [{ id: 'pro', name: 'old catalog', features: ['loyalty'] }], initialCustomers: [], initialOperations: [] };
const h = harness(initial);
h.find(Directory).props.onManage(cafe);
h.find(Dialog).props.services.props.change('loyalty', 'disabled');
assert.equal(h.find(Dialog).props.services.props.dirty, true);
const dialogKey = h.find(Dialog).key;

// A successful local save renders immediately and survives unrelated rerenders.
await h.find(Dialog).props.updatePlan('brand-a', ['pro'], 'revision');
assert.equal(h.find(Directory).props.cafes[0].planName, 'saved plan');
assert.equal(h.find(Dialog).props.cafe.planName, 'saved plan');
h.render();
assert.equal(h.find(Directory).props.cafes[0].planName, 'saved plan');

// Server refresh must refresh every server-backed collection and the open dialog,
// without discarding an unrelated, unsaved service draft or remounting the dialog.
const freshCafe = { ...cafe, name: 'Server refreshed', planName: 'fresh plan', customersCount: 9 };
const freshPlans = [{ id: 'pro', name: 'fresh catalog', features: ['loyalty'] }];
h.refresh({ initialCafes: [freshCafe], initialPlans: freshPlans,
  initialCustomers: [{ id: 'customer-a', cafeId: 'brand-a', fullName: 'Fresh customer', phone: '', totalSpent: 0 }],
  initialOperations: [{ id: 'operation-a', cafeId: 'brand-a', title: 'Fresh operation', type: 'test', createdAt: 'now' }] });
assert.equal(h.find(Directory).props.cafes[0].name, 'Server refreshed');
assert.equal(h.find(Dialog).props.cafe.planName, 'fresh plan');
assert.equal(h.find(Dialog).key, dialogKey);
assert.equal(h.find(Dialog).props.plans, freshPlans);
assert.equal(h.find(Directory).props.plans, freshPlans);
assert.equal(h.find(Dialog).props.services.props.dirty, true);
assert.equal(h.find(Dialog).props.services.props.draft.loyalty, 'disabled');
const activity = JSON.stringify(h.find(Dialog).props.activity);
assert.ok(activity.includes('Fresh customer'));
assert.ok(activity.includes('Fresh operation'));

// An action started before a refresh must apply its result to the newest list,
// retaining newly returned server rows instead of restoring the prior snapshot.
let finish;
h.delayPlans(() => new Promise(resolve => { finish = resolve; }));
const pending = h.find(Dialog).props.updatePlan('brand-a', ['pro'], 'revision');
h.refresh({ initialCafes: [freshCafe, { ...cafe, id: 'brand-b', name: 'Concurrent new brand' }] });
finish({ ok: true, data: { planName: 'confirmed late save' } });
await pending;
assert.equal(h.find(Directory).props.cafes.length, 2);
assert.equal(h.find(Dialog).props.cafe.planName, 'confirmed late save');
assert.equal(h.find(Dialog).props.services.props.draft.loyalty, 'disabled');

// A real deletion in a fresh snapshot closes only the now-missing dialog.
h.refresh({ initialCafes: [{ ...cafe, id: 'brand-b' }] });
assert.equal(h.find(Dialog), undefined);
assert.equal(h.find(Directory).props.cafes[0].id, 'brand-b');
console.log('PASS admin directory: saved mutation, fresh server collections/dialog, draft retention, late-response merge and deleted selection');
