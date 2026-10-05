import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/rast-loyalty/rast-camera-scanner.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Actual component handlers/effects with only browser and media boundaries mocked.
const slots = [], effects = [], detections = [];
let cursor = 0, pending = [], tree, session, starts = 0, stops = 0;
const body = { style: { overflow: "auto" } };
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: { body } });
const modal = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
const video = { srcObject: null };
const react = {
  useId: () => "camera-test",
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    return slots[index] ??= { current: initial };
  },
  useEffect(run, deps) {
    const index = cursor++;
    if (!effects[index] || deps.some((value, i) => !Object.is(value, effects[index].deps[i]))) {
      pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
    }
  },
};
const stubs = {
  react,
  "./camera-session": { startRastCameraSession(options) { starts++; session = options; return () => { stops++; }; } },
};
const exports = {};
new Function("require", "exports", code)((name) => stubs[name] ?? dependency(name), exports);
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)];
const props = { disabled: false, onDetected: (value) => detections.push(value) };
function render() {
  cursor = 0;
  tree = exports.RastCameraScanner(props);
  for (const node of nodes(tree)) {
    if (node.type === "dialog") node.props.ref.current = modal;
    if (node.type === "video") node.props.ref.current = video;
  }
  const queue = pending; pending = []; queue.forEach((run) => run());
}
const find = (predicate) => {
  const matches = nodes(tree).filter(predicate);
  assert.equal(matches.length, 1);
  return matches[0];
};
const trigger = () => find((node) => node.props["aria-haspopup"] === "dialog");
const dialog = () => find((node) => node.type === "dialog");
const open = () => { trigger().props.onClick(); render(); assert(modal.open); assert.equal(body.style.overflow, "hidden"); };
const closed = () => { assert.equal(modal.open, false); assert.equal(body.style.overflow, "auto"); assert.equal(starts, stops); };

try {
  render(); closed();
  assert.equal(starts, 0, "A closed scanner must not request camera access");
  open();
  assert.equal(trigger().props["aria-controls"], dialog().props.id);
  assert(nodes(tree).some((node) => node.props.id === dialog().props["aria-labelledby"]));
  find((node) => node.type === "button" && !node.props["aria-haspopup"]).props.onClick();
  render(); closed();
  open();
  let prevented = false;
  dialog().props.onCancel({ preventDefault: () => { prevented = true; } });
  render(); closed(); assert(prevented, "Escape uses the same cleanup path");
  open(); session.onError(); render();
  assert(find((node) => node.props.role === "alert").props.children);
  assert(modal.open, "Permission errors retain the accessible close control");
  modal.close(); dialog().props.onClose({ currentTarget: modal }); render(); closed();
  open(); assert.equal(nodes(tree).filter((node) => node.props.role === "alert").length, 0);
  dialog().props.onClose({ currentTarget: modal }); render();
  assert(modal.open, "A delayed close event cannot close a reopened camera");
  session.onDetected("CARD123"); render(); closed();
  assert.deepEqual(detections, ["CARD123"]);
  open(); props.disabled = true; render();
  assert.equal(starts, stops, "Pending cashier operations stop camera capture");
  find((node) => node.type === "button" && !node.props["aria-haspopup"]).props.onClick();
  render(); closed(); assert(trigger().props.disabled);
  props.disabled = false; render(); open();
  effects.forEach((effect) => effect?.cleanup?.()); closed();
  console.log("PASS: camera dialog open, close, Escape, detection, error recovery, pending guard and unmount cleanup.");
} finally {
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else delete globalThis.document;
}
