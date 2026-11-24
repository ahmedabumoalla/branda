import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(file, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const relative = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(relative + (fs.existsSync(relative + ".tsx") ? ".tsx" : ".ts"), stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

const { ARAB_COUNTRY_CODES } = load("lib/auth/brand-phone.ts");
const currency = load("lib/currency/account-currency.ts");
const expected = { SA: "SAR", AE: "AED", BH: "BHD", KW: "KWD", OM: "OMR", QA: "QAR", YE: "YER", JO: "JOD", PS: "ILS", LB: "LBP", SY: "SYP", IQ: "IQD", EG: "EGP", SD: "SDG", LY: "LYD", TN: "TND", DZ: "DZD", MA: "MAD", MR: "MRU", SO: "SOS", DJ: "DJF", KM: "KMF" };
// SIX List One minor units (2026-11-24). Intl/CLDR cash-display defaults differ
// for YER, LBP and others and must not be mistaken for ISO accounting precision.
const threeDecimals = new Set(["BHD", "KWD", "OMR", "JOD", "IQD", "LYD", "TND"]);
const zeroDecimals = new Set(["DJF", "KMF"]);
assert.deepEqual(Object.keys(currency.ARAB_ACCOUNT_CURRENCIES).sort(), [...ARAB_COUNTRY_CODES].sort());
for (const [country, code] of Object.entries(expected)) {
  const rule = currency.currencyForCountry(country);
  assert.equal(rule.currencyCode, code);
  const isoMinorUnits = threeDecimals.has(code) ? 3 : zeroDecimals.has(code) ? 0 : 2;
  assert.equal(rule.fractionDigits, isoMinorUnits, country + " decimal places");
  assert.equal(currency.currencyByCode(code), rule);
}
assert.equal(currency.currencyForCountry(undefined).currencyCode, "SAR");
assert.equal(currency.currencyForCountry("__proto__").currencyCode, "SAR");
assert.equal(currency.formatAccountAmount(10000, "IQD", "en-US"), "10,000");
assert.equal(currency.formatAccountAmount(25.123, "IQD", "en-US"), "25.123");
assert.equal(currency.formatAccountAmount(25.12, "DJF", "en-US"), "25");
assert.equal(currency.formatAccountMoney(25.123, "SAR"), (25.123).toLocaleString("ar-SA") + " ر.س");
assert.equal(currency.menuCurrencyLabel("SAR"), "ريال");
assert.equal(currency.menuCurrencyLabel("IQD"), "د.ع");

const accountRequests = [];
const { getBrandCurrency } = load("lib/data/brand-currency.ts", {
  react: { cache: fn => fn },
  "@/lib/data/brand-phone-country": { getBrandPhoneCountry: async cafeId => {
    accountRequests.push(cafeId);
    if (cafeId === "unavailable") throw new Error("Country lookup failed");
    return cafeId === "iraqi-brand" ? "IQ" : "SA";
  } },
});
assert.equal((await getBrandCurrency("iraqi-brand")).currencyCode, "IQD");
assert.equal((await getBrandCurrency("saudi-brand")).currencyCode, "SAR");
await assert.rejects(getBrandCurrency("unavailable"), /Country lookup failed/);
assert.deepEqual(accountRequests, ["iraqi-brand", "saudi-brand", "unavailable"]);

const product = { id: "product", name: "Haircut", category: "Salon", ingredients: [], description: "", price: 10000, available: true, promo: null, catalogKind: "service" };
const { MenuProductCard } = load("components/dashboard/menu/product-card.tsx", {
  "@/components/cafe/product-image": { ProductMediaDisplay: () => null },
});
for (const code of ["IQD", "SAR"]) {
  const html = renderToStaticMarkup(React.createElement(MenuProductCard, { product, currencyCode: code, businessCategory: "hair_salons", onEdit() {}, onDuplicate() {}, onToggleAvailability() {}, onDelete() {} }));
  assert(html.includes(currency.currencyByCode(code).currencyLabel));
  assert(!html.includes(code === "IQD" ? "ر.س" : "د.ع"));
}
assert.equal(product.price, 10000, "Rendering must never convert or rewrite catalog amounts");

const noop = () => null;
const uiStubs = {
  "next/image": { __esModule: true, default: ({ fill, unoptimized, priority, ...props }) => React.createElement("img", props) },
  "next/link": { __esModule: true, default: "a" },
  "motion/react": { useReducedMotion: () => true, AnimatePresence: React.Fragment, motion: new Proxy({}, { get: (_, tag) => ({ initial, animate, exit, transition, whileInView, viewport, ...props }) => React.createElement(tag, props) }) },
  "./bistro-menu": { ProductDetails: noop },
  "./menu-services": { MenuServices: noop },
  "./brand-loyalty-entry": { BrandLoyaltyEntry: noop },
  "@/lib/menu/menu-entry-scroll": { startMenuAtTop: noop, menuEntryUrl: (_origin, slug) => "/menu/" + slug },
};
const { SignatureMenu } = load("components/menu/signature-menu.tsx", uiStubs);
const { defaultSignatureBrand } = load("lib/menu/default-signature.ts");
for (const code of ["IQD", "SAR"]) {
  const item = { ...product, price: 25.123, currencyCode: code, categoryId: "category", images: [], videos: [] };
  const menu = { presentation: "signature", businessCategory: "cafes_coffee", currencyCode: code, currencyLabel: currency.currencyByCode(code).currencyLabel, slug: "test", name: "Currency test", logoUrl: null, description: null, products: [item], categories: [{ id: "category", name: "Drinks", description: null }], contacts: { feedbackEnabled: false, instagramUrl: null, location: null } };
  const html = renderToStaticMarkup(React.createElement(SignatureMenu, { menu, brand: defaultSignatureBrand(menu), loyalty: null }));
  assert(html.includes(currency.menuCurrencyLabel(code)), "Public catalog currency label");
  assert(html.includes(code === "IQD" ? "25.123" : "25.12"), "Public catalog uses its currency precision");
}
console.log("Account currency: 22 country mappings and ISO minor units, owner/public Iraqi/Saudi rendering, account isolation, legacy formatting and read failures passed");
