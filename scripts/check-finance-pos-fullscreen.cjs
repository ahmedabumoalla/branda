const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const listeners = new Map();
const cleanups = [];
let slots = [], cursor = 0;
const hooks = { ...React,
  useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
  useEffect(effect) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(effect()); } },
  useSyncExternalStore(subscribe, snapshot, serverSnapshot) { const i = cursor++; if (!(i in slots)) { slots[i] = true; assert.equal(serverSnapshot(), false); cleanups.push(subscribe(() => {})); } return snapshot(); },
};
const exported = {};
const code = ts.transpileModule(fs.readFileSync('components/finance/finance-pos-fullscreen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
new Function('require', 'exports', code)(name => name === 'react' ? hooks : name.endsWith('.css') ? { __esModule: true, default: {} } : require(name), exported);
const render = () => { cursor = 0; return exported.FinancePosFullscreen(); };
async function main() {
  const nativeDocument = global.document;
  let requests = 0, exits = 0;
  const doc = { fullscreenElement: null, documentElement: {}, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  doc.documentElement.requestFullscreen = async function () { assert.equal(this, doc.documentElement); requests++; doc.fullscreenElement = this; };
  doc.exitFullscreen = async function () { assert.equal(this, doc); exits++; doc.fullscreenElement = null; };
  global.document = doc;
  try {
    let tree = render();
    assert.equal(tree.props.children[0].props['aria-pressed'], false);
    await tree.props.children[0].props.onClick();
    assert.equal(requests, 1);
    tree = render();
    assert.equal(tree.props.children[0].props['aria-pressed'], true);
    assert.match(tree.props.children[0].props['aria-label'], /الخروج/);
    await tree.props.children[0].props.onClick();
    assert.equal(exits, 1);
    assert.equal(render().props.children[0].props['aria-pressed'], false);
    doc.fullscreenElement = doc.documentElement;
    assert.equal(render().props.children[0].props['aria-pressed'], true);
    doc.fullscreenElement = null; // User exits with Escape or browser controls
    listeners.get('fullscreenchange')();
    assert.equal(render().props.children[0].props['aria-pressed'], false);
    let resolve;
    doc.documentElement.requestFullscreen = () => { requests++; return new Promise(done => { resolve = done; }); };
    const click = render().props.children[0].props.onClick;
    const pending = click(); await click();
    assert.equal(requests, 2, 'Ignore repeated clicks during pending entry');
    assert.equal(render().props.children[0].props.disabled, true);
    resolve(); await pending;
    doc.documentElement.requestFullscreen = async () => { throw new Error('Denied'); };
    await render().props.children[0].props.onClick();
    assert.equal(render().props.children[1].props.role, 'alert');
    assert.equal(exported.isPosFullscreen(doc), false, 'Denied entry never reports fullscreen');
    await assert.rejects(exported.togglePosFullscreen({ documentElement: {} }), /unavailable/);
    const legacy = { documentElement: {}, webkitFullscreenElement: null };
    legacy.documentElement.webkitRequestFullscreen = function () { legacy.webkitFullscreenElement = this; };
    legacy.webkitExitFullscreen = function () { this.webkitFullscreenElement = null; };
    await exported.togglePosFullscreen(legacy);
    assert.equal(exported.isPosFullscreen(legacy), true);
    await exported.togglePosFullscreen(legacy);
    assert.equal(exported.isPosFullscreen(legacy), false);
    for (const cleanup of cleanups) cleanup();
    assert.equal(listeners.size, 0);
    console.log('POS fullscreen: enter/exit, browser exit state, legacy API, unsupported/denied entry, duplicate clicks and cleanup passed');
  } finally { global.document = nativeDocument; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
