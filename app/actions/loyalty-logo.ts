"use server";

import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";
import { prepareLoyaltyLogo } from "@/lib/cafe/prepare-loyalty-logo";

export async function prepareLoyaltyLogoAction(form: FormData, scope: "settings" | "loyalty" = "settings") {
  if (scope !== "settings" && scope !== "loyalty") throw new Error("خدمة غير متاحة");
  await assertOwnerServiceEnabled(scope);
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024) throw new Error("اختر صورة شعار لا تتجاوز 10 ميجابايت");
  return prepareLoyaltyLogo(new Uint8Array(await file.arrayBuffer()));
}
