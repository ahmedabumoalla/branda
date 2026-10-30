"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { watchCashierSession } from "@/lib/cashier/watch-session";

export function CashierSessionGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/cashier") return;
    return watchCashierSession(window, document);
  }, [pathname]);
  return null;
}
