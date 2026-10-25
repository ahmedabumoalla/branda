"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lockOfflineSession } from "@/lib/finance/pos-offline-storage";

/** Logout locks cached access without deleting invoices awaiting synchronization. */
export function FinanceOfflineSessionGuard() {
  const pathname = usePathname();
  useEffect(() => {
    const lock = () => { void lockOfflineSession().catch(() => {}); window.dispatchEvent(new Event("branda:pos-session-locked")); };
    if (/(^|\/)login(\/|$)/.test(pathname)) lock();
    const { data } = createClient().auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") lock(); });
    return () => data.subscription.unsubscribe();
  }, [pathname]);
  return null;
}
