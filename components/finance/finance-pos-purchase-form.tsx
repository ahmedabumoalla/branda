"use client";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { previewFinanceTotals, type FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import { FinanceInventoryItemForm, type InventorySaved } from "./finance-inventory-item-form";
import type { FinanceForm } from "./finance-operation-form";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";
import purchase from "./finance-pos-purchase-form.module.css";

type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean>; onBusyChange?: (busy: boolean) => void; onInventorySaved?: InventorySaved; onInventoryUnitsChanged?: (units: NonNullable<FinanceSnapshot["units"]>) => void };
export function FinancePosPurchaseForm({ form, snapshot, pending, error, onCancel, onSubmit, onBusyChange, onInventorySaved, onInventoryUnitsChanged }: Props) {
  const shift = snapshot.shifts.find(row => row.id === form.values?.shiftId && row.user_id === snapshot.userId && row.status === "open");
  const [lines, setLines] = useState([{ key: 1, itemId: "", quantity: "1", unitPrice: "" }]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [vatRate, setVatRate] = useState(String(snapshot.settings.vat_rate));
  const [inclusive, setInclusive] = useState(false);
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [catalog, setCatalog] = useState({ items: snapshot.items, units: snapshot.units ?? [] });
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const lock = useRef(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const blocked = !shift || shift.supervisor_paused;
  const disabled = pending || busy || blocked;
  const total = previewFinanceTotals(lines.map(line => ({ quantity: Number(line.quantity), price: Number(line.unitPrice) })), 0, Number(vatRate), inclusive);
  function setWorking(value: boolean) { lock.current = value; setBusy(value); onBusyChange?.(value); }
  function closeEditor() { setEditingRow(null); requestAnimationFrame(() => returnFocus.current?.focus()); }
  return <>
    <div hidden={editingRow !== null}>
      <form className={styles.form} onSubmit={async event => {
        event.preventDefault(); if (disabled || lock.current || !shift) return;
        setLocalError("");
        const data = new FormData(event.currentTarget);
        if (!supplierName.trim() || supplierPhone.trim().length < 5 || !lines.length || lines.some(line => !line.itemId || line.quantity === "" || line.unitPrice === "" || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) || new Set(lines.map(line => line.itemId)).size !== lines.length || !Number.isFinite(total.total) || total.total <= 0) { setLocalError("أدخل المورد وجواله والأصناف والكميات والأسعار الصحيحة"); return; }
        if (total.total > shift.expected_cash) { setLocalError("رصيد صندوق الوردية لا يكفي لسداد الفاتورة"); return; }
        setWorking(true);
        try { await onSubmit("shift_purchase", { shiftId: shift.id, supplierName: supplierName.trim(), supplierPhone: supplierPhone.trim(), warehouseId: String(data.get("warehouseId") ?? ""), lines: lines.map(line => ({ itemId: line.itemId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })), vatRate: Number(vatRate), taxInclusive: inclusive, expectedTotal: total.total, note: String(data.get("note") ?? "").trim(), attachmentIds: files.map(file => file.id) }); }
        catch { setLocalError("تعذر تأكيد تسجيل الفاتورة أعد المحاولة بنفس البيانات"); }
        finally { setWorking(false); }
      }}>
        {(error || localError) && <p role="alert" className={styles.error}>{error || localError}</p>}
        <p className={styles.notice}>{blocked ? "تسجيل المشتريات متاح من ورديتك المفتوحة وغير الموقوفة" : "تزيد الفاتورة رصيد المخزون وتُسدد نقدًا من صندوق ورديتك وتظهر ضمن حركاتها"}</p>
        <fieldset disabled={disabled || editingRow !== null} className={purchase.fields}>
          <div className={styles.fields}>
            {snapshot.parties.some(party => party.kind === "supplier" && party.active) && <Field label="اختيار مورد محفوظ اختياري"><select defaultValue="" onChange={event => { const supplier = snapshot.parties.find(party => party.id === event.target.value); if (supplier) { setSupplierName(supplier.name); setSupplierPhone(supplier.phone ?? ""); } }}><option value="">أدخل بيانات المورد</option>{snapshot.parties.filter(party => party.kind === "supplier" && party.active).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}
            <Field label="اسم المورد"><input required maxLength={150} value={supplierName} onChange={event => setSupplierName(event.target.value)} /></Field>
            <Field label="جوال المورد"><input required type="tel" dir="ltr" minLength={5} maxLength={30} value={supplierPhone} onChange={event => setSupplierPhone(event.target.value)} /></Field>
            <Field label="مستودع الاستلام"><select name="warehouseId" required defaultValue={snapshot.warehouses.find(row => row.active)?.id ?? ""}><option value="">اختر المستودع</option>{snapshot.warehouses.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          </div>
          {!catalog.items.some(item => item.active) && <p className={styles.notice}>لا توجد أصناف مخزنية اطلب من مسؤول المخزون إضافتها أولًا</p>}
          <div className={purchase.lines}>{lines.map((line, index) => <div key={line.key} className={purchase.line}>
            <div className={purchase.item}><Field label={`الصنف ${index + 1}`}><select required value={line.itemId} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, itemId: event.target.value } : row))}><option value="">اختر الصنف</option>{catalog.items.filter(item => item.active && (item.id === line.itemId || !lines.some(row => row.itemId === item.id))).map(item => <option key={item.id} value={item.id}>{item.name} — {item.unit}</option>)}</select></Field>
              {canFinance(snapshot.role, "inventory_write") && <button type="button" className={styles.secondary} onClick={event => { returnFocus.current = event.currentTarget; setEditingRow(line.key); }}><Plus size={15} />إنشاء صنف جديد</button>}</div>
            <Field label="الكمية"><input aria-label={`كمية الصنف ${index + 1}`} required type="number" min="0.001" max="1000000" step="0.001" value={line.quantity} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, quantity: event.target.value } : row))} /></Field>
            <Field label="سعر الوحدة"><input aria-label={`سعر الصنف ${index + 1}`} required type="number" min="0" max="10000000" step="0.01" value={line.unitPrice} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, unitPrice: event.target.value } : row))} /></Field>
            <button type="button" className={styles.iconButton} disabled={lines.length === 1} aria-label={`حذف الصنف ${index + 1}`} onClick={() => setLines(current => current.filter(row => row.key !== line.key))}><Trash2 size={17} /></button>
          </div>)}</div>
          <button type="button" className={styles.secondary} disabled={lines.length >= 100} onClick={() => setLines(current => [...current, { key: Math.max(...current.map(row => row.key)) + 1, itemId: "", quantity: "1", unitPrice: "" }])}><Plus size={16} />إضافة صنف للفاتورة</button>
          <div className={styles.fields}><Field label="نسبة الضريبة"><input type="number" min="0" max="100" step="0.01" required value={vatRate} onChange={event => setVatRate(event.target.value)} /></Field><label className={styles.check}><input type="checkbox" checked={inclusive} onChange={event => setInclusive(event.target.checked)} />سعر الوحدة شامل الضريبة</label></div>
          <Field label="بيان الفاتورة اختياري"><textarea name="note" maxLength={500} rows={2} placeholder="رقم فاتورة المورد أو ملاحظات الاستلام" /></Field>
        </fieldset>
        {shift && <FinanceShiftAttachments slug={snapshot.cafe.slug} shiftId={shift.id} value={files} onChange={setFiles} disabled={pending || busy || blocked} onBusyChange={setWorking} />}
        <div className={purchase.totals}><span>قبل الضريبة <Numeric value={total.total - total.tax} money /></span><span>الضريبة <Numeric value={total.tax} money /></span><strong>إجمالي السداد <Numeric value={total.total} money /></strong><small>المتاح في صندوق الوردية <Numeric value={shift?.expected_cash ?? 0} money /></small></div>
        <div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={pending || busy} onClick={onCancel}>إلغاء</button><button type="submit" className={styles.primary} disabled={disabled}>{pending || busy ? "جارٍ إكمال العملية" : "تسجيل الفاتورة والسداد من الصندوق"}</button></div>
      </form>
    </div>
    {editingRow !== null && <FinanceInventoryItemForm snapshot={{ ...snapshot, items: catalog.items, units: catalog.units }} onBusyChange={setWorking} onCancel={closeEditor} onUnitsChanged={units => { setCatalog(current => ({ ...current, units })); onInventoryUnitsChanged?.(units); }} onSaved={(item, units) => { setCatalog(current => ({ items: [...current.items.filter(row => row.id !== item.id), item], units })); setLines(current => current.map(row => row.key === editingRow ? { ...row, itemId: item.id } : row)); onInventorySaved?.(item, units); closeEditor(); }} />}
  </>;
}
