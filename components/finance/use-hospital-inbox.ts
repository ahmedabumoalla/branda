"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readHospitalOrdersAction } from "@/app/actions/hospital-orders";
import type { HospitalOrder } from "@/lib/commerce/hospital-orders";
import { createClient } from "@/lib/supabase/client";
import { unseenHospitalMenuOrder } from "@/lib/finance/hospital-pos-model";

export function useHospitalInbox(slug: string, cafeId: string, userId: string) {
  const [orders, setOrders] = useState<HospitalOrder[]>([]), [notice, setNotice] = useState<HospitalOrder | null>(null), [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false), queued = useRef(false), seen = useRef(new Set<string>()), alive = useRef(true), started = useRef(false);
  const refresh = useCallback(async function refreshOrders(): Promise<void> {
    if (!alive.current) return;
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    try {
      const result = await readHospitalOrdersAction(slug);
      if (!alive.current) return;
      if (!result.ok) { setFailed(true); return; }
      const initialLoad = !started.current;
      if (initialLoad) { try { const value = JSON.parse(sessionStorage.getItem(`mind-inbox:${slug}:${userId}`) ?? "[]"); if (Array.isArray(value)) value.filter(item => typeof item === "string").slice(-500).forEach(id => seen.current.add(id)); } catch { /* The in-memory seen set remains available. */ } started.current = true; }
      const fresh = initialLoad ? null : unseenHospitalMenuOrder(result.orders, seen.current);
      result.orders.forEach(order => seen.current.add(order.id));
      if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-500));
      try { sessionStorage.setItem(`mind-inbox:${slug}:${userId}`, JSON.stringify([...seen.current])); } catch { /* Never persist names, phones or order details. */ }
      setOrders(result.orders); setFailed(false); setLoaded(true); if (fresh) setNotice(fresh);
    } catch { if (alive.current) setFailed(true); }
    finally {
      inFlight.current = false;
      if (queued.current && alive.current) { queued.current = false; void refreshOrders(); }
    }
  }, [slug, userId]);
  useEffect(() => {
    alive.current = true;
    const first = setTimeout(() => void refresh(), 0);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(visible, 15000);
    let realtimeCleanup = () => {};
    try {
      const client = createClient();
      const channel = client.channel(`hospital-orders:${cafeId}:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "hospital_orders", filter: `cafe_id=eq.${cafeId}` }, () => void refresh()).subscribe();
      realtimeCleanup = () => { void client.removeChannel(channel).catch(() => {}); };
    } catch { /* Polling and visibility refresh continue if realtime is unavailable. */ }
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible);
    return () => { alive.current = false; clearTimeout(first); clearInterval(timer); realtimeCleanup(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, [refresh, cafeId, userId]);
  return { orders, notice, failed, loaded, refresh, dismiss: () => setNotice(null) };
}
