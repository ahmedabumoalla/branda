import "server-only";

import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

/** Call only after deriving the Rast cafe from a validated owner or cashier session. */
export async function assertRastLoyaltyEntitlement(cafeId: string) {
  if (!featureCodesAllow(await getCafeFeatureCodes(cafeId), "loyalty")) {
    throw new Error("برنامج الولاء غير متاح حاليًا.");
  }
}
