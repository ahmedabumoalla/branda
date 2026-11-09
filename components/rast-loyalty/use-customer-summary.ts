"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createCustomerSummaryController } from "@/lib/loyalty/customer-summary";

export function useCustomerSummary({ cafeId, cashierId }: { cafeId: string; cashierId: string }) {
  const controller = useMemo(() => createCustomerSummaryController({ scope: { cafeId, cashierId } }), [cafeId, cashierId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => () => controller.clear(), [controller]);
  return { state, lookup: controller.lookup, clear: controller.clear, confirm: controller.confirm };
}
