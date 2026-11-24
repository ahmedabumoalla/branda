import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();
function load(file) {
  if (moduleCache.has(file)) return moduleCache.get(file);
  const exports = {};
  moduleCache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function("require","exports",code)(name => name.startsWith("@/") ? load(name.slice(2)+".ts") : require(name), exports);
  return exports;
}
const phone = load("lib/auth/brand-phone.ts");
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(),"branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
const migration = fs.readFileSync("supabase/migrations/20261124124949_arab_phone_countries.sql","utf8");
const scalar = async (sql,values=[]) => Object.values((await db.query(sql,values)).rows[0])[0];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
let checks=0;
const equal = (actual,expected,message) => {assert.equal(actual,expected,message);checks++;};
try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE cafes(id uuid PRIMARY KEY,name text);");
  await db.exec(fs.readFileSync("supabase/migrations/20261123011000_brand_mobile_country.sql","utf8"));
  await db.query("INSERT INTO cafes(id,name) VALUES($1,'Existing Saudi')",[id(1)]);
  const existing = (await db.query("SELECT * FROM cafes")).rows;
  await db.exec(migration.split("-- FOUNDATION START")[1].split("-- FOUNDATION END")[0]);
  assert.deepEqual((await db.query("SELECT * FROM cafes")).rows,existing);checks++;
  equal(await scalar("SELECT count(*)::int FROM brand_phone_private.country_rules()"),22,"all Arab countries in SQL");
  for (const [index,country] of phone.ARAB_COUNTRIES.entries()) {
    const cafe=id(index+20), canonical=country.callingCode+country.example;
    await db.query("INSERT INTO cafes(id,name,phone_country) VALUES($1,$2,$3)",[cafe,country.name,country.code]);
    const national=(country.prefix??"")+country.example;
    const toArabic = value => value.replace(/[0-9]/g,digit=>String.fromCharCode(0x660+Number(digit)));
    const inputs=[country.example,national,canonical,"+"+canonical,"00"+canonical," +"+country.callingCode+" ("+national+") ",toArabic(national),"\u2066+"+toArabic(canonical)+"\u2069","", "123", "+14155552671", "+"+canonical+"x", canonical.slice(0,-1), "0"+national];
    for (const value of inputs) {
      equal(await scalar("SELECT brand_phone_private.normalize($1,$2)",[cafe,value]),phone.normalizeBrandPhone(value,country.code),country.code+" customer parity "+value);
      equal(await scalar("SELECT brand_phone_private.staff_normalize($1,$2)",[cafe,value]),phone.normalizeInternationalPhone(value,country.code),country.code+" staff parity "+value);
    }
    equal(await scalar("SELECT brand_phone_private.country_for_phone($1)",[canonical]),country.code,"canonical country");
    equal(await scalar("SELECT brand_phone_private.canonical($1,$2)",[cafe,canonical]),true,"canonical customer");
    equal(await scalar("SELECT brand_phone_private.canonical($1,$2)",[cafe,"+"+canonical]),false,"canonical excludes plus");
    const foreign=phone.ARAB_COUNTRIES.find(item=>item.code!==country.code);
    const foreignCanonical=foreign.callingCode+foreign.example;
    equal(await scalar("SELECT brand_phone_private.normalize($1,$2)",[cafe,"+"+foreignCanonical]),null,"customer country mismatch rejected");
    equal(await scalar("SELECT brand_phone_private.staff_normalize($1,$2)",[cafe,"+"+foreignCanonical]),foreignCanonical,"explicit staff country accepted");
    equal(await scalar("SELECT brand_phone_private.staff_canonical($1,$2)",[cafe,foreignCanonical]),true,"staff canonical preserves explicit foreign number");
    await assert.rejects(db.query("UPDATE cafes SET phone_country=$2 WHERE id=$1",[cafe,foreign.code]),/cannot be changed/);checks++;
  }
  // Tunisia local numbers beginning 20 must not be mistaken for Egypt calling code 20
  equal(await scalar("SELECT brand_phone_private.normalize_country('TN','20123456')"),"21620123456","valid local prefix ambiguity");
  equal(await scalar("SELECT brand_phone_private.normalize_country('US','20123456')"),null,"unsupported country");
  equal(await scalar("SELECT brand_phone_private.normalize($1,'0512345678')",[id(999)]),null,"missing tenant");
  for(const fn of ["country_rules()","country_for_phone(text)","normalize_country(text,text,boolean)","staff_normalize(uuid,text)","staff_canonical(uuid,text)"]) {
    equal(await scalar("SELECT has_function_privilege('anon',$1,'EXECUTE')",["brand_phone_private."+fn]),false,"anon denied "+fn);
    equal(await scalar("SELECT has_function_privilege('authenticated',$1,'EXECUTE')",["brand_phone_private."+fn]),false,"authenticated denied "+fn);
    equal(await scalar("SELECT has_function_privilege('service_role',$1,'EXECUTE')",["brand_phone_private."+fn]),true,"service allowed "+fn);
  }
  const constraints=migration.split("-- CONSTRAINTS START")[1].split("-- CONSTRAINTS END")[0];
  for(const match of constraints.matchAll(/ALTER TABLE ([a-z_]+\.[a-z_]+) ADD CONSTRAINT ([a-z_]+) (CHECK [^\n]+) NOT VALID;/g)) {
    const [,table,name,definition]=match;
    const column=definition.match(/\b(phone_normalized|phone|requested_phone|customer_phone)\b/)[1];
    const plus=definition.includes("^\\+");
    await db.exec(`CREATE SCHEMA IF NOT EXISTS ${table.split(".")[0]};CREATE TABLE ${table}(${column} text);`);
    await db.query(`INSERT INTO ${table} VALUES($1)`,[(plus?"+":"")+"966512345678"]);
    await db.exec(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition};`);
    equal(await scalar(`SELECT count(*)::int FROM ${table}`),1,"legacy Saudi constraint row preserved");
    for(const country of phone.ARAB_COUNTRIES) {
      await db.query(`INSERT INTO ${table} VALUES($1)`,[(plus?"+":"")+country.callingCode+country.example]);checks++;
    }
    await assert.rejects(db.query(`INSERT INTO ${table} VALUES('14155552671')`));checks++;
  }
  console.log(`PASS Arab phone SQL: ${checks} isolated PostgreSQL checks, all 22 countries, TS parity, staff overrides, strict loyalty country, immutable brands, legacy Saudi preservation and constraints`);
} finally { await db.close(); }
