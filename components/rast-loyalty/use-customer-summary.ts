"use client";

import type { BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createCustomerSummaryController } from "@/lib/loyalty/customer-summary";

export function useCustomerSummary({ cafeId, cashierId }: { cafeId: string; cashierId: string }, phoneCountry: BrandPhoneCountry = "SA") {
  const controller = useMemo(() => createCustomerSummaryController({ phoneCountry, scope: { cafeId, cashierId } }), [cafeId, cashierId, phoneCountry]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => { controller.resume(); return () => controller.pause(); }, [controller]);
  return { state, lookup: controller.lookup, clear: controller.clear, confirm: controller.confirm };
}
