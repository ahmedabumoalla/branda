"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Eye, FileText, Plus, Printer, Save } from "lucide-react";
import { getAldeemQuoteDefaults } from "@/app/actions/aldeem-quotes";
import { saveQuoteAction } from "@/app/actions/finance-quotes";
import { searchAldeemInvoiceProducts } from "@/app/actions/aldeem-invoice-lookups";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import { newAldeemQuote } from "@/lib/finance/aldeem-quotation";
import { quoteAmounts, quotePreview, quoteStatus, quoteStatusLabels, type QuotePayload, type QuoteRecord } from "@/lib/finance/quotation";
import { displayRecordNumber } from "@/lib/erp/settings-numbering";
import type { FinanceParty } from "@/lib/finance/brand-finance";
import type { InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { CompanyInvoiceLines } from "../finance/company-invoice-lines";
import { InvoiceCustomerSearch } from "../finance/invoice-customer-search";
import { AldeemCustomerForm } from "../finance/aldeem-customer-form";
import { Modal } from "./ui/modal";
import aldeem from "../finance/finance-sale-aldeem.module.css";
import css from "./aldeem-sales-quotes.module.css";

type Options = Extract<Awaited<ReturnType<typeof getAldeemQuoteDefaults>>, { ok: true }>["data"];
const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function AldeemQuoteEditor({ saved, onBack, onSaved }: { saved?: QuoteRecord; onBack: () => void; onSaved: (record: QuoteRecord) => void }) {
  const [payload, setPayload] = useState<QuotePayload>(() => saved?.payload ?? newAldeemQuote());
  const [record, setRecord] = useState(saved);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [taxReady, setTaxReady] = useState(!!saved);
  const [customer, setCustomer] = useState<FinanceParty | undefined>(() => saved?.payload.document.invoice.partyId ? {
    id: saved.payload.document.invoice.partyId, name: saved.customerName, kind: "customer", active: true, balance: 0, phone: "", email: "", tax_number: "",
  } : undefined);
  const [products, setProducts] = useState<InvoiceCatalogProduct[]>(() => [...new Map((saved?.lines.map(line => {
    const stored = saved.payload.document.invoice.lines.find(row => row.productId === line.productId);
    const inventory = stored?.catalogSource === "inventory";
    return {
      id: line.productId, name: line.name, price: stored?.price ?? 0,
      available: true, imageUrl: null, stockTracked: inventory, itemId: inventory ? line.productId : null, quantity: 0, category: "",
      ...(inventory ? { catalogSource: "inventory" as const, unitName: stored.unitName, unitFactor: stored.unitFactor,
        units: [...new Map(saved.payload.document.invoice.lines.filter(row => row.productId === line.productId && row.unitName && row.unitFactor).map(row => [row.unitName, { name: row.unitName!, factor: row.unitFactor! }])).values()],
        kind: stored.kind, vatRate: stored.vatRate, taxCategory: stored.taxCategory, exemptionReason: stored.exemptionReason } : {}),
    };
  }) ?? []).map(product => [product.id, product])).values()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(!saved);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [preview, setPreview] = useState<CompanyInvoicePreview | null>(null);
  const [pdf, setPdf] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const identity = useRef({ id: saved?.id ?? "", revision: saved?.revision ?? 0 });
  const defaultsRequest = useRef<Promise<Options> | null>(null);
  const defaultsValue = useRef<Options | null>(null);
  const taxEdited = useRef(!!saved);
  const inclusiveEdited = useRef(!!saved);
  const payloadRef = useRef(payload);
  const locked = useRef(false), customerLocked = useRef(false);
  const pdfRequest = useRef<Promise<string> | null>(null);
  const pdfUrl = useRef("");
  const previewVersion = useRef(0);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLParagraphElement>(null);
  payloadRef.current = payload;
  const invoice = payload.document.invoice;
  const amounts = quoteAmounts(payload.document);
  const disabled = busy || !!record?.invoiceDraftId;

  // Lifecycle only: no requests on mount, focus, sidebar navigation or browser visibility.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; previewVersion.current++; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function patch(next: Partial<QuotePayload>) { setPayload(current => ({ ...current, ...next })); setDirty(true); setError(""); setNotice(""); }
  function patchInvoice(next: Partial<typeof invoice>) { setPayload(current => ({ ...current, document: { ...current.document, invoice: { ...current.document.invoice, ...next } } })); setDirty(true); setError(""); setNotice(""); }
  function applyDefaults(current: QuotePayload, data: Options): QuotePayload {
    return { ...current, document: { ...current.document, invoice: { ...current.document.invoice,
      warehouseId: current.document.invoice.warehouseId || (!saved ? data.warehouses[0]?.id : "") || "",
      ...(!taxEdited.current ? { vatRate: data.taxRate } : {}),
      ...(!inclusiveEdited.current ? { taxInclusive: data.taxInclusive } : {}),
    } } };
  }
  function ensureDefaults(): Promise<Options> {
    if (defaultsRequest.current) return defaultsRequest.current;
    setOptionsLoading(true); setOptionsError("");
    defaultsRequest.current = getAldeemQuoteDefaults().then(result => {
      if (!result.ok) throw new Error(result.message);
      defaultsValue.current = result.data;
      if (mounted.current) { setOptions(result.data); setPayload(current => applyDefaults(current, result.data)); setTaxReady(true); }
      return result.data;
    }).catch(cause => {
      defaultsRequest.current = null;
      if (mounted.current) setOptionsError(cause instanceof Error ? cause.message : "تعذر تحميل خيارات العرض");
      throw cause;
    }).finally(() => { if (mounted.current) setOptionsLoading(false); });
    return defaultsRequest.current;
  }
  const searchProducts = useCallback(async (query: string) => {
    const result = await searchAldeemInvoiceProducts(query);
    if (!result.ok) throw new Error(result.message);
    const rows = result.data;
    if (mounted.current) setProducts(previous => [...new Map([...previous, ...rows].map(product => [product.id, product])).values()]);
    return rows.map(product => product.id);
  }, []);
  async function prepare() {
    if (taxEdited.current && payloadRef.current.document.invoice.warehouseId) return payloadRef.current;
    const data = await ensureDefaults();
    const next = applyDefaults(payloadRef.current, data);
    setPayload(next);
    return next;
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الطلب أعد المحاولة"); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(status: QuotePayload["status"]) {
    const next = { ...await prepare(), status };
    if (status !== "draft" && !next.document.invoice.partyId) throw new Error("اختر العميل قبل حفظ عرض السعر");
    if (!identity.current.id) identity.current.id = crypto.randomUUID();
    const result = await saveQuoteAction({ ...identity.current, payload: next }, "khayal-aldeem");
    if (!result.ok) throw new Error(result.message);
    identity.current = { id: result.data.id, revision: result.data.revision };
    setRecord(result.data); setPayload(result.data.payload); setDirty(false);
    setNotice(`تم حفظ عرض السعر رقم ${displayRecordNumber(result.data)}`);
    onSaved(result.data);
  }
  function closePreview() {
    previewVersion.current++; pdfRequest.current = null;
    if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    pdfUrl.current = ""; setPdf(""); setPreview(null); setPdfBusy(false); setPdfError("");
  }
  async function showPreview() {
    const next = await prepare();
    closePreview();
    setPreview({ ...quotePreview(next, {
      brand: defaultsValue.current?.brand || "الديم", customer: customer?.name || record?.customerName || "",
      warehouse: defaultsValue.current?.warehouses.find(warehouse => warehouse.id === next.document.invoice.warehouseId)?.name || record?.warehouseName || "",
      products,
    }, record), appearance: "aldeem" });
  }
  function preparePdf() {
    if (!preview) return Promise.resolve("");
    if (pdfRequest.current) return pdfRequest.current;
    const version = previewVersion.current;
    setPdfBusy(true); setPdfError("");
    pdfRequest.current = import("@/lib/export/company-invoice-preview-pdf").then(module => module.createCompanyInvoicePreviewPdf(preview)).then(blob => {
      if (!mounted.current || previewVersion.current !== version) return "";
      const url = URL.createObjectURL(blob); pdfUrl.current = url; setPdf(url); return url;
    }).catch(() => {
      if (mounted.current && previewVersion.current === version) { pdfRequest.current = null; setPdfError("تعذر تجهيز ملف الطباعة أعد المحاولة"); }
      return "";
    }).finally(() => { if (mounted.current && previewVersion.current === version) setPdfBusy(false); });
    return pdfRequest.current;
  }
  async function createCustomer(values: Record<string, unknown>) {
    if (customerLocked.current) return false;
    customerLocked.current = true; setCustomerBusy(true); setCustomerError("");
    try {
      // The customer form retains its UUID across retries.
      const result = await executeBrandFinanceAction({ operation: "party", requestId: String(values.id), payload: { ...values, kind: "customer" } }, "khayal-aldeem");
      if (!result.ok) throw new Error(result.message);
      const party: FinanceParty = { id: result.data.id, kind: "customer", name: String(values.name ?? ""), phone: String(values.phone ?? ""), email: String(values.email ?? ""), tax_number: String(values.taxNumber ?? ""), active: true, balance: 0 };
      setCustomer(party); patchInvoice({ partyId: party.id }); return true;
    } catch (cause) { setCustomerError(cause instanceof Error ? cause.message : "تعذر تأكيد حفظ العميل أعد المحاولة"); return false; }
    finally { customerLocked.current = false; setCustomerBusy(false); }
  }

  return <>
    <form className={`${css.editor} ${aldeem.form}`} inert={customerOpen || cancelOpen || !!preview} onSubmit={event => { event.preventDefault(); if (!disabled) void run(() => save(payload.status === "draft" ? "ready" : payload.status)); }}>
      <header className={css.toolbar} data-invoice-toolbar><div><h2>{record ? `عرض سعر رقم ${displayRecordNumber(record)}` : "إنشاء عرض سعر"}</h2><p>{record ? quoteStatusLabels[quoteStatus(record)] : "العميل والأصناف وتفاصيل العرض"}</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={() => dirty ? setCancelOpen(true) : onBack()}><ArrowRight size={17} aria-hidden="true" />سجل العروض</button><button type="button" disabled={busy} onClick={() => void run(showPreview)}><Eye size={17} aria-hidden="true" />استعراض عرض السعر</button><button type="button" disabled={disabled} onClick={() => void run(() => save("draft"))}><Save size={17} aria-hidden="true" />حفظ كمسودة</button><button type="submit" className={css.primary} disabled={disabled}>{busy ? "جار تنفيذ الطلب" : "حفظ عرض السعر"}</button></div></header>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className={css.error}>{error}</p>}{notice && <p className={css.notice} role="status">{notice}</p>}
      <fieldset disabled={disabled} className={css.formBody}>
        <section className={css.template}><span><FileText size={20} aria-hidden="true" />عرض سعر</span><label>قالب العرض<select value={payload.document.template} onChange={event => patch({ document: { ...payload.document, template: event.target.value as "standard" | "thermal" } })}><option value="standard">التصميم الافتراضي</option><option value="thermal">تصميم حراري</option></select></label></section>
        <div className={css.metadata} data-invoice-metadata><section className={css.card} aria-label="العميل والمستودع"><h3 className={aldeem.heading}><span>01</span>بيانات العميل</h3><label>العميل</label><div className={aldeem.customerRow}><InvoiceCustomerSearch customer={customer} disabled={disabled} onSelect={party => { setCustomer(party); patchInvoice({ partyId: party.id }); }} /><button type="button" onClick={() => { setCustomerError(""); setCustomerOpen(true); }}><Plus size={16} aria-hidden="true" />إضافة</button></div><label>مستودع البيع<select value={invoice.warehouseId} onFocus={() => { void ensureDefaults().catch(() => undefined); }} onChange={event => patchInvoice({ warehouseId: event.target.value })}><option value="">{optionsLoading ? "جار قراءة المستودعات" : "اختيار المستودع"}</option>{invoice.warehouseId && !options?.warehouses.some(warehouse => warehouse.id === invoice.warehouseId) && <option value={invoice.warehouseId}>{record?.warehouseName || "المستودع المحدد"}</option>}{options?.warehouses.map(warehouse => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>{optionsError && <div className={css.error} role="alert">{optionsError}<button type="button" onClick={() => { void ensureDefaults().catch(() => undefined); }}>إعادة المحاولة</button></div>}</section>
        <section className={css.card}><h3 className={aldeem.heading}><span>02</span>بيانات عرض السعر</h3><div className={css.fields}><label>رقم العرض<input readOnly value={record ? displayRecordNumber(record) : "يُحدد عند الحفظ"} /></label><label>تاريخ العرض<input type="date" required value={payload.date} onChange={event => patch({ date: event.target.value })} /></label><label>صالح حتى<input type="date" min={payload.date} value={payload.validUntil} onChange={event => patch({ validUntil: event.target.value })} /></label><label>الحالة<select value={payload.status} onChange={event => patch({ status: event.target.value as QuotePayload["status"] })}>{(["draft", "ready", "accepted", "rejected"] as const).map(status => <option key={status} value={status}>{quoteStatusLabels[status]}</option>)}</select></label></div></section></div>
        <section className={css.lines}><h3>أصناف عرض السعر</h3><CompanyInvoiceLines lines={invoice.lines} products={products} vatRate={invoice.vatRate ?? 0} disabled={disabled} amounts={amounts.rows} onSearchProducts={searchProducts} onChange={lines => patchInvoice({ lines })} summary={<div className={css.totals}>{[["المجموع الفرعي", money(amounts.subtotal)], ["الخصم", money(amounts.discount)], ["الضريبة", taxReady ? money(amounts.tax) : "حسب إعدادات الحساب"], ["الإجمالي", taxReady ? money(amounts.total) : "يُحسب بعد تحديد الضريبة"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>} /></section>
        <section className={css.card}><h3>الخصم والضريبة</h3><div className={css.fields}><label>ضريبة العرض<select value={taxReady ? String(invoice.vatRate ?? 0) : "account"} onChange={event => { if (event.target.value === "account") { taxEdited.current = false; setDirty(true); setNotice(""); setError(""); void ensureDefaults().then(data => { setPayload(current => applyDefaults(current, data)); setTaxReady(true); }).catch(() => undefined); } else { taxEdited.current = true; setTaxReady(true); patchInvoice({ vatRate: Number(event.target.value) }); } }}><option value="account">حسب إعدادات الحساب</option><option value="0">بدون ضريبة</option><option value="15">ضريبة القيمة المضافة 15%</option>{invoice.vatRate !== undefined && ![0, 15].includes(invoice.vatRate) && <option value={invoice.vatRate}>{invoice.vatRate}%</option>}</select></label><label className={css.check}><input type="checkbox" checked={invoice.taxInclusive} onChange={event => { inclusiveEdited.current = true; patchInvoice({ taxInclusive: event.target.checked }); }} />الأسعار شاملة الضريبة</label><label className={css.check}><input type="checkbox" checked={invoice.discountEnabled} onChange={event => patchInvoice({ discountEnabled: event.target.checked })} />يوجد خصم على العرض</label>{invoice.discountEnabled && <><label>الخصم<input type="number" required min="0" max={invoice.discountKind === "percent" ? 100 : amounts.subtotal} step="0.01" value={invoice.discountValue} onChange={event => patchInvoice({ discountValue: Number(event.target.value) })} /></label><label>نوع الخصم<select value={invoice.discountKind} onChange={event => patchInvoice({ discountKind: event.target.value as "amount" | "percent" })}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></label></>}</div></section>
        <section className={css.card}><label>الملاحظات والشروط<textarea maxLength={500} value={invoice.note} rows={3} placeholder="أضف شروط عرض السعر أو ملاحظات العميل" onChange={event => patchInvoice({ note: event.target.value })} /></label></section>
      </fieldset>
    </form>
    <Modal open={customerOpen} title="إضافة عميل" onClose={() => { if (!customerBusy) setCustomerOpen(false); }} panelClassName={css.dialog}><AldeemCustomerForm pending={customerBusy} error={customerError} onCancel={() => setCustomerOpen(false)} onSubmit={(_, values) => createCustomer(values)} onSaved={() => setCustomerOpen(false)} /></Modal>
    <Modal open={cancelOpen} title="تعديلات غير محفوظة" onClose={() => setCancelOpen(false)} panelClassName={css.dialog}><p>لم تُحفظ آخر التعديلات على عرض السعر</p><div className={css.actions}><button type="button" className={css.primary} onClick={() => setCancelOpen(false)}>متابعة التعديل</button><button type="button" onClick={onBack}>العودة دون حفظ</button></div></Modal>
    <Modal open={!!preview} title="استعراض عرض السعر" onClose={closePreview} panelClassName={css.previewDialog}>{preview && <div className={css.preview}>
      <div className={css.actions}><button type="button" className={css.primary} disabled={pdfBusy} onClick={() => void preparePdf()}><Printer size={17} aria-hidden="true" />{pdfBusy ? "جار تجهيز ملف الطباعة" : "عرض ملف الطباعة"}</button>{pdf && <><a href={pdf} target="_blank" rel="noopener">فتح للطباعة</a><a href={pdf} download={`quote-${record ? displayRecordNumber(record) : "preview"}.pdf`}><Download size={17} aria-hidden="true" />تنزيل العرض</a></>}</div>{pdfError && <p role="alert" className={css.error}>{pdfError}</p>}
      {pdf ? <iframe className={css.pdf} src={pdf} title="عرض السعر جاهز للطباعة" /> : <><header className={css.previewHeader}><div><h2>{preview.brand}</h2><p>{preview.customer}</p></div><div><h3>{preview.quote?.draft ? "مسودة عرض سعر" : "عرض سعر"}{record ? ` #${displayRecordNumber(record)}` : " غير محفوظ"}</h3><p>التاريخ {preview.quote?.date}</p><p>صالح حتى {preview.quote?.validUntil || "غير محدد"}</p></div></header><p className={css.notice}>عرض سعر وليس فاتورة ضريبية{dirty ? " · يتضمن تعديلات غير محفوظة" : ""}</p><div className={css.tableScroll}><table><thead><tr>{["الصنف", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "المجموع"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{preview.lines.map((line, index) => <tr key={index}><td>{line.name}{line.description && <p>{line.description}</p>}</td><td>{line.quantity}</td>{[line.price, line.discount, line.tax, line.total].map((value, column) => <td key={column}>{money(value)}</td>)}</tr>)}</tbody></table></div><div className={css.totals}>{[["المجموع الفرعي", preview.subtotal], ["الخصم", preview.discount], ["الضريبة", preview.tax], ["الإجمالي", preview.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(Number(value))}</strong></div>)}</div><p className={css.note}>{preview.note}</p></>}
    </div>}</Modal>
  </>;
}
