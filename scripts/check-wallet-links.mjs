import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", source)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)}.ts`, stubs, cache);
    return require(name);
  }, exports);
  return exports;
}
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const helper = load("lib/loyalty/wallet-links.ts");
const { walletLinksSchema: schema, normalizeWalletLinkUrl: normalize, appleWalletLinkFields } = helper;
const links = [{ id: "instagram", label: "إنستغرام", url: "https://instagram.com/example" }, { id: "phone", label: "اتصل بنا", url: "tel:+966501234567" }];
check(schema.safeParse(links).success);
assert.equal(normalize(" HTTPS://Example.com/path?a=1&b=2 "), "https://example.com/path?a=1&b=2"); checks++;
assert.equal(normalize("tel:+966 (50) 123-4567"), links[1].url); checks++;
check(normalize("mailto:hello@example.com"));
check(normalize("https://example.com/مرحبا"));
check(normalize("https://example.com/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7"));
const unsafe = ["javascript:alert(1)", "data:text/html,hi", "http://example.com", "https://user:pass@example.com", "https://localhost/x", "https://x.local", "https://127.0.0.1", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://example.com:8443", "https://example.com/\nhi", "https://example.com/%0a", "https://example.com/%C2%85", "https://example.com\\@localhost", "tel:112", "mailto:a@example.com?subject=hi", "https://example.com/<a>"];
for (const url of unsafe) check(!schema.safeParse([{ ...links[0], url }]).success, url);
for (const input of [null, {}, [{ ...links[0], extra: true }], [{ ...links[0], id: "bad id" }], [{ ...links[0], label: " " }], [{ ...links[0], label: "a".repeat(61) }], [links[0], links[0]], [links[0], { ...links[0], id: "duplicate" }], Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: "Test", url: `https://example.com/${i}` }))]) check(!schema.safeParse(input).success);
const escaped = appleWalletLinkFields([{ id: "custom", label: '<Menu & "offers">', url: "https://example.com/?a=1&b=2" }])[0];
check(escaped.attributedValue.includes("&lt;Menu &amp; &quot;offers&quot;&gt;"));
check(escaped.attributedValue.includes("a=1&amp;b=2"));
check(escaped.value === "https://example.com/?a=1&b=2");
check(appleWalletLinkFields().length === 0);

const member = { card: { id: "card", cafeId: "cafe", cardCode: "CARD123", displayNumber: "000123", stampsInCycle: 3, availableRewards: 1 }, cafeSlug: "example", cafeName: "Example", logoUrl: null,
  program: { enabled: true, appleWalletEnabled: true, autoLogo: true, cardTitle: "Rewards", backgroundColor: "#111111", foregroundColor: "#ffffff", rewardName: "Coffee", terms: "Terms", stampLabel: "Stamps", purchasesRequired: 10 },
  experience: { rewardValidityDays: 30, nearbyMessage: "Nearby", latitude: null, longitude: null } };
const commonStubs = { "@/lib/loyalty/secure-qr-payload": { createBarndaksaQrPayload: (_, code) => `CARD:${code}` } };
const payload = load("lib/wallet/payload.ts", commonStubs);
const originalClass = payload.buildGoogleClass(member, "issuer", "https://brand.example");
const linkedClass = payload.buildGoogleClass({ ...member, walletLinks: links }, "issuer", "https://brand.example");
check(linkedClass.linksModuleData.uris.length === 2);
check(linkedClass.linksModuleData.uris[1].uri === links[1].url);
assert.deepEqual({ ...linkedClass, linksModuleData: originalClass.linksModuleData }, originalClass); checks++;
assert.deepEqual(payload.buildGoogleClass({ ...member, walletLinks: [] }, "issuer", "https://brand.example"), originalClass); checks++;
assert.deepEqual(payload.buildGoogleObject({ ...member, walletLinks: links }, "issuer"), payload.buildGoogleObject(member, "issuer")); checks++;
let captured;
class MockPass {
  constructor(assets, signing, props) { this.props = props; this.signing = signing; captured = this; this.types = []; }
  get backFields() { return this.types[0].backFields; }
  setBarcodes(value) { this.barcode = value; }
  setLocations(...value) { this.locations = value; }
  getAsBuffer() { return Buffer.from(JSON.stringify(this)); }
}
class MockType { constructor() { this.backFields = []; this.headerFields = []; this.secondaryFields = []; this.auxiliaryFields = []; } }
const image = { clone() { return this; }, trim() { return this; }, resize() { return this; }, flatten() { return this; }, png() { return this; }, async toBuffer() { return Buffer.from("image"); } };
const apple = load("lib/wallet/apple.ts", { ...commonStubs, sharp: () => image, "passkit-generator": { PKPass: MockPass, PassType: MockType },
  "./config": { appleConfig: () => ({ baseUrl: "https://brand.example", secret: "test-only", passTypeIdentifier: "pass.test", teamIdentifier: "TEST", wwdr: "fixture", signerCert: "fixture", signerKey: "fixture" }) },
  "./logo": { walletBrandLogo: async () => Buffer.from("image") }, "./art": { walletStampArtwork: async () => Buffer.from("image"), WALLET_ART_VERSION: "test" },
  "./apple-icon": { APPLE_ICON_SIZE: 29, APPLE_ICON_VERSION: "test", appleIconBackground: async () => "#111111" }, "./mqas77-assets": {}, "./apple-push": {} });
await apple.issueApplePass(member);
const originalApple = structuredClone(captured);
originalApple.backFields = originalApple.types[0].backFields;
await apple.issueApplePass({ ...member, walletLinks: links });
check(captured.backFields.filter(field => field.key.startsWith("wallet_link_")).length === 2);
assert.deepEqual(captured.barcode, originalApple.barcode); checks++;
assert.deepEqual(captured.signing, originalApple.signing); checks++;
assert.deepEqual(captured.backFields.filter(field => !field.key.startsWith("wallet_link_")), originalApple.backFields); checks++;
await apple.issueApplePass({ ...member, walletLinks: [] });
assert.deepEqual(captured.backFields, originalApple.backFields); checks++;

let role = "owner", rpcCalls = 0, readError = null, rpcError = null, supplied;
const data = load("lib/data/wallet-links.ts", {
  "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: "derived-cafe", role }) },
  "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => ["loyalty"] },
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: readError }) }) }) }) }) },
  "@/lib/supabase/server": { createClient: async () => ({ rpc: async (_, args) => { rpcCalls++; supplied = args; return { data: args.p_links, error: rpcError }; } }) },
});
check((await data.getOwnerWalletLinks()).available);
readError = { code: "42P01" }; check(!(await data.getOwnerWalletLinks()).available);
readError = { code: "500" }; await assert.rejects(data.getOwnerWalletLinks()); checks++;
check((await data.saveOwnerWalletLinks(links)).ok);
check(supplied.p_cafe === "derived-cafe");
const priorCalls = rpcCalls;
role = "manager"; check(!(await data.saveOwnerWalletLinks(links)).ok); check(rpcCalls === priorCalls);
role = "staff"; check(!(await data.saveOwnerWalletLinks(links)).ok); check(rpcCalls === priorCalls);
role = "owner"; rpcError = { code: "PGRST202" }; check(!(await data.saveOwnerWalletLinks(links)).ok);

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = (sql, args = []) => db.query(sql, args);
const v = async (sql, args = []) => Object.values((await q(sql, args)).rows[0])[0];
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA platform_access_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text);
 CREATE TABLE public.cafes(id uuid PRIMARY KEY,owner_id uuid);
 CREATE FUNCTION public.is_cafe_owner(c uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_id=auth.uid()) $$;
 CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()='${id(9)}'::uuid $$;
 CREATE FUNCTION public.brand_account_not_cancelled(c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.archived',true),'')<>'yes' $$;
 CREATE FUNCTION platform_access_private.service_enabled(c uuid,s text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.no_entitlement',true),'')<>'yes' $$;
 CREATE TABLE public.wallet_passes(card_id uuid,cafe_id uuid,provider text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(card_id,provider));
 CREATE TABLE public.wallet_notification_jobs(cafe_id uuid,card_id uuid,kind text,status text DEFAULT 'pending',nearby_refresh boolean DEFAULT false);
 CREATE UNIQUE INDEX pending_sync ON public.wallet_notification_jobs(card_id) WHERE kind='sync' AND status='pending';
 GRANT USAGE ON SCHEMA public,auth,platform_access_private TO authenticated,service_role;
 GRANT SELECT ON public.profiles TO authenticated;
 INSERT INTO public.profiles VALUES('${id(1)}','active'),('${id(2)}','active'),('${id(3)}','suspended'),('${id(9)}','active');
 INSERT INTO public.cafes VALUES('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}'),('${id(13)}','${id(3)}');
 INSERT INTO public.wallet_passes(card_id,cafe_id,provider) VALUES('${id(21)}','${id(11)}','apple'),('${id(21)}','${id(11)}','google'),('${id(22)}','${id(12)}','apple');
`);
await db.exec(fs.readFileSync("supabase/migrations/20261124140000_cafe_wallet_links.sql", "utf8"));
check(await v("SELECT count(*)=0 FROM public.cafe_wallet_links"));
check(await v("SELECT count(*)=0 FROM public.wallet_notification_jobs"));
for (const url of unsafe) check(!await v("SELECT public.valid_cafe_wallet_links($1::jsonb)", [JSON.stringify([{ ...links[0], url }])]), `SQL accepted ${url}`);
for (const url of ["https://example.com/مرحبا", normalize("https://example.com/مرحبا"), "mailto:hello@example.com"]) check(await v("SELECT public.valid_cafe_wallet_links($1::jsonb)", [JSON.stringify([{ ...links[0], url }])]));
const actor = async n => { await db.exec("RESET ROLE"); await q("SELECT set_config('test.actor',$1,false)", [id(n)]); await db.exec("SET ROLE authenticated"); };
const save = (cafe, items) => q("SELECT public.save_cafe_wallet_links($1,$2::jsonb)", [id(cafe), JSON.stringify(items)]);
await actor(1); await save(11, links); checks++;
await assert.rejects(save(12, links)); checks++;
await assert.rejects(q("UPDATE public.cafe_wallet_links SET links='[]'")); checks++;
await db.exec("RESET ROLE");
check(await v("SELECT count(*)=1 FROM public.wallet_notification_jobs WHERE nearby_refresh AND cafe_id=$1", [id(11)]));
const touched = await v("SELECT updated_at::text FROM public.wallet_passes WHERE cafe_id=$1 LIMIT 1", [id(11)]);
await actor(1); await save(11, links); await db.exec("RESET ROLE");
check(await v("SELECT updated_at::text FROM public.wallet_passes WHERE cafe_id=$1 LIMIT 1", [id(11)]) === touched);
await db.exec("DELETE FROM public.wallet_notification_jobs");
await actor(1); await save(11, []); await db.exec("RESET ROLE");
check(await v("SELECT count(*)=1 FROM public.wallet_notification_jobs"));
check(await v("SELECT links='[]'::jsonb FROM public.cafe_wallet_links WHERE cafe_id=$1", [id(11)]));
await actor(2); check(await v("SELECT count(*)=0 FROM public.cafe_wallet_links"));
await actor(3); await assert.rejects(save(13, links)); checks++;
await actor(9); await save(12, links); checks++;
await actor(1); await q("SELECT set_config('test.no_entitlement','yes',false)"); await assert.rejects(save(11, links)); checks++;
await q("SELECT set_config('test.no_entitlement','',false)"); await q("SELECT set_config('test.archived','yes',false)"); await assert.rejects(save(11, links)); checks++;
await q("SELECT set_config('test.archived','',false)");
await db.exec("RESET ROLE; SET ROLE anon"); await assert.rejects(save(11, links)); checks++;
await db.exec("RESET ROLE; SET ROLE service_role"); await assert.rejects(save(11, links)); checks++;
await db.exec("RESET ROLE");
check(await v("SELECT prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='public.save_cafe_wallet_links(uuid,jsonb)'::regprocedure"));
await db.close();
console.log(`Wallet links: ${checks} checks passed (validation, pass builders, owner actions, isolated PostgreSQL/RLS/quiet sync)`);
