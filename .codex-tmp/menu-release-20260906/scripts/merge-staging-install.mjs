#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "supabase", "manual", "BARNDAKSA_STAGING_INITIAL_INSTALL.sql");

const migrations = [
  { num: "001", name: "barndaksa_production_schema", file: "001_barndaksa_production_schema.sql" },
  { num: "002", name: "barndaksa_storage_policies", file: "002_barndaksa_storage_policies.sql" },
  { num: "003", name: "barndaksa_security_hardening", file: "003_barndaksa_security_hardening.sql" },
  { num: "004", name: "barndaksa_critical_security_fixes", file: "004_barndaksa_critical_security_fixes.sql" },
];

const header = `-- BARNDAKSA STAGING INITIAL INSTALL
-- TARGET: Fresh empty Supabase Staging project only
-- DO NOT RUN ON PRODUCTION
-- SOURCE: Final reviewed migrations 001 -> 002 -> 003 -> 004
-- DATABASE STATUS BEFORE RUN: Must be empty / no Barndaksa migrations previously applied

`;

let content = header;

for (const m of migrations) {
  const body = fs.readFileSync(path.join(ROOT, "supabase", "migrations", m.file), "utf8");
  content += `-- ============================================================\n`;
  content += `-- BEGIN MIGRATION ${m.num}: ${m.name}\n`;
  content += `-- SOURCE FILE: supabase/migrations/${m.file}\n`;
  content += `-- ============================================================\n\n`;
  content += body.trimEnd() + "\n\n";
  content += `-- ============================================================\n`;
  content += `-- END MIGRATION ${m.num}\n`;
  content += `-- ============================================================\n\n`;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, content, "utf8");

const lines = content.split(/\n/).length;
const bytes = Buffer.byteLength(content, "utf8");
console.log(`Written: ${OUT}`);
console.log(`Lines: ${lines}`);
console.log(`Bytes: ${bytes}`);
