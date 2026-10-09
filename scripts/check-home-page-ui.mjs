import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const homeFile = path.join(root, "components/marketing/platform-home-page.tsx");
const css = fs.readFileSync(path.join(root, "components/marketing/platform-home-page.module.css"), "utf8");
const compiled = transform({ filename: "platform-home-page.module.css", code: Buffer.from(css), cssModules: true, minify: true });
for (const file of [homeFile, path.join(root, "components/marketing/home-product-preview.tsx")]) {
  for (const [, name] of fs.readFileSync(file, "utf8").matchAll(/styles\.(\w+)/g)) assert(compiled.exports[name], `Missing CSS: ${name}`);
}

function load(file, stubs, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  let source = fs.readFileSync(file, "utf8");
  if (file === homeFile) source += "\nexport { ContactModal, HomeDialog, MediaGallery };";
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith(".")) { const target = path.resolve(path.dirname(file), name); return load(fs.existsSync(`${target}.tsx`) ? `${target}.tsx` : `${target}.ts`, stubs, cache); }
    return dependency(name);
  }, exports);
  return exports;
}

const settings = {
  heroBadge: "منصة علامتك", heroTitle: "منيو تفاعلي - بطاقات ولاء - تسويق في مكان واحد", heroDescription: "وصف العلامة من الإدارة", heroSideText: "تجربة تحمل هويتك", featuresTitle: "مزايا العلامة", loyaltyDescription: "وصف الولاء من الإدارة", ctaTitle: "ابدأ رحلتك", ctaDescription: "وصف الدعوة من الإدارة", aboutUs: "من نحن من الإدارة", vision: "رؤيتنا من الإدارة", mission: "رسالتنا من الإدارة", fontFamily: "system", carouselIntervalSeconds: 5,
  heroBadgeFontSize: 14, heroTitleFontSize: 48, heroDescriptionFontSize: 18, heroSideTextFontSize: 30, featuresTitleFontSize: 36, loyaltyTitleFontSize: 36, loyaltyDescriptionFontSize: 18, ctaTitleFontSize: 36, ctaDescriptionFontSize: 18, aboutCardsFontSize: 15,
};
const data = { settings, contacts: { email: "", whatsapp: "", instagram: "", facebook: "", tiktok: "", x: "" }, heroImages: [], loyaltyImages: [], brands: [], promotions: [], videoViews: 0, videoClicks: 0 };
const baseStubs = {
  "next/link": { __esModule: true, default: "a" },
  "@/components/ui/barndaksa-logo": { BarndaksaLogo: () => React.createElement("span", null, "برندة") },
  "@/app/actions/platform-content": { recordIntroVideoEventAction: async () => {}, submitContactRequestAction: async () => {} },
};
function harness(component = "PlatformHomePage", props = { data }, overrides = {}) {
  const values = [], effects = [], calls = []; let cursor = 0;
  const hooks = { ...React,
    useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
    useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
    useEffect(effect) { effects.push(effect); },
  };
  const stubs = { ...baseStubs, react: hooks,
    "./home-motion": { homeMotion: { duration: { fast: .18, slow: .8 }, stagger: .09, distance: 28, tilt: 5 }, homeSprings: { perspective: {} }, useHomeMotion: () => ({ root: { current: null }, active: true, reduced: false }) },
    "motion/react": { motion: new Proxy({}, { get: (_, name) => name }), useScroll: () => ({ scrollYProgress: 0 }), useInView: () => true, useMotionValue: () => ({ set: value => calls.push(["motion", value]) }), useSpring: () => 0, AnimatePresence: React.Fragment },
    "@/app/actions/platform-content": { recordIntroVideoEventAction: async (...args) => { calls.push(["video", ...args]); }, submitContactRequestAction: async (...args) => { calls.push(["contact", ...args]); } }, ...overrides,
  };
  const file = component === "HomeProductPreview" ? path.join(root, "components/marketing/home-product-preview.tsx") : homeFile;
  const Component = load(file, stubs)[component];
  return { calls, effects, render(nextProps = props) { cursor = 0; effects.length = 0; return Component(nextProps); } };
}
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { if (tree == null || typeof tree === "boolean") return ""; if (Array.isArray(tree)) return tree.map(text).join(""); return typeof tree === "object" ? text(tree.props?.children) : String(tree); }
function byId(tree, id) { return nodes(tree).find(node => node.props?.id === id); }
function byLabel(tree, label) { return nodes(tree).find(node => node.props?.["aria-label"] === label); }
function button(tree, label) { return nodes(tree).find(node => node.type === "button" && text(node) === label); }
const submitEvent = { preventDefault() {} };
let checks = 1;
async function test(run) { await run(); checks++; }

await test(() => {
  const { PlatformHomePage } = load(homeFile, baseStubs);
  const html = renderToStaticMarkup(React.createElement(PlatformHomePage, { data }));
  assert(html.includes('data-motion="off"'));
  assert(html.includes("معاينة توضيحية"));
  assert(html.includes(settings.heroDescription));
  assert(html.includes(settings.aboutUs));
  assert(html.includes('href="/register"'));
  assert(!html.includes("علامات اختارت برندة"));
  assert(!html.includes("أشياء تستحق الاكتشاف"));
  assert(!html.includes('opacity:0'));
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});
await test(() => {
  const populated = { ...data, contacts: { ...data.contacts, whatsapp: "966511111111", instagram: "https://example.invalid/social" }, heroImages: [{ id: "photo", url: "https://example.invalid/hero.png", altText: "صورة الإدارة" }], loyaltyImages: [{ id: "loyalty", url: "https://example.invalid/card.png", altText: "بطاقة الإدارة" }], brands: [{ id: "brand", name: "علامة من الإدارة", href: "/menu/test" }], promotions: [{ id: "offer", itemType: "offer", title: "عرض من الإدارة", brandName: "العلامة", href: "/menu/test?offer=1" }] };
  const { PlatformHomePage } = load(homeFile, baseStubs);
  const html = renderToStaticMarkup(React.createElement(PlatformHomePage, { data: populated }));
  for (const expected of ["صورة الإدارة", "بطاقة الإدارة", "علامة من الإدارة", "عرض من الإدارة", "https://wa.me/966511111111", "https://example.invalid/social"]) assert(html.includes(expected), expected);
  assert(!html.includes("undefined"));
});
await test(() => {
  const h = harness();
  byLabel(h.render(), "إيقاف حركة الصفحة").props.onClick();
  assert.equal(byLabel(h.render(), "تشغيل حركة الصفحة").props["aria-pressed"], true);
  byLabel(h.render(), "فتح القائمة").props.onClick();
  assert.equal(byLabel(h.render(), "إغلاق القائمة").props["aria-expanded"], true);
  assert(byId(h.render(), "home-mobile-nav"));
  byId(h.render(), "home-mobile-nav").props.onKeyDown({ key: "Escape" });
  assert(!byId(h.render(), "home-mobile-nav"));
});
await test(() => {
  const h = harness("HomeProductPreview", { animate: true });
  byId(h.render(), "preview-tab-loyalty").props.onClick();
  assert.equal(byId(h.render(), "preview-tab-loyalty").props["aria-selected"], true);
  assert(text(byId(h.render(), "preview-panel-loyalty")).includes("كل زيارة لها مكافأة"));
  let focused;
  byId(h.render(), "preview-tab-loyalty").props.onKeyDown({ key: "ArrowLeft", preventDefault() {}, currentTarget: { parentElement: { querySelector: selector => ({ focus() { focused = selector; } }) } } });
  assert.equal(focused, "#preview-tab-offers");
  assert.equal(byId(h.render(), "preview-tab-offers").props["aria-selected"], true);
});
await test(() => {
  const h = harness("HomeProductPreview", { animate: false });
  const scene = nodes(h.render()).find(node => node.props?.onPointerMove);
  scene.props.onPointerMove({ pointerType: "mouse" });
  assert.equal(h.calls.length, 0);
  assert.equal(scene.props["data-moving"], false);
});
await test(() => {
  const h = harness("PlatformHomePage", { data: { ...data, introVideo: { id: "video id" } } });
  button(h.render(), "شاهد كيف تعمل برندة").props.onClick();
  assert.deepEqual(h.calls, [["video", "intro_video_click"]]);
  const video = nodes(h.render()).find(node => node.type === "video");
  assert.equal(video.props.src, "/api/public/platform-media/video%20id");
  video.props.onPlay();
  assert.deepEqual(h.calls.at(-1), ["video", "intro_video_view"]);
  video.props.onError();
  assert(nodes(h.render()).some(node => node.props?.role === "alert"));
  const dialog = nodes(h.render()).find(node => node.props?.title === "تعرّف على برندة");
  dialog.props.onClose();
  assert(!nodes(h.render()).some(node => node.type === "video"));
});
await test(async () => {
  const h = harness("ContactModal", { open: true, onClose() {}, contacts: data.contacts });
  for (const [id, value] of [["contact-name", "Test"], ["contact-email", "test@example.invalid"], ["contact-message", "Test request"]]) byId(h.render(), id).props.onChange({ target: { value } });
  await nodes(h.render()).find(node => node.type === "form").props.onSubmit(submitEvent);
  assert.deepEqual(h.calls, [["contact", { fullName: "Test", email: "test@example.invalid", message: "Test request" }]]);
  assert(nodes(h.render()).some(node => node.props?.role === "status"));
});
await test(async () => {
  const h = harness("ContactModal", { open: true, onClose() {}, contacts: data.contacts }, { "@/app/actions/platform-content": { submitContactRequestAction: async () => { throw Error("تعذر الإرسال"); } } });
  byId(h.render(), "contact-message").props.onChange({ target: { value: "Keep this draft" } });
  await nodes(h.render()).find(node => node.type === "form").props.onSubmit(submitEvent);
  assert.equal(byId(h.render(), "contact-message").props.value, "Keep this draft");
  assert.equal(nodes(h.render()).find(node => node.type === "fieldset").props.disabled, false);
  assert.equal(text(nodes(h.render()).find(node => node.props?.role === "alert")), "تعذر الإرسال");
});
await test(() => {
  const h = harness("HomeDialog", { open: true, onClose() {}, title: "Test", children: null });
  const dialog = h.render(); let opens = 0, closes = 0;
  dialog.props.ref.current = { open: false, showModal() { opens++; this.open = true; }, close() { closes++; this.open = false; } };
  h.effects[0](); assert.equal(opens, 1);
  h.render({ open: false, onClose() {}, title: "Test", children: null }); h.effects[0]();
  assert.equal(closes, 1);
});
await test(() => {
  const original = globalThis.window; let interval, cleared;
  globalThis.window = { setInterval(callback, delay) { interval = { callback, delay }; return 7; }, clearInterval(id) { cleared = id; } };
  try {
    const images = [{ id: "one", url: "/one.png" }, { id: "two", url: "/two.png" }];
    const h = harness("MediaGallery", { images, active: true, interval: 1 }); h.render();
    const dispose = h.effects[0](); assert.equal(interval.delay, 5000);
    interval.callback(); assert(text(h.render()).includes("2 / 2"));
    dispose(); assert.equal(cleared, 7);
    interval = undefined; h.render({ images, active: false, interval: 1 }); h.effects[0](); assert.equal(interval, undefined);
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});

await test(() => {
  const original = Object.fromEntries(["window", "document", "navigator", "IntersectionObserver"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = [], effects = [], events = new Map(); let cursor = 0, reduced = false, observer, played = 0, stopped = 0, disconnected = 0;
  const element = { dataset: {}, style: { removeProperty() {} } };
  const hooks = { useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; }, useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = next; }]; }, useEffect(effect) { effects.push(effect); } };
  class Observer { constructor(callback) { this.callback = callback; observer = this; } observe() {} unobserve() {} disconnect() { disconnected++; } }
  const doc = { visibilityState: "visible", addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } };
  for (const [key, value] of Object.entries({ window: { IntersectionObserver: Observer }, document: doc, navigator: { hardwareConcurrency: 8 }, IntersectionObserver: Observer })) Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    const { useHomeMotion } = load(path.join(root, "components/marketing/home-motion.ts"), { react: hooks, "motion/react": { useReducedMotion: () => reduced, animate() { played++; return { stop() { stopped++; } }; } } });
    const render = paused => { cursor = 0; effects.length = 0; return useHomeMotion(paused); };
    const initial = render(false); assert.equal(initial.active, false);
    initial.root.current = { querySelectorAll: () => [element] };
    const removeVisibility = effects[0]();
    assert.equal(render(false).active, true);
    const stopAnimations = effects[1]();
    observer.callback([{ target: element, isIntersecting: true }]); assert.equal(played, 1);
    observer.callback([{ target: element, isIntersecting: true }]); assert.equal(played, 1);
    doc.visibilityState = "hidden"; events.get("visibilitychange")();
    assert.equal(render(false).active, false);
    stopAnimations(); assert.equal(stopped, 1); assert.equal(disconnected, 1);
    doc.visibilityState = "visible"; events.get("visibilitychange")(); reduced = true;
    assert.equal(render(false).active, false);
    reduced = false; assert.equal(render(true).active, false);
    globalThis.navigator.hardwareConcurrency = 2;
    render(false); effects[0]();
    assert.equal(render(false).active, false);
    removeVisibility(); assert.equal(events.size, 0);
  } finally { for (const [key, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
});

function luminance(hex) { return hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); }
await test(() => {
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, value]) => [name, value]));
  for (const [fg, bg, limit] of [["ink", "paper", 4.5], ["muted", "paper", 4.5], ["accent", "soft", 4.5], ["gold", "night", 4.5], ["muted-dark", "night", 4.5], ["field-border", "paper", 3]]) {
    const [light, dark] = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => b - a);
    assert((light + .05) / (dark + .05) >= limit, `Contrast ${fg}/${bg}`);
  }
  for (const [, asset] of css.matchAll(/url\("([^"\)]+)"\)/g)) assert(fs.existsSync(path.join(root, "public", asset)));
});
console.log(`PASS homepage: ${checks} isolated SSR, CMS, tabs, navigation, contact, video, timer, CSS and contrast checks; no live messages`);
