import "server-only";

import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export async function assertOwnerServiceEnabled(feature: "menu" | "offers" | "settings") {
  if (!featureCodesAllow(await getOwnerFeatureCodes(), feature)) {
    throw new Error("هذه الخدمة غير مفعلة في اشتراك العلامة الحالي");
  }
}
