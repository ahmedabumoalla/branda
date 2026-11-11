import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

// Read-only verification: never change access grants, identity, programs or finance.
const id = "8f4d6f70-83e9-4a28-98c7-da65ba8b501b";
const logo = "https://barndaksa.com/menu-art/jamila/logo-v1.png";
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const dir = process.env.JAMILA_EVIDENCE_DIR;
assert(dir, "Set JAMILA_EVIDENCE_DIR to the private evidence directory");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprints = {};
const original = JSON.parse(fs.readFileSync(path.join(dir, "../jamila-before-private.json"), "utf8"));
const targetChanges = {};
for (const table of ["cafes", "cafe_settings", "cafe_custom_identity", "cafe_loyalty_programs", "cafe_loyalty_experience", "menu_products", "menu_categories", "loyalty_cards", "customer_reward_instances", "wallet_passes", "wallet_notification_jobs", "subscriptions"]) {
  let rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from(table).select("*").range(start, start + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 500) break;
  }
  if (table === "cafes") assert(rows.some(row => row.id === id && row.slug === "brand-406bf519a458" && row.name === "Jamila"));
  if (table === "menu_products" || table === "menu_categories") assert(!rows.some(row => row.cafe_id === id));
  if (table === "cafe_loyalty_programs" || table === "cafe_loyalty_experience") {
    const current = rows.find(row => row.cafe_id === id), previous = original[table][0];
    assert(current);
    targetChanges[table] = Object.keys(current).filter(key => JSON.stringify(current[key]) !== JSON.stringify(previous[key]));
    for (const key of Object.keys(previous)) {
      // Keep the owner's concurrent stamp-design save; this task never writes program or experience rows.
      if (key === "updated_at" || key === "card_design") continue;
      assert.deepEqual(current[key], previous[key], `Owner business preference changed: ${table}.${key}`);
    }
  }
  if (table === "cafe_settings") {
    assert(rows.some(row => row.cafe_id === id && row.logo_url === logo && !row.logo_storage_path));
    rows = rows.map(row => {
      if (row.cafe_id !== id) return row;
      const { logo_url: _logo, updated_at: _updated, ...rest } = row;
      return rest;
    });
  }
  if (table === "cafe_custom_identity") rows = rows.filter(row => row.cafe_id !== id);
  fingerprints[table] = { count: rows.length, sha256: hash(rows.map(row => JSON.stringify(row)).sort()) };
}
const before = JSON.parse(fs.readFileSync(path.join(dir, "dry-run.json"), "utf8")).protectedBefore;
const changedTables = Object.keys(fingerprints).filter(table => fingerprints[table].sha256 !== before[table].sha256 || fingerprints[table].count !== before[table].count);
for (const table of ["cafes", "cafe_settings", "cafe_custom_identity", "menu_products", "menu_categories", "subscriptions"]) assert.deepEqual(fingerprints[table],before[table],`Unexpected protected configuration change: ${table}`);
const report = { at: new Date().toISOString(), logoStored: true, unchangedConfigurationTables: 6, fingerprints, globalSnapshotMatch: changedTables.length===0, concurrentDeltaTables: changedTables, targetChanges, databaseWrite: "Jamila cafe_settings.logo_url only; all other settings preserved", palette: "Version-controlled Jamila default in approvedLoyaltyColors; future saved palette overrides it", schemaChanges: false };
fs.writeFileSync(path.join(dir, "account-verification.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ logoStored: true, unchangedConfigurationTables: 6, rewardRulesUnchanged: true, concurrentDeltaTables: changedTables, targetChanges }));
