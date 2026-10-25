"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Gift, RefreshCw, WalletCards } from "lucide-react";
import { fetchFinancePosCustomerAction, fetchFinancePosPagerAction, updateFinancePosPagerAction } from "@/app/actions/finance-pos-customer";
import { normalizePosCustomerPhone, type FinancePosCustomer, type FinancePosCustomerResult } from "@/lib/finance/pos-customer";
import type { PagerPage } from "@/lib/pager/types";
import { Modal } from "@/components/dashboard/ui/modal";
import { PagerOrderCard } from "@/components/pager/pager-order-card";
import styles from "./finance.module.css";
import s from "./finance-pos-customer.module.css";

export function financePosCustomerNotice(result?: FinancePosCustomerResult) {
  if (!result) return "";
  const messages = [result.pagerOrderId ? "أُضيفت الفاتورة إلى البيجر" : ""];
  if (result.loyaltyStatus === "stamped") messages.push("سُجل ختم الولاء للعميل");
  if (result.loyaltyStatus === "pending_enrollment") messages.push("حُفظ ختم الفاتورة لحين إكمال تسجيل بطاقة الولاء");
  if (result.rewardRedeemedId) messages.push("تم صرف المكافأة وإقفالها");
  if (result.notificationStatus === "pending") messages.push("رسالة رابط البطاقة بانتظار الإرسال");
  return messages.filter(Boolean).join(" · ");
}

export function usePosCustomer(slug?: string) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ data: FinancePosCustomer; slug?: string } | null>(null);
  const [rewardId, setRewardId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const normalized = normalizePosCustomerPhone(phone);
  const matching = result?.slug === slug && result?.data.phone === normalized ? result.data : null;

  function changePhone(value: string) {
    generation.current += 1;
    setPhone(value); setResult(null); setRewardId(""); setError(""); setLoading(false);
  }
  useEffect(() => {
    const request = ++generation.current;
    if (!normalized) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await fetchFinancePosCustomerAction(normalized, slug);
        if (request !== generation.current) return;
        if (next.ok) { setResult({ data: next.data, slug }); setError(""); }
        else { setResult(null); setRewardId(""); setError(next.message); }
      } catch {
        if (request === generation.current) { setResult(null); setRewardId(""); setError("تعذر التحقق من بطاقة العميل أعد المحاولة"); }
      } finally { if (request === generation.current) setLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [normalized, phone, slug, attempt]);

  function payload(): Record<string, unknown> {
    if (!phone.trim()) return {};
    if (!normalized) throw new Error("أدخل رقم جوال صحيحًا أو اتركه فارغًا لإصدار الفاتورة بدون رقم");
    if (rewardId && !matching?.rewards.some((reward) => reward.id === rewardId)) throw new Error("حدّث بطاقة العميل قبل صرف المكافأة");
    return { customerPhone: normalized, ...(rewardId ? { redeemRewardId: rewardId } : {}) };
  }
  return { phone, customer: matching, rewardId, loading, error, normalized, changePhone, selectReward: setRewardId, retry: () => { setError(""); setAttempt((value) => value + 1); }, reset: () => changePhone(""), payload };
}

export function FinancePosCustomerField({ state, disabled }: { state: ReturnType<typeof usePosCustomer>; disabled: boolean }) {
  const customer = state.customer;
  return <section className={s.customer} aria-label="جوال العميل والولاء">
    <label className={s.phoneLabel}><span>رقم جوال العميل <small>اختياري</small></span><input name="posCustomerPhone" type="tel" inputMode="tel" autoComplete="off" dir="ltr" maxLength={24} placeholder="05xxxxxxxx" value={state.phone} disabled={disabled} onChange={(event) => state.changePhone(event.target.value)} aria-describedby="pos-customer-help" aria-invalid={!!state.phone.trim() && !state.normalized} /></label>
    <p className={s.hint} id="pos-customer-help">بدون رقم تُصدر الفاتورة كالمعتاد</p>
    {!!state.phone.trim() && !state.normalized && <p className={s.error}>أدخل رقم جوال سعودي صحيحًا</p>}
    <div aria-live="polite" aria-busy={state.loading}>
      {state.loading && <p className={s.hint}>جار التحقق من بطاقة الولاء</p>}
      {state.error && <div className={s.feedback}><p>{state.error}</p><button type="button" className={styles.secondary} disabled={disabled || state.loading} onClick={state.retry}>إعادة التحقق</button></div>}
      {customer && <div className={s.loyalty}>
        <div className={s.heading}><WalletCards size={19} aria-hidden="true" /><strong>{customer.member?.name || "ولاء العميل"}</strong></div>
        {customer.loyaltyEnabled ? customer.member ? <><div className={s.progress}><span>أختام البطاقة</span><strong><bdi>{customer.member.stampsInCycle} / {customer.member.targetStamps}</bdi></strong></div><p className={s.hint}>يُسجل ختم لهذه الفاتورة بعد حفظ البيع</p></> : <p className={s.hint}>يُرسل رابط بطاقة الولاء بعد حفظ البيع ويُضاف ختم الفاتورة عند إكمال التسجيل</p> : <p className={s.hint}>الولاء غير مفعّل لهذه العلامة</p>}
        {customer.pagerEnabled ? <p className={s.pagerHint}><BellRing size={15} aria-hidden="true" />تُضاف الفاتورة إلى طلبات البيجر بعد الحفظ</p> : <p className={s.hint}>البيجر غير مفعّل لهذه العلامة</p>}
        {!!customer.rewards.length && <div className={s.reward}><strong><Gift size={17} aria-hidden="true" />مكافأة جاهزة للعميل</strong><label><span>صرف مكافأة مع هذه الفاتورة</span><select name="posRedeemReward" value={state.rewardId} disabled={disabled || state.loading} onChange={(event) => state.selectReward(event.target.value)}><option value="">عدم صرف مكافأة الآن</option>{customer.rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.title}</option>)}</select></label><p className={s.hint}>عند اختيارها تُقفل المكافأة بعد حفظ البيع ولا يُغيّر سعر الفاتورة تلقائيًا</p></div>}
      </div>}
    </div>
  </section>;
}

export function FinancePosPager({ slug, refreshKey }: { slug?: string; refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PagerPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const sequence = useRef(0);
  const mutating = useRef(false);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { if (!mutating.current && document.visibilityState === "visible") setReload((value) => value + 1); }, 15000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    const request = ++sequence.current;
    if (!open) return;
    let active = true;
    void (async () => {
      setLoading(true); setError("");
      try {
        const result = await fetchFinancePosPagerAction({ page, status: "active" }, slug);
        if (!active || request !== sequence.current) return;
        if (result.ok) setData(result.data); else { setData(null); setError(result.message); }
      } catch { if (active && request === sequence.current) { setData(null); setError("تعذر تحميل طلبات البيجر أعد المحاولة"); } }
      finally { if (active && request === sequence.current) setLoading(false); }
    })();
    return () => { active = false; };
  }, [open, page, slug, refreshKey, reload]);
  async function change(id: string, status: "ready" | "received" | "cancelled") {
    if (mutating.current) return;
    mutating.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await updateFinancePosPagerAction(id, status, slug);
      if (!result.ok) { setError(result.message); return; }
      setCancelId(null); setNotice(status === "ready" ? "تم الاستدعاء وبدأت تنبيهات الجاهزية" : status === "received" ? "تم تأكيد الاستلام وإيقاف التذكير" : "ألغي طلب البيجر وتوقفت تنبيهاته");
      setReload((value) => value + 1);
    } catch { setError("تعذر تأكيد الإجراء حدّث القائمة قبل المحاولة مرة أخرى"); }
    finally { mutating.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className={styles.secondary} onClick={() => { setData(null); setNotice(""); setPage(0); setOpen(true); }}><BellRing size={17} aria-hidden="true" />استدعاء البيجر</button>
    <Modal open={open} title="استدعاء البيجر" onClose={() => { if (!busy) { setOpen(false); setCancelId(null); } }} panelClassName={s.dialog}>
      <div className={s.pager}>
        <div className={s.toolbar}><p className={s.hint}>طلبات العلامة من البيجر والكاشير في قائمة واحدة</p><button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" />تحديث</button></div>
        {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
        {loading && <p className={s.empty} role="status">جار تحميل طلبات البيجر</p>}
        {!loading && !error && data && !data.orders.length && <p className={s.empty}>لا توجد طلبات بانتظار الاستدعاء أو الاستلام</p>}
        {!loading && data?.orders.map((order) => <div key={order.id}><PagerOrderCard order={order} busy={busy} onChange={(id, status) => status === "cancelled" ? setCancelId(id) : void change(id, status)} />{cancelId === order.id && <div className={s.confirm} role="alert"><p>إلغاء طلب البيجر وإيقاف تنبيهاته؟ تبقى فاتورة البيع محفوظة</p><div className={styles.actions}><button type="button" className={styles.danger} disabled={busy} onClick={() => void change(order.id, "cancelled")}>تأكيد الإلغاء</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setCancelId(null)}>تراجع</button></div></div>}</div>)}
        {data && <nav className={s.toolbar} aria-label="صفحات طلبات البيجر"><button type="button" className={styles.secondary} disabled={loading || busy || page === 0} onClick={() => { setCancelId(null); setPage((value) => value - 1); }}>السابق</button><span className={s.hint}>صفحة {page + 1}</span><button type="button" className={styles.secondary} disabled={loading || busy || (page + 1) * data.pageSize >= data.total} onClick={() => { setCancelId(null); setPage((value) => value + 1); }}>التالي</button></nav>}
      </div>
    </Modal>
  </>;
}
