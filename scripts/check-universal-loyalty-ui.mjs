import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const noMutation = () => assert.fail("Rendering must not send messages or mutate cards");
const baseStubs = {
  "next/link": { __esModule: true, default: "a" },
  "next/image": { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement("img", props) },
  "next/navigation": { useRouter: () => ({ refresh: noMutation }) },
  "@/app/actions/loyalty-experience": new Proxy({}, { get: () => noMutation }),
  "@/app/actions/cashier": { logoutCashierAction: "/test-logout" },
};
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(file, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (Object.hasOwn(baseStubs, name)) return baseStubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const relative = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(`${relative}${fs.existsSync(path.join(root, `${relative}.tsx`)) ? ".tsx" : ".ts"}`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const identity = { name: "علامة الاختبار", slug: "test-brand", logoUrl: "/own-logo.png", cardBackground: "#186340", cardForeground: "#ffffff", cardAccent: "#327746" };
const rast = { name: "مقهى الكواكب", slug: "rast", logoUrl: null };
const program = { enabled: true, purchasesRequired: 7, rewardName: "هدية الزيارة", terms: "", appleWalletEnabled: true, googleWalletEnabled: true };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

const { loyaltyTheme } = load("components/rast-loyalty/loyalty-theme.ts");
check("Kawakib receives no palette override", () => assert.equal(loyaltyTheme(rast), undefined));
check("Other brand uses its configured card colors", () => {
  const theme = loyaltyTheme(identity);
  assert.equal(theme["--card-background"], "#186340");
  assert.equal(theme["--card-foreground"], "#ffffff");
});
check("Invalid colors cannot enter generated theme styles", () => {
  const theme = loyaltyTheme({ ...identity, cardBackground: "url(https://invalid.test)", cardForeground: "red", cardAccent: "initial" });
  assert(Object.entries(theme).every(([key, value]) => key === "--card-logo-filter"
    ? ["brightness(0)", "brightness(0) invert(1)"].includes(value)
    : /^#[a-f0-9]{6}$/i.test(value)));
});
function lum(color) {
  const values = color.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
check("Dark light and bright brand palettes remain readable", () => {
  for (const color of ["#ffffff", "#facc15", "#000000", "#00ff00", "#ff0000", "#0000ff", "#808080"]) {
    const theme = loyaltyTheme({ ...identity, cardBackground: color, cardForeground: color, cardAccent: color });
    assert(contrast(theme["--card-background"], theme["--card-foreground"]) >= 4.5);
    assert(contrast(theme["--cream"], theme["--wine"]) >= 4.5);
    assert(contrast(theme["--cream"], theme["--red"]) >= 4.5);
  }
});

const { RastHeader, RastBrand } = load("components/rast-loyalty/rast-brand.tsx");
check("Header keeps the current brand menu destination", () => {
  const html = render(RastHeader, { identity });
  assert(html.includes('href="/menu/test-brand"'));
  assert(html.includes(identity.name));
  assert(!html.includes("الكواكب"));
});
check("Missing brand logo falls back to its name not another business", () => {
  const html = render(RastBrand, { identity: { ...identity, logoUrl: null }, light: true });
  assert(html.includes('class="logoFallback"'));
  assert(!html.includes("kawakib"));
});
check("Kawakib keeps its established logo fallback", () => assert(render(RastBrand, { identity: rast }).includes("kawakib-transparent-20261008.png")));

const { RastStampCard } = load("components/rast-loyalty/rast-stamp-card.tsx");
check("Member card carries own brand and exact QR membership value", () => {
  const html = render(RastStampCard, { identity, customerName: "عميل تجريبي", stamps: 2, required: 7, rewardName: program.rewardName, cardCode: "CARD-TEST-123" });
  assert(html.includes("CARD-TEST-123"));
  assert(html.includes(identity.name));
  assert(!html.includes("KAWAKIB"));
  assert.equal((html.match(/class="collected"/g) || []).length, 2);
  assert.equal((html.match(/aria-label="الختم /g) || []).length, 7);
  assert(html.includes("--card-background:#186340"));
});
check("Preview clamps malformed stamp counts", () => {
  const html = render(RastStampCard, { identity, stamps: -1, required: 0, rewardName: program.rewardName, preview: true });
  assert.equal((html.match(/aria-label="الختم /g) || []).length, 1);
  assert(!html.includes('class="collected"'));
});

const { RastEnrollment } = load("components/rast-loyalty/rast-enrollment.tsx");
check("Enrollment names its own brand and retains phone OTP inputs", () => {
  const html = render(RastEnrollment, { identity, program });
  assert(html.includes(identity.name));
  assert(!html.includes("الكواكب"));
  assert(html.includes('name="phone"'));
  assert(html.includes("واتساب"));
});
check("Disabled enrollment has own menu link and no registration form", () => {
  const html = render(RastEnrollment, { identity, program: { ...program, enabled: false } });
  assert(!html.includes("<form"));
  assert(html.includes('href="/menu/test-brand"'));
  assert(!html.includes("الكواكب"));
});
check("Verified membership failure does not expose fresh registration", () => {
  const html = render(RastEnrollment, { identity, program, authenticated: true });
  assert(!html.includes("<form"));
  assert(html.includes("تحديث الصفحة"));
  assert(!html.includes("الكواكب"));
});

const { RastMemberCard } = load("components/rast-loyalty/rast-member-card.tsx");
check("Member page retains wallet links card QR and reward details per brand", () => {
  const member = { card: { cardCode: "CARD-TEST-123", customerName: "عميل تجريبي", stampsInCycle: 2 }, program, rewards: [{ id: "reward-1", rewardTitle: "هدية العميل", rewardCode: "REWARD-123", expiresAt: null, metadata: { termsSnapshot: { rewardKind: "discount", discountPercent: 20 } } }] };
  const html = render(RastMemberCard, { identity, member, walletAvailability: { apple: true, google: true } });
  assert(html.includes('/api/wallet/apple/CARD-TEST-123'));
  assert(html.includes('/api/wallet/google/CARD-TEST-123'));
  assert(html.includes("REWARD-123"));
  assert(html.includes("خصم 20%"));
  assert(!html.includes("الكواكب"));
});
const { RastCashier } = load("components/rast-loyalty/rast-cashier.tsx");
check("Member greeting separates and isolates Arabic and Latin names for every brand", () => {
  for (const brand of [identity, rast, { ...identity, slug: "kat-coffe" }]) {
    for (const customerName of ["احمد", "أحمد عبد الرحمن محمد", "Ahmed Abdullah"]) {
      const html = render(RastMemberCard, { identity: brand, member: { card: { cardCode: "CARD-TEST", customerName, stampsInCycle: 0 }, program, rewards: [] }, walletAvailability: { apple: true, google: true } });
      assert(html.includes(`<h1>يا هلا برجعتك <span class="memberName"><bdi>${customerName}</bdi></span></h1>`));
    }
  }
});
check("Cashier offers approved stamp reward and camera flow for own brand", () => {
  const initialData = { cafe: { id: "cafe", slug: identity.slug, name: identity.name }, cashier: { fullName: "موظف تجريبي", canUsePager: true } };
  const html = render(RastCashier, { initialData, identity });
  assert(html.includes('href="/loyalty/test-brand"'));
  assert(html.includes("تسجيل ختم"));
  assert(html.includes("صرف مكافأة"));
  assert(html.includes("قراءة بالكاميرا"));
  assert(html.includes('href="/pager"'));
  assert(!html.includes("KAWAKIB"));
  assert(!html.includes("الكواكب"));
});

let requestedSlug, profileSlug, member = null, profile = null, membershipCalls = 0;
const { default: PublicPage } = load("app/loyalty/[slug]/page.tsx", {
  "next/navigation": { notFound: () => { throw new Error("not-found"); } },
  "@/lib/data/loyalty-experience": { getLoyaltyBrand: async (slug) => { requestedSlug = slug; return slug === "missing" ? null : { identity, program }; }, getLoyaltyMembership: async () => { membershipCalls++; return member; } },
  "@/lib/auth/rast-loyalty-session": { getVerifiedLoyaltyCustomerProfile: async (slug) => { profileSlug = slug; return profile; } },
  "@/lib/wallet": { getWalletReadiness: () => ({ apple: true, google: true }) },
  "@/components/analytics/public-page-analytics": { PublicPageAnalytics: () => null },
  "@/components/rast-loyalty/rast-enrollment": { RastEnrollment: () => React.createElement("div", { "data-view": "enrollment" }) },
  "@/components/rast-loyalty/rast-member-card": { RastMemberCard: () => React.createElement("div", { "data-view": "membership" }) },
});
await PublicPage({ params: Promise.resolve({ slug: identity.slug }), searchParams: Promise.resolve({}) });
check("Public route authorizes and checks OTP identity against requested brand", () => {
  assert.equal(requestedSlug, identity.slug);
  assert.equal(profileSlug, identity.slug);
  assert.equal(membershipCalls, 0, "Anonymous enrollment skips redundant brand and membership queries");
});
profile = { id: "verified-customer" }; member = { card: { id: "own-card" } };
let page = await PublicPage({ params: Promise.resolve({ slug: identity.slug }), searchParams: Promise.resolve({}) });
check("Verified members retain their authorized card flow", () => {
  assert.equal(membershipCalls, 1);
  assert(renderToStaticMarkup(page).includes('data-view="membership"'));
});
member = null;
page = await PublicPage({ params: Promise.resolve({ slug: identity.slug }), searchParams: Promise.resolve({}) });
check("Verified nonmembers retain enrollment", () => assert(renderToStaticMarkup(page).includes('data-view="enrollment"')));
program.enabled = false;
const previousCalls = membershipCalls;
await PublicPage({ params: Promise.resolve({ slug: identity.slug }), searchParams: Promise.resolve({}) });
check("Disabled programs never load a membership", () => assert.equal(membershipCalls, previousCalls));
program.enabled = true;

let pending = false;
const { LoyaltyLinkContent } = load("components/menu/loyalty-link-content.tsx", {
  "next/link": { useLinkStatus: () => ({ pending }) },
});
for (const service of [false, true]) {
  pending = false;
  const idle = render(LoyaltyLinkContent, { service });
  pending = true;
  const busy = render(LoyaltyLinkContent, { service });
  check(`Loyalty link immediately exposes accessible pending feedback (service=${service})`, () => {
    assert(!idle.includes("جار فتح بطاقتك"));
    assert(busy.includes("جار فتح بطاقتك") && busy.includes("spinner") && busy.includes('role="status"'));
  });
  pending = false;
  check("Router cancellation resets feedback", () => assert.equal(render(LoyaltyLinkContent, { service }), idle));
}
const { default: Loading } = load("app/loyalty/[slug]/loading.tsx");
check("Shared dynamic loyalty route streams an accessible loading boundary", () => {
  const html = render(Loading);
  assert(html.includes("جار فتح بطاقتك") && html.includes('role="status"') && html.includes('dir="rtl"'));
});
await assert.rejects(() => PublicPage({ params: Promise.resolve({ slug: "missing" }), searchParams: Promise.resolve({}) }), /not-found/);
checks++;
console.log(`PASS ${checks} universal loyalty UI checks with no browser or customer messages`);
