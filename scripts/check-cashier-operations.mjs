import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [adminPage, adminUi, portalUi, cashierData, customerRewards, experienceRewards] =
  await Promise.all([
    read("app/dashboard/cashier/page.tsx"),
    read("components/dashboard/pages/operational-cashier-page.tsx"),
    read("components/cashier/cashier-console-client.tsx"),
    read("lib/data/cashier.ts"),
    read("lib/data/customer-rewards.ts"),
    read("lib/data/experience-rewards.ts"),
  ]);

assert.match(adminPage, /getOwnerCashierOperations/);
assert.doesNotMatch(adminPage, /getOwnerLoyaltyCardsDashboard/);
assert.doesNotMatch(adminUi, /BarcodeCameraScanner|recordLoyaltyCardOperationAction|ownerOperationalRedeem/);
assert.doesNotMatch(adminUi, /JSON\.stringify|cashier\.temporaryPassword/);
assert.match(adminUi, /dashboard\.activities\.slice\(0, 5\)/);
assert.match(adminUi, /setLoyaltyCashierStatusAction|createLoyaltyCashierAction/);
assert.match(adminUi, /تظهر مرة واحدة/);
assert.match(adminUi, /overflow-x-auto|min-w-\[760px\]/);

assert.match(portalUi, /"orders" \| "loyalty" \| "rewards"/);
assert.match(portalUi, /dynamic\(/);
assert.match(portalUi, /activeTab === "loyalty"/);
assert.match(portalUi, /activeTab === "rewards"/);
assert.match(portalUi, /updateCashierOrderStatusAction|cashierScanLoyaltyAction|cashierRedeemExperienceRewardAction/);
assert.match(portalUi, /if \(pendingKey\) return/);

for (const source of [cashierData, customerRewards, experienceRewards]) {
  assert.match(source, /active/);
  assert.match(source, /session\.cafe_id|cafeId/);
}
assert.match(cashierData, /\.eq\("cafe_id", session\.cafeId\)/);
assert.match(customerRewards, /reward\.cafeId !== context\.cafeId/);
assert.match(experienceRewards, /rewardCafeId !== currentCafeId/);

console.log("Cashier operations static checks passed.");
