const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
let current;
function hooks() {
  const slots = []; const cleanups = []; let index = 0; let effects = [];
  return {
    useState(initial) { const n = index++; if (!(n in slots)) slots[n] = initial; return [slots[n], next => { slots[n] = typeof next === 'function' ? next(slots[n]) : next; }]; },
    useRef(initial) { const n = index++; return slots[n] ?? (slots[n] = { current: initial }); },
    useEffectEvent(fn) { return fn; },
    useEffect(fn) { const n = index++; if (!(n in slots)) { slots[n] = true; effects.push(fn); } },
    render(fn, props) { current = this; index = 0; const tree = fn(props); for (const effect of effects) cleanups.push(effect()); effects = []; return tree; },
    close() { cleanups.forEach(fn => fn?.()); },
  };
}
const api = { ...React, useState: (...args) => current.useState(...args), useRef: (...args) => current.useRef(...args), useEffect: (...args) => current.useEffect(...args), useEffectEvent: (...args) => current.useEffectEvent(...args) };
const compiled = ts.transpileModule(fs.readFileSync('components/finance/finance-treasury-attachments.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const output = {};
new Function('require', 'exports', compiled)(name => {
  if (name === 'react') return api;
  if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
  if (name.includes('treasury-attachments')) return { compressTreasuryImage: async file => file };
  if (name.includes('treasury-upload')) return { uploadTreasuryFile: async () => { throw new Error('Previously uploaded files must not upload again'); } };
  return require(name);
}, output);
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const settle = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const nativeFetch = global.fetch;
  try {
    const files = Array.from({ length: 35 }, (_, index) => new File(['content'], `invoice-${index}.pdf`));
    Object.defineProperty(files[0], 'size', { value: 21 * 1024 * 1024 });
    let prepared = [], completed = 0, fail = true;
    global.fetch = async (_, options) => {
      if (!options.method) return Response.json({ attachments: [] });
      const input = JSON.parse(options.body); prepared.push(input);
      if (fail && input.name === 'invoice-2.pdf') return Response.json({ error: 'temporary failure' }, { status: 400 });
      return Response.json({ attachment: { id: input.id, name: input.name, size: input.size }, uploaded: true });
    };
    const props = { slug: 'brand', documentId: 'document', initialFiles: files, onInitialFilesUploaded: () => completed++ };
    const child = output.FinanceTreasuryAttachments(props); const h = hooks(); h.render(child.type, child.props); await settle();
    const tree = h.render(child.type, child.props);
    assert.equal(prepared.length, 35, 'All 35 initial attachments are accepted');
    assert.equal(prepared[0].size, 21 * 1024 * 1024, 'Files over 20MiB reach prepare');
    assert.equal(completed, 0, 'Parent retains draft until failed file is uploaded');
    const chooser = nodes(tree).find(node => node.type === 'input' && node.props.multiple);
    assert.ok(chooser); assert.equal(chooser.props.accept, undefined, 'All document formats can be selected');
    const originalIds = prepared.map(file => file.id); prepared = []; fail = false; h.close();
    const reopened = hooks(); reopened.render(child.type, child.props); await settle();
    assert.deepEqual(prepared.map(file => file.id), originalIds, 'Reopening partial upload retains attachment identity');
    assert.equal(completed, 1); reopened.close();
    prepared = []; const readonly = hooks(); readonly.render(child.type, { ...child.props, readOnly: true }); await settle();
    assert.equal(prepared.length, 0); readonly.close();
    console.log('PASS attachment UI: 35 drafts, >20MiB, optional all-format picker, failed-file retention, reopen identity, completion callback and read-only access');
  } finally { global.fetch = nativeFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
