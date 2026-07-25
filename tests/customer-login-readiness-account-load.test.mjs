import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("OTP screen supports changing the phone and gates navigation on readiness", async () => {
  const form = await source("components/cafe/customer-phone-auth-form.tsx");

  assert.match(form, /تغيير رقم الجوال/);
  assert.match(form, /confirmCustomerAccountReadyAction/);
  assert.match(form, /جاري تجهيز حسابك/);
  assert.match(form, /إعادة تجهيز الحساب/);
  assert.match(form, /sessionStorage\.removeItem\(storageKey\)/);
  assert.doesNotMatch(form, /router\.refresh\(\)/);
  assert.equal((form.match(/router\.replace\(/g) ?? []).length, 1);
});

test("account loading has separate core and optional actions without a global timeout", async () => {
  const action = await source("app/actions/customer-account.ts");
  const page = await source("app/c/[slug]/account/page.tsx");

  assert.match(action, /fetchCustomerAccountCoreAction/);
  assert.match(action, /fetchCustomerAccountOptionalAction/);
  assert.match(action, /optional_section_failed/);
  assert.match(action, /section: input\.section/);
  assert.doesNotMatch(page, /ACCOUNT_SNAPSHOT_TIMEOUT_MS/);
  assert.match(page, /بعض أقسام الحساب لم تكتمل/);
  assert.match(page, /إعادة تحميل الأقسام/);
});

test("readiness checks Supabase user, cafe profile, and internal session", async () => {
  const auth = await source("app/actions/auth.ts");

  assert.match(auth, /confirmCustomerAccountReadyAction/);
  assert.match(auth, /supabase\.auth\.getUser\(\)/);
  assert.match(auth, /\.eq\("cafe_id", cafe\.id\)/);
  assert.match(auth, /getCustomerProfileBySessionToken\(slug, token\)/);
});
