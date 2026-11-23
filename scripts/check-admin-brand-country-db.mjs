import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const source = name => readFile("supabase/migrations/" + name, "utf8");
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const actor = randomUUID();
const stage = async (id, country, phone, admin = actor) => scalar(
  "select public.admin_prepare_brand_account($1,$2,$3,$4,$5)",
  [id, admin, { slug: id, category: "retail_stores", ownerName: "Owner", brandName: "Fixture",
    phone, email: "", ...(country === undefined ? {} : { phoneCountry: country }) }, "a".repeat(64), "x".repeat(60)],
);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, encrypted_password text);
    CREATE TABLE profiles(id uuid PRIMARY KEY,email text,full_name text,phone text,role text,status text);
    CREATE TABLE cafes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,name text,name_en text,owner_user_id uuid,status text,is_public bool,business_category text);
    CREATE TABLE cafe_members(cafe_id uuid,user_id uuid,role text,permissions jsonb);
    CREATE TABLE cafe_settings(cafe_id uuid,owner_name text,owner_email text,owner_phone text);
    CREATE TABLE platform_plans(id text PRIMARY KEY,name text,active bool,price_sar numeric,trial_days int);
    CREATE TABLE category_default_plans(category_id text,default_plan_id text);
    CREATE TABLE platform_settings(id text,default_plan_id text);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status text,amount_sar numeric,
      started_at timestamptz,expires_at timestamptz,plan_name_snapshot text,duration_unit text,duration_count int,activation_source text);
    INSERT INTO platform_plans VALUES ('trial','Trial',true,0,7);
    INSERT INTO platform_settings VALUES ('default','trial');
  `);
  await db.query("INSERT INTO profiles(id,role,status) VALUES ($1,'platform_admin','active')", [actor]);
  const original = await source("20261013231133_admin_brand_preparation.sql");
  await db.exec(original.slice(0, original.indexOf("CREATE FUNCTION public.admin_prepare_brand_account")));
  const drafts = await source("20261013232802_admin_brand_drafts.sql");
  const salons = await source("20261028073254_enable_mens_barbershop_category.sql");
  // Match the currently deployed function, including the three subsequent category additions.
  const prepare = salons.match(/CREATE OR REPLACE FUNCTION public\.admin_prepare_brand_account[\s\S]*?END \$\$;/)[0]
    .replace("'cafes_coffee','restaurants','hair_salons'", "'cafes_coffee','restaurants','hair_salons','gifts_flowers','butcher_shops','retail_stores'");
  await db.exec(prepare);
  await db.exec(drafts.match(/CREATE OR REPLACE FUNCTION brand_onboarding_private\.complete_account[\s\S]*?END \$\$;/)[0]);
  await db.exec(await source("20261123011000_brand_mobile_country.sql"));

  const legacyId = randomUUID();
  const legacy = await stage(legacyId, undefined, "");
  await db.exec(await source("20261123205420_admin_brand_creation_country.sql"));
  async function complete(id, proof, phone, country) {
    await db.query("INSERT INTO auth.users VALUES ($1,$2,$3,'fixture')", [id, phone ? null : "prepared-" + id + "@accounts.barndaksa.invalid", phone || null]);
    await db.query("select brand_onboarding_private.complete_account($1,$2,$3,$4)", [id,phone,id,proof]);
    const brand = await scalar("select cafe_id from brand_onboarding_private.accounts where id=$1 and state='ready'", [id]);
    assert.equal(await scalar("select phone_country from cafes where id=$1", [brand]), country);
    assert.equal(await scalar("select brand_phone_private.normalize($1,'0590000001')", [brand]), country === "PS" ? "970590000001" : "966590000001");
    assert.equal(await scalar("select count(*)::int from subscriptions where cafe_id=$1", [brand]), 1);
    await assert.rejects(db.query("update cafes set phone_country=$2 where id=$1", [brand,country === "PS" ? "SA" : "PS"]), /cannot be changed/);
  }
  await complete(legacyId, legacy.proof, "", "SA");
  for (const [country, phone] of [["PS","970590000001"],["PS","970560000001"],["PS",""],["SA","966500000001"],[undefined,"966500000002"]]) {
    const id = randomUUID();
    const {proof} = await stage(id,country,phone);
    await complete(id,proof,phone,country ?? "SA");
    assert((await stage(id,country,phone)).cafeId);
  }
  for (const [country, phone] of [["SA","970590000009"],["PS","966500000009"],["PS","970550000009"],["US",""],[null,""],[undefined,"970590000009"]]) {
    await assert.rejects(stage(randomUUID(),country,phone), /INVALID_ACCOUNT_DATA/);
  }
  await assert.rejects(stage(randomUUID(),"PS","",randomUUID()), /ADMIN_REQUIRED/);
  console.log("PASS admin account country: staged creation, country-specific local phones, blank-owner drafts, legacy retry, cross-country rejection, immutable country and admin gate");
} finally { await db.close(); }
