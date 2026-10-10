import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
let downstream = 0;
const blockedDependency = new Proxy(function () { downstream++; throw new Error("Unexpected downstream call"); }, {
  get: (_, key) => key === "__esModule" ? true : blockedDependency,
});
function load(file, stubs = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name === "@/lib/platform/storefront-availability") return availability;
    if (["@/lib/platform/feature-access", "@/lib/platform/feature-registry"].includes(name)) return load(`${name.slice(2)}.ts`, stubs);
    if (name === "zod" || name.startsWith("react")) return dependency(name);
    return blockedDependency;
  }, exports);
  return exports;
}
const previous = process.env.STOREFRONT_ENABLED;
delete process.env.STOREFRONT_ENABLED;
const availability = load("lib/platform/storefront-availability.ts");
let checks = 0;
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}
try {
  for (const value of [undefined, "false", "1", "TRUE", ""]) {
    if (value === undefined) delete process.env.STOREFRONT_ENABLED;
    else process.env.STOREFRONT_ENABLED = value;
    assert.equal(availability.isStorefrontEnabled(), false); checks++;
  }
  process.env.STOREFRONT_ENABLED = "true";
  assert.equal(availability.isStorefrontEnabled(), true);
  availability.requireStorefrontEnabled(); checks++;
  delete process.env.STOREFRONT_ENABLED;

  const routes = ["app/api/public/cafe", "app/api/customer-fast", "app/api/pwa"].flatMap(walk).filter(file => file.endsWith("route.ts"));
  for (const file of routes) {
    const route = load(file);
    const handler = route.GET ?? route.POST;
    const response = await handler(new Request("https://barndaksa.com/"), { params: Promise.resolve({ slug: "sample" }) });
    assert.equal(response.status, 404, file);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(downstream, 0, file); checks++;
  }
  for (const file of walk("app/c").filter(file => file.endsWith(".tsx"))) {
    if (!fs.readFileSync(path.join(root, file), "utf8").includes("requireStorefrontEnabled();")) continue;
    const page = load(file);
    for (const handler of [page.default, page.generateMetadata].filter(value => typeof value === "function")) {
      await assert.rejects(() => handler({ params: Promise.resolve({ slug: "sample" }) }), /الفرع الإلكتروني غير متاح/);
      assert.equal(downstream, 0, file); checks++;
    }
  }
  const wholeActionFiles = ["orders", "customer", "customer-account", "customer-media", "table-wars", "brand-games", "final-product-release", "operation-events", "branches"];
  const targeted = {
    "platform-upgrade": ["trackCafeVisitAction", "fetchVisitAnalyticsAction"],
    cashier: ["fetchCashierOrdersAction", "acceptCashierOrderAction", "updateCashierOrderStatusAction"],
    auth: ["registerCustomerAction", "loginCustomerAction", "changeCustomerPasswordAction", "requestCustomerPasswordResetAction", "resetCustomerPasswordAction", "requestCustomerPhoneOtpAction", "completeCustomerPhoneOtpAction"],
  };
  for (const name of [...wholeActionFiles, ...Object.keys(targeted)]) {
    const actions = load(`app/actions/${name}.ts`);
    for (const key of targeted[name] ?? Object.keys(actions)) {
      await assert.rejects(() => actions[key]("sample", "", "", ""), /الفرع الإلكتروني غير متاح/, `${name}/${key}`);
      assert.equal(downstream, 0, `${name}/${key}`); checks++;
    }
  }
  const auth = load("app/actions/auth.ts", {
    "@/lib/data/feature-entitlements": { getPublicCafeFeatureCodesBySlug: async () => [] },
    "@/lib/platform/feature-gates": { featureCodesAllow: (features, code) => features.includes(code) },
  });
  await assert.rejects(() => auth.requestCustomerPhoneOtpAction("sample", "", "customer_signup", "loyalty"), /خدمة الولاء غير مفعلة/);
  await assert.rejects(() => auth.completeCustomerPhoneOtpAction("sample", "", "", "customer_signup", "name", "loyalty"), /خدمة الولاء غير مفعلة/);
  assert.equal(downstream, 0); checks += 2;
  const nextResponse = {
    next: () => ({ kind: "next" }), rewrite: () => ({ kind: "rewrite" }),
    redirect: (url, status) => new Response(null, { status, headers: { location: url.toString() } }),
  };
  const proxy = load("proxy.ts", { "next/server": { NextResponse: nextResponse } }).proxy;
  function request(pathname, host = "barndaksa.com", method = "GET") {
    const url = new URL(`https://${host}${pathname}`);
    url.clone = () => new URL(url);
    return { nextUrl: url, headers: new Headers({ host }), method };
  }
  for (const pathname of ["/c", "/c/sample/logo.png", "/api/public/cafe/sample", "/api/customer-fast/sample", "/api/pwa/sample/manifest.json"]) {
    assert.equal((await proxy(request(pathname))).status, 404); checks++;
  }
  for (const pathname of ["/c/sample", "/c/sample/", "/c/sample/products/popular", "/c/sample/product/saved-id", "/c/sample/login", "/app/sample"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request(pathname, "barndaksa.com", method));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "https://barndaksa.com/menu/sample"); checks++;
    }
  }
  const campaign = await proxy(request("/c/sample/products/popular?utm_source=whatsapp&source=qr&token=private&next=https://foreign.test"));
  assert.equal(campaign.headers.get("location"), "https://barndaksa.com/menu/sample?source=qr&utm_source=whatsapp"); checks++;
  for (const pathname of ["/", "/products/popular", "/menu/sample", "/c/sample"]) {
    const response = await proxy(request(pathname, "sample.barndaksa.com"));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://barndaksa.com/menu/sample"); checks++;
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    assert.equal((await proxy(request("/c/sample", "barndaksa.com", method))).status, 404); checks++;
  }
  for (const host of ["www.barndaksa.com", "app.barndaksa.com", "sample.foreign.test", "sample.nested.barndaksa.com"]) {
    assert.equal((await proxy(request("/", host))).kind, "next"); checks++;
  }
  assert.equal((await proxy(request("/api/public/cafe/sample", "sample.barndaksa.com"))).status, 404); checks++;
  for (const pathname of ["/menu/sample", "/loyalty/sample", "/api/wallet/google/card"]) {
    assert.equal((await proxy(request(pathname))).kind, "next"); checks++;
  }
  process.env.STOREFRONT_ENABLED = "true";
  assert.equal((await proxy(request("/", "sample.barndaksa.com"))).status, 308);
  assert.equal((await proxy(request("/c/sample"))).status, 308); checks += 2;
  delete process.env.STOREFRONT_ENABLED;
  assert.equal(downstream, 0);

  const redirect = (target) => { const error = new Error("redirect"); error.target = target; throw error; };
  for (const segment of ["orders", "branches", "reports"]) {
    const page = load(`app/dashboard/${segment}/page.tsx`, { "next/navigation": { redirect } }).default;
    await assert.rejects(page, error => error.target === "/dashboard");
    assert.equal(downstream, 0); checks++;
  }
  for (const features of [["menu", "loyalty"], ["offers"], ["loyalty"], ["settings"]]) {
    let reads = 0;
    const page = load("app/dashboard/page.tsx", {
      "next/navigation": { redirect },
      "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => { reads++; return features; } },
    }).default;
    await assert.rejects(page, error => error.target === `/dashboard/${features[0]}`);
    assert.equal(reads, 1); assert.equal(downstream, 0); checks++;
  }
  const emptyPage = load("app/dashboard/page.tsx", {
    "next/navigation": { redirect }, "next/link": { __esModule: true, default: "a" },
    "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => [] },
  }).default;
  const empty = await emptyPage();
  assert.equal(empty.type, "section"); assert.equal(downstream, 0); checks++;
  const homeReads = [];
  const query = new Proxy({}, { get: (_, key) => key === "then"
    ? (resolve) => resolve({ data: [] })
    : () => query });
  const home = load("lib/data/platform-content.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: (table) => {
      assert(["platform_home_settings", "platform_contact_settings", "platform_media_assets", "platform_public_events"].includes(table), `Unexpected storefront read: ${table}`);
      homeReads.push(table); return query;
    } }) },
  });
  const homeData = await home.getPublicPlatformHomeData();
  assert.deepEqual(homeData.brands, []);
  assert.deepEqual(homeData.promotions, []);
  assert.equal(homeReads.length, 4);
  assert(homeData.settings && homeData.contacts);
  assert.equal(downstream, 0); checks++;
  console.log(`PASS storefront suspension: ${checks} actual handler/proxy/page checks; zero downstream calls while suspended.`);
} finally {
  if (previous === undefined) delete process.env.STOREFRONT_ENABLED;
  else process.env.STOREFRONT_ENABLED = previous;
}
