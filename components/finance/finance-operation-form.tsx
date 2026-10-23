"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FinanceOperation, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { previewFinanceTotals } from "@/lib/finance/brand-finance";
import { Field, Numeric, accountKindNames } from "./finance-ui";
import styles from "./finance.module.css";

export type FinanceFormOperation = FinanceOperation | "staff_create";
export type FinanceForm = { operation: FinanceFormOperation; title: string; values?: Record<string, unknown> };
type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceFormOperation, payload: Record<string, unknown>) => Promise<boolean> };

export function FinanceOperationForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const { operation, values = {} } = form;
  const [lines, setLines] = useState([{ key: 1, itemId: "", quantity: 1, unitPrice: 0 }]);
  const [journalLines, setJournalLines] = useState([{ key: 1, accountId: "", debit: 0, credit: 0 }, { key: 2, accountId: "", debit: 0, credit: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [treasuryKind, setTreasuryKind] = useState(String(values.kind ?? "receipt"));
  const [staffMode, setStaffMode] = useState(operation === "staff_create" ? "new" : "existing");
  const [localError, setLocalError] = useState("");
  const [stockMode, setStockMode] = useState("adjust");
  const [stockItem, setStockItem] = useState(String(values.itemId ?? ""));
  const [stockWarehouse, setStockWarehouse] = useState(String(values.warehouseId ?? snapshot.warehouses.find((warehouse) => warehouse.active)?.id ?? ""));
  const activeAccounts = snapshot.accounts.filter((account) => account.active);
  const liquidAccounts = activeAccounts.filter((account) => ["cash", "bank", "pos", "employee"].includes(account.kind));
  const activeItems = snapshot.items.filter((item) => item.active);
  const activeWarehouses = snapshot.warehouses.filter((warehouse) => warehouse.active);
  const purchaseTotals = previewFinanceTotals(lines.map((line) => ({ quantity: line.quantity, price: line.unitPrice })), discount, snapshot.settings.vat_rate, snapshot.settings.tax_inclusive);
  const selectAccounts = (name: string, list = liquidAccounts, required = true, label = "الحساب") => <Field label={label}><select name={name} required={required} defaultValue={String(values[name] ?? "")}><option value="">اختر الحساب</option>{list.map((account) => <option value={account.id} key={account.id}>{account.name} · {accountKindNames[account.kind]}</option>)}</select></Field>;
  const selectWarehouse = (name = "warehouseId", label = "المستودع") => <Field label={label}><select name={name} required defaultValue={String(values[name] ?? activeWarehouses[0]?.id ?? "")}><option value="">اختر المستودع</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></Field>;
  const selectParty = (kind?: "customer" | "supplier" | "employee", required = false) => <Field label={kind === "supplier" ? "المورد" : kind === "employee" ? "الموظف" : "الطرف المرتبط"}><select name="partyId" required={required} defaultValue={String(values.partyId ?? "")}><option value="">بدون طرف</option>{snapshot.parties.filter((party) => party.active && (!kind || party.kind === kind)).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>;
  const amount = (name: string, label: string, defaultValue = 0, min = 0) => <Field label={label}><input name={name} type="number" inputMode="decimal" step="0.01" min={min} max="999999999" required defaultValue={Number(values[name] ?? defaultValue)} /></Field>;
  const note = <Field label="البيان"><textarea name="note" maxLength={500} required={["refund", "stock_adjust", "stock_transfer", "journal", "treasury"].includes(operation)} defaultValue={String(values.note ?? "")} placeholder="سبب العملية أو مرجعها" /></Field>;

  return <form className={styles.form} onSubmit={async (event) => {
    event.preventDefault(); if (pending) return;
    setLocalError("");
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = { ...values };
    for (const [key, value] of data) payload[key] = String(value).trim();
    for (const key of ["amount", "openingCash", "countedCash", "quantity", "unitCost", "paid", "minQuantity", "vatRate"]) if (key in payload) payload[key] = Number(payload[key]);
    if (operation === "purchase") {
      if (lines.some((line) => !line.itemId || line.quantity <= 0 || line.unitPrice < 0) || new Set(lines.map((line) => line.itemId)).size !== lines.length) { setLocalError("اختر أصنافًا مختلفة بكميات صحيحة"); return; }
      if (Number(payload.paid) > purchaseTotals.total + .001) { setLocalError("المبلغ المدفوع أعلى من إجمالي المشتريات"); return; }
      if (Number(payload.paid) > 0 && !payload.accountId) { setLocalError("اختر حساب دفع المشتريات"); return; }
      payload.lines = lines.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })); payload.discount = discount;
    }
    if (operation === "journal") {
      const debit = journalLines.reduce((sum, line) => sum + line.debit, 0); const credit = journalLines.reduce((sum, line) => sum + line.credit, 0);
      if (Math.abs(debit - credit) > .001 || debit <= 0 || journalLines.some((line) => !line.accountId || (line.debit > 0) === (line.credit > 0))) { setLocalError("يجب أن يتساوى المدين والدائن وأن يحتوي كل سطر على جهة واحدة"); return; }
      payload.lines = journalLines.map(({ accountId, debit, credit }) => ({ accountId, debit, credit }));
    }
    if (operation === "treasury") {
      const custody = [payload.accountId, payload.toAccountId].some((id) => snapshot.accounts.some((account) => account.id === id && account.kind === "employee"));
      if (custody && !snapshot.parties.some((party) => party.id === payload.partyId && party.kind === "employee" && party.active)) { setLocalError("اختر الموظف المرتبط بالعهدة من قائمة الأطراف"); return; }
    }
    if (operation === "settings") { payload.taxInclusive = data.get("taxInclusive") === "on"; payload.closedThrough = payload.closedThrough || null; }
    if (operation === "stock_adjust" && stockMode === "count") {
      const expected = snapshot.stock.find((stock) => stock.item_id === stockItem && stock.warehouse_id === stockWarehouse)?.quantity ?? 0;
      const counted = Number(payload.countedQuantity);
      if (!Number.isFinite(counted) || counted < 0) { setLocalError("أدخل الكمية المعدودة فعليًا"); return; }
      payload.expectedQuantity = expected;
      payload.countedQuantity = counted;
      delete payload.quantity;
    }
    if (operation === "party" || operation === "staff") payload.active = data.get("active") === "on";
    for (const key of ["accountId", "partyId", "menuProductId", "toAccountId"]) if (payload[key] === "") delete payload[key];
    await onSubmit(operation === "staff" && staffMode === "new" ? "staff_create" : operation, payload);
  }}>
    {(error || localError) && <div role="alert" className={styles.error}>{error || localError}</div>}
    <fieldset disabled={pending} className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
      {operation === "party" && <>
        <div className={styles.fields}><Field label="الاسم"><input name="name" required maxLength={150} defaultValue={String(values.name ?? "")} /></Field><Field label="النوع"><select name="kind" defaultValue={String(values.kind ?? "customer")}><option value="customer">عميل</option><option value="supplier">مورد</option><option value="employee">موظف</option></select></Field><Field label="رقم الجوال"><input name="phone" type="tel" maxLength={30} defaultValue={String(values.phone ?? "")} /></Field><Field label="البريد الإلكتروني"><input name="email" type="email" maxLength={180} defaultValue={String(values.email ?? "")} /></Field><Field label="الرقم الضريبي"><input name="taxNumber" maxLength={30} defaultValue={String(values.taxNumber ?? "")} /></Field></div>
        <label className={styles.check}><input type="checkbox" name="active" defaultChecked={values.active !== false} />طرف نشط</label>
      </>}
      {operation === "account" && <div className={styles.fields}><Field label="اسم الحساب"><input name="name" required maxLength={100} /></Field><Field label="نوع الحساب"><select name="kind" defaultValue={String(values.kind ?? "cash")}>{(["cash", "bank", "pos", "employee"] as const).map((kind) => <option key={kind} value={kind}>{accountKindNames[kind]}</option>)}</select></Field></div>}
      {operation === "warehouse" && <Field label="اسم المستودع"><input name="name" required maxLength={100} /></Field>}
      {operation === "item" && <div className={styles.fields}><Field label="اسم الصنف"><input name="name" required maxLength={150} defaultValue={String(values.name ?? "")} /></Field><Field label="رمز الصنف"><input name="sku" required maxLength={60} dir="ltr" defaultValue={String(values.sku ?? "")} /></Field><Field label="وحدة القياس"><input name="unit" required maxLength={30} defaultValue={String(values.unit ?? "قطعة")} /></Field>{amount("minQuantity", "حد التنبيه للكمية")}
        <Field label="ربط بمنتج المنيو" hint="يخصم البيع من المخزون عند ربط المنتج"><select name="menuProductId" defaultValue={String(values.menuProductId ?? "")}><option value="">صنف مستقل</option>{snapshot.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field></div>}
      {operation === "purchase" && <>
        <div className={styles.fields}>{selectParty("supplier", true)}{selectWarehouse()}</div>
        {lines.map((line, index) => <div className={styles.rowFields} key={line.key}><Field label={`الصنف ${index + 1}`}><select required aria-label={`الصنف ${index + 1}`} value={line.itemId} onChange={(event) => setLines(lines.map((item) => item.key === line.key ? { ...item, itemId: event.target.value } : item))}><option value="">اختر الصنف</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></Field><Field label="الكمية"><input type="number" required min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines(lines.map((item) => item.key === line.key ? { ...item, quantity: Number(event.target.value) } : item))} /></Field><Field label="سعر الوحدة"><input type="number" required min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines(lines.map((item) => item.key === line.key ? { ...item, unitPrice: Number(event.target.value) } : item))} /></Field><button type="button" className={styles.iconButton} disabled={lines.length === 1} aria-label={`حذف الصنف ${index + 1}`} onClick={() => setLines(lines.filter((item) => item.key !== line.key))}><Trash2 size={16} /></button></div>)}
        <button type="button" className={styles.secondary} onClick={() => setLines([...lines, { key: Math.max(...lines.map((line) => line.key)) + 1, itemId: "", quantity: 1, unitPrice: 0 }])}><Plus size={16} />إضافة صنف للمشتريات</button>
        <div className={styles.fields}><Field label="خصم على الفاتورة"><input type="number" min="0" max={purchaseTotals.subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></Field>{amount("paid", "المبلغ المدفوع")}{selectAccounts("accountId", liquidAccounts, false, "حساب الدفع")}</div>
        <div className={styles.notice}>إجمالي المشتريات بعد الخصم والضريبة <strong><Numeric value={purchaseTotals.total} money /></strong></div>{note}
      </>}
      {(operation === "stock_adjust" || operation === "stock_transfer") && <>
        {operation === "stock_adjust" && <Field label="نوع التسوية"><select value={stockMode} onChange={(event) => setStockMode(event.target.value)}><option value="adjust">إضافة أو عجز أو تلف</option><option value="count">جرد الكمية الفعلية</option></select></Field>}
        <div className={styles.fields}><Field label="الصنف"><select name="itemId" required value={stockItem} onChange={(event) => setStockItem(event.target.value)}><option value="">اختر الصنف</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></Field><Field label={operation === "stock_transfer" ? "من مستودع" : "المستودع"}><select name="warehouseId" required value={stockWarehouse} onChange={(event) => setStockWarehouse(event.target.value)}>{activeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
          {operation === "stock_transfer" ? selectWarehouse("toWarehouseId", "إلى مستودع") : amount("unitCost", "تكلفة الوحدة للإضافة")}
          {operation === "stock_adjust" && stockMode === "count" ? <Field label="الكمية المعدودة فعليًا" hint={`الرصيد المسجل ${snapshot.stock.find((stock) => stock.item_id === stockItem && stock.warehouse_id === stockWarehouse)?.quantity ?? 0}`}><input name="countedQuantity" type="number" inputMode="decimal" required min="0" max="99999999" step="0.001" /></Field> : <Field label={operation === "stock_adjust" ? "التغير في الكمية" : "الكمية المنقولة"} hint={operation === "stock_adjust" ? "قيمة موجبة للإضافة وسالبة للعجز أو التلف" : undefined}><input name="quantity" type="number" inputMode="decimal" required min={operation === "stock_transfer" ? .001 : -99999999} max="99999999" step="0.001" /></Field>}
        </div>{note}
      </>}
      {operation === "treasury" && <><div className={styles.fields}><Field label="نوع العملية"><select name="kind" value={treasuryKind} onChange={(event) => setTreasuryKind(event.target.value)}><option value="receipt">سند قبض</option><option value="expense">سند صرف</option><option value="transfer">تحويل بين الحسابات أو تسليم عهدة</option><option value="opening">رصيد افتتاحي</option></select></Field>{selectAccounts("accountId", liquidAccounts, true, treasuryKind === "transfer" ? "من حساب" : "الحساب")}{treasuryKind === "transfer" && selectAccounts("toAccountId", liquidAccounts, true, "إلى حساب")}{amount("amount", "المبلغ", 0, .01)}{selectParty()}</div>{note}</>}
      {operation === "settlement" && <><p className={styles.notice}>تسجيل دفعة مرتبطة بالمستند وتخفيض الرصيد المستحق</p><div className={styles.fields}>{selectAccounts("accountId")}{amount("amount", "مبلغ التسوية", Number(values.remaining ?? 0), .01)}</div>{note}</>}
      {operation === "refund" && <><div className={styles.notice}>سيتم إرجاع كامل المستند وتحديث رصيد الحساب والمخزون والقيود المحاسبية</div>{note}</>}
      {operation === "shift_open" && <div className={styles.fields}>{selectAccounts("accountId", activeAccounts.filter((account) => account.kind === "cash"), true, "صندوق الوردية")}{amount("openingCash", "النقدية المعدودة عند البداية")}</div>}
      {(operation === "shift_close" || operation === "shift_handover" || operation === "shift_accept") && <>
        {typeof values.expectedCash === "number" && <div className={styles.notice}>النقدية المتوقعة <strong><Numeric value={values.expectedCash} money /></strong></div>}
        <div className={styles.fields}>{amount("countedCash", operation === "shift_accept" ? "النقدية المستلمة فعليًا" : "النقدية المعدودة فعليًا")}{operation === "shift_handover" && <Field label="تسليم إلى"><select name="toUserId" required defaultValue=""><option value="">اختر المستلم</option>{snapshot.staff.filter((staff) => staff.active && staff.user_id !== snapshot.userId).map((staff) => <option key={staff.user_id} value={staff.user_id}>{staff.name}</option>)}</select></Field>}</div>{note}
      </>}
      {operation === "settings" && <><div className={styles.fields}>{amount("vatRate", "نسبة ضريبة القيمة المضافة")}
        <Field label="إقفال الفترة حتى" hint="يمنع الترحيل في الأيام المقفلة حسب تاريخ العملية"><input name="closedThrough" type="date" defaultValue={snapshot.settings.closed_through?.slice(0, 10) ?? ""} /></Field></div>
        <label className={styles.check}><input name="taxInclusive" type="checkbox" defaultChecked={snapshot.settings.tax_inclusive} />أسعار الأصناف شاملة الضريبة</label>
      </>}
      {(operation === "staff" || operation === "staff_create") && <>
        {!values.userId && <Field label="طريقة إضافة الموظف"><select value={staffMode} onChange={(event) => setStaffMode(event.target.value)}><option value="existing">ربط حساب مسجل</option><option value="new">إنشاء حساب مالي جديد</option></select></Field>}
        <div className={styles.fields}><Field label="اسم الموظف"><input name="name" required maxLength={100} defaultValue={String(values.name ?? "")} /></Field>{!values.userId && <Field label="البريد الإلكتروني"><input name="email" type="email" required maxLength={180} defaultValue={String(values.email ?? "")} /></Field>}<Field label="الصلاحية"><select name="role" defaultValue={String(values.role ?? "cashier")}><option value="cashier">كاشير مالي</option><option value="manager">مدير مالي</option></select></Field>{staffMode === "new" && <Field label="كلمة المرور المؤقتة"><input name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>}</div>
        {staffMode === "existing" && <label className={styles.check}><input type="checkbox" name="active" defaultChecked={values.active !== false} />موظف نشط</label>}
      </>}
      {operation === "journal" && <>
        {journalLines.map((line, index) => <div className={styles.rowFields} key={line.key}><Field label={`الحساب ${index + 1}`}><select required value={line.accountId} onChange={(event) => setJournalLines(journalLines.map((item) => item.key === line.key ? { ...item, accountId: event.target.value } : item))}><option value="">اختر الحساب</option>{activeAccounts.filter((account) => !["inventory", "receivable", "payable", "employee"].includes(account.kind)).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field><Field label="مدين"><input type="number" min="0" step="0.01" value={line.debit} onChange={(event) => setJournalLines(journalLines.map((item) => item.key === line.key ? { ...item, debit: Number(event.target.value) } : item))} /></Field><Field label="دائن"><input type="number" min="0" step="0.01" value={line.credit} onChange={(event) => setJournalLines(journalLines.map((item) => item.key === line.key ? { ...item, credit: Number(event.target.value) } : item))} /></Field><button className={styles.iconButton} type="button" disabled={journalLines.length <= 2} aria-label={`حذف سطر القيد ${index + 1}`} onClick={() => setJournalLines(journalLines.filter((item) => item.key !== line.key))}><Trash2 size={16} /></button></div>)}
        <button type="button" className={styles.secondary} onClick={() => setJournalLines([...journalLines, { key: Math.max(...journalLines.map((line) => line.key)) + 1, accountId: "", debit: 0, credit: 0 }])}><Plus size={16} />إضافة سطر</button>{note}
      </>}
      <div className={styles.formFooter}><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button><button type="submit" className={styles.primary}>{pending ? "جار حفظ العملية" : operation === "refund" ? "تأكيد المرتجع" : "حفظ العملية"}</button></div>
    </fieldset>
  </form>;
}
