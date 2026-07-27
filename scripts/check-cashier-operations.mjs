import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  cashierLoginPage,
  cashierLoginForm,
  cashierPage,
  unifiedLogin,
  authActions,
  cashierActions,
  portalUi,
  cashierData,
  clearRoute,
  customerRewards,
  experienceRewards,
  productionSchema,
  orderStatusUpgrade,
] = await Promise.all([
  read("app/cashier/login/page.tsx"),
  read("components/cashier/cashier-login-form.tsx"),
  read("app/cashier/page.tsx"),
  read("app/login/page.tsx"),
  read("app/actions/auth.ts"),
  read("app/actions/cashier.ts"),
  read("components/cashier/cashier-console-client.tsx"),
  read("lib/data/cashier.ts"),
  read("app/cashier/session/clear/route.ts"),
  read("lib/data/customer-rewards.ts"),
  read("lib/data/experience-rewards.ts"),
  read("supabase/migrations/001_barndaksa_production_schema.sql"),
  read("supabase/migrations/067_add_order_not_completed_status.sql"),
]);

assert.match(cashierActions, /loginCashierWithPassword[\s\S]+redirect\("\/cashier"\)/);
assert.doesNotMatch(cashierActions, /message: "تم تسجيل الدخول"/);
assert.match(authActions, /loginUnifiedAction[\s\S]+redirect\(result\.redirectTo\)/);
assert.match(authActions, /redirectTo: "\/admin"/);
assert.match(authActions, /redirectTo: "\/representative"/);
assert.match(authActions, /redirectTo: "\/cashier"/);
assert.match(unifiedLogin, /loginUnifiedAction/);
assert.doesNotMatch(unifiedLogin, /redirectTo === "\/cashier"|router\.push|window\.location\.assign/);

assert.match(cashierLoginPage, /hasValidCashierSession\(\)[\s\S]+redirect\("\/cashier"\)/);
assert.match(cashierPage, /redirect\("\/cashier\/login"\)/);
assert.match(cashierPage, /cashier\/session\/clear/);
assert.match(clearRoute, /maxAge: 0/);
assert.match(clearRoute, /path: "\/"/);
assert.match(cashierActions, /logoutCashier[\s\S]+redirect\("\/cashier\/login"\)/);
assert.match(cashierLoginForm, /<form onSubmit=\{submit\}/);
assert.match(cashierLoginForm, /autoComplete="username"/);
assert.match(cashierLoginForm, /autoComplete="current-password"/);

assert.match(cashierData, /cashierSessionCookie = "barndaksa_cashier_session"/);
assert.match(cashierData, /httpOnly: true/);
assert.match(cashierData, /secure: process\.env\.NODE_ENV === "production"/);
assert.match(cashierData, /sameSite: "lax"/);
assert.match(cashierData, /path: "\/"/);
assert.match(cashierData, /maxAge: 60 \* 60 \* 24 \* 30/);
assert.match(cashierData, /verify_created_session/);
assert.match(cashierData, /\.eq\("cashier_id", cashierId\)/);
assert.match(cashierData, /\.eq\("cafe_id", cafeId\)/);
assert.match(cashierData, /cashier\.active !== true/);
assert.doesNotMatch(cashierData, /rpc\("get_cashier_console"/);
assert.match(productionSchema, /CREATE TYPE order_status AS ENUM \(\s*'pending_cafe', 'accepted', 'rejected', 'cancelled_by_customer'/);
assert.match(productionSchema, /status\s+order_status NOT NULL DEFAULT 'pending_cafe'/);
assert.match(productionSchema, /cafe_id\s+UUID NOT NULL/);
assert.match(productionSchema, /deleted_at\s+TIMESTAMPTZ/);
assert.match(orderStatusUpgrade, /add value if not exists 'completed'/);
assert.match(orderStatusUpgrade, /add value if not exists 'not_completed'/);
assert.match(cashierData, /const cashierOrderStatuses = \[\s*"pending_cafe",\s*"accepted",\s*"completed",\s*"not_completed",\s*"rejected",\s*"cancelled_by_customer"/);
assert.doesNotMatch(
  cashierData.match(/const cashierOrderStatuses = \[[\s\S]*?\] as const/)?.[0] ?? "",
  /"pending"|"approved"/,
);
assert.match(cashierData, /\.limit\(40\)/);
assert.match(cashierData, /code: ordersError\.code/);
assert.match(cashierData, /message: ordersError\.message/);
assert.match(cashierData, /details: ordersError\.details/);
assert.match(cashierData, /hint: ordersError\.hint/);
assert.match(cashierData, /ordersError: dataError/);
assert.match(cashierActions, /fetchCashierOrdersAction[\s\S]+getCashierOrders/);
assert.match(portalUi, /ordersLoadError/);
assert.match(portalUi, /إعادة تحميل الطلبات/);
assert.doesNotMatch(portalUi, /fetchCashierConsoleAction/);
assert.match(cashierData, /const canHandlePending = \["pending", "pending_cafe"\]/);
assert.match(cashierData, /const canCloseAccepted = \["accepted", "approved"\]/);
assert.match(cashierData, /\.eq\("cafe_id", session\.cafeId\)/);
assert.match(cashierData, /\.eq\("status", currentStatus\)/);

const cashierRuntime = [cashierLoginPage, cashierPage, cashierActions, portalUi, cashierData].join("\n");
assert.doesNotMatch(
  cashierRuntime,
  /reservation|reservations|booking|bookings|حجز|حجوزات|operationReservations|reservationId/i,
);
assert.doesNotMatch(
  cashierRuntime,
  /operationTickets|event_tickets|confirmCashierTicketAction|cashierConfirmEventTicket|operationRewards|experience_reward_submissions/,
);

assert.match(portalUi, /"orders" \| "loyalty" \| "rewards"/);
assert.match(portalUi, /type OrderFilter = "new" \| "accepted" \| "completed" \| "all"/);
assert.match(portalUi, /rows\(order, "items", "order_items"\)/);
assert.match(portalUi, /updateCashierOrderStatusAction/);
assert.match(portalUi, /pendingOrders\.has\(id\)/);
assert.match(portalUi, /activeTab === "loyalty"/);
assert.match(portalUi, /activeTab === "rewards"/);
assert.match(portalUi, /dynamic\(/);
assert.doesNotMatch(portalUi, /JSON\.stringify/);
assert.match(portalUi, /overflow-x-hidden/);
assert.match(portalUi, /min-w-0|break-words/);

for (const source of [cashierData, customerRewards, experienceRewards]) {
  assert.match(source, /active/);
  assert.match(source, /session\.cafe_id|cafeId/);
}
assert.match(cashierData, /\.eq\("cafe_id", session\.cafeId\)/);
assert.match(customerRewards, /reward\.cafeId !== context\.cafeId/);
assert.match(experienceRewards, /rewardCafeId !== currentCafeId/);

console.log("Cashier login routing and operations checks passed.");
