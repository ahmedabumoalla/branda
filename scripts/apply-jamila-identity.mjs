import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

// Explicit, audited data-only change. No schema, program, wallet queue or finance writes.
const id = "8f4d6f70-83e9-4a28-98c7-da65ba8b501b";
const slug = "brand-406bf519a458";
const logo = "https://barndaksa.com/menu-art/jamila/logo-v1.png";
const palette = { primary: "#5c5c5c", secondary: "#ffe8c5", button: "#292827", background: "#fff8ee", text: "#ffe8c5", accent: "#ffe8c5" };
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const dir = process.env.JAMILA_EVIDENCE_DIR;
assert(dir, "Set JAMILA_EVIDENCE_DIR to a private local evidence directory");
fs.mkdirSync(dir, { recursive: true });
const hash = value => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
async function rows(table, filter) {
  const out = [];
  for (let start = 0; ; start += 500) {
    let query = client.from(table).select("*").range(start, start + 499);
    if (filter) query = query.eq(...filter);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 500) return out;
  }
}
async function snapshot() {
  const data = {};
  // Finance tables intentionally deny Data API access; never change their grants to inspect them.
  for (const table of ["cafes", "cafe_settings", "cafe_custom_identity", "cafe_loyalty_programs", "cafe_loyalty_experience", "menu_products", "menu_categories", "loyalty_cards", "customer_reward_instances", "wallet_passes", "wallet_notification_jobs", "subscriptions"]) data[table] = await rows(table);
  return data;
}
function fingerprints(data) {
  return Object.fromEntries(Object.entries(data).map(([table, items]) => {
    const protectedRows = table === "cafe_custom_identity" ? items.filter(row => row.cafe_id !== id) : table === "cafe_settings" ? items.map(row => {
      if (row.cafe_id !== id) return row;
      const { logo_url: _logo, updated_at: _updated, ...other } = row;
      return other;
    }) : items;
    return [table, { count: protectedRows.length, sha256: hash(protectedRows.map(row => JSON.stringify(row)).sort()) }];
  }));
}
const before = await snapshot();
const brand = before.cafes.find(row => row.id === id);
assert(brand?.slug === slug && brand.name === "Jamila" && brand.status === "active" && brand.is_public && !brand.deleted_at, "Unexpected target brand");
assert(!before.menu_products.some(row => row.cafe_id === id) && !before.menu_categories.some(row => row.cafe_id === id), "Preserve any newly created catalog");
const program = before.cafe_loyalty_programs.find(row => row.cafe_id === id);
assert(program?.enabled && program.purchases_required === 6, "Owner loyalty configuration changed");
const settings = before.cafe_settings.find(row => row.cafe_id === id);
const identity = before.cafe_custom_identity.find(row => row.cafe_id === id);
assert(settings && !settings.logo_storage_path, "Review owner logo before changing");
const matchingIdentity = identity?.logo_url === logo && !identity.logo_storage_path && isDeepStrictEqual(identity.palette, palette);
const already = settings.logo_url === logo && matchingIdentity;
if (process.argv.includes("--apply") && !already) {
  assert((!identity || matchingIdentity) && (!settings.logo_url || settings.logo_url === logo), "Preserve new owner identity");
  const response = await fetch(logo, { redirect: "error" });
  assert(response.ok && response.headers.get("content-type")?.startsWith("image/png"), "Deploy the logo before activation");
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(fs.readFileSync("public/menu-art/jamila/logo-v1.png")), "Published logo differs");
  const backup = path.join(dir, "before-private.json");
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify({ settings, identity: identity ?? null }, null, 2));
  if (!identity) {
    const created = await client.from("cafe_custom_identity").insert({ cafe_id: id, logo_url: logo, palette }).select("cafe_id").single();
    if (created.error) throw new Error(`Identity not saved: ${created.error.message}`);
  }
  if (!settings.logo_url) {
    const updated = await client.from("cafe_settings").update({ logo_url: logo }).eq("cafe_id", id).eq("updated_at", settings.updated_at).is("logo_url", null).is("logo_storage_path", null).select("cafe_id").single();
    if (updated.error) throw new Error(`Identity saved but account logo needs review: ${updated.error.message}`);
  }
}
const after = process.argv.includes("--apply") ? await snapshot() : before;
const protectedBefore = fingerprints(before), protectedAfter = fingerprints(after);
assert.deepEqual(protectedAfter, protectedBefore, "Protected data changed; investigate concurrent activity");
if (process.argv.includes("--apply")) {
  assert.equal(after.cafe_settings.find(row => row.cafe_id === id).logo_url, logo);
  const saved = after.cafe_custom_identity.find(row => row.cafe_id === id);
  assert.equal(saved.logo_url, logo);
  assert.deepEqual(saved.palette, palette);
}
const report = { at: new Date().toISOString(), mode: process.argv.includes("--apply") ? "applied" : "dry-run", brand: { id, slug, name: brand.name }, logo, palette, rewardPreserved: { stamps: program.purchases_required, reward: program.reward_name }, protectedBefore, protectedAfter, financeVerification: "No finance writes in script; direct Data API fingerprint unavailable because finance tables deny access", scriptSha256: hash(fs.readFileSync(import.meta.filename)) };
fs.writeFileSync(path.join(dir, process.argv.includes("--apply") ? "activation.json" : "dry-run.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode: report.mode, protectedTables: Object.keys(protectedBefore).length, stamps: program.purchases_required, products: 0 }));
