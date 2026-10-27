const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const listeners = new Map();
let cleanup;
let focused = false;
class FakeNode {}
class FakeElement extends FakeNode {
  constructor(action = false) { super(); this.action = action; }
  closest() { return this.action ? this : null; }
}
const inside = new FakeElement();
const disclosure = { open: true, contains: target => target === inside, querySelector: () => ({ focus() { focused = true; } }) };
const savedGlobals = { Node: global.Node, Element: global.Element, document: global.document };
global.Node = FakeNode;
global.Element = FakeElement;
global.document = { addEventListener: (type, listener) => listeners.set(type, listener), removeEventListener: type => listeners.delete(type) };
try {
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync('components/finance/finance-pos-actions.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => name === 'react' ? { ...React, useRef: () => ({ current: disclosure }), useEffect: effect => { cleanup = effect(); } } : name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : require(name), exported);
  const action = React.createElement('button', { disabled: true }, 'Action');
  const tree = exported.FinancePosActions({ children: action, details: 'Shift details' });
  assert.equal(tree.type, 'details');
  assert.equal(tree.props.open, undefined, 'Actions are collapsed initially');
  const [summary, panel] = tree.props.children;
  assert.equal(summary.type, 'summary', 'Use native keyboard disclosure semantics');
  assert.equal(panel.props.children[1].props.children, action, 'Preserve action identity, handlers and disabled permissions');
  assert.equal(panel.props.children[0].props.children, 'Shift details');
  listeners.get('pointerdown')({ target: inside });
  assert.equal(disclosure.open, true);
  listeners.get('pointerdown')({ target: new FakeNode() });
  assert.equal(disclosure.open, false);
  disclosure.open = true;
  tree.props.onKeyDown({ key: 'Escape', currentTarget: disclosure, preventDefault() {} });
  assert.equal(disclosure.open, false);
  assert.equal(focused, true, 'Escape restores focus to the trigger');
  disclosure.open = true;
  tree.props.onBlur({ relatedTarget: inside, currentTarget: disclosure });
  assert.equal(disclosure.open, true);
  tree.props.onBlur({ relatedTarget: new FakeNode(), currentTarget: disclosure });
  assert.equal(disclosure.open, false);
  disclosure.open = true;
  panel.props.children[1].props.onClick({ target: new FakeElement(false) });
  assert.equal(disclosure.open, true, 'Non-action and disabled targets do not dismiss');
  panel.props.children[1].props.onClick({ target: new FakeElement(true) });
  assert.equal(disclosure.open, false, 'Choosing an action dismisses the menu without unmounting children');
  cleanup();
  assert.equal(listeners.size, 0, 'Remove the outside-pointer listener on unmount');
  console.log('POS actions: disclosure, dismissal, keyboard focus, action preservation and cleanup passed');
} finally { Object.assign(global, savedGlobals); }
