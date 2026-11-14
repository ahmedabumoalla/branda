"use client";

import { useState } from "react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { getPrimaryFinanceAccount } from "@/lib/finance/brand-finance";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import type { FinanceForm } from "./finance-operation-form";
import { Field } from "./finance-ui";
import { PosNumeric as Numeric, useFinancePosLocale } from "./finance-pos-locale";
import styles from "./finance.module.css";

type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean> };

export function FinanceShiftForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const { t, dir, language } = useFinancePosLocale();
  const { operation, values = {} } = form;
  const accounts = snapshot.accounts.filter(account => account.active && account.kind === "cash");
  const [accountId, setAccountId] = useState(String(values.accountId ?? getPrimaryFinanceAccount(accounts.filter(account => !snapshot.drawerAvailability?.find(drawer => drawer.account_id === account.id)?.busy))?.id ?? ""));
  const [count, setCount] = useState("");
  const [received, setReceived] = useState(false);
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const shift = snapshot.shifts.find(item => item.id === values.shiftId);
  const opening = operation === "shift_open";
  const payout = operation === "supplier_payout";
  const available = snapshot.drawerAvailability?.find(drawer => drawer.account_id === accountId);
  const expected = opening || operation === "shift_accept" ? null : Number(values.expectedCash ?? shift?.expected_cash ?? 0);
  const variance = count === "" || expected === null ? null : Math.round((Number(count) - expected) * 100) / 100;
  const busy = pending || uploading;
  return <form dir={dir} lang={language} className={styles.form} onSubmit={async event => {
    event.preventDefault(); if (busy) return; setLocalError("");
    if (operation === "shift_accept" && (!received || count === "")) { setLocalError(t("عد النقدية وأكد استلامها قبل بدء الوردية")); return; }
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = { ...values, note: String(data.get("note") ?? "").trim() };
    if (payout) { payload.supplierName = String(data.get("supplierName") ?? "").trim(); payload.supplierPhone = String(data.get("supplierPhone") ?? "").trim(); payload.amount = Number(data.get("amount")); payload.attachmentIds = files.map(file => file.id); if (!payload.supplierName || !payload.supplierPhone || !Number.isFinite(payload.amount) || Number(payload.amount) <= 0) { setLocalError(t("أدخل اسم المورد ورقم جواله ومبلغًا صحيحًا")); return; } }
    else { if (count === "" || !Number.isFinite(Number(count)) || Number(count) < 0) { setLocalError(t("أدخل النقدية التي عددتها فعليًا حتى لو كانت صفرًا")); return; } payload[opening ? "openingCash" : "countedCash"] = Number(count); if (opening) payload.accountId = accountId; if (operation === "shift_handover") payload.toUserId = String(data.get("toUserId") ?? ""); }
    await onSubmit(operation, payload);
  }}>
    {(error || localError) && <div className={styles.error} role="alert">{t(error || localError)}</div>}
    <fieldset className={styles.shiftFieldset} disabled={busy}>
      {payout ? <>
        <p className={styles.notice}>{t("يُسجل سند صرف ويُخصم المبلغ من صندوق ورديتك ويظهر في تقرير الإقفال")}</p>
        <div className={styles.fields}><Field label={t("اسم المورد")}><input name="supplierName" required maxLength={150} autoComplete="organization" /></Field><Field label={t("رقم جوال المورد")}><input name="supplierPhone" type="tel" required maxLength={30} dir="ltr" autoComplete="tel" /></Field><Field label={t("المبلغ المدفوع من الصندوق")}><input name="amount" type="number" required min="0.01" max="999999999" step="0.01" inputMode="decimal" /></Field><div className={styles.shiftTotal}><span>{t("رصيد الصندوق الحالي")}</span><strong><Numeric value={shift?.expected_cash ?? 0} money /></strong></div></div>
        <Field label={t("بيان السداد اختياري")}><textarea name="note" maxLength={500} placeholder={t("رقم فاتورة المورد أو سبب السداد")} /></Field>
      </> : <>
        {opening && <Field label={t("صندوق الوردية")}><select required value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">{t("اختر الصندوق")}</option>{accounts.map(account => { const drawer = snapshot.drawerAvailability?.find(item => item.account_id === account.id); return <option key={account.id} value={account.id} disabled={drawer?.busy}>{account.name}{drawer?.busy ? t(" — مشغول بوردية أخرى") : ""}</option>; })}</select></Field>}
        {!opening && operation !== "shift_accept" && shift && <div className={styles.shiftSummaryGrid}>{[[t("المبيعات النقدية"), shift.cash_sales], [t("مبيعات الشبكة"), shift.pos_sales], [t("التحويلات البنكية"), shift.bank_sales], [t("سداد الموردين"), shift.supplier_payouts]].map(([label, amount]) => <div key={String(label)}><span>{label}</span><strong><Numeric value={Number(amount ?? 0)} money /></strong></div>)}</div>}
        <div className={opening ? undefined : styles.fields}>{expected !== null && <div className={styles.shiftTotal}><span>{t("النقدية المتوقعة في الصندوق")}</span><strong><Numeric value={expected} money /></strong></div>}<Field label={opening ? t("النقدية المعدودة عند البداية") : operation === "shift_accept" ? t("النقدية المستلمة فعليًا") : t("النقدية الموجودة في الصندوق")} hint={t("عد النقد فقط ثم أدخل المبلغ")}><input type="number" required min="0" max="999999999" step="0.01" inputMode="decimal" value={count} onChange={event => { setCount(event.target.value); setReceived(false); }} /></Field></div>
        {operation === "shift_accept" && count !== "" && <label className={styles.check}><input type="checkbox" required checked={received} onChange={event => setReceived(event.target.checked)} />{t("أؤكد استلام النقدية المعدودة بمبلغ")} <bdi dir="ltr">{Number(count).toFixed(2)}</bdi> {t("ر س")}</label>}
        {variance !== null && <div className={variance === 0 ? styles.success : styles.notice} role="status">{variance === 0 ? t("النقدية مطابقة لرصيد الصندوق") : <><strong>{variance < 0 ? t("عجز نقدي") : t("زيادة نقدية")} <Numeric value={Math.abs(variance)} money /></strong><br />{t("يمكنك إكمال الوردية وسيُسجل الفرق ويُرسل تنبيه إلى مالك العلامة")}</>}</div>}
        {operation === "shift_handover" && <Field label={t("تسليم إلى")}><select name="toUserId" required defaultValue=""><option value="">{t("اختر المستلم")}</option>{snapshot.staff.filter(staff => staff.active && staff.user_id !== snapshot.userId).map(staff => <option key={staff.user_id} value={staff.user_id}>{staff.name}</option>)}</select></Field>}
        <Field label={t("ملاحظة اختياري")}><textarea name="note" maxLength={500} /></Field>
      </>}
    </fieldset>
    {payout && <FinanceShiftAttachments slug={snapshot.cafe.slug} shiftId={String(values.shiftId)} value={files} onChange={setFiles} disabled={pending} onBusyChange={setUploading} />}
    <div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>{t("إلغاء")}</button><button className={styles.primary} disabled={busy || (opening && (!accountId || available?.busy || snapshot.initialized === false))}>{uploading ? t("جارٍ رفع المرفقات") : pending ? t("جارٍ الحفظ") : payout ? t("تسجيل سند الصرف") : opening ? t("بدء الوردية") : operation === "shift_close" ? t("إقفال الوردية وإظهار التقرير") : t("حفظ العملية")}</button></div>
  </form>;
}

export function FinanceOpeningBalancesForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const { t, dir, language } = useFinancePosLocale();
  const reset = form.operation === "finance_reset";
  const accounts = snapshot.accounts.filter(account => account.active && ["cash", "bank", "pos"].includes(account.kind));
  const [confirmed, setConfirmed] = useState(false);
  return <form dir={dir} lang={language} className={styles.form} onSubmit={async event => { event.preventDefault(); if (pending) return; const data = new FormData(event.currentTarget); await onSubmit(form.operation, reset ? { note: String(data.get("note") ?? "").trim(), confirmation: "RESET" } : { balances: accounts.map(account => ({ accountId: account.id, amount: Number(data.get(account.id)) })), note: String(data.get("note") ?? "").trim() }); }}>
    {error && <div className={styles.error} role="alert">{t(error)}</div>}
    <p className={reset ? styles.error : styles.notice}>{reset ? t("تصفير أرصدة النقدية والبنوك والشبكة إجراء إداري مسجل ويتطلب إقفال جميع الورديات أولًا وتبقى المستندات السابقة محفوظة") : t("عد النقد الموجود في كل صندوق وسجل أرصدة البنك والشبكة لبدء الحساب تسجل الأرصدة الافتتاحية مرة واحدة")}</p>
    <fieldset disabled={pending} className={styles.shiftFieldset}>{reset ? <label className={styles.check}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("أؤكد مراجعة الأرصدة وأرغب في تصفيرها")}</label> : <div className={styles.fields}>{accounts.map(account => <Field key={account.id} label={account.name} hint={`${t("الرصيد المسجل حاليًا")} ${account.balance}`}><input name={account.id} required type="number" min="0" max="999999999" step="0.01" inputMode="decimal" defaultValue={account.balance} /></Field>)}</div>}<Field label={reset ? t("سبب التصفير") : t("ملاحظة التفعيل اختياري")}><textarea name="note" required={reset} maxLength={500} /></Field><div className={styles.formFooter}><button className={styles.secondary} type="button" onClick={onCancel}>{t("إلغاء")}</button><button className={reset ? styles.danger : styles.primary} disabled={pending || (reset && !confirmed)}>{pending ? t("جارٍ الحفظ") : reset ? t("تصفير الأرصدة") : t("حفظ الأرصدة وبدء الحساب")}</button></div></fieldset>
  </form>;
}
