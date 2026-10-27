"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFinanceCashHandoversAction } from "@/app/actions/finance-cash-handovers";
import type { CashHandoversPage } from "@/lib/finance/cash-handovers";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceForm } from "./finance-operation-form";
import { Numeric } from "./finance-ui";
import styles from "./finance-cash-handovers.module.css";

type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean> };

export function FinanceCashHandoverForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const opening = form.operation === "shift_open";
  const slug = snapshot.cafe.slug;
  const [context, setContext] = useState<{ slug: string; attempt: number; data?: CashHandoversPage; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [count, setCount] = useState("");
  const [received, setReceived] = useState(false);
  const [drawerId, setDrawerId] = useState("");
  const preferenceKey = `branda-pos-drawer:${snapshot.cafe.id}`;
  const [handoverType, setHandoverType] = useState<"" | "next_shift" | "accountant" | "other">("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const ready = context?.slug === slug && context?.attempt === attempt;
  const data = ready ? context?.data : undefined;
  const shift = snapshot.shifts.find(item => item.id === form.values?.shiftId);
  const shiftTotals = shift as (typeof shift & { cash_sales?: number; pos_sales?: number; bank_sales?: number; supplier_payouts?: number });
  const salesTotal = (kind: "cash" | "pos" | "bank") => {
    const recorded = shiftTotals?.[`${kind}_sales`];
    if (recorded != null) return recorded;
    if (snapshot.truncated) return null;
    return snapshot.documents.filter(item => item.shift_id === shift?.id && item.kind === "sale" && snapshot.accounts.some(account => account.id === item.account_id && account.kind === kind)).reduce((sum, item) => sum + item.paid, 0);
  };
  const drawers = data?.cashierDrawers ?? snapshot.accounts.filter(account => account.is_cashier_drawer && account.active).map(account => ({ id: account.id, name: account.name, busy: false }));
  const selectedDrawer = drawers.find(drawer => drawer.id === drawerId);
  const drawerName = snapshot.accounts.find(account => account.id === (opening ? drawerId : shift?.account_id))?.name ?? selectedDrawer?.name ?? "صندوق الكاشير";
  const busy = pending || saving;
  const emptyDrawer = !opening && count !== "" && Number(count) === 0;
  useEffect(() => {
    let active = true;
    void fetchFinanceCashHandoversAction(0, slug).then(result => {
      if (!active) return;
      setContext(result.ok ? { slug, attempt, data: result.data } : { slug, attempt, error: result.message });
      if (result.ok && opening) {
        let remembered = "";
        try { remembered = localStorage.getItem(preferenceKey) ?? ""; } catch { /* Selection remains available without browser storage. */ }
        const choices = result.data.cashierDrawers;
        setDrawerId(choices ? choices.some(drawer => drawer.id === remembered) ? remembered : choices.length === 1 ? choices[0].id : "" : result.data.cashierDrawerId);
      }
    }).catch(() => { if (active) setContext({ slug, attempt, error: "تعذر تحميل بيانات صندوق الكاشير أعد المحاولة" }); });
    return () => { active = false; };
  }, [slug, attempt, opening, preferenceKey]);
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault();
    if (sending.current || busy || !data) return;
    setLocalError("");
    if (count === "" || !Number.isFinite(Number(count)) || Number(count) < 0) { setLocalError("أدخل النقدية التي عددتها فعليًا حتى لو كانت صفرًا"); return; }
    if (opening && !received) { setLocalError("أكد استلام النقدية التي عددتها قبل بدء الوردية"); return; }
    if (opening && (!selectedDrawer || selectedDrawer.busy)) { setLocalError("اختر صندوق كاشير متاحًا لهذا الجهاز"); return; }
    if (!opening && (!shift || (!emptyDrawer && !handoverType))) { setLocalError("اختر جهة تسليم النقدية قبل إقفال الوردية"); return; }
    if (!opening && !emptyDrawer && handoverType === "accountant" && !data.accountants.some(item => item.user_id === recipientUserId)) { setLocalError("اختر المحاسب المستلم من القائمة"); return; }
    if (!opening && !emptyDrawer && handoverType === "other" && (!recipientName.trim() || !recipientPhone.trim())) { setLocalError("أدخل اسم المستلم ورقم جواله"); return; }
    const payload = opening ? { accountId: drawerId, openingCash: Number(count), note: note.trim() } : { shiftId: shift!.id, countedCash: Number(count), handoverType: emptyDrawer ? "no_cash" : handoverType, ...(!emptyDrawer && handoverType === "accountant" ? { recipientUserId } : !emptyDrawer && handoverType === "other" ? { recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim() } : {}), note: note.trim() };
    sending.current = true; setSaving(true);
    try {
      const saved = await onSubmit(opening ? "shift_open" : "shift_close", payload);
      if (saved && opening) { try { localStorage.setItem(preferenceKey, drawerId); } catch { /* The shift is saved even if the device preference cannot be stored. */ } }
    }
    catch { setLocalError("تعذر تأكيد العملية أعد المحاولة بنفس البيانات"); }
    finally { sending.current = false; setSaving(false); }
  }}>
    {(error || localError) && <div className={styles.error} role="alert">{error || localError}</div>}
    {!ready ? <p role="status" className={styles.note}>جارٍ تحميل صندوق الكاشير</p> : context?.error ? <><div role="alert" className={styles.error}>{context.error}</div><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></> : null}
    <fieldset className={styles.fieldset} disabled={busy || !data}>
      <div className={styles.identity}><div><span>صندوق الوردية</span><br /><strong>{drawerName}</strong></div>{shift?.shift_number && <strong><bdi dir="ltr">#{shift.shift_number}</bdi></strong>}</div>
      {opening && <><label className={styles.field}>صندوق هذا الجهاز<select name="accountId" required value={drawerId} onChange={event => { setDrawerId(event.target.value); setCount(""); setReceived(false); setLocalError(""); }}><option value="">اختر صندوق الكاشير</option>{drawers.map(drawer => <option key={drawer.id} value={drawer.id} disabled={drawer.busy}>{drawer.name}{drawer.busy ? " — مشغول بوردية أخرى" : ""}</option>)}</select></label>{selectedDrawer?.busy && <p className={styles.error} role="alert">الصندوق المحفوظ لهذا الجهاز مشغول اختر صندوقًا آخر أو حدّث البيانات بعد إقفال ورديته</p>}</>}
      {opening ? <p className={styles.note}>يُحفظ اختيار الصندوق على هذا الجهاز بعد بدء الوردية عد نقدية هذا الصندوق فقط ثم سجّل المبلغ</p> : <><div className={styles.summary}><div><span>النقدية المتوقعة عند الإقفال</span><strong><Numeric value={shift?.expected_cash ?? 0} money /></strong></div>{([["cash", "المبيعات النقدية المحصلة"], ["pos", "مبيعات الشبكة المحصلة"], ["bank", "المبيعات المحصلة بتحويل بنكي"]] as const).map(([kind, label]) => <div key={kind}><span>{label}</span><strong>{salesTotal(kind) == null ? "غير متاح في الملخص الحالي" : <Numeric value={salesTotal(kind)!} money />}</strong></div>)}</div><p className={styles.note}>مبالغ المبيعات المحصلة قبل المرتجعات والمصروفات رصيد الإقفال المتوقع يشمل حركات الصندوق</p></>}
      <label className={styles.field}>{opening ? "النقدية المعدودة عند البداية" : "النقدية الموجودة في الصندوق"}<input name={opening ? "openingCash" : "countedCash"} required type="number" min="0" max="999999999" step="0.01" inputMode="decimal" dir="ltr" value={count} onChange={event => { setCount(event.target.value); setReceived(false); }} /><small>عد النقد فقط وأدخل صفرًا إذا كان الصندوق فارغًا</small></label>
      {opening && count !== "" && Number(count) >= 0 && <label className={styles.note}><input name="receivedCash" type="checkbox" required checked={received} onChange={event => setReceived(event.target.checked)} /> أؤكد أنني عددت واستلمت مبلغ <bdi dir="ltr">{Number(count).toFixed(2)}</bdi> ر س في الصندوق</label>}
      {opening && <p className={styles.note}>المبلغ السابق مخفي لضمان العد المستقل أي فرق يُسجل في حركة الصندوق مع تنبيه مالك العلامة</p>}
      {emptyDrawer && <p className={styles.note}>الصندوق فارغ ستُقفل الوردية دون تسليم نقدي أو تحديد مستلم</p>}
      {!opening && !emptyDrawer && <>
        <label className={styles.field}>تسليم نقدية الوردية<select name="handoverType" required value={handoverType} onChange={event => { setHandoverType(event.target.value as typeof handoverType); setRecipientUserId(""); setRecipientName(""); setRecipientPhone(""); }}><option value="">اختر جهة التسليم</option><option value="next_shift">للموظف في الوردية التالية</option><option value="accountant">للمحاسب</option><option value="other">لمستلم آخر</option></select></label>
        {handoverType === "next_shift" && <p className={styles.note}>{shift?.account_id !== data?.cashierDrawerId ? "يُحوّل المبلغ بقيد موثق من صندوق الوردية الحالي إلى صندوق كاشير الفرع للوردية التالية" : "يُسلّم المبلغ إلى صندوق كاشير الفرع حتى يعدّه موظف الوردية التالية ويبدأ ورديته"}</p>}
        {handoverType === "accountant" && <label className={styles.field}>المحاسب المستلم<select name="recipientUserId" required value={recipientUserId} onChange={event => setRecipientUserId(event.target.value)}><option value="">اختر المحاسب</option>{data?.accountants.map(item => <option key={item.user_id} value={item.user_id}>{item.name}</option>)}</select>{data?.accountants.length === 0 && <small>لا يوجد محاسب نشط في قائمة الفريق</small>}</label>}
        {handoverType === "other" && <div className={styles.fields}><label className={styles.field}>اسم المستلم<input name="recipientName" required maxLength={100} value={recipientName} onChange={event => setRecipientName(event.target.value)} /></label><label className={styles.field}>رقم جوال المستلم<input name="recipientPhone" required type="tel" maxLength={30} dir="ltr" value={recipientPhone} onChange={event => setRecipientPhone(event.target.value)} /></label></div>}
        {["accountant", "other"].includes(handoverType) && <p className={styles.note}>يُسجل كامل النقد المعدود كتسليم معلق حتى تأكيد استلامه بسند قبض في الخزينة أو البنك</p>}
      </>}
      <label className={styles.field}>ملاحظة اختيارية<textarea name="note" maxLength={500} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
    </fieldset>
    <div className={styles.footer}><button type="submit" className={styles.primary} disabled={busy || !data || count === "" || (opening ? !received || !selectedDrawer || selectedDrawer.busy : (!emptyDrawer && !handoverType) || !shift)}>{busy ? "جارٍ الحفظ" : opening ? "بدء الوردية" : emptyDrawer ? "إقفال الوردية دون نقدية" : "إقفال الوردية وتسجيل التسليم"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>إلغاء</button></div>
  </form>;
}
