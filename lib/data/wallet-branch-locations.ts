import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { selectBranchWalletLocations } from "@/lib/wallet/branch-locations";

/** Internal only, called after the wallet member/brand access guard */
export const loadWalletBranchLocations = cache(async (cafeId: string) => {
  const features = await getCafeFeatureCodes(cafeId);
  // Menu accounts see branch management even without the legacy branches add-on
  if (!featureCodesAllow(features, "branches") && !featureCodesAllow(features, "menu")) return undefined;
  const { data, error } = await createAdminClient().from("branches")
    .select("id,cafe_id,name,lat,lng,active,deleted_at,is_primary,sort_order,welcome_message,wallet_location_managed")
    .eq("cafe_id", cafeId).order("is_primary", { ascending: false }).order("sort_order").order("id");
  if (error) throw new Error("تعذر تحميل مواقع الفروع لبطاقة الولاء");
  // Retain inactive/deleted rows only to know that branch locations were configured
  // and prevent the legacy single location from resurrecting a closed branch
  const selected = selectBranchWalletLocations((data ?? []).filter(row => row.cafe_id === cafeId).map(row => ({
    id: String(row.id), name: String(row.name ?? ""), lat: row.lat, lng: row.lng,
    active: row.active === true, deletedAt: row.deleted_at as string | null,
    primary: row.is_primary === true, sortOrder: Number(row.sort_order ?? 0),
    welcomeMessage: row.welcome_message as string | null,
    walletLocationManaged: row.wallet_location_managed === true,
  })));
  return selected.configured ? selected.locations : undefined;
});
