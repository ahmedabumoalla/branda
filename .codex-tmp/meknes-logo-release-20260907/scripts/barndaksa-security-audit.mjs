import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const root = process.cwd();
function readEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}
readEnvFile(".env.local");
readEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const report = { ok: true, checkedAt: new Date().toISOString(), source: {}, env: {}, database: {}, warnings: [], failures: [] };
function fail(message, meta) { report.ok = false; report.failures.push(meta ? { message, meta } : { message }); }
function warn(message, meta) { report.warnings.push(meta ? { message, meta } : { message }); }

// Source gate
const sourceChecks = [];
const skipDirs = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "out", "coverage", "docs"]);
const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".sql"]);
function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(d.name)) continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full);
    else if (exts.has(path.extname(d.name)) && !d.name.startsWith("barndaksa-security-audit") && !d.name.startsWith("barndaksa-source-verify")) scan(full);
  }
}
function scan(file) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const text = fs.readFileSync(file, "utf8");
  const checks = [
    [/packages\.applied-caas|internal\.api\.openai/g, "internal npm registry URL"],
    [/�/g, "replacement-character encoding corruption"],
    [/ط؛ظٹ|ط§ظƒ|ظ…ط±ط¨|طھط¹ط°ط±/g, "probable mojibake Arabic text"],
    [/NEXT_PUBLIC_.*SERVICE_ROLE|SERVICE_ROLE.*NEXT_PUBLIC/g, "service role exposed as public env"],
  ];
  for (const [rx, label] of checks) {
    const matches = text.match(rx);
    if (matches) sourceChecks.push({ file: rel, issue: label, count: matches.length });
  }
}
walk(root);
report.source.issues = sourceChecks;
if (sourceChecks.length) fail("Source security/encoding verification failed", sourceChecks);

report.env = {
  hasSupabaseUrl: Boolean(url),
  hasAnonKey: Boolean(anon),
  hasServiceRoleKey: Boolean(service),
  appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
  publicDomain: process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN || null,
};
if (!url || !anon) fail("Missing Supabase public environment variables");
if (!service) warn("SUPABASE_SERVICE_ROLE_KEY is missing; admin/database checks are limited");
if ((process.env.NEXT_PUBLIC_APP_URL || "").includes("branda") && !(process.env.NEXT_PUBLIC_APP_URL || "").includes("barndaksa.com")) warn("NEXT_PUBLIC_APP_URL may still point to an old domain");

async function tableCheck(client, table, select = "id") {
  const res = await client.from(table).select(select).limit(1);
  return { ok: !res.error, status: res.status, error: res.error?.message || null, count: Array.isArray(res.data) ? res.data.length : null };
}
if (url && anon) {
  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = service ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const publicTables = ["cafes", "cafe_pages", "cafe_settings", "menu_categories", "menu_products", "branches", "reviews", "reservation_services", "offers"];
  const privateTables = ["profiles", "orders", "order_items", "reservations", "customer_profiles", "subscriptions", "representatives", "platform_settings", "audit_logs"];
  report.database.anonPublicReads = {};
  for (const t of publicTables) report.database.anonPublicReads[t] = await tableCheck(anonClient, t, "*");
  report.database.anonPrivateReads = {};
  for (const t of privateTables) {
    const r = await tableCheck(anonClient, t, "*");
    report.database.anonPrivateReads[t] = r;
    if (r.ok && (r.count ?? 0) > 0) fail(`Anon can read private table ${t}`, r);
  }
  if (adminClient) {
    report.database.serviceRoleCoreTables = {};
    for (const t of [...publicTables, ...privateTables]) report.database.serviceRoleCoreTables[t] = await tableCheck(adminClient, t, "*");
    const storage = await adminClient.storage.listBuckets();
    report.database.storageBuckets = storage.error ? { ok: false, error: storage.error.message } : { ok: true, buckets: storage.data.map((b) => ({ id: b.id, name: b.name, public: b.public })) };
    if (!storage.error) {
      for (const b of storage.data) {
        if (["customer-avatars", "experience-submissions"].includes(b.name) && b.public) fail(`Sensitive bucket is public: ${b.name}`);
      }
    }
  }
}



const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
if (dbUrl) {
  const sqlPath = path.join(root, "supabase", "manual", "999_barndaksa_full_security_audit.sql");
  const deep = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath], { encoding: "utf8" });
  report.database.deepSqlAudit = {
    attempted: true,
    exitCode: deep.status,
    stdout: deep.stdout?.slice(0, 20000) || "",
    stderr: deep.stderr?.slice(0, 8000) || "",
  };
  if (deep.error) warn("psql is not available locally; install PostgreSQL client or run the SQL file in Supabase SQL Editor", deep.error.message);
  else if (deep.status !== 0) fail("Deep SQL audit failed", { stderr: deep.stderr });
} else {
  report.database.deepSqlAudit = {
    attempted: false,
    reason: "Set SUPABASE_DB_URL or DATABASE_URL to run the deep PostgreSQL audit from this same command.",
    sqlFile: "supabase/manual/999_barndaksa_full_security_audit.sql",
  };
}

const out = JSON.stringify(report, null, 2);
console.log(out);
fs.mkdirSync(path.join(root, "audit-output"), { recursive: true });
fs.writeFileSync(path.join(root, "audit-output", "barndaksa-security-audit.json"), out + "\n", "utf8");
process.exit(report.ok ? 0 : 1);
