"use client";
import { useEffect, useRef, useState } from "react";
import { loadPosPurchases, peekPosPurchases, posPurchaseKey, invalidatePosPurchases } from "./pos-purchase-cache";
import { newPurchase, newSupplier, purchaseTotals, type PurchaseInput, type PurchaseSnapshot, type SupplierInput } from "@/lib/erp/purchases";
import { posPurchaseItemSchema, posPurchaseSchema, type PosPurchaseCatalog, type PosPurchaseItem } from "@/lib/finance/pos-purchases";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import { PurchaseEditor } from "@/components/erp/purchases/editor";
import { SupplierEditor } from "@/components/erp/purchases/supplier-editor";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import type { InventorySaved } from "./finance-inventory-item-form";
import type { FinanceForm } from "./finance-operation-form";
import { useFinancePosLocale } from "./finance-pos-locale";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean>; onBusyChange?: (busy: boolean) => void; onInventorySaved?: InventorySaved; onInventoryUnitsChanged?: (units: NonNullable<FinanceSnapshot["units"]>) => void };
export function FinancePosPurchaseForm({ form, snapshot, pending, error, onCancel, onSubmit, onBusyChange }: Props) {
  const { t } = useFinancePosLocale();
  const shift = snapshot.shifts.find(row => row.id === form.values?.shiftId && row.user_id === snapshot.userId && row.status === "open");
  const [catalog, setCatalog] = useState<PosPurchaseCatalog | null>(() => shift ? peekPosPurchases(posPurchaseKey(snapshot.cafe.slug, snapshot.userId, shift.id)) : null);
  const [value, setValue] = useState<PurchaseInput | null>(null);
  const [newItems, setNewItems] = useState<PosPurchaseItem[]>([]);
  const [newSupplierValue, setNewSupplierValue] = useState<SupplierInput | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<SupplierInput | null>(null);
  const [itemDraft, setItemDraft] = useState<PosPurchaseItem | null>(null);
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const [initialId] = useState(() => crypto.randomUUID());
  const slug = snapshot.cafe.slug, shiftId = shift?.id;
  useEffect(() => {
    if (!shiftId) return;
    let active = true;
    void loadPosPurchases(slug, snapshot.userId, shiftId, retry > 0).then(result => {
      if (!active) return;
      if (!result.ok) { setLocalError(result.message); return; }
      setCatalog(result.data); setLocalError("");
    }).catch(() => { if (active) setLocalError("تعذر تحميل بيانات المشتريات أعد المحاولة"); });
    return () => { active = false; };
  }, [slug, snapshot.userId, shiftId, retry]);
  function working(next: boolean) { lock.current = next; setBusy(next); onBusyChange?.(next); }
  if (!shift || shift.supervisor_paused) return <p role="alert" className={styles.error}>{t("تسجيل المشتريات متاح من ورديتك المفتوحة وغير الموقوفة")}</p>;
  if (!catalog) return <div aria-busy={!localError}><p role={localError ? "alert" : "status"}>{t(localError || "جارٍ تحميل بيانات المشتريات")}</p>{localError && <button type="button" onClick={() => { setLocalError(""); setRetry(count => count + 1); }}>{t("إعادة المحاولة")}</button>}</div>;
  const items = [...snapshot.items, ...newItems.map(item => ({ id: item.id, name: item.name, sku: item.sku, unit: snapshot.units?.find(unit => unit.id === item.unitId)?.name ?? "", unit_id: item.unitId, barcode: item.barcode, menu_product_id: null, min_quantity: 0, active: true, quantity: 0, average_cost: 0 }))];
  const purchaseSnapshot: PurchaseSnapshot = { ...catalog, finance: { ...snapshot, items }, suppliers: [...catalog.suppliers, ...(newSupplierValue ? [newSupplierValue] : [])], units: [...catalog.units, ...newItems.map(item => ({ itemId: item.id, name: snapshot.units?.find(unit => unit.id === item.unitId)?.name ?? "", factor: 1 }))], records: [], invoices: [], payments: [], credits: [], receipts: [], allocations: [], events: [], inventoryDocuments: [], statements: [], canCreate: true, canUpdate: false, canDelete: false, canApprove: true, canConfigure: false, canFiles: false, slug, brand: snapshot.cafe.name };
  const invoice = value ?? { ...newPurchase(purchaseSnapshot, "invoice"), id: initialId, accountId: shift.account_id, received: true };
  if (supplierDraft) return <SupplierEditor value={supplierDraft} onChange={setSupplierDraft} pending={pending || busy} owner={false} openingLocked onCancel={() => setSupplierDraft(null)} onSave={() => { setNewSupplierValue(supplierDraft); setValue({ ...invoice, supplierId: supplierDraft.id }); setSupplierDraft(null); }} />;
  if (itemDraft) return <form className={styles.form} onSubmit={event => { event.preventDefault(); if (pending || busy) return; const parsed = posPurchaseItemSchema.safeParse(itemDraft); if (!parsed.success) { setLocalError(t("راجع اسم الصنف ورمزه ووحدة القياس")); return; } setNewItems(current => [...current, parsed.data]); setItemDraft(null); }}><fieldset disabled={pending || busy}><p>{t("يحفظ الصنف الجديد مع فاتورة المشتريات")}</p><Field label={t("اسم الصنف")}><input required maxLength={150} value={itemDraft.name} onChange={event => setItemDraft({ ...itemDraft, name: event.target.value })} /></Field><Field label={t("رمز الصنف")}><input required maxLength={60} value={itemDraft.sku} onChange={event => setItemDraft({ ...itemDraft, sku: event.target.value })} /></Field><Field label={t("الوحدة")}><select required value={itemDraft.unitId} onChange={event => setItemDraft({ ...itemDraft, unitId: event.target.value })}><option value="">{t("اختر الوحدة")}</option>{snapshot.units?.map(unit => <option key={unit.id} value={unit.id}>{t(unit.name)}</option>)}</select></Field><Field label={t("الباركود اختياري")}><input maxLength={64} value={itemDraft.barcode} onChange={event => setItemDraft({ ...itemDraft, barcode: event.target.value })} /></Field><div className={styles.actions}><button type="submit">{t("إضافة الصنف للفاتورة")}</button><button type="button" onClick={() => setItemDraft(null)}>{t("إلغاء")}</button></div></fieldset></form>;
  return <>{catalog.settings.autoApplyCredit && snapshot.role !== "owner" && <p className={styles.muted}>{t("تسوية رصيد المورد المتاح تتم من إدارة المشتريات", "Available supplier credit is settled from purchase management")}</p>}{(localError || error) && <p role="alert" className={styles.error}>{t(localError || error)}</p>}<PurchaseEditor snapshot={purchaseSnapshot} value={invoice} onChange={setValue} pending={pending || busy} onCancel={onCancel} pos={{ supplierBalances: catalog.supplierBalances, createProduct: catalog.permissions.createItem, shiftId: shift.id, accountId: shift.account_id, accountName: snapshot.accounts.find(account => account.id === shift.account_id)?.name ?? t("صندوق الوردية"), allowCredit: catalog.permissions.credit, onCreateSupplier: catalog.permissions.createSupplier ? () => setSupplierDraft(newSupplierValue ?? newSupplier()) : undefined, onCreateItem: catalog.permissions.createItem ? () => setItemDraft({ id: crypto.randomUUID(), name: "", sku: "", unitId: snapshot.units?.[0]?.id ?? "", barcode: "" }) : undefined, attachments: <FinanceShiftAttachments slug={slug} shiftId={shift.id} value={files} onChange={setFiles} disabled={pending || busy} onBusyChange={working} /> }} onSave={async () => {
    if (pending || busy || lock.current) return;
    const input = posPurchaseSchema.safeParse({ shiftId: shift.id, branchScope: catalog.branchScope, invoice, newSupplier: newSupplierValue?.id === invoice.supplierId ? newSupplierValue : null, newItems: newItems.filter(item => invoice.lines.some(line => line.itemId === item.id)), attachmentIds: files.map(file => file.id) });
    if (!input.success) { setLocalError(t("راجع بيانات فاتورة المشتريات والمورد والأصناف")); return; }
    const totals = purchaseTotals(invoice);
    if (!catalog.permissions.credit && invoice.paid < totals.total || invoice.paid * invoice.exchangeRate > shift.expected_cash + .001) { setLocalError(t("راجع صلاحية الشراء الآجل ورصيد صندوق الوردية")); return; }
    setLocalError(""); working(true);
    try { const saved = await onSubmit("shift_purchase", { ...input.data, expectedTotal: totals.sarTotal }); if (saved) invalidatePosPurchases(slug, snapshot.userId, shift.id); if (!saved) setLocalError(t("لم يتم حفظ الفاتورة راجع البيانات ثم أعد المحاولة بنفس الفاتورة")); }
    catch { setLocalError(t("تعذر تأكيد حفظ الفاتورة أعد المحاولة بنفس البيانات")); }
    finally { working(false); }
  }} /></>;
}
