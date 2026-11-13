"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { previewFinanceTotals, type FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import type { FinanceForm } from "./finance-operation-form";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

type Supplier = { name: string; phone?: string; taxNumber?: string; commercialRegistration?: string };
type StockItem = { name: string; sku: string; barcode?: string };
type PurchaseLine = { key: number; itemId: string; newItem?: StockItem; quantity: number; unitPrice: number };
type CameraDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function BarcodeCamera({ onValue, onClose }: { onValue: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let closed = false; let stream: MediaStream | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
    const Detector = (window as unknown as { BarcodeDetector?: new () => CameraDetector }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { queueMicrotask(() => setError("قراءة الباركود بالكاميرا غير متاحة في هذا المتصفح أدخل الرقم يدويًا أو استخدم قارئ الباركود")); return; }
    const detector = new Detector();
    const scan = async () => { if (closed) return; try { if (video.current?.readyState && video.current.readyState >= 2) { const codes = await detector.detect(video.current); if (codes[0]?.rawValue) { onValue(codes[0].rawValue); return; } } } catch { /* The next frame can become readable after autofocus. */ } if (!closed) timer = setTimeout(() => void scan(), 250); };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(async value => { stream = value; if (closed) { value.getTracks().forEach(track => track.stop()); return; } if (video.current) { video.current.srcObject = value; await video.current.play(); void scan(); } }).catch(() => { if (!closed) setError("تعذر فتح الكاميرا اسمح باستخدامها أو أدخل الباركود يدويًا"); });
    return () => { closed = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, [onValue]);
  return <Modal open title="مسح باركود الصنف" onClose={onClose} panelClassName={styles.shiftDialog}><div className={styles.form}>{error ? <p className={styles.notice} role="status">{error}</p> : <><p className={styles.muted}>وجه الكاميرا إلى الباركود وستُقرأ الأرقام تلقائيًا</p><video ref={video} muted playsInline className={styles.barcodeVideo} /></>}<button type="button" className={styles.secondary} onClick={onClose}>العودة إلى الإدخال اليدوي</button></div></Modal>;
}

export function FinanceShiftPurchaseForm({ form, snapshot, pending, error, onCancel, onSubmit }: { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean> }) {
  const shiftId = String(form.values?.shiftId ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<StockItem>({ name: "", sku: "", barcode: "" });
  const [camera, setCamera] = useState(false);
  const [lines, setLines] = useState<PurchaseLine[]>([{ key: 1, itemId: "", quantity: 1, unitPrice: 0 }]);
  const [vatRate, setVatRate] = useState(15);
  const [inclusive, setInclusive] = useState(false);
  const [payment, setPayment] = useState("cash");
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const total = previewFinanceTotals(lines.map(line => ({ quantity: line.quantity, price: line.unitPrice })), 0, vatRate, inclusive);
  const busy = pending || uploading;
  const updateLine = (key: number, value: Partial<PurchaseLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...value } : line));
  return <>
    <form className={styles.form} onSubmit={async event => { event.preventDefault(); if (busy) return; setLocalError(""); const data = new FormData(event.currentTarget); if ((!supplier && !supplierId) || !lines.length || lines.some(line => (!line.itemId && !line.newItem) || line.quantity <= 0 || !Number.isFinite(line.quantity) || line.unitPrice < 0 || !Number.isFinite(line.unitPrice))) { setLocalError("اختر المورد والأصناف وأدخل الكميات والأسعار الصحيحة"); return; } await onSubmit("shift_purchase", { shiftId, ...(supplier ? { supplier } : { supplierId }), warehouseId: String(data.get("warehouseId") ?? ""), lines: lines.map(line => ({ ...(line.newItem ? { newItem: line.newItem } : { itemId: line.itemId }), quantity: line.quantity, unitPrice: line.unitPrice })), vatRate, taxInclusive: inclusive, payment, attachmentIds: files.map(file => file.id), note: String(data.get("note") ?? "").trim() }); }}>
      {(error || localError) && <div className={styles.error} role="alert">{error || localError}</div>}
      <p className={styles.notice}>فاتورة مشتريات تزيد مخزون العلامة الدفع النقدي يُخصم من صندوق ورديتك والآجل يسجل مبلغًا مستحقًا للمورد</p>
      <fieldset disabled={busy} className={styles.shiftFieldset}>
        <div className={styles.fields}><div><Field label="المورد"><select value={supplier ? "new" : supplierId} required onChange={event => { if (event.target.value === "new") return; setSupplier(null); setSupplierId(event.target.value); }}><option value="">اختر المورد</option>{supplier && <option value="new">{supplier.name} — مورد جديد</option>}{snapshot.parties.filter(party => party.active && party.kind === "supplier").map(party => <option value={party.id} key={party.id}>{party.name}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setSupplierDialog(true)}><Plus size={16} aria-hidden="true" />{supplier ? "تعديل المورد الجديد" : "إضافة مورد"}</button></div><Field label="مستودع الاستلام"><select name="warehouseId" required defaultValue={snapshot.warehouses.find(item => item.active)?.id ?? ""}><option value="">اختر المستودع</option>{snapshot.warehouses.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field></div>
        <div className={styles.tableWrap}><table className={`${styles.table} ${styles.purchaseTable}`}><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>قيمة السطر</th><th><span className="sr-only">حذف</span></th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.key}><td><select required aria-label={`صنف المشتريات ${index + 1}`} value={line.newItem ? "new" : line.itemId} onChange={event => { if (event.target.value !== "new") updateLine(line.key, { itemId: event.target.value, newItem: undefined }); }}><option value="">اختر الصنف</option>{line.newItem && <option value="new">{line.newItem.name} — جديد</option>}{snapshot.items.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name} · {item.sku}</option>)}</select><button type="button" className={styles.purchaseInline} onClick={() => { setItemDraft(line.newItem ?? { name: "", sku: "", barcode: "" }); setItemDialog(line.key); }}><Plus size={14} aria-hidden="true" />{line.newItem ? "تعديل الصنف الجديد" : "إضافة صنف مخزون"}</button></td><td><input aria-label={`كمية الصنف ${index + 1}`} required type="number" min="0.001" step="0.001" inputMode="decimal" value={line.quantity} onChange={event => updateLine(line.key, { quantity: Number(event.target.value) })} /></td><td><input aria-label={`سعر وحدة الصنف ${index + 1}`} required type="number" min="0" step="0.01" inputMode="decimal" value={line.unitPrice} onChange={event => updateLine(line.key, { unitPrice: Number(event.target.value) })} /></td><td><Numeric value={line.quantity * line.unitPrice} money /></td><td><button type="button" className={styles.iconButton} disabled={lines.length === 1} aria-label={`حذف الصنف ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
        <button type="button" className={styles.secondary} disabled={lines.length >= 100} onClick={() => setLines(current => [...current, { key: Math.max(...current.map(line => line.key)) + 1, itemId: "", quantity: 1, unitPrice: 0 }])}><Plus size={16} aria-hidden="true" />إضافة سطر</button>
        <div className={styles.fields}><Field label="نسبة الضريبة %"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" required value={vatRate} onChange={event => setVatRate(Number(event.target.value))} /></Field><Field label="طريقة سداد المشتريات"><select value={payment} onChange={event => setPayment(event.target.value)}><option value="cash">نقدًا من صندوق الوردية</option><option value="credit">آجل على حساب المورد</option></select></Field></div>
        <label className={styles.check}><input type="checkbox" checked={inclusive} onChange={event => setInclusive(event.target.checked)} />أسعار الوحدات شاملة الضريبة</label>
        <div className={styles.shiftSummaryGrid}><div><span>المبلغ قبل الضريبة</span><strong><Numeric value={total.total - total.tax} money /></strong></div><div><span>مبلغ الضريبة {vatRate}%</span><strong><Numeric value={total.tax} money /></strong></div><div><span>إجمالي الفاتورة</span><strong><Numeric value={total.total} money /></strong></div></div>
        <Field label="بيان المشتريات اختياري"><textarea name="note" maxLength={500} /></Field>
      </fieldset>
      <FinanceShiftAttachments slug={snapshot.cafe.slug} shiftId={shiftId} value={files} onChange={setFiles} onBusyChange={setUploading} disabled={pending} />
      <div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>إلغاء</button><button type="submit" className={styles.primary} disabled={busy}>{uploading ? "جارٍ رفع المرفقات" : pending ? "جارٍ حفظ الفاتورة" : "حفظ فاتورة المشتريات"}</button></div>
    </form>
    {supplierDialog && <Modal open title="إضافة مورد" onClose={() => setSupplierDialog(false)} panelClassName={styles.shiftDialog}><form className={styles.form} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setSupplier({ name: String(data.get("name") ?? "").trim(), phone: String(data.get("phone") ?? "").trim(), taxNumber: String(data.get("taxNumber") ?? "").trim(), commercialRegistration: String(data.get("commercialRegistration") ?? "").trim() }); setSupplierId(""); setSupplierDialog(false); }}><p className={styles.muted}>اسم المورد مطلوب وبقية البيانات اختيارية يُحفظ المورد مع الفاتورة</p><div className={styles.fields}><Field label="اسم المورد"><input name="name" required maxLength={150} defaultValue={supplier?.name} /></Field><Field label="رقم الجوال اختياري"><input name="phone" type="tel" dir="ltr" maxLength={30} defaultValue={supplier?.phone} /></Field><Field label="الرقم الضريبي اختياري"><input name="taxNumber" dir="ltr" maxLength={30} defaultValue={supplier?.taxNumber} /></Field><Field label="السجل التجاري اختياري"><input name="commercialRegistration" dir="ltr" maxLength={30} defaultValue={supplier?.commercialRegistration} /></Field></div><button type="submit" className={styles.primary}>استخدام المورد في الفاتورة</button></form></Modal>}
    {itemDialog !== null && <Modal open title="إضافة صنف مخزون" onClose={() => { setItemDialog(null); setCamera(false); }} panelClassName={styles.shiftDialog}><form className={styles.form} onSubmit={event => { event.preventDefault(); updateLine(itemDialog, { itemId: "", newItem: { name: itemDraft.name.trim(), sku: itemDraft.sku.trim(), barcode: itemDraft.barcode?.trim() } }); setItemDialog(null); }}><p className={styles.notice}>يضاف الصنف إلى المخزون فقط ولا يظهر في المنيو يُحفظ عند اعتماد فاتورة المشتريات</p><Field label="اسم الصنف"><input required maxLength={150} value={itemDraft.name} onChange={event => setItemDraft(current => ({ ...current, name: event.target.value }))} /></Field><Field label="رمز الصنف"><input required maxLength={60} dir="ltr" value={itemDraft.sku} onChange={event => setItemDraft(current => ({ ...current, sku: event.target.value }))} /></Field><Field label="الباركود اختياري"><input maxLength={100} dir="ltr" value={itemDraft.barcode ?? ""} onChange={event => setItemDraft(current => ({ ...current, barcode: event.target.value }))} /></Field><button type="button" className={styles.secondary} onClick={() => setCamera(true)}><Camera size={16} aria-hidden="true" />قراءة الباركود بالكاميرا</button><button type="submit" className={styles.primary}>استخدام الصنف في الفاتورة</button></form></Modal>}
    {camera && <BarcodeCamera onClose={() => setCamera(false)} onValue={value => { setItemDraft(current => ({ ...current, barcode: value })); setCamera(false); }} />}
  </>;
}
