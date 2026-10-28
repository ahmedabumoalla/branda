import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
async function reject(fn, pattern) { await assert.rejects(fn, pattern); checks++; }
async function load(file, stubs = {}) {
  const source = await readFile(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", code)(name => {
    if (name === "server-only") return {};
    if (name === "next/image") return { __esModule: true, default: (input) => { const props = { ...input }; delete props.unoptimized; return React.createElement("img", props); } };
    if (name in stubs) return stubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (["react", "react/jsx-runtime", "zod", "lucide-react"].includes(name) || name.startsWith("node:")) return require(name);
    throw new Error(`Unmocked dependency ${name}`);
  }, exports);
  return exports;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Real network disabled in salon tests"); };
try {
  const types = await load("lib/salon/types.ts");
  const loyaltyTheme = await load("components/rast-loyalty/loyalty-theme.ts");
  const salonTheme = await load("components/salon/salon-theme.ts", { "@/components/rast-loyalty/loyalty-theme": loyaltyTheme });
  ok(types.salonInputTime("2030-05-10T14:30") === "2030-05-10T11:30:00.000Z", "Saudi input never depends on client timezone");
  assert.throws(() => types.salonInputTime("invalid")); checks++;
  assert.throws(() => types.salonInputTime("2030-02-30T14:30")); checks++;
  const glyphs = await load("lib/loyalty/stamp-style.ts");
  ok(glyphs.loyaltyStampStyle("scissors") === "scissors" && glyphs.stampPaths.scissors, "scissors share native wallet renderer");
  ok(glyphs.loyaltyStampStyle("comb") === "comb" && glyphs.loyaltyStampStyle(undefined) === "ceramic", "salon styles preserve cafe default");
  const id = "11111111-1111-4111-8111-111111111111";
  const cafeId = "22222222-2222-4222-8222-222222222222";
  let category = "hair_salons", featureList = ["menu", "pager", "offers", "loyalty"], rpcCalls = [];
  const rows = { cafes: { id: cafeId, name: "صالون الاختبار", slug: "salon-test", business_category: category }, salon_bookings: { id, cafe_id: cafeId, customer_name: "عميل اختبار", phone: "966500000001", status: "confirmed", version: 1, requested_start: "2030-05-10T11:30:00Z", scheduled_start: "2030-05-10T11:30:00Z", service_snapshot: { name: "حلاقة شعر", price: 40 }, portal_hash: "secret", client_key: "private" } };
  function builder(table) {
    const result = () => ({ data: table === "cafes" ? { ...rows.cafes, business_category: category } : rows[table], error: null });
    const b = { then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
    for (const method of ["select", "eq", "is", "gte", "maybeSingle", "single", "order", "limit"]) b[method] = () => b;
    return b;
  }
  const data = await load("lib/data/salon.ts", {
    "next/headers": { headers: async () => new Headers({ "x-vercel-forwarded-for": "127.0.0.1" }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: builder, rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: true, error: null }; } }) },
    "@/lib/data/loyalty-identity": { getLoyaltyBrandAppearance: async () => ({ colors: { background: "#4a281d", foreground: "#ffffff", accent: "#d9a33f" } }) },
    "@/lib/supabase/server": { getSessionUser: async () => ({ id }) },
    "@/lib/barndaksa/env": { getSupabaseServiceRoleKey: () => "test-secret-only-never-production" },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: cafeId, role: "owner", businessCategory: category }) },
    "@/lib/data/cashier": { requireCashierPermission: async () => ({ cafeId, cashierId: id }) },
    "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => featureList },
    "@/lib/auth/phone-utils": await load("lib/auth/phone-utils.ts"), "@/lib/salon/types": types,
  });
  const token = data.salonPortalToken(id);
  ok(/^[a-f0-9]{64}$/.test(token) && token === data.salonPortalToken(id), "retry-stable opaque capability");
  ok(token !== data.salonPortalToken(cafeId), "different bookings have different capabilities");
  const portal = await data.getSalonPortal(token);
  ok(portal.booking.phone === "" && !JSON.stringify(portal).includes("private") && !JSON.stringify(portal).includes("secret"), "public projection excludes phone and private hashes");
  ok(await data.getSalonPortal("wrong") === null, "invalid capabilities rejected before lookup");
  await reject(() => data.commandSalonBooking(id, 1, "confirm", null, "staff"), /مخصصة/);
  category = "cafes_coffee";
  await reject(() => data.commandSalonBooking(id, 1, "call", null, "owner"), /غير متاحة/);
  ok(rpcCalls.length === 0, "unauthorized actors never reach RPC");
  category = "hair_salons"; featureList = ["menu"];
  await reject(() => data.commandSalonBooking(id, 1, "call", null, "owner"), /غير متاحة/);
  featureList = ["menu", "pager"];
  await data.commandSalonBooking(id, 1, "call", null, "staff");
  ok(rpcCalls[0].args.p_actor === id && rpcCalls[0].args.p_cafe === cafeId && rpcCalls[0].args.p_actor_kind === "staff", "actor and tenant derive from verified staff context");
  rpcCalls = [];
  await data.createSalonBooking({ id, slug: "salon-test", name: "عميل اختبار", phone: "٠٥٠٠٠٠٠٠٠١", serviceId: null, start: "2030-05-10T11:30:00.000Z" });
  ok(rpcCalls[0].args.p_phone === "966500000001", "Arabic phone digits normalized");
  ok(!rpcCalls[0].args.p_client_key.includes("127.0.0.1") && rpcCalls[0].args.p_portal_hash !== token, "IP and capabilities hashed before storage");

  async function workerHarness(options = {}) {
    let queue = options.kinds ?? ["call"], sent = [], finished = [], claims = 0, authorizations = 0;
    const db = { from: builder, rpc: async (name, args) => {
      if (name === "salon_claim_messages") { claims++; const jobs = queue.map(kind => ({ id: kind, kind, cafe_id: cafeId, booking_id: id, phone: "966500000001", lease_token: "lease" })); queue = []; return { data: jobs, error: null }; }
      if (name === "salon_authorize_dispatch") { authorizations++; return { data: options.authorized ?? true, error: null }; }
      if (name === "salon_finish_message") { finished.push(args); if (options.finishError) throw new Error("private db error"); return { data: true, error: null }; }
      throw new Error(name);
    } };
    const worker = await load("lib/salon/worker.ts", {
      "@/lib/supabase/admin": { createAdminClient: () => db }, "@/lib/data/salon": { salonPortalToken: () => token },
      "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => options.features ?? ["menu", "pager", "loyalty"] },
      "@/lib/whatsapp/green-api": { isGreenApiConfigured: () => options.configured ?? true, sendGreenApiPagerMessage: async input => { sent.push(input); if (options.sendError) throw new Error("secret-provider-error"); return { providerMessageId: "provider-id" }; } }, "./types": types,
    });
    return { worker, sent, finished, counts: () => ({ claims, authorizations }) };
  }
  let h = await workerHarness({ configured: false }); await h.worker.runSalonMessageJobs(); ok(h.counts().claims === 0, "unconfigured transport never claims jobs");
  h = await workerHarness({ authorized: false }); await h.worker.runSalonMessageJobs(); ok(h.sent.length === 0, "stale or cancelled job never sends");
  h = await workerHarness(); await Promise.all([h.worker.runSalonMessageJobs(), h.worker.runSalonMessageJobs()]); ok(h.sent.length === 1 && h.finished.length === 1, "overlapping workers do not repeat call");
  ok(h.sent[0].message.includes("دورك جاء") && !h.sent[0].message.includes("الفاتورة"), "salon call names customer without cafe order semantics");
  h = await workerHarness({ sendError: true }); await h.worker.runSalonMessageJobs(); await h.worker.runSalonMessageJobs(); ok(h.sent.length === 1 && h.finished[0].p_provider_id === null && h.finished[0].p_error === "provider_send_uncertain", "ambiguous send recorded once without leaking credentials or retrying");
  h = await workerHarness({ finishError: true }); await h.worker.runSalonMessageJobs(); ok(h.sent.length === 1 && h.finished.length === 1, "successful send not retried when persistence fails");
  h = await workerHarness({ kinds: ["completed"] }); await h.worker.runSalonMessageJobs(); ok(h.sent[0].message.includes(`/salon/booking/${token}`) && h.sent[0].message.includes("/loyalty/salon-test"), "completion includes private review and existing loyalty links");
  h = await workerHarness({ kinds: ["completed"], features: ["pager"] }); await h.worker.runSalonMessageJobs(); ok(!h.sent[0].message.includes("/loyalty/"), "no unavailable loyalty link");
  h = await workerHarness({ kinds: ["owner_new", "owner_response", "proposed", "confirmed", "rejected"] }); await h.worker.runSalonMessageJobs(); ok(h.sent.length === 5 && h.sent.every(x => !x.message.includes("undefined")), "all notification kinds render");
  ok(h.sent.find(x => x.message.includes("عندك حجز جديد")).message.includes(`/dashboard/bookings?booking=${id}`), "owner deep link opens exact appointment");
  const publicUi = await load("components/salon/public-salon.tsx", { "@/app/actions/salon": {}, "@/lib/salon/types": types, "./salon-theme": salonTheme });
  const html = renderToStaticMarkup(React.createElement(publicUi.PublicSalon, { menu: { name: "صالون الاختبار", slug: "salon-test", products: [{ id, name: "حلاقة شعر", catalogKind: "service", price: 40, preparationTimeMinutes: 30, images: [] }, { id: cafeId, name: "زيت عناية", catalogKind: "product", price: 25, images: [] }], contacts: {}, loyaltyEnabled: true }, announcements: [{ id: "ad", title: "خدمة جديدة", description: "عناية باللحية" }], colors: { background: "#112211", foreground: "#ffffff", accent: "#aabbcc" } }));
  ok(html.includes("الخدمات والأسعار") && html.includes("منتجات العناية") && html.includes("حلاقة شعر") && html.includes("زيت عناية"), "services and retail products separated on public page");
  ok(html.includes('type="date"') && html.includes('type="time"') && !html.includes("نحضّر لك المنيو"), "direct booking without cafe loading or barber selector");
  ok(html.includes("خدمة جديدة") && html.includes("/loyalty/salon-test"), "announcements and original loyalty flow rendered");
  const consoleUi = await load("components/salon/booking-console.tsx", { "@/components/ui/design-system": { DashboardPageShell: ({ title, children }) => React.createElement("section", null, React.createElement("h1", null, title), children) }, "@/app/actions/salon": {}, "@/lib/salon/types": types });
  const baseBooking = { ...portal.booking, phone: "966500000001", proposedStart: null, calledAt: null, completedAt: null, rating: null, review: "" };
  const ownerHtml = renderToStaticMarkup(React.createElement(consoleUi.BookingConsole, { initial: { bookings: [{ ...baseBooking, status: "pending" }], total: 1, page: 0 } }));
  ok(ownerHtml.includes("تأكيد الموعد") && ownerHtml.includes("إرسال الموعد للعميل") && ownerHtml.includes("الحجوزات المرفوضة"), "owner supports confirmation, alternative proposal and rejected archive");
  const cashierUi = await load("components/salon/salon-cashier.tsx", { "@/app/actions/salon": {}, "@/app/actions/cashier": { logoutCashierAction: async () => {} }, "@/lib/salon/types": types, "@/components/rast-loyalty/loyalty-theme": loyaltyTheme });
  const pagerHtml = renderToStaticMarkup(React.createElement(cashierUi.SalonCashier, { identity: { name: "صالون الاختبار", slug: "salon-test" }, initial: { bookings: [baseBooking, { ...baseBooking, id: cafeId, status: "in_service" }], total: 2, page: 0 } }));
  ok(pagerHtml.includes("استدعاء العميل") && pagerHtml.includes("إنهاء الخدمة") && !pagerHtml.includes("تقييمات العملاء") && !pagerHtml.includes("الخدمات المكتملة") && !pagerHtml.includes("تأكيد الموعد") && !pagerHtml.includes("رقم الفاتورة"), "cashier has call/completion only and no reviews or archive");
  await reject(() => data.getSalonBookings({ status: "reviews" }, "staff", true), /الكاشير/);
  await reject(() => data.getSalonBookings({ status: "completed" }, "staff", true), /الكاشير/);
  const portalUi = await load("components/salon/booking-portal.tsx", { "./salon-theme": salonTheme, "next/navigation": { useRouter: () => ({ refresh() {} }) }, "@/app/actions/salon": {}, "@/lib/salon/types": types });
  const proposedHtml = renderToStaticMarkup(React.createElement(portalUi.BookingPortal, { token, booking: { ...baseBooking, status: "proposed", proposedStart: "2030-05-11T11:30:00Z" }, brandName: "صالون الاختبار", slug: "salon-test", loyaltyEnabled: true }));
  ok(proposedHtml.includes("أوافق على الموعد") && proposedHtml.includes("أرفض الموعد") && !proposedHtml.includes("966500000001"), "proposal needs explicit customer choice and hides phone");
  const doneHtml = renderToStaticMarkup(React.createElement(portalUi.BookingPortal, { token, booking: { ...baseBooking, status: "completed", rating: 5, review: "تقييم محفوظ" }, brandName: "صالون الاختبار", slug: "salon-test", loyaltyEnabled: true }));
  ok(doneHtml.includes("تقييم محفوظ") && !doneHtml.includes("إرسال التقييم"), "submitted review is immutable in customer UI");
  console.log(`PASS ${checks} salon server, worker, capability, Saudi time, grooming icons and public rendering checks`);
} finally { globalThis.fetch = originalFetch; }
