"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FinanceCommandResult, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { createFinanceReceiptPreview } from "@/lib/finance/receipt-preview";
import { drainOfflineSales, pendingSales, posScope, projectOfflineSales, type OfflineSale, type PosSyncResponse } from "@/lib/finance/pos-offline";
import { acknowledgeOfflineSale, flagOfflineConflict, getOfflineSession, listOfflineSales, lockOfflineSession, retryOfflineConflicts, saveOfflineSnapshot, storeOfflineSale, withOfflineSyncLease } from "@/lib/finance/pos-offline-storage";
import { cachedReceiptBrand, prepareOfflineAssets } from "@/lib/finance/pos-offline-assets";
import type { ReceiptBrand } from "./finance-receipt-print";
import type { FinanceFormOperation } from "./finance-operation-form";
import { useFinance } from "./use-finance";

export function usePosFinance(initialSnapshot: FinanceSnapshot, slug?: string, offlineEntry = false) {
  const base = useFinance(initialSnapshot, slug);
  const [serverSnapshot, setServerSnapshot] = useState(initialSnapshot);
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const loginRedirected = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assetsStatus, setAssetsStatus] = useState("جار تجهيز المنتجات والطباعة للعمل دون اتصال");
  const [brand, setBrand] = useState<ReceiptBrand | null>(null);
  const scope = posScope(initialSnapshot), targetSlug = initialSnapshot.cafe.slug;
  useEffect(() => {
    if (!blocked || loginRedirected.current) return;
    loginRedirected.current = true;
    // Replace the stale POS document without clearing durable invoices or closing the shift.
    window.location.replace(`/finance/${encodeURIComponent(targetSlug)}/login`);
  }, [blocked, targetSlug]);
  const snapshot = useMemo(() => projectOfflineSales(serverSnapshot, sales), [serverSnapshot, sales]);
  const current = useRef({ snapshot, sales, ready, blocked });
  useLayoutEffect(() => { current.current = { snapshot, sales, ready, blocked }; }, [snapshot, sales, ready, blocked]);
  const deviceId = useRef<string | null>(null);
  const busy = useRef(false), syncBusy = useRef(false), alive = useRef(true);
  const checkoutRetry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const endpoint = `/api/finance/${encodeURIComponent(targetSlug)}/pos-sync`;
  const notify = () => channel.current?.postMessage("changed");
  const reload = useCallback(async () => {
    const [session, rows] = await Promise.all([getOfflineSession(scope), listOfflineSales(scope)]);
    if (!alive.current) return;
    if (session) setServerSnapshot(session.snapshot);
    setSales(rows);
  }, [scope]);
  const sync = useCallback(async () => {
    if (syncBusy.current || !current.current.ready || !navigator.onLine) return;
    syncBusy.current = true; if (alive.current) setSyncing(true);
    try {
      await withOfflineSyncLease(scope, async () => {
        const auth = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const body = await auth.json();
        if (!auth.ok) {
          if (auth.status === 401 || auth.status === 403) { setBlocked(true); setError(body.message); await lockOfflineSession(); }
          else setConnected(false);
          return;
        }
        if (posScope(body.snapshot) !== scope) { setBlocked(true); setError("سجل الدخول بنفس حساب الموظف لإكمال مزامنة فواتيره"); await lockOfflineSession(); return; }
        setConnected(true); setBlocked(false);
        // Do not mark an acknowledgement reflected until this fresh snapshot includes it.
        await saveOfflineSnapshot(body.snapshot, true, true);
        await drainOfflineSales({
          list: () => listOfflineSales(scope),
          send: async sale => {
            try {
              const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId: initialSnapshot.cafe.id, userId: initialSnapshot.userId, command: sale.command }), signal: AbortSignal.timeout(25_000) });
              if (response.status >= 500) { setConnected(false); return { ok: false, kind: "retry", message: "المزامنة ستُستأنف تلقائيًا" }; }
              return await response.json() as PosSyncResponse;
            } catch (reason) { setConnected(false); throw reason; }
          },
          acknowledge: acknowledgeOfflineSale,
          conflict: flagOfflineConflict,
          authRequired: message => { setBlocked(true); setError(message); void lockOfflineSession(); },
        });
        // Telemetry is advisory and never controls durable sale acknowledgement.
        // Report closed shifts too when this device still has unresolved local sales.
        try {
          if (!deviceId.current) {
            const key = "branda-pos-monitor-device";
            deviceId.current = localStorage.getItem(key) || crypto.randomUUID();
            localStorage.setItem(key, deviceId.current);
          }
          const local = pendingSales(await listOfflineSales(scope));
          const shifts = new Set<string>([...body.snapshot.shifts.filter((s: { user_id: string; status: string }) => s.user_id === initialSnapshot.userId && s.status !== "closed").map((s: { id: string }) => s.id), ...local.map(s => String(s.command.payload.shiftId))]);
          await Promise.all([...shifts].map(shiftId => {
            const rows = local.filter(s => s.command.payload.shiftId === shiftId);
            return fetch(endpoint.replace("pos-sync", "shift-heartbeat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftId, deviceId: deviceId.current, pending: rows.length, conflicts: rows.filter(s => s.status === "conflict").length }), signal: AbortSignal.timeout(8000) });
          }));
        } catch { /* Missing heartbeat turns yellow without blocking offline storage or retries. */ }
        await reload(); notify();
      });
    } catch { if (alive.current) setConnected(false); }
    finally { syncBusy.current = false; if (alive.current) setSyncing(false); }
  }, [endpoint, initialSnapshot.cafe.id, initialSnapshot.userId, reload, scope]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        if (!offlineEntry) await saveOfflineSnapshot(initialSnapshot, true);
        const session = await getOfflineSession(scope);
        if (alive.current) setConnected(navigator.onLine);
        if (!session) throw new Error("افتح الكاشير مرة أثناء الاتصال لتجهيزه على هذا الجهاز");
        await reload(); if (!alive.current) return; setReady(true);
        setBrand(await cachedReceiptBrand(initialSnapshot));
        if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
        if (navigator.onLine) {
          const assets = await prepareOfflineAssets(initialSnapshot);
          if (alive.current) { setBrand(assets.brand); setAssetsStatus(assets.failedImages ? `حُفظت الفواتير والمنتجات محليًا تعذر تحميل ${assets.failedImages} من الصور` : "المنتجات والصور والطباعة جاهزة دون اتصال"); }
        } else setAssetsStatus("تعمل على البيانات المحفوظة بهذا الجهاز");
      } catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : "تعذر التخزين المحلي تحقق من مساحة الجهاز وإعدادات المتصفح"); setAssetsStatus("لم يكتمل تجهيز العمل دون اتصال"); } }
    })();
    if (typeof BroadcastChannel !== "undefined") { channel.current = new BroadcastChannel(`branda-pos:${scope}`); channel.current.onmessage = () => void reload().catch(() => {}); }
    const online = () => { setConnected(true); void sync(); };
    const offline = () => setConnected(false);
    const locked = () => { setBlocked(true); setError("سجل الدخول مجددًا للوصول إلى الكاشير فواتير الجهاز محفوظة"); };
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visible);
    window.addEventListener("branda:pos-session-locked", locked);
    const timer = setInterval(() => void sync(), 15_000);
    return () => { alive.current = false; clearInterval(timer); channel.current?.close(); channel.current = null; window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); window.removeEventListener("branda:pos-session-locked", locked); };
  }, [initialSnapshot, offlineEntry, reload, scope, sync]);
  useEffect(() => { if (ready) void sync(); }, [ready, sync]);

  async function execute(operation: FinanceFormOperation, payload: Record<string, unknown>): Promise<FinanceCommandResult | null> {
    if (busy.current || blocked || !ready) return null;
    if (operation !== "sale") {
      if (!navigator.onLine || !connected) { setError("هذه العملية تحتاج اتصالًا بالإنترنت المبيعات والفواتير المحلية محفوظة"); return null; }
      if (pendingSales(await listOfflineSales(scope)).length) { setError("انتظر مزامنة الفواتير قبل إقفال الوردية أو تعديل أرصدتها"); return null; }
      const result = await base.execute(operation, payload);
      if (result) await sync();
      return result;
    }
    busy.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const data = current.current.snapshot;
      const shift = data.shifts.find(row => row.id === payload.shiftId && row.user_id === data.userId);
      if (!shift || shift.status !== "open") throw new Error("الوردية مقفلة أو غير متاحة حدث الكاشير قبل متابعة البيع");
      if (shift.supervisor_paused) throw new Error("الوردية موقوفة إداريًا تواصل مع المسؤول لاستئناف البيع");
      if (payload.redeemRewardId && !connected) throw new Error("صرف المكافأة يحتاج اتصالًا للتحقق من عدم استخدامها يمكنك حفظ البيع دون صرفها");
      const lines = (payload.lines as { productId: string; quantity: number }[]).map(line => {
        const product = data.products.find(product => product.id === line.productId);
        if (!product) throw new Error("تعذر العثور على صنف في السلة");
        return { product, quantity: line.quantity };
      });
      const document = createFinanceReceiptPreview({ lines, settings: data.settings, discount: Number(payload.discount), paymentKind: payload.accountId ? data.accounts.find(account => account.id === payload.accountId)?.kind ?? "cash" : "credit", accountId: payload.accountId as string, partyId: payload.partyId as string, customerPhone: payload.customerPhone as string, note: String(payload.note ?? ""), createdAt: new Date().toISOString() });
      document.shift_id = String(payload.shiftId); document.warehouse_id = String(payload.warehouseId);
      const fingerprint = JSON.stringify(payload);
      if (!checkoutRetry.current || checkoutRetry.current.fingerprint !== fingerprint) checkoutRetry.current = { fingerprint, requestId: crypto.randomUUID() };
      const sale = await storeOfflineSale(scope, payload, document, checkoutRetry.current.requestId);
      // Durable commit is success even if a subsequent read or broadcast fails.
      setSales(rows => rows.some(row => row.id === sale.id) ? rows : [...rows, sale]);
      await reload().catch(() => {});
      try { notify(); } catch { /* Another tab may have closed during commit. */ }
      checkoutRetry.current = null;
      setMessage("حُفظت الفاتورة على الجهاز وستُزامن تلقائيًا عند توفر الاتصال");
      void sync();
      return { id: sale.document.id, localReference: sale.localReference, offline: true };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ الفاتورة على الجهاز لا تعِد التحصيل قبل التحقق"); return null; }
    finally { busy.current = false; setSaving(false); }
  }
  return {
    ...base, snapshot, execute, pending: base.pending || saving, stale: blocked || !ready,
    error: error || base.error, message: message || base.message,
    refresh: async () => { setError(""); await sync(); },
    clearFeedback: () => { setError(""); setMessage(""); base.clearFeedback(); },
    offline: { ready, connected, syncing, blocked, assetsStatus, brand, sales, pending: pendingSales(sales),
      retry: async () => { setError(""); await retryOfflineConflicts(scope); await sync(); },
      logout: async () => { if (pendingSales(await listOfflineSales(scope)).length) throw new Error("زامن الفواتير المحفوظة على الجهاز قبل تسجيل الخروج"); await lockOfflineSession(); },
    },
  };
}
