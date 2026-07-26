import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("OTP screen changes phone and transitions directly from the completed action", async () => {
  const form = await source("components/cafe/customer-phone-auth-form.tsx");

  assert.match(form, /تغيير رقم الجوال/);
  assert.doesNotMatch(form, /confirmCustomerAccountReadyAction/);
  assert.doesNotMatch(form, /prepareAccount/);
  assert.doesNotMatch(form, /جاري تجهيز حسابك/);
  assert.match(form, /primeCustomerSessionCache\(slug, result\.session\)/);
  assert.match(form, /sessionStorage\.removeItem\(storageKey\)/);
  assert.doesNotMatch(form, /router\.refresh\(\)/);
  assert.equal((form.match(/router\.replace\(/g) ?? []).length, 1);
});

test("account loading uses cache, a minimal core, and independent lazy sections", async () => {
  const action = await source("app/actions/customer-account.ts");
  const page = await source("app/c/[slug]/account/page.tsx");

  assert.match(action, /fetchCustomerAccountCoreAction/);
  assert.doesNotMatch(action, /fetchCustomerAccountOptionalAction/);
  assert.match(action, /fetchCustomerOrdersSectionAction/);
  assert.doesNotMatch(action, /fetchCustomerReservationsSectionAction/);
  assert.match(action, /fetchCustomerLoyaltySectionAction/);
  assert.match(action, /optional_section_failed/);
  assert.match(page, /peekCachedCustomerSession\(slug\)/);
  assert.match(page, /IntersectionObserver/);
  assert.doesNotMatch(page, /ACCOUNT_SNAPSHOT_TIMEOUT_MS/);
  assert.match(page, /إعادة تحميل الأقسام/);
});

test("the login path has no readiness action", async () => {
  const auth = await source("app/actions/auth.ts");

  assert.doesNotMatch(auth, /confirmCustomerAccountReadyAction/);
});
