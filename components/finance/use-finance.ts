"use client";

import { useRef, useState } from "react";
import { executeBrandFinanceAction, fetchBrandFinanceAction, fetchBrandFinanceHistoryAction } from "@/app/actions/brand-finance";
import { createFinanceStaffAccountAction, createSalesCashierAccountAction } from "@/app/actions/finance-access";
import type { FinanceCommand, FinanceCommandResult, FinanceDocument, FinanceJournalLine, FinanceMovement, FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceFormOperation } from "./finance-operation-form";

export function useFinance(initialSnapshot: FinanceSnapshot, slug?: string) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [historyMore, setHistoryMore] = useState({ documents: initialSnapshot.documents.length >= 500, journal: initialSnapshot.journal.length >= 2000, movements: initialSnapshot.movements.length >= 1000 });
  const historyOffsets = useRef({ documents: initialSnapshot.documents.length, journal: initialSnapshot.journal.length, movements: initialSnapshot.movements.length });
  const busy = useRef(false);
  const retry = useRef<{ fingerprint: string; command: FinanceCommand } | null>(null);
  async function load() {
    const result = await fetchBrandFinanceAction(slug);
    if (!result.ok) throw new Error(result.message || "تعذر تحديث البيانات");
    setSnapshot(result.data); setStale(false);
    setHistoryMore({ documents: result.data.documents.length >= 500, journal: result.data.journal.length >= 2000, movements: result.data.movements.length >= 1000 });
    historyOffsets.current = { documents: result.data.documents.length, journal: result.data.journal.length, movements: result.data.movements.length };
    return result.data;
  }
  async function refresh() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { await load(); }
    catch { setStale(true); setError("تعذر تحديث الأرصدة الحالية أعد التحديث قبل تنفيذ عملية جديدة"); }
    finally { busy.current = false; setPending(false); }
  }
  async function execute(operation: FinanceFormOperation, payload: Record<string, unknown>): Promise<FinanceCommandResult | null> {
    if (busy.current || stale) return null;
    busy.current = true; setPending(true); setError(""); setMessage("");
    try {
      let saved: FinanceCommandResult;
      let successMessage = "";
      if (operation === "sales_cashier_create") {
        const result = await createSalesCashierAccountAction({ name: String(payload.name), phone: String(payload.phone), password: String(payload.password) });
        if (!result.ok) { setError(result.message); return null; }
        successMessage = result.message;
        saved = { id: "staff" };
      } else if (operation === "staff_create") {
        const result = await createFinanceStaffAccountAction({ email: String(payload.email), name: String(payload.name), password: String(payload.password), role: payload.role === "manager" ? "manager" : "cashier" });
        if (!result.ok) { setError(result.message); return null; }
        saved = { id: "staff" };
      } else {
        const fingerprint = JSON.stringify({ operation, payload });
        if (!retry.current || retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, command: { operation, payload, requestId: crypto.randomUUID() } };
        const result = await executeBrandFinanceAction(retry.current.command, slug);
        if (!result.ok) { setError(result.message); return null; }
        saved = result.data; retry.current = null;
      }
      setMessage(successMessage || (saved.status === "pending" ? "تم إرسال المرتجع لاعتماد مالك العلامة لم يتم صرف أي مبلغ" : saved.number ? `تم حفظ العملية رقم ${saved.number}` : "تم حفظ العملية بنجاح"));
      try { await load(); }
      catch { setStale(true); setError("تم الحفظ لكن تعذر تحديث الأرصدة أعد التحديث ولا تكرر العملية المحفوظة"); }
      return saved;
    } catch {
      setError("تعذر تأكيد نتيجة العملية تحقق من الاتصال ثم أعد المحاولة بنفس البيانات لمنع التكرار");
      return null;
    } finally { busy.current = false; setPending(false); }
  }
  async function loadMore(kind: "documents" | "journal" | "movements") {
    if (busy.current || !snapshot.canManage || !historyMore[kind]) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await fetchBrandFinanceHistoryAction(kind, historyOffsets.current[kind], slug);
      if (!result.ok) { setError(result.message); return; }
      setSnapshot((current) => {
        const ids = new Set(current[kind].map((row) => row.id));
        const rows = result.data.rows.filter((row) => !ids.has(row.id));
        if (kind === "documents") return { ...current, documents: [...current.documents, ...rows as FinanceDocument[]] };
        if (kind === "journal") return { ...current, journal: [...current.journal, ...rows as FinanceJournalLine[]] };
        return { ...current, movements: [...current.movements, ...rows as FinanceMovement[]] };
      });
      historyOffsets.current[kind] += result.data.rows.length;
      setHistoryMore((current) => ({ ...current, [kind]: result.data.hasMore }));
    } catch { setError("تعذر تحميل العمليات الأقدم حاول مرة أخرى"); }
    finally { busy.current = false; setPending(false); }
  }
  return { snapshot, pending, stale, error, message, execute, refresh, loadMore, historyMore, clearFeedback: () => { setError(""); setMessage(""); } };
}
