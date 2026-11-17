"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Eye, FileText, Plus, Printer, Save, Search, Trash2 } from "lucide-react";
import { actPurchases } from "@/app/actions/erp-purchases";
import { getAldeemPurchaseDefaults, readAldeemPurchaseRecord, searchAldeemPurchaseItems, searchAldeemPurchaseSuppliers } from "@/app/actions/aldeem-purchases";
import { newAldeemPurchase, type AldeemPurchaseDetail, type AldeemPurchaseDefaults, type AldeemPurchaseItem, type AldeemPurchaseSupplier } from "@/lib/erp/aldeem-purchases";
import { purchaseDocumentSchema, purchaseTotals, type PurchaseCommand, type PurchaseInput, type PurchaseLine } from "@/lib/erp/purchases";
import { convertPurchaseUnitPrice } from "@/lib/erp/purchase-units";
import { erpFieldDefault } from "@/lib/erp/custom-fields";
import type { TrackingRow } from "@/lib/erp/inventory-tracking";
import type { AldeemPurchasePrintModel } from "@/lib/export/aldeem-purchase-pdf";
import { ErpFieldValues } from "../erp/fields/field-values";
import { Modal } from "./ui/modal";
import css from "./aldeem-sales-quotes.module.css";
import style from "./aldeem-purchase-editor.module.css";

const labels = { invoice: "فاتورة مشتريات", request: "طلب شراء", order: "أمر شراء" };
const statusLabels = { draft: "مسودة", pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", converted: "تم التحويل", posted: "صادر", cancelled: "ملغى" };
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
type Kind = keyof typeof labels;

/** All reads are initiated by an explicit user action; opening a draft never loads a legacy workspace. */
export function AldeemPurchaseEditor({ kind, initial, onBack, onSaved, onOpenRecord }: {
  kind: Kind; initial?: AldeemPurchaseDetail; onBack: () => void; onSaved: (detail: AldeemPurchaseDetail) => void; onOpenRecord?: (id: string) => void;
}) {
  const [value, setValue] = useState<PurchaseInput>(() => initial?.record ?? newAldeemPurchase(kind));
  const [detail, setDetail] = useState(initial);
  const [supplier, setSupplier] = useState<AldeemPurchaseSupplier | null>(initial?.supplier ?? null);
  const [conversionSupplier, setConversionSupplier] = useState<AldeemPurchaseSupplier | null>(null);
  const [items, setItems] = useState<AldeemPurchaseItem[]>(initial?.items ?? []);
  const [defaults, setDefaults] = useState<AldeemPurchaseDefaults | null>(null);
  const [busy, setBusy] = useState(false), [optionsBusy, setOptionsBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(!initial), [leaveOpen, setLeaveOpen] = useState(false);
  const [lookup, setLookup] = useState<"item" | "supplier" | null>(null), [query, setQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false), [lookupError, setLookupError] = useState("");
  const [foundItems, setFoundItems] = useState<AldeemPurchaseItem[]>([]), [foundSuppliers, setFoundSuppliers] = useState<AldeemPurchaseSupplier[]>([]);
  const [confirm, setConfirm] = useState<PurchaseCommand | null>(null);
  const [preview, setPreview] = useState<AldeemPurchasePrintModel | null>(null);
  const [pdf, setPdf] = useState(""), [pdfBusy, setPdfBusy] = useState(false), [pdfError, setPdfError] = useState("");
  const [recoveryId, setRecoveryId] = useState("");
  const [autoPaid, setAutoPaid] = useState(false), [pdfReady, setPdfReady] = useState(false);
  const valueRef = useRef(value), defaultsRef = useRef<AldeemPurchaseDefaults | null>(null);
  const defaultsRequest = useRef<Promise<AldeemPurchaseDefaults> | null>(null);
  const locked = useRef(false), lookupVersion = useRef(0), alive = useRef(true), pdfVersion = useRef(0);
  const pdfUrl = useRef(""), pdfRequest = useRef<Promise<string> | null>(null);
  const retry = useRef<{ body: string; requestId: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pdfFrame = useRef<HTMLIFrameElement>(null);
  const paidEdited = useRef(!!initial), unitPriceOrigins = useRef(new Map<string, { unit: string; price: number }>());
  valueRef.current = value;
  const record = detail?.record;
  const editable = record ? ["draft", "rejected"].includes(record.status) && !!detail?.canUpdate : defaults?.canCreate !== false;
  const priced = kind !== "request";
  const totals = purchaseTotals(value);
  const canApprove = detail?.canApprove ?? defaults?.canApprove ?? false;
  const readonly = !editable || busy || !!recoveryId;

  useEffect(() => { alive.current = true; return () => { alive.current = false; lookupVersion.current++; pdfVersion.current++; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); }; }, []);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function patch(next: Partial<PurchaseInput>) { const updated = { ...valueRef.current, ...next }; if (autoPaid && kind === "invoice" && next.paid === undefined) updated.paid = purchaseTotals(updated).total; valueRef.current = updated; setValue(updated); setDirty(true); setNotice(""); }
  function patchLine(id: string, next: Partial<PurchaseLine>) { if (next.price !== undefined && next.unit === undefined) unitPriceOrigins.current.delete(id); patch({ lines: valueRef.current.lines.map(line => line.id === id ? { ...line, ...next } : line) }); }
  function changeUnit(line: PurchaseLine, item: AldeemPurchaseItem | undefined, unit: string) {
    const origin = unitPriceOrigins.current.get(line.id) ?? { unit: line.unit, price: line.price };
    unitPriceOrigins.current.set(line.id, origin);
    patchLine(line.id, { unit, price: convertPurchaseUnitPrice(origin.price, line.itemId, origin.unit, unit, (item?.units ?? []).map(row => ({ ...row, itemId: line.itemId }))) });
  }
  function ensureDefaults() {
    if (defaultsRef.current) return Promise.resolve(defaultsRef.current);
    if (defaultsRequest.current) return defaultsRequest.current;
    setOptionsBusy(true);
    defaultsRequest.current = getAldeemPurchaseDefaults().then(result => {
      if (!result.ok) throw new Error(result.message);
      const options = result.data;
      defaultsRef.current = options;
      if (alive.current) {
        setDefaults(options);
        if (!initial?.record) {
          const current = valueRef.current;
          const updated = { ...current, currency: options.financeSettings.currency || "SAR", taxInclusive: options.financeSettings.tax_inclusive,
            received: kind === "invoice" && options.settings.defaultReceived, adjustmentAccountId: options.settings.adjustmentAccountId,
            customValues: { ...Object.fromEntries(options.settings.fields.map(field => [field.id, erpFieldDefault(field)])), ...current.customValues } };
          updated.exchangeRate = updated.currency === "SAR" ? 1 : options.settings.exchangeRates.find(row => row.currency === updated.currency)?.rate ?? current.exchangeRate;
          if (kind === "invoice" && !paidEdited.current && options.settings.defaultPaid) { updated.paid = purchaseTotals(updated).total; setAutoPaid(true); }
          valueRef.current = updated; setValue(updated);
        }
      }
      return options;
    }).catch(cause => { defaultsRequest.current = null; throw cause; }).finally(() => { if (alive.current) setOptionsBusy(false); });
    return defaultsRequest.current;
  }
  async function loadOptions() { try { await ensureDefaults(); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة خيارات المشتريات"); } }
  async function search(mode: "item" | "supplier", text: string) {
    const version = ++lookupVersion.current; setLookupBusy(true); setLookupError("");
    try {
      if (mode === "item") {
        const [result] = await Promise.all([searchAldeemPurchaseItems(text), ensureDefaults()]);
        if (!result.ok) throw new Error(result.message);
        if (alive.current && version === lookupVersion.current) setFoundItems(result.data.filter(item => item.active));
      } else {
        const result = await searchAldeemPurchaseSuppliers(text);
        if (!result.ok) throw new Error(result.message);
        if (alive.current && version === lookupVersion.current) setFoundSuppliers(result.data.filter(item => item.active));
      }
    } catch (cause) { if (alive.current && version === lookupVersion.current) setLookupError(cause instanceof Error ? cause.message : "تعذر البحث أعد المحاولة"); }
    finally { if (alive.current && version === lookupVersion.current) setLookupBusy(false); }
  }
  function openLookup(mode: "item" | "supplier") { setLookup(mode); setQuery(""); setFoundItems([]); setFoundSuppliers([]); void search(mode, ""); }
  function closeLookup() { lookupVersion.current++; setLookup(null); setLookupBusy(false); }
  function addItem(item: AldeemPurchaseItem) {
    const settings = defaultsRef.current?.settings;
    if (!settings || valueRef.current.lines.length >= 100) return;
    setItems(current => [...current.filter(row => row.id !== item.id), item]);
    const unit = item.buyUnitName || item.unit;
    const taxRate = settings.taxMode === "none" ? 0 : settings.taxMode === "specific" ? settings.taxRate : Math.min(100, item.tax1 + item.tax2);
    patch({ lines: [...valueRef.current.lines, { id: crypto.randomUUID(), itemId: item.id, description: item.name, unit, quantity: 1, price: priced ? item.buyPrice : 0, discount: 0, discountType: "amount", taxRate: priced ? taxRate : 0, costCenterId: null, tracking: [] }] });
    closeLookup();
  }
  function moveLine(index: number, direction: number) { const lines = [...valueRef.current.lines]; const target = index + direction; if (target < 0 || target >= lines.length) return; [lines[index], lines[target]] = [lines[target], lines[index]]; patch({ lines }); }
  function validate(input: PurchaseInput, options: AldeemPurchaseDefaults) {
    const parsed = purchaseDocumentSchema.safeParse(input);
    if (!parsed.success) throw new Error("راجع الأصناف والكميات والتواريخ والأسعار ثم أعد الحفظ");
    if (priced && !input.supplierId) throw new Error("اختر المورد قبل حفظ المستند");
    if (input.dueDate && input.dueDate < input.date) throw new Error("تاريخ الاستحقاق يجب ألا يسبق تاريخ المستند");
    if (options.financeSettings.closed_through && input.date <= options.financeSettings.closed_through) throw new Error("تاريخ المستند يقع ضمن فترة مالية مغلقة");
    if (input.discountType === "percent" && input.discount > 100 || input.lines.some(line => line.discountType === "percent" && line.discount > 100 || line.discountType === "amount" && line.discount > line.quantity * line.price)) throw new Error("قيمة الخصم تتجاوز قيمة البند أو النسبة المسموحة");
    const result = purchaseTotals(input);
    if (result.total < 0 || input.paid > result.total) throw new Error("راجع الإجمالي والمبلغ المدفوع");
    if (input.paid > 0 && !input.accountId) throw new Error("اختر حساب الدفع للمبلغ المدفوع");
    if (input.received && !input.warehouseId) throw new Error("اختر مستودع الاستلام");
    if (input.currency !== "SAR" && options.settings.exchangeMode === "configured" && !options.settings.exchangeRates.some(row => row.currency === input.currency && row.rate === input.exchangeRate)) throw new Error("اختر عملة لها سعر صرف معرف في إعدادات المشتريات");
    const beforeDiscount = input.lines.reduce((sum, line) => sum + Math.max(0, line.quantity * line.price - (line.discountType === "percent" ? line.quantity * line.price * line.discount / 100 : line.discount)), 0);
    if (input.discountType === "amount" && input.discount > beforeDiscount) throw new Error("خصم المستند يتجاوز قيمة الأصناف");
    return parsed.data;
  }
  async function acceptDetail(id: string) {
    const result = await readAldeemPurchaseRecord(id);
    if (!result.ok) throw new Error(result.message);
    if (!result.data.record) throw new Error("تعذر قراءة المستند المحفوظ");
    if (!alive.current) return;
    applyDetail(result.data);
  }
  function applyDetail(next: AldeemPurchaseDetail) {
    if (!next.record) return;
    setDetail(next); setValue(next.record); valueRef.current = next.record;
    setSupplier(next.supplier); setItems(next.items); setDirty(false); setRecoveryId(""); onSaved(next);
  }
  async function execute(command?: PurchaseCommand) {
    if (locked.current || recoveryId) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const options = await ensureDefaults();
      const action: PurchaseCommand = command ?? { action: "save", payload: validate(valueRef.current, options) };
      const body = JSON.stringify({ ...action, branchScope: detail?.branchScope ?? options.branchScope });
      const requestId = retry.current?.body === body ? retry.current.requestId : crypto.randomUUID();
      retry.current = { body, requestId };
      const result = await actPurchases("khayal-aldeem", JSON.parse(body), requestId);
      if (!result.ok) throw new Error(result.message);
      retry.current = null; setConfirm(null);
      const id = action.action === "receive" ? valueRef.current.id : result.data.id ?? valueRef.current.id;
      try {
        if (action.action === "convert" && onOpenRecord) { await acceptDetail(action.payload.id); setDirty(false); onOpenRecord(id); }
        else await acceptDetail(id);
        setNotice(action.action === "post" ? "تم إصدار فاتورة المشتريات" : "تم حفظ العملية");
      } catch { setRecoveryId(id); setDirty(false); setError("تم حفظ العملية وتعذر تحديث تفاصيلها اضغط إعادة قراءة المستند"); }
    } catch (cause) { setConfirm(null); setError(cause instanceof Error ? cause.message : "تعذر تأكيد العملية أعد المحاولة"); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() { if (locked.current) return; locked.current = true; setBusy(true); try { await acceptDetail(recoveryId); setError(""); setNotice("تم تحديث المستند"); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة المستند"); } finally { locked.current = false; setBusy(false); } }
  function closePreview() { pdfVersion.current++; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); pdfUrl.current = ""; pdfRequest.current = null; setPdf(""); setPdfReady(false); setPdfBusy(false); setPdfError(""); setPreview(null); }
  function showPreview() {
    const input = valueRef.current, amounts = purchaseTotals(input);
    setPreview({ brand: defaults?.brand ?? detail?.brand ?? "سلسلة خيال الديم للحلويات", title: labels[kind], number: input.number || "مسودة", date: input.date,
      supplier: supplier?.name ?? "لم يحدد المورد", warehouse: defaults?.warehouses.find(row => row.id === input.warehouseId)?.name,
      currency: input.currency, exchangeRate: input.exchangeRate, status: dirty ? "مسودة غير محفوظة" : statusLabels[record?.status ?? "draft"], note: input.note, terms: input.terms,
      lines: amounts.rows.map(line => ({ name: line.description || items.find(item => item.id === line.itemId)?.name || "صنف", unit: line.unit, quantity: line.quantity, price: line.price, discount: line.discountType === "percent" ? line.price * line.quantity * line.discount / 100 : line.discount, tax: line.tax, total: line.total })),
      total: amounts.total, tax: amounts.tax, paid: kind === "invoice" ? input.paid : undefined, paidLabel: record?.status === "posted" ? "المدفوع عند الإصدار" : "الدفعة المحددة", outstanding: kind === "invoice" && record?.status !== "posted" ? amounts.total - input.paid : undefined, showPrices: priced });
  }
  async function preparePdf() {
    if (!preview) return "";
    if (pdfRequest.current) return pdfRequest.current;
    const version = pdfVersion.current; setPdfBusy(true); setPdfError("");
    pdfRequest.current = import("@/lib/export/aldeem-purchase-pdf").then(module => module.createAldeemPurchasePdf(preview)).then(blob => {
      if (!alive.current || version !== pdfVersion.current) return "";
      const url = URL.createObjectURL(blob); pdfUrl.current = url; setPdf(url); return url;
    }).catch(() => { if (alive.current && version === pdfVersion.current) { setPdfError("تعذر تجهيز ملف الطباعة أعد المحاولة"); pdfRequest.current = null; } return ""; }).finally(() => { if (alive.current && version === pdfVersion.current) setPdfBusy(false); });
    return pdfRequest.current;
  }

  return <section dir="rtl" className={`${css.page} ${style.body}`}>
    <header className={css.toolbar}><div><h2>{record ? `${labels[kind]} ${record.number}` : `إضافة ${labels[kind]}`}</h2><p>{record ? statusLabels[record.status] : "أدخل بيانات المورد والأصناف ثم احفظ المستند"}</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={() => dirty ? setLeaveOpen(true) : onBack()}><ArrowRight size={16} />رجوع للسجل</button><button type="button" onClick={showPreview} disabled={!value.lines.length}><Eye size={16} />استعراض المستند</button></div></header>
    {error && <p className={css.error} role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
    {notice && <p className={css.notice} role="status">{notice}</p>}
    {recoveryId && <button type="button" disabled={busy} onClick={() => void recover()}>إعادة قراءة المستند</button>}
    {record && !editable && !defaults && <button type="button" disabled={optionsBusy} onClick={() => void loadOptions()}>{optionsBusy ? "جار قراءة الخيارات" : "عرض بيانات المستودع والحقول الإضافية"}</button>}
    <form className={css.editor} onSubmit={event => { event.preventDefault(); void execute(); }}>
      <fieldset className={css.formBody} disabled={readonly}>
        <div className={css.metadata}>
          <section className={css.card}><h3>بيانات المستند</h3><div className={css.fields}>
            <label>عنوان المستند<input required maxLength={200} value={value.title} onChange={event => patch({ title: event.target.value })} /></label>
            <label>رقم المستند<input maxLength={80} placeholder="يحدد عند الحفظ" value={value.number} onChange={event => patch({ number: event.target.value })} /></label>
            <label>تاريخ المستند<input required type="date" value={value.date} onChange={event => patch({ date: event.target.value })} /></label>
            <label>{kind === "invoice" ? "تاريخ الاستحقاق" : "تاريخ التسليم المطلوب"}<input type="date" min={value.date} value={value.dueDate ?? ""} onChange={event => patch({ dueDate: event.target.value || null })} /></label>
          </div></section>
          <section className={css.card}><h3>المورد والمستودع</h3><label>المورد<button type="button" onClick={() => openLookup("supplier")}><Search size={16} />{supplier?.name || "اختر المورد"}</button></label>{supplier?.taxNumber && <p className={css.hint}>الرقم الضريبي {supplier.taxNumber}</p>}
            <label>المستودع<select value={value.warehouseId ?? ""} onFocus={() => void loadOptions()} onChange={event => patch({ warehouseId: event.target.value || null })}><option value="">{optionsBusy ? "جار قراءة المستودعات" : "اختر المستودع"}</option>{value.warehouseId && !defaults?.warehouses.some(row => row.id === value.warehouseId) && <option value={value.warehouseId}>المستودع المحفوظ</option>}{defaults?.warehouses.filter(row => row.active || row.id === value.warehouseId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            {!defaults && <button type="button" disabled={optionsBusy} onClick={() => void loadOptions()}>{optionsBusy ? "جار قراءة الخيارات" : "خيارات الضريبة والدفع"}</button>}
          </section>
        </div>
        <section className={css.lines}><h3>أصناف {labels[kind]}</h3><div className={css.tableScroll}><table className={style.lineTable}><thead><tr><th>الصنف والوصف</th><th>الوحدة</th><th>الكمية</th>{priced && <><th>سعر الوحدة</th><th>الخصم</th><th>الضريبة %</th><th>الإجمالي</th></>}<th>الإجراء</th></tr></thead><tbody>
          {value.lines.map((line, index) => { const item = items.find(row => row.id === line.itemId); const unitOptions = [...new Set([line.unit, item?.unit, ...(item?.units.map(unit => unit.name) ?? [])].filter(Boolean))] as string[]; const mode = item?.trackingMode ?? "quantity"; return <tr key={line.id}>
            <td><span className={style.itemName}>{item?.name || line.description}</span><input aria-label={`وصف البند ${index + 1}`} maxLength={5000} value={line.description} onChange={event => patchLine(line.id, { description: event.target.value })} />
              <div className={style.rowControls}><button type="button" disabled={index === 0} aria-label={`رفع البند ${index + 1}`} onClick={() => moveLine(index, -1)}><ArrowUp size={15} /></button><button type="button" disabled={index === value.lines.length - 1} aria-label={`خفض البند ${index + 1}`} onClick={() => moveLine(index, 1)}><ArrowDown size={15} /></button></div>
              {!!defaults?.costCenters.length && <label>مركز التكلفة<select value={line.costCenterId ?? ""} onChange={event => patchLine(line.id, { costCenterId: event.target.value || null })}><option value="">بدون مركز تكلفة</option>{defaults.costCenters.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label>}
              {kind === "invoice" && mode !== "quantity" && <details className={style.tracking}><summary>بيانات التتبع والاستلام</summary>{(line.tracking ?? []).map((row, n) => <div className={style.trackingRow} key={n}>{mode === "serial" && <label>الرقم المسلسل<input value={row.serial} maxLength={120} onChange={event => patchTracking(line, n, { serial: event.target.value })} /></label>}{["lot", "lot_expiry"].includes(mode) && <label>رقم الشحنة<input value={row.lot} maxLength={120} onChange={event => patchTracking(line, n, { lot: event.target.value })} /></label>}{["expiry", "lot_expiry"].includes(mode) && <label>تاريخ الانتهاء<input type="date" value={row.expiresOn} onChange={event => patchTracking(line, n, { expiresOn: event.target.value })} /></label>}<label>الكمية بالوحدة الأساسية<input type="number" min={.001} step={.001} disabled={mode === "serial"} value={row.quantity} onChange={event => patchTracking(line, n, { quantity: Number(event.target.value) })} /></label><button type="button" aria-label="حذف بيانات التتبع" onClick={() => patchLine(line.id, { tracking: line.tracking?.filter((_, i) => i !== n) })}><Trash2 size={16} /></button></div>)}<button type="button" onClick={() => patchLine(line.id, { tracking: [...(line.tracking ?? []), { serial: "", lot: "", expiresOn: "", quantity: 1 }] })}>إضافة بيانات تتبع</button></details>}
            </td>
            <td><select aria-label={`وحدة البند ${index + 1}`} value={line.unit} onChange={event => changeUnit(line, item, event.target.value)}>{unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></td>
            <td><input aria-label={`كمية البند ${index + 1}`} type="number" required min={.001} max={1e6} step={.001} value={line.quantity} onChange={event => patchLine(line.id, { quantity: Number(event.target.value) })} /></td>
            {priced && <><td>
              <input aria-label={`سعر البند ${index + 1}`} type="number" required min={0} max={1e9} step="any" disabled={!defaults || !defaults.settings.updateItemPrices && !!item?.buyPrice} value={line.price} onChange={event => patchLine(line.id, { price: Number(event.target.value) })} />
              {defaults && !defaults.settings.updateItemPrices && item && item.buyPrice > 0 && line.price === 0 && <button type="button" onClick={() => patchLine(line.id, { price: convertPurchaseUnitPrice(item.buyPrice, item.id, item.buyUnitName || item.unit, line.unit, item.units.map(unit => ({ ...unit, itemId: item.id }))) })}>تطبيق سعر الصنف</button>}
            </td><td><input aria-label={`خصم البند ${index + 1}`} type="number" min={0} step="any" disabled={!defaults || defaults.settings.discountMode === "invoice"} value={line.discount} onChange={event => patchLine(line.id, { discount: Number(event.target.value) })} /><select aria-label={`نوع خصم البند ${index + 1}`} value={line.discountType} disabled={!defaults || defaults.settings.discountMode === "invoice"} onChange={event => patchLine(line.id, { discountType: event.target.value as "amount" | "percent" })}><option value="amount">مبلغ</option><option value="percent">نسبة %</option></select></td><td><input aria-label={`ضريبة البند ${index + 1}`} type="number" min={0} max={100} step="any" disabled={defaults?.settings.taxMode !== "item"} value={line.taxRate} onChange={event => patchLine(line.id, { taxRate: Number(event.target.value) })} /></td><td className={style.money}>{money(totals.rows[index].total)}</td></>}
            <td><button type="button" className={style.remove} aria-label={`حذف البند ${index + 1}`} onClick={() => patch({ lines: value.lines.filter(row => row.id !== line.id) })}><Trash2 size={20} /></button></td>
          </tr>; })}
          {!value.lines.length && <tr><td colSpan={priced ? 8 : 4}><div className={css.empty}><FileText size={28} /><p>أضف الأصناف إلى المستند</p></div></td></tr>}
        </tbody></table></div><div className={css.footer}><button type="button" disabled={value.lines.length >= 100} onClick={() => openLookup("item")}><Plus size={16} />إضافة صنف</button><span>{value.lines.length} بند</span></div></section>
        {priced && <section className={css.card}><h3>القيمة والضريبة {kind === "invoice" && "والدفع"}</h3><div className={css.fields}>
          <label>العملة<input maxLength={3} pattern="[A-Z]{3}" value={value.currency} disabled={!defaults} onChange={event => { const currency = event.target.value.toUpperCase(); const rate = currency === "SAR" ? 1 : defaults?.settings.exchangeRates.find(row => row.currency === currency)?.rate; patch({ currency, exchangeRate: rate ?? value.exchangeRate }); }} /></label>
          {value.currency !== "SAR" && <label>سعر الصرف مقابل الريال<input required type="number" min={.000001} step="any" disabled={!defaults || defaults.settings.exchangeMode === "configured"} value={value.exchangeRate} onChange={event => patch({ exchangeRate: Number(event.target.value) })} /></label>}
          <label className={css.check}><input type="checkbox" disabled={!defaults} checked={value.taxInclusive} onChange={event => patch({ taxInclusive: event.target.checked })} />الأسعار شاملة الضريبة</label>
          <label>خصم المستند<input type="number" min={0} step="any" disabled={!defaults || defaults.settings.discountMode === "line"} value={value.discount} onChange={event => patch({ discount: Number(event.target.value) })} /></label><label>نوع الخصم<select disabled={!defaults || defaults.settings.discountMode === "line"} value={value.discountType} onChange={event => patch({ discountType: event.target.value as "amount" | "percent" })}><option value="amount">مبلغ</option><option value="percent">نسبة %</option></select></label>
          <label>الشحن<input type="number" min={0} step="any" value={value.shipping} onChange={event => patch({ shipping: Number(event.target.value) })} /></label>
          {defaults?.settings.allowAdjustment && <label>{defaults.settings.adjustmentLabel || "التسوية"}<input type="number" step="any" value={value.adjustment} onChange={event => patch({ adjustment: Number(event.target.value) })} /></label>}
          {kind === "invoice" && <label className={css.check}><input type="checkbox" checked={autoPaid} disabled={!defaults} onChange={event => { paidEdited.current = true; setAutoPaid(event.target.checked); if (event.target.checked) patch({ paid: totals.total }); }} />دفع كامل قيمة الفاتورة</label>}
          {kind === "invoice" && <><label>المدفوع<input type="number" min={0} max={totals.total} step="any" value={value.paid} onChange={event => { paidEdited.current = true; setAutoPaid(false); patch({ paid: Number(event.target.value) }); }} /></label><label>حساب الدفع<select value={value.accountId ?? ""} onFocus={() => void loadOptions()} onChange={event => patch({ accountId: event.target.value || null })}><option value="">اختر حساب الدفع</option>{value.accountId && !defaults?.accounts.some(row => row.id === value.accountId) && <option value={value.accountId}>الحساب المحفوظ</option>}{defaults?.accounts.filter(row => row.active && ["cash", "bank", "pos"].includes(row.kind)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className={css.check}><input type="checkbox" checked={value.received} disabled={!defaults} onChange={event => patch({ received: event.target.checked })} />استلام الأصناف في المستودع عند إصدار الفاتورة</label></>}
        </div><div className={css.totals}><div><span>الصافي</span><strong>{money(totals.net)} {value.currency}</strong></div><div><span>الضريبة</span><strong>{money(totals.tax)} {value.currency}</strong></div><div><span>الإجمالي</span><strong>{money(totals.total)} {value.currency}</strong></div></div></section>}
        <section className={css.card}><div className={css.fields}><label>ملاحظات<textarea rows={3} maxLength={5000} value={value.note} onChange={event => patch({ note: event.target.value })} /></label><label>الشروط<textarea rows={3} maxLength={5000} value={value.terms} onChange={event => patch({ terms: event.target.value })} /></label></div>
          {defaults && <ErpFieldValues fields={defaults.settings.fields} values={value.customValues} update={(key, entry) => patch({ customValues: { ...value.customValues, [key]: entry } })} readOnly={!editable} sources={{ customers: { label: "الموردون", options: supplier ? [{ id: supplier.id, name: supplier.name, phone: supplier.phone ?? "" }] : [] }, items: { label: "الأصناف", options: items }, warehouses: { label: "المستودعات", options: defaults.warehouses }, accounts: { label: "الحسابات", options: defaults.accounts }, cost_centers: { label: "مراكز التكلفة", options: defaults.costCenters } }} />}
        </section>
      </fieldset>
      <div className={css.actions}>{editable && <button className={css.primary} disabled={busy || !!recoveryId} type="submit"><Save size={16} />{busy ? "جار الحفظ" : "حفظ المسودة"}</button>}
        {record && !dirty && !recoveryId && <>
          {canApprove && kind !== "invoice" && record.status === "approved" && onOpenRecord && <button type="button" disabled={busy} onClick={() => openLookup("supplier")}>{(conversionSupplier ?? supplier) ? `مورد التحويل ${(conversionSupplier ?? supplier)?.name}` : "اختيار مورد التحويل"}</button>}
          {["draft", "rejected"].includes(record.status) && <button type="button" disabled={busy} onClick={() => setConfirm({ action: "submit", payload: { id: record.id, revision: record.revision } })}>إرسال للاعتماد</button>}
          {canApprove && record.status === "pending" && <><button type="button" disabled={busy} onClick={() => setConfirm({ action: "approve", payload: { id: record.id, revision: record.revision } })}>اعتماد المستند</button><button type="button" disabled={busy} onClick={() => setConfirm({ action: "reject", payload: { id: record.id, revision: record.revision } })}>رفض المستند</button></>}
          {canApprove && kind === "invoice" && ["draft", "approved"].includes(record.status) && <button type="button" className={css.primary} disabled={busy} onClick={() => setConfirm({ action: "post", payload: { id: record.id, revision: record.revision, expectedTotal: purchaseTotals(record).sarTotal } })}>إصدار فاتورة المشتريات</button>}
          {canApprove && kind !== "invoice" && record.status === "approved" && onOpenRecord && <button type="button" disabled={busy || !(conversionSupplier?.id ?? record.supplierId)} onClick={() => setConfirm({ action: "convert", payload: { id: record.id, revision: record.revision, kind: kind === "request" ? "order" : "invoice", supplierId: conversionSupplier?.id ?? record.supplierId, supplierIds: [] } })}>{kind === "request" ? "تحويل إلى أمر شراء" : "تحويل إلى فاتورة مشتريات"}</button>}
        </>}
      </div>
    </form>
    {detail && <AldeemPurchaseReceipt detail={detail} onSaved={applyDetail} />}
    <Modal open={!!lookup} title={lookup === "supplier" ? "اختيار المورد" : "اختيار الصنف"} onClose={closeLookup} panelClassName={css.dialog}><div className={css.page}><form className={style.searchRow} onSubmit={event => { event.preventDefault(); if (lookup) void search(lookup, query); }}><input aria-label="عبارة البحث" type="search" maxLength={100} placeholder={lookup === "supplier" ? "اسم المورد أو رقم الهاتف" : "اسم الصنف أو رمزه"} value={query} onChange={event => setQuery(event.target.value)} /><button disabled={lookupBusy} type="submit"><Search size={16} />بحث</button></form>{lookupError && <p role="alert" className={css.error}>{lookupError}</p>}{lookupBusy ? <p role="status" className={css.hint}>جار البحث</p> : <div className={style.searchResults}>{lookup === "supplier" ? foundSuppliers.map(row => <button type="button" key={row.id} onClick={() => { if (editable) { setSupplier(row); patch({ supplierId: row.id }); } else setConversionSupplier(row); closeLookup(); }}><span>{row.name}</span><small>{row.phone}</small></button>) : foundItems.map(row => <button type="button" key={row.id} onClick={() => addItem(row)}><span>{row.name}</span><small>{row.sku} {priced && money(row.buyPrice)}</small></button>)}{!lookupError && (lookup === "supplier" ? !foundSuppliers.length : !foundItems.length) && <p className={css.hint}>لا توجد نتائج مطابقة</p>}</div>}</div></Modal>
    <Modal open={!!confirm} title="تأكيد العملية" onClose={() => { if (!busy) setConfirm(null); }} panelClassName={css.dialog}><div className={css.page}><p>{confirm?.action === "post" ? "سيصدر المستند قيدًا ماليًا ويطبق الدفع والاستلام المحددين في الفاتورة" : confirm?.action === "convert" ? "سيتم إنشاء مستند مرتبط مع الاحتفاظ بالمستند الأصلي" : "تأكيد تغيير حالة المستند"}</p><div className={css.actions}><button className={css.primary} disabled={busy} onClick={() => confirm && void execute(confirm)}>{busy ? "جار التنفيذ" : "تأكيد"}</button><button disabled={busy} onClick={() => setConfirm(null)}>رجوع</button></div></div></Modal>
    <Modal open={leaveOpen} title="تغييرات غير محفوظة" onClose={() => setLeaveOpen(false)} panelClassName={css.dialog}><div className={css.page}><p>توجد تغييرات لم تحفظ بعد</p><div className={css.actions}><button onClick={() => setLeaveOpen(false)}>متابعة التحرير</button><button onClick={onBack}>الرجوع دون حفظ</button></div></div></Modal>
    <Modal open={!!preview} title={`استعراض ${labels[kind]}`} onClose={closePreview} panelClassName={css.previewDialog}>{preview && <div className={css.page}><div className={css.actions}><button className={css.primary} disabled={pdfBusy} onClick={() => void preparePdf()}><Printer size={16} />{pdfBusy ? "جار تجهيز الملف" : "تجهيز ملف الطباعة"}</button>{pdf && <><button type="button" disabled={!pdfReady} onClick={() => { try { pdfFrame.current?.contentWindow?.focus(); pdfFrame.current?.contentWindow?.print(); } catch { setPdfError("استخدم زر الطباعة في عارض المستند أو نزل الملف للطباعة"); } }}><Printer size={16} />طباعة المستند</button><a href={pdf} target="_blank" rel="noopener noreferrer">فتح للطباعة</a><a href={pdf} download={`${labels[kind]}-${preview.number}.pdf`}>تنزيل المستند</a></>}</div>{pdfError && <p role="alert" className={css.error}>{pdfError}</p>}{pdf ? <iframe ref={pdfFrame} onLoad={() => setPdfReady(true)} title={`ملف ${labels[kind]} للطباعة`} src={pdf} className={css.pdf} /> : <article className={style.document}><header className={css.previewHeader}><div><h3>{preview.brand}</h3><p>المورد {preview.supplier}</p></div><div><h3>{preview.title} {preview.number}</h3><p>التاريخ <bdi>{preview.date}</bdi></p><p>{preview.status}</p></div></header><div className={css.tableScroll}><table><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th>{priced && <><th>السعر</th><th>الضريبة</th><th>الإجمالي</th></>}</tr></thead><tbody>{preview.lines.map((line, index) => <tr key={index}><td>{line.name}</td><td>{line.unit}</td><td>{line.quantity}</td>{priced && <><td>{money(line.price)}</td><td>{money(line.tax)}</td><td>{money(line.total)}</td></>}</tr>)}</tbody></table></div>{priced && <div className={css.totals}><div><span>الضريبة</span><strong>{money(preview.tax)}</strong></div><div><span>الإجمالي</span><strong>{money(preview.total)} {preview.currency}</strong></div></div>}<p className={css.note}>{preview.note}</p><p className={css.note}>{preview.terms}</p></article>}</div>}</Modal>
  </section>;

  function patchTracking(line: PurchaseLine, index: number, values: Partial<TrackingRow>) { patchLine(line.id, { tracking: line.tracking?.map((row, n) => n === index ? { ...row, ...values } : row) }); }
}

/** Reuses the original receipt and original finance line identities, including for imported invoices. */
export function AldeemPurchaseReceipt({ detail, onSaved }: { detail: AldeemPurchaseDetail; onSaved: (detail: AldeemPurchaseDetail) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [tracking, setTracking] = useState<Record<string, TrackingRow[]>>({});
  const [needsRead, setNeedsRead] = useState(false);
  const locked = useRef(false), retry = useRef<{ body: string; requestId: string } | null>(null);
  const invoice = detail.document, receipt = detail.receipt;
  if (!invoice || invoice.kind !== "purchase" || !receipt || receipt.status !== "pending" || !detail.canApprove) return null;
  const lines = invoice.lines.flatMap(line => {
    const item = detail.items.find(item => item.id === line.item_id);
    return item && item.trackingMode !== "quantity" ? [{ line, item }] : [];
  });
  const change = (id: string, index: number, values: Partial<TrackingRow>) => setTracking(current => ({ ...current, [id]: (current[id] ?? []).map((row, n) => n === index ? { ...row, ...values } : row) }));
  async function receive() {
    if (locked.current || !receipt || !invoice) return;
    locked.current = true; setBusy(true); setError("");
    try {
      if (!needsRead) {
        const command = { action: "receive", payload: { id: receipt.source_document_id, revision: receipt.revision, tracking }, branchScope: detail.branchScope };
        const body = JSON.stringify(command), requestId = retry.current?.body === body ? retry.current.requestId : crypto.randomUUID();
        retry.current = { body, requestId };
        const result = await actPurchases("khayal-aldeem", command, requestId);
        if (!result.ok) throw new Error(result.message);
        retry.current = null; setNeedsRead(true);
      }
      const refreshed = await readAldeemPurchaseRecord(detail.record?.id ?? invoice.id);
      if (!refreshed.ok) { setError("تم اعتماد الاستلام وتعذر تحديث التفاصيل أعد قراءة المستند"); return; }
      setNeedsRead(false); setOpen(false); onSaved(refreshed.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تأكيد الاستلام أعد المحاولة"); }
    finally { locked.current = false; setBusy(false); }
  }
  return <div className={css.page}><div className={css.actions}><button type="button" onClick={() => {
    setTracking(Object.fromEntries(lines.map(({ line }) => [line.id, detail.record?.lines.find(row => row.id === line.id)?.tracking ?? []])));
    setError(""); setOpen(true);
  }}>اعتماد الاستلام المخزني</button></div>
    <Modal open={open} title="اعتماد الاستلام المخزني" panelClassName={css.dialog} onClose={() => { if (!busy) setOpen(false); }}>
      <form className={css.page} onSubmit={event => { event.preventDefault(); void receive(); }}>
        <p>ستضاف الأصناف إلى المستودع وينقل رصيد البضاعة قيد الاستلام إلى المخزون</p>
        {error && <p role="alert" className={css.error}>{error}</p>}
        <fieldset disabled={busy || needsRead} className={css.formBody}>{lines.map(({ line, item }) => <section key={line.id} className={css.card}>
          <h3>{line.name}</h3><p className={css.hint}>الكمية المطلوبة بالوحدة الأساسية {line.quantity}</p>
          {(tracking[line.id] ?? []).map((row, index) => <div key={index} className={style.trackingRow}>
            {item.trackingMode === "serial" && <label>الرقم المسلسل<input required maxLength={120} value={row.serial} onChange={event => change(line.id, index, { serial: event.target.value })} /></label>}
            {["lot", "lot_expiry"].includes(item.trackingMode) && <label>رقم الشحنة<input required maxLength={120} value={row.lot} onChange={event => change(line.id, index, { lot: event.target.value })} /></label>}
            {["expiry", "lot_expiry"].includes(item.trackingMode) && <label>تاريخ الانتهاء<input required type="date" value={row.expiresOn} onChange={event => change(line.id, index, { expiresOn: event.target.value })} /></label>}
            <label>الكمية<input required type="number" min={.001} step={.001} value={row.quantity} disabled={item.trackingMode === "serial"} onChange={event => change(line.id, index, { quantity: Number(event.target.value) })} /></label>
            <button type="button" aria-label="حذف بيانات التتبع" onClick={() => setTracking(current => ({ ...current, [line.id]: current[line.id].filter((_, n) => index !== n) }))}><Trash2 size={18} /></button>
          </div>)}
          <button type="button" disabled={(tracking[line.id]?.length ?? 0) >= 1000} onClick={() => setTracking(current => ({ ...current, [line.id]: [...(current[line.id] ?? []), { serial: "", lot: "", expiresOn: "", quantity: 1 }] }))}><Plus size={16} />إضافة بيانات تتبع</button>
        </section>)}</fieldset>
        <div className={css.actions}><button type="submit" disabled={busy} className={css.primary}>{busy ? "جار التنفيذ" : needsRead ? "إعادة قراءة المستند" : "تأكيد الاستلام"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>رجوع</button></div>
      </form>
    </Modal>
  </div>;
}
