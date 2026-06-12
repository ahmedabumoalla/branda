#!/usr/bin/env node
/**
 * Static security gate — fails if migrations/source contain forbidden patterns.
 * Does not connect to any database.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const UNIFIED_INSTALL = path.join(ROOT, "supabase", "manual", "BARNDAKSA_STAGING_INITIAL_INSTALL.sql");

const MOJIBAKE_PATTERNS = [
  { label: "ط·ظ", re: /ط·ظ/ },
  { label: "طھظ", re: /طھظ/ },
  { label: "ظ…ظ", re: /ظ…ظ/ },
  { label: "â€\"", re: /â€"/ },
  { label: "â•گ", re: /â•گ/ },
];

const UNSAFE_PROFILES_INSERT =
  /CREATE\s+POLICY\s+profiles_insert_own[\s\S]*?WITH\s+CHECK\s*\(\s*id\s*=\s*auth\.uid\(\)\s+OR\s+public\.is_platform_admin\(\)\s*\)/i;

const FORBIDDEN_POLICY_NAMES = [
  "cafe_settings_public_read",
  "orders_customer_insert",
  "orders_cafe_update",
  "order_items_insert",
  "reservations_customer_insert",
  "reservations_cafe_update",
  "reservation_responses_insert",
  "notifications_update_read",
  "loyalty_accounts_update",
  "domain_orders_insert",
  "reviews_customer_insert",
  "experience_submissions_insert",
  "experience_submissions_review",
  "customer_profiles_insert",
  "customer_profiles_update",
  "platform_settings_read",
  "create_customer_self_notification",
];

const REQUIRED_RPCS = [
  "create_pickup_order",
  "respond_to_pickup_order",
  "create_customer_reservation",
  "respond_to_reservation",
  "create_customer_profile",
  "update_customer_profile",
  "create_customer_review",
  "create_domain_order",
  "submit_experience_submission",
  "attach_experience_submission_media",
  "update_experience_submission_metrics",
  "approve_experience_submission",
  "reject_experience_submission",
];

const FORBIDDEN_FRAGMENTS = [
  "SET search_path = public",
  "storage_customer_avatars_update",
  "storage_experience_update",
  "GRANT EXECUTE ON FUNCTION public.storage_object_exists",
];

const SENSITIVE_TABLES = [
  "orders",
  "order_items",
  "reservations",
  "reservation_responses",
  "notifications",
  "audit_logs",
  "subscriptions",
  "domain_orders",
  "loyalty_accounts",
  "customer_profiles",
  "experience_submissions",
  "storage.objects",
];

const failures = [];

function readMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, content: fs.readFileSync(path.join(MIGRATIONS, f), "utf8") }));
}

function checkForbiddenPolicyCreates(files) {
  for (const { name, content } of files) {
    for (const policy of FORBIDDEN_POLICY_NAMES) {
      const re = new RegExp(`CREATE\\s+POLICY\\s+${policy}\\b`, "i");
      if (re.test(content)) {
        failures.push(`${name}: CREATE POLICY ${policy} is forbidden`);
      }
    }
  }
}

function checkRequiredRpcs(files) {
  const combined = files.map((f) => f.content).join("\n");
  for (const rpc of REQUIRED_RPCS) {
    const re = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}\\s*\\(`,
      "i"
    );
    if (!re.test(combined)) {
      failures.push(`migrations: missing required RPC public.${rpc}`);
    }
  }
}

function checkForbiddenFragments(files) {
  for (const { name, content } of files) {
    for (const frag of FORBIDDEN_FRAGMENTS) {
      if (content.includes(frag)) {
        failures.push(`${name}: forbidden fragment "${frag}"`);
      }
    }
  }
}

function checkHasCafeAccessOnSensitivePolicies(files) {
  for (const { name, content } of files) {
    const blocks = content.split(/CREATE\s+POLICY/i);
    for (let i = 1; i < blocks.length; i += 1) {
      const block = blocks[i].split(/;\s*\n/)[0];
      const tableMatch = block.match(/ON\s+(?:public\.)?(\w+)/i);
      if (!tableMatch) continue;
      const table = tableMatch[1].toLowerCase();
      if (!SENSITIVE_TABLES.includes(table)) continue;
      if (/has_cafe_access\s*\(/i.test(block)) {
        failures.push(
          `${name}: policy on ${table} uses has_cafe_access — use permission or owner/admin`
        );
      }
    }
  }
}

function checkStorageObjectExistsGrant(files) {
  for (const { name, content } of files) {
    if (/storage_object_exists/i.test(content) && /GRANT EXECUTE.*authenticated/i.test(content)) {
      failures.push(`${name}: storage_object_exists must not be granted to authenticated`);
    }
  }
}

function checkMojibake(label, content) {
  for (const { label: patternLabel, re } of MOJIBAKE_PATTERNS) {
    if (re.test(content)) {
      failures.push(`${label}: mojibake pattern "${patternLabel}" detected`);
    }
  }
}

function checkMojibakeInSources(files) {
  for (const { name, content } of files) {
    checkMojibake(name, content);
  }
  if (!fs.existsSync(UNIFIED_INSTALL)) {
    failures.push("supabase/manual/BARNDAKSA_STAGING_INITIAL_INSTALL.sql: missing — run node scripts/merge-staging-install.mjs");
    return;
  }
  checkMojibake("BARNDAKSA_STAGING_INITIAL_INSTALL.sql", fs.readFileSync(UNIFIED_INSTALL, "utf8"));
}

function checkUnsafeProfilesInsertPolicy(files) {
  const sources = [
    ...files.map((f) => ({ name: f.name, content: f.content })),
  ];
  if (fs.existsSync(UNIFIED_INSTALL)) {
    sources.push({
      name: "BARNDAKSA_STAGING_INITIAL_INSTALL.sql",
      content: fs.readFileSync(UNIFIED_INSTALL, "utf8"),
    });
  }
  for (const { name, content } of sources) {
    if (UNSAFE_PROFILES_INSERT.test(content)) {
      failures.push(`${name}: unsafe profiles_insert_own policy (missing role=customer guard)`);
    }
  }
}

function checkTypeScriptDirectWrites() {
  const checks = [
    {
      file: "lib/data/reservations.ts",
      pattern: /\.from\("reservations"\)\s*\n\s*\.update\(/,
      msg: "reservations must use respond_to_reservation RPC",
    },
    {
      file: "lib/data/reviews.ts",
      pattern: /\.from\("reviews"\)\s*\n\s*\.insert\(/,
      msg: "reviews must use create_customer_review RPC",
    },
    {
      file: "lib/data/domain-orders.ts",
      pattern: /\.from\("domain_orders"\)\s*\n\s*\.insert\(/,
      msg: "domain_orders must use create_domain_order RPC",
    },
    {
      file: "lib/data/experience.ts",
      pattern: /p_media_storage_path/,
      msg: "submit_experience_submission must not pass p_media_storage_path",
    },
    {
      file: "lib/data/customers.ts",
      pattern: /\.from\("customer_profiles"\)\s*\n\s*\.update\(/,
      msg: "customer_profiles must use update_customer_profile RPC",
    },
    {
      file: "app/actions/customer-media.ts",
      pattern: /\.from\("customer_profiles"\)\s*\n\s*\.update\(/,
      msg: "customer_profiles must use update_customer_profile RPC",
    },
  ];

  for (const { file, pattern, msg } of checks) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");
    if (pattern.test(content)) {
      failures.push(`${file}: ${msg}`);
    }
  }
}

function main() {
  const files = readMigrationFiles();
  checkForbiddenPolicyCreates(files);
  checkRequiredRpcs(files);
  checkForbiddenFragments(files);
  checkHasCafeAccessOnSensitivePolicies(files);
  checkStorageObjectExistsGrant(files);
  checkMojibakeInSources(files);
  checkUnsafeProfilesInsertPolicy(files);
  checkTypeScriptDirectWrites();

  if (failures.length) {
    console.error("security:source FAILED\n");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("security:source PASSED");
  console.log(`  migrations scanned: ${files.length}`);
  console.log(`  forbidden policy creates: 0`);
  console.log(`  required RPCs: ${REQUIRED_RPCS.length}`);
  console.log(`  sensitive has_cafe_access policies: 0`);
  console.log(`  mojibake patterns: 0`);
  console.log(`  unsafe profiles_insert_own: 0`);
}

main();
