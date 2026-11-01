import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(os.tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();
const migration=await fs.readFile('supabase/migrations/20261101202913_together_flowers_loyalty_only.sql','utf8');
const fixture={
  "brand": [
    {
      "id": "4e5a661a-7029-40ec-a3bc-dc75959a05bb",
      "slug": "brand-871ec6e243c0"
    }
  ],
  "subscriptions": [
    {
      "id": "79ea3eeb-b098-44ca-a379-9a0def0dc942",
      "cafe_id": "4e5a661a-7029-40ec-a3bc-dc75959a05bb",
      "plan_id": "finance",
      "status": "trialing",
      "amount_sar": 0,
      "started_at": "2026-11-01T00:14:03.199768+00:00",
      "expires_at": "2026-11-08T00:14:03.199768+00:00",
      "cancelled_at": null,
      "activation_source": "owner_authorized_finance_trial_7d",
      "plan_name_snapshot": "تجربة برندة المالية المجانية لمدة 7 أيام"
    },
    {
      "id": "51c11a72-2a1f-4598-892e-a52f13025abb",
      "cafe_id": "4e5a661a-7029-40ec-a3bc-dc75959a05bb",
      "plan_id": "-",
      "status": "trialing",
      "amount_sar": 0,
      "started_at": "2026-10-31T23:15:41.142547+00:00",
      "expires_at": null,
      "cancelled_at": null,
      "activation_source": "admin_prepared_trial",
      "plan_name_snapshot": "باقة تجريبية"
    },
    {
      "id": "054d8d37-5536-4375-b17a-becb76d3dc7b",
      "cafe_id": "4e5a661a-7029-40ec-a3bc-dc75959a05bb",
      "plan_id": "pro",
      "status": "active",
      "amount_sar": 0,
      "started_at": "2026-11-01T20:18:11.109128+00:00",
      "expires_at": "2026-12-01T20:18:11.109128+00:00",
      "cancelled_at": null,
      "activation_source": "admin_manual_change",
      "plan_name_snapshot": "ولاء برندة"
    }
  ]
};
try{
await db.exec(`CREATE TABLE cafes(id uuid primary key,slug text); CREATE TABLE platform_plans(id text primary key,name text,description text,price_sar numeric,features jsonb,sort_order integer,active boolean,is_default boolean,duration_unit text,duration_count integer,category_id text,trial_days integer,free_after_trial boolean,is_upgrade_bundle boolean); CREATE TABLE subscriptions(id uuid primary key,cafe_id uuid,plan_id text,status text,amount_sar numeric,started_at timestamptz,expires_at timestamptz,cancelled_at timestamptz,updated_at timestamptz,activation_source text); CREATE TABLE brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean,UNIQUE(cafe_id,feature_id));`);
await db.query('INSERT INTO cafes VALUES($1,$2)',[fixture.brand[0].id,fixture.brand[0].slug]);
for(const s of fixture.subscriptions) await db.query('INSERT INTO subscriptions(id,cafe_id,plan_id,status,amount_sar,started_at,expires_at,cancelled_at,activation_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s.id,s.cafe_id,s.plan_id,s.status,s.amount_sar,s.started_at,s.expires_at,s.cancelled_at,s.activation_source]);
const loyalty=await db.query("SELECT * FROM subscriptions WHERE plan_id='pro'");
await db.exec(migration);
assert.deepEqual((await db.query("SELECT * FROM subscriptions WHERE plan_id='pro'")).rows,loyalty.rows);
assert.equal((await db.query("SELECT count(*)::int n FROM subscriptions WHERE status='cancelled'")).rows[0].n,2);
const p=(await db.query("SELECT * FROM platform_plans WHERE id='flowers'")).rows[0]; assert.equal(p.active,false);assert.equal(p.price_sar,'0');assert.equal(p.category_id,'gifts_flowers');assert.equal(p.features.length,6);
assert.equal((await db.query("SELECT enabled FROM brand_feature_overrides WHERE feature_id='pager'")).rows[0].enabled,false);
await db.exec(migration); assert.equal((await db.query('SELECT count(*)::int n FROM platform_plans')).rows[0].n,1);
assert.deepEqual((await db.query("SELECT * FROM subscriptions WHERE plan_id='pro'")).rows,loyalty.rows);
await db.query("UPDATE subscriptions SET expires_at=expires_at+interval '1 day' WHERE plan_id='pro'");await assert.rejects(()=>db.exec(migration),/loyalty period changed/);await db.exec('ROLLBACK');
await db.exec("CREATE TABLE cafe_loyalty_programs(cafe_id uuid primary key,enabled boolean,purchases_required integer); CREATE TABLE cafe_loyalty_experience(cafe_id uuid primary key,reward_kind text DEFAULT 'custom',reward_discount_percent integer,reward_validity_days integer DEFAULT 30,nearby_message text DEFAULT 'Original message',branch_latitude numeric,branch_longitude numeric,offer_title text DEFAULT '',offer_body text DEFAULT '',updated_at timestamptz DEFAULT now());");
await db.query('INSERT INTO cafe_loyalty_programs VALUES($1,true,4)',[fixture.brand[0].id]);
const rewardMigration=await fs.readFile('supabase/migrations/20261101203459_together_loyalty_discount_reward.sql','utf8');
await db.exec(rewardMigration);
let reward=(await db.query('SELECT * FROM cafe_loyalty_experience')).rows[0];
assert.equal(reward.reward_kind,'discount');assert.equal(reward.reward_discount_percent,10);assert.equal(reward.reward_validity_days,30);
const originalReward={...reward};await db.exec(rewardMigration);assert.deepEqual((await db.query('SELECT * FROM cafe_loyalty_experience')).rows[0],originalReward);
await db.query("UPDATE cafe_loyalty_experience SET reward_kind='custom',reward_discount_percent=NULL,reward_validity_days=45,nearby_message='Brand message',offer_title='Offer',branch_latitude=24,branch_longitude=46");
await db.query("INSERT INTO cafe_loyalty_experience(cafe_id,reward_kind,reward_discount_percent) VALUES('00000000-0000-4000-8000-000000000001','discount',20)");
await db.exec(rewardMigration);
reward=(await db.query('SELECT * FROM cafe_loyalty_experience WHERE cafe_id=$1',[fixture.brand[0].id])).rows[0];
assert.equal(reward.reward_discount_percent,10);assert.equal(reward.reward_validity_days,45);assert.equal(reward.nearby_message,'Brand message');assert.equal(reward.offer_title,'Offer');assert.equal(Number(reward.branch_latitude),24);assert.equal(Number(reward.branch_longitude),46);
assert.equal((await db.query("SELECT reward_discount_percent FROM cafe_loyalty_experience WHERE cafe_id='00000000-0000-4000-8000-000000000001'")).rows[0].reward_discount_percent,20);
await db.exec("ALTER TABLE cafe_loyalty_programs ADD COLUMN card_design jsonb,ADD COLUMN updated_at timestamptz DEFAULT now();");
await db.query('UPDATE cafe_loyalty_programs SET card_design=$1', [{stampStyle:'ceramic',layoutVersion:'brand-stamps-v1',customField:'keep'}]);
await db.query('UPDATE cafe_loyalty_experience SET nearby_message=$1 WHERE cafe_id=$2',['قريب منّا؟ خذ لك لحظة قهوة، يسعدنا نشوفك.',fixture.brand[0].id]);
const plantMigration=await fs.readFile('supabase/migrations/20261101210754_together_plant_stamp_identity.sql','utf8');
await db.exec(plantMigration);
let plant=(await db.query('SELECT * FROM cafe_loyalty_programs')).rows[0];assert.equal(plant.card_design.stampStyle,'plant');assert.equal(plant.card_design.layoutVersion,'brand-stamps-v1');assert.equal(plant.card_design.customField,'keep');assert.equal(plant.purchases_required,4);
let botanicalExperience=(await db.query('SELECT * FROM cafe_loyalty_experience WHERE cafe_id=$1',[fixture.brand[0].id])).rows[0];assert.equal(botanicalExperience.nearby_message,'قريب منّا؟ اكتشف غرسة تنمو معك وهدية تُسعد أحبابك');assert.equal(botanicalExperience.reward_discount_percent,10);assert.equal(botanicalExperience.reward_validity_days,45);
await db.exec(plantMigration);assert.deepEqual((await db.query('SELECT * FROM cafe_loyalty_programs')).rows[0],plant);
await db.query('UPDATE cafe_loyalty_experience SET nearby_message=$1 WHERE cafe_id=$2',['Customer authored message',fixture.brand[0].id]);await db.exec(plantMigration);assert.equal((await db.query('SELECT nearby_message FROM cafe_loyalty_experience WHERE cafe_id=$1',[fixture.brand[0].id])).rows[0].nearby_message,'Customer authored message');
assert.equal((await db.query("SELECT reward_discount_percent FROM cafe_loyalty_experience WHERE cafe_id='00000000-0000-4000-8000-000000000001'")).rows[0].reward_discount_percent,20);
console.log('Together plan, reward and plant identity: 31 migration/replay/guard/preservation assertions passed');
}finally{await db.close()}
