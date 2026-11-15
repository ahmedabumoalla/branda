"use client";
import { PosNumeric as Numeric, useFinancePosLocale } from "./finance-pos-locale";
import { useEffect, useRef, useState } from "react";
import { newSupplier, supplierSchema, type SupplierInput } from '@/lib/erp/purchases';
import type { PosPurchaseCatalog } from '@/lib/finance/pos-purchases';
import { SupplierEditor } from '@/components/erp/purchases/supplier-editor';
import { loadPosPurchases, peekPosPurchases, posPurchaseKey, invalidatePosPurchases } from './pos-purchase-cache';
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import type { FinanceForm } from "./finance-operation-form";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";

type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean> };
export function FinanceSupplierPayoutForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const { t } = useFinancePosLocale();
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const submitting = useRef(false);
  const shift = snapshot.shifts.find(item => item.id === form.values?.shiftId && item.user_id === snapshot.userId && item.status === "open");
  const [catalog, setCatalog] = useState<PosPurchaseCatalog | null>(() => shift ? peekPosPurchases(posPurchaseKey(snapshot.cafe.slug, snapshot.userId, shift.id)) : null);
  const [supplierId, setSupplierId] = useState('');
  const [draft, setDraft] = useState<SupplierInput | null>(null);
  const [created, setCreated] = useState<SupplierInput | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!shift) return;
    let active = true;
    void loadPosPurchases(snapshot.cafe.slug, snapshot.userId, shift.id, retry > 0).then(result => {
      if (!active) return;
      if (result.ok) setCatalog(result.data); else setLocalError(result.message);
    }).catch(() => { if (active) setLocalError('تعذر تحميل الموردين أعد المحاولة'); });
    return () => { active = false; };
  }, [snapshot.cafe.slug, snapshot.userId, shift?.id, retry]);
  const busy = pending || uploading || saving;
  const blocked = !shift || shift.supervisor_paused || !catalog || catalog.permissions.supplierPayout !== true;
  const suppliers = [...(catalog?.suppliers ?? []), ...(created ? [created] : [])];
  const supplier = suppliers.find(row => row.id === supplierId);
  const balance = created?.id === supplierId ? created.openingBalance : catalog?.supplierBalances?.[supplierId];
  if (draft) return <SupplierEditor value={draft} onChange={setDraft} pending={busy} owner={snapshot.role === 'owner'} openingLocked={snapshot.role !== 'owner'} onCancel={() => setDraft(null)} onSave={() => {
    const parsed = supplierSchema.safeParse(draft);
    if (!parsed.success) { setLocalError('راجع بيانات المورد'); return; }
    setCreated(parsed.data); setSupplierId(parsed.data.id); setDraft(null);
  }} />;
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault(); if (busy || blocked || submitting.current) return;
    setLocalError("");
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (!supplier || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > .00001) { setLocalError(t("اختر المورد وأدخل مبلغًا صحيحًا بمنزلتين عشريتين كحد أقصى")); return; }
    submitting.current = true; setSaving(true);
    try { const saved = await onSubmit("supplier_payout", { shiftId: shift.id, branchScope: catalog!.branchScope, supplierId, newSupplier: created?.id === supplierId ? created : null, supplierName: supplier.name, supplierPhone: supplier.phone, amount, note: String(data.get("note") ?? "").trim(), attachmentIds: files.map(file => file.id) }); if (saved) invalidatePosPurchases(snapshot.cafe.slug, snapshot.userId, shift.id); }
    catch { setLocalError(t("تعذر تأكيد السداد أعد المحاولة بنفس البيانات لمنع التكرار")); }
    finally { submitting.current = false; setSaving(false); }
  }}>
    {(error || localError) && <div className={styles.error} role="alert">{t(error || localError)}</div>}
    {!catalog && <p role="status">{t('جار تحميل الموردين')} {localError && <button type="button" onClick={() => { setLocalError(''); setRetry(n => n + 1); }}>{t('إعادة المحاولة')}</button>}</p>}
    {catalog && blocked && <p className={styles.notice} role="alert">{t("سداد الموردين يحتاج إذن المالك ووردية مفتوحة غير موقوفة")}</p>}
    <p className={styles.notice}>{t("يُسجل سند صرف باسم المورد ويُخصم من صندوق ورديتك ويظهر في تقريرها")}</p>
    <fieldset disabled={busy || blocked} className="min-w-0 border-0 p-0 grid gap-4">
      <div className={styles.fields}>
        <Field label={t("المورد")}><select required value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">{t('اختر المورد')}</option>{suppliers.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{catalog?.permissions.createSupplier && <button type="button" className={styles.secondary} onClick={() => setDraft(created ?? newSupplier())}>{t('إضافة مورد جديد')}</button>}</Field>
        <div className={styles.notice}><span>{t(balance !== undefined && balance < 0 ? 'رصيد لصالح المنشأة' : 'مديونية للمورد')}</span><strong className="block text-xl">{balance === undefined ? '—' : <Numeric value={Math.abs(balance)} money />}</strong>{created?.id === supplierId && <small>{t('يشمل الرصيد الافتتاحي ويحفظ مع السداد')}</small>}</div>
        <Field label={t("المبلغ المدفوع من الصندوق")}><input name="amount" type="number" required min="0.01" max="999999999" step="0.01" inputMode="decimal" /></Field>
        <div className={styles.notice}><span>{t("رصيد الصندوق الحالي")}</span><strong className="block text-xl"><Numeric value={shift?.expected_cash ?? 0} money /></strong></div>
      </div>
      <Field label={t("بيان السداد اختياري")}><textarea name="note" maxLength={500} placeholder={t("رقم فاتورة المورد أو سبب السداد")} /></Field>
    </fieldset>
    {shift && <FinanceShiftAttachments slug={snapshot.cafe.slug} shiftId={shift.id} value={files} onChange={setFiles} disabled={pending || saving || blocked} onBusyChange={setUploading} />}
    <div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>{t("إلغاء")}</button><button className={styles.primary} disabled={busy || blocked}>{uploading ? t("جارٍ رفع المرفقات") : saving || pending ? t("جارٍ تسجيل السداد") : t("تسجيل سند الصرف")}</button></div>
  </form>;
}
