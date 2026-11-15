const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict'), crypto = require('node:crypto');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
const domain = load('lib/finance/invoice-custom-fields.ts'), actionResult = load('lib/platform/action-result.ts');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tables = ['bf_invoice_custom_field_settings', 'bf_invoice_custom_field_events', 'bf_invoice_custom_field_drafts', 'bf_invoice_custom_fields', 'bf_invoice_custom_field_values', 'bf_invoice_custom_field_media'];
const missing = name => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}(p_cafe_id, p_draft_id) in the schema cache` } });
const empty = supported => ({ supported, settings: { title: 'Fields', fields: [] }, settingsRevision: 0, savedSettings: null, savedSettingsRevision: null, values: {}, revision: 0, hasSelection: false, issued: false });
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
function harness(options = {}) {
  const calls = [], reads = [], auth = [];
  const client = {
    async rpc(name, args) { calls.push({ name, args }); return options.rpcs?.[name] ?? missing(name); },
    from(table) {
      const read = { table }; reads.push(read);
      return { select(columns) { read.columns = columns; return { eq(column, value) { read.filter = [column, value]; return { async limit(limit) { read.limit = limit; return options.tables?.[table] ?? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } }; } }; } }; } };
    },
  };
  const actions = load('app/actions/finance-invoice-custom-fields.ts', {
    '@/lib/data/brand-finance': { getBrandFinanceContext: async slug => { auth.push(slug); if (options.denied) throw Error('Denied'); return { client, cafe: { id: id(1), role: options.role ?? 'owner' } }; } },
    '@/lib/finance/permissions': { canFinance: (role, operation) => operation === 'settings_manage' ? role === 'owner' : ['owner', 'manager', 'accountant'].includes(role) },
    '@/lib/platform/action-result': actionResult, '@/lib/finance/invoice-custom-fields': domain,
  });
  return { ...actions, calls, reads, auth };
}
function hookHarness({ context = empty(false), response, reader = false } = {}) {
  const slots = []; let cursor = 0, effects = [], actionCalls = 0, saves = 0;
  const react = {
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, dependencies) { const index = cursor++; if (!(index in slots)) { slots[index] = dependencies; effects.push(effect); } },
  };
  const read = async () => { actionCalls++; return response ?? { ok: true, data: context }; };
  const hook = load('components/finance/use-invoice-custom-fields.ts', {
    react, '@/lib/finance/invoice-custom-fields': domain,
    '@/app/actions/finance-invoice-custom-fields': { getFinanceInvoiceCustomFieldContext: read, saveFinanceInvoiceCustomFieldValues: async () => { saves++; return context.supported === false ? { ok: true, data: { supported: false, skipped: true } } : { ok: true, data: { supported: true, skipped: false, values: context.values, revision: 2, issued: false } }; } },
  }).useInvoiceCustomFields;
  const render = () => { cursor = 0; return hook('brand-a', undefined, reader ? read : undefined); };
  return { render, async initialize() { render(); const pending = effects; effects = []; pending.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); return render(); }, get calls() { return actionCalls; }, get saves() { return saves; } };
}
(async () => {
  const absent = harness(), context = await absent.getFinanceInvoiceCustomFieldContext('brand-a');
  eq(context.ok, true, 'entire absent feature allows base invoice'); eq(context.data.supported, false, 'absence is explicit'); eq(context.data.settings.fields, [], 'no invented fields');
  eq(absent.auth, ['brand-a'], 'authorized brand checked');
  eq(absent.reads, tables.map(table => ({ table, columns: 'cafe_id', filter: ['cafe_id', id(1)], limit: 0 })), 'six zero-row tenant-scoped probes');
  const field = { ...domain.newInvoiceCustomField('singleline', id(4)), required: true };
  const required = { ...empty(true), settings: { title: 'Fields', fields: [field] }, settingsRevision: 3 };
  const installed = harness({ rpcs: { brand_finance_invoice_custom_field_context: { data: required, error: null } } });
  const loaded = await installed.getFinanceInvoiceCustomFieldContext('brand-b'); eq(loaded.data.settings.fields[0].required, true, 'required fields retained'); eq(loaded.data.supported, true, 'installed feature active'); eq(installed.reads.length, 0, 'installed feature avoids probes');
  for (const table of tables) {
    const partial = harness({ tables: { [table]: { data: [], error: null } } });
    eq((await partial.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'existing table blocks absence: ' + table);
  }
  for (const error of [{ code: '42501' }, { code: '08006' }, { code: 'PGRST003' }, { code: '42P01' }, { code: 'PGRST205', message: "Could not find the table 'public.other_table' in the schema cache" }]) {
    const blocked = harness({ tables: { [tables[0]]: { data: null, error } } });
    eq((await blocked.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'table failure stays blocking: ' + error.code);
  }
  const configured = harness({ rpcs: { brand_finance_invoice_custom_fields: { data: { settings: required.settings, revision: 3 }, error: null } } });
  eq((await configured.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'settings RPC with required fields blocks partial context');
  for (const error of [{ code: '42501' }, { code: '08006' }, { code: '42883' }, { code: 'PGRST202', message: 'Could not find the function public.other_function()' }]) {
    const blocked = harness({ rpcs: { brand_finance_invoice_custom_field_context: { data: null, error } } });
    eq((await blocked.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'RPC failure stays blocking: ' + error.code); eq(blocked.reads.length, 0, 'not treated as missing whole feature');
  }
  for (const role of ['cashier', 'viewer']) { const denied = harness({ role }); eq((await denied.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'unauthorized role denied'); eq(denied.calls.length, 0, 'no probing before role check'); }
  const denied = harness({ denied: true }); eq((await denied.getFinanceInvoiceCustomFieldContext('brand-a')).ok, false, 'session denial retained'); eq(denied.calls.length, 0, 'session denial prevents probes');
  const input = { draftId: id(2), draftRevision: 1, revision: 0, settingsRevision: 0, values: {} };
  const skip = harness(); eq(await skip.saveFinanceInvoiceCustomFieldValues('brand-a', input), { ok: true, data: { supported: false, skipped: true } }, 'empty unsupported save explicitly skips without revisions'); eq(skip.reads.length, 6, 'save rechecks current capability');
  for (const changed of [{ values: { [id(4)]: 'never discard' } }, { settingsRevision: 1 }, { revision: 1 }]) {
    const blocked = harness(); eq((await blocked.saveFinanceInvoiceCustomFieldValues('brand-a', { ...input, ...changed })).ok, false, 'values or prior state never silently skipped'); eq(blocked.reads.length, 0, 'nonempty save has no compatibility bypass');
  }
  const partialSave = harness({ tables: { [tables[0]]: { data: [], error: null } } }); eq((await partialSave.saveFinanceInvoiceCustomFieldValues('brand-a', input)).ok, false, 'partial install save blocked');
  const normalSave = harness({ rpcs: { brand_finance_set_invoice_custom_fields: { data: { revision: 1, values: { [id(4)]: 'kept' }, issued: false }, error: null } } });
  const saved = await normalSave.saveFinanceInvoiceCustomFieldValues('brand-a', { ...input, values: { [id(4)]: 'kept' } }); eq(saved.data, { supported: true, skipped: false, revision: 1, values: { [id(4)]: 'kept' }, issued: false }, 'installed save keeps original result'); eq(normalSave.reads.length, 0, 'normal save no probe');
  const readOnly = harness({ role: 'auditor' }); eq((await readOnly.saveFinanceInvoiceCustomFieldValues('brand-a', input)).ok, false, 'auditor cannot save or skip write guard'); eq(readOnly.calls.length, 0, 'write authorization before capability');
  const hook = hookHarness({ reader: true }); let state = await hook.initialize(); eq(state.ready, true, 'unsupported hook releases base form'); eq(state.settings, null, 'uninstalled section hidden'); eq(hook.calls, 1, 'injected reader used once');
  eq(await state.save(id(2), 1), { ok: true, skipped: true }, 'hook exposes explicit skip'); state = hook.render(); eq(state.context.hasSelection, false, 'skip does not invent saved selection'); eq(state.context.revision, 0, 'skip does not invent saved revision');
  state.change(id(4), 'must not be lost'); state = hook.render(); eq((await state.save(id(2), 1)).ok, false, 'unsupported values blocked'); eq(hook.saves, 1, 'blocked values never call server save');
  const enabled = hookHarness({ context: required }); state = await enabled.initialize(); eq(state.ready, true, 'installed hook ready'); eq(state.settings.fields[0].required, true, 'installed required setting visible'); assert.ok(state.validate(true)); checks++;
  const failed = hookHarness({ response: { ok: false, message: 'Blocked' } }); state = await failed.initialize(); eq(state.ready, false, 'partial or permission error keeps form blocked'); eq(state.error, 'Blocked', 'error not hidden');
  const files = ['app/actions/finance-invoice-custom-fields.ts', 'components/finance/use-invoice-custom-fields.ts', 'lib/finance/invoice-custom-fields.ts', 'scripts/check-invoice-custom-fields-compatibility.cjs', 'package-lock.json'];
  const report = { at: new Date().toISOString(), runtime: process.version, passed: true, checks, scope: 'Actual server actions and hook with substituted network; missing/full/partial/required/auth/permission/network/name mismatch/empty explicit skip; no business writes', limitation: 'Runtime absence probes use PostgREST schema-cache PGRST205, not direct pg_catalog. Live read-only metadata independently confirmed all feature tables/functions absent and zero migration records before implementation. A newly partially installed feature invisible to a stale schema cache cannot be distinguished without a dedicated database capability RPC.', inputs: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) };
  fs.mkdirSync('output/invoice-custom-fields-compatibility-20261115', { recursive: true }); fs.writeFileSync('output/invoice-custom-fields-compatibility-20261115/verification.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: true, checks, at: report.at, runtime: report.runtime }));
})().catch(error => { console.error(error); process.exitCode = 1; });
