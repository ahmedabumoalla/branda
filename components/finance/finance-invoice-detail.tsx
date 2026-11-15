"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Copy, CreditCard, FileDown, FileText, Pencil, Printer, RotateCcw, Truck } from "lucide-react";
import { updateInvoiceManagementAction } from "@/app/actions/finance-invoice-management";
import { createInvoiceDetailCache, invoiceDetailContext, invoiceDetailSession, type InvoiceDetailCache, type InvoiceDetailLoader } from "@/lib/finance/invoice-detail-loader";
import { isMindSalesSimplified } from "@/lib/finance/sales-features";
import { saveInvoiceDraftAction } from "@/app/actions/finance-invoice-drafts";
import { copyFinanceInvoiceLineNotes } from "@/app/actions/finance-invoice-line-notes";
import { copyFinanceInvoiceShippingCharge } from "@/app/actions/finance-invoice-shipping-charge";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { type InvoiceDetail, type InvoiceSchedule } from "@/lib/finance/invoice-management";
import { canFinance } from "@/lib/finance/permissions";
import { invoiceCopyPayload } from "@/lib/finance/invoice-copy";
import { InvoiceFileDownloads } from "./company-invoice-files";
import { financeDate, Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";
import { FinancePaymentEditor } from "./finance-payment-editor";
import { FinancePaymentDetail } from "./finance-payment-detail";
import { FinanceJournalPreview } from "./finance-journal-detail";
import type { InvoicePayment } from "@/lib/finance/payment-management";
import { PaymentReceiptDialog } from "./payment-receipt-dialog";
import { paymentReceiptData, type PaymentReceiptMode } from "@/lib/finance/payment-receipt";
import { renderInvoiceDetails } from "./invoice-details-view";
import { InvoiceOrderSourceSummary } from "./invoice-order-source-summary";
import { renderInvoicePayments, type PaymentOrder } from "./invoice-payments-view";
import { renderInvoiceStock, renderInvoiceInstallments } from "./invoice-stock-installments";
import { newInvoiceSchedule, InvoiceInstallmentEditor } from "./invoice-installment-editor";
import { InvoiceAdvancedTools, InvoiceProfitPanel, useInvoiceAdvanced } from "./invoice-advanced-tools";
import { InvoiceReturnsPanel } from "./invoice-returns-panel";
import { InvoiceActivityTimeline } from "./invoice-activity-timeline";
import { InvoiceAmendmentDialog } from "./invoice-amendment-dialog";
import activityStyles from "./invoice-activity-timeline.module.css";

const tabs = [["invoice", "فاتورة"], ["details", "التفاصيل"], ["payments", "المدفوعات"], ["returns", "المرتجع"], ["activity", "سجل النشاطات"], ["stock", "المخزون"], ["installments", "اتفاقية التقسيط"]] as const;
type Tab = typeof tabs[number][0] | "profit";
const frequencies: Record<InvoiceSchedule["frequency"], string> = { weekly: "أسبوعي", fortnightly: "كل أسبوعين", monthly: "شهري", quarterly: "كل ثلاثة أشهر", half_yearly: "كل ستة أشهر", yearly: "سنوي" };

export function FinanceInvoiceDetail({ id, snapshot, disabled, onBack, onNavigate, onPrint, onSettle, onRefund, onDraft, onChanged, initialPaymentId, onCustomer, onCustomerStatement, onJournal, invoiceDetailCache }: {
  id: string; snapshot: FinanceSnapshot; disabled: boolean; onBack: () => void; onNavigate: (id: string) => void;
  onPrint: (document: FinanceDocument) => void; onSettle?: (document: FinanceDocument, amount?: number) => void; onRefund?: (document: FinanceDocument) => void; onDraft?: (id: string) => void; onChanged?: () => void | Promise<void>;
  initialPaymentId?: string | null; onCustomer?: (id: string, paymentId?: string) => void; onCustomerStatement?: (id: string) => void; onJournal?: (id: string, paymentId: string) => void; invoiceDetailCache?: InvoiceDetailCache;
}) {
  const [loaded, setLoaded] = useState<{ detail?: InvoiceDetail; error?: string; loader: InvoiceDetailLoader } | null>(null);
  const [privateCache] = useState(createInvoiceDetailCache);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Tab>("invoice");
  const [editing, setEditing] = useState(false);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [paymentEditor, setPaymentEditor] = useState<{ payment: InvoicePayment; deleting: boolean } | null>(null);
  const [paymentViewId, setPaymentViewId] = useState<string | null>(initialPaymentId ?? null);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder>("newest");
  const [paymentSelection, setPaymentSelection] = useState<{ document: FinanceDocument; mode: PaymentReceiptMode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState<InvoiceSchedule>(newInvoiceSchedule);
  const lock = useRef(false);
  const copyId = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const slug = snapshot.cafe.slug;
  const simplifiedSales = isMindSalesSimplified(slug);
  const cache = invoiceDetailCache ?? privateCache;
  const detailLoader = cache.get({ id, slug, context: invoiceDetailContext(snapshot), session: invoiceDetailSession(snapshot) });
  const cached = detailLoader.peek();
  const readError = detailLoader.error();
  const current = cached?.ok ? { detail: cached.data, error: undefined } : readError ? { detail: undefined, error: readError } : loaded?.loader === detailLoader ? loaded : null;
  const advanced = useInvoiceAdvanced(id, slug, canFinance(snapshot.role, "reports"), revision, detailLoader, detailLoader.advanced);
  const profitAvailable = !!advanced.settings?.advanced.profitEnabled && !!advanced.data?.profit;
  const hasReturns = current?.detail?.related.some(item => item.kind === "refund") || snapshot.refundRequests?.some(item => item.document_id === id);
  const standardTabs = tabs.filter(([key]) => !(simplifiedSales && key === "installments") && (key !== "returns" || hasReturns));
  const visibleTabs: readonly (readonly [Tab, string])[] = profitAvailable ? [...standardTabs, ["profit", "الربح"]] : standardTabs;
  const activeTab = visibleTabs.some(([key]) => key === tab) ? tab : "invoice";
  useEffect(() => {
    let active = true;
    if (detailLoader.peek()) return;
    detailLoader.detail().then(result => {
      if (active) setLoaded({ ...(result.ok ? { detail: result.data } : { error: result.message }), loader: detailLoader });
    }).catch(() => { if (active) setLoaded({ error: "تعذر تحميل تفاصيل الفاتورة أعد المحاولة", loader: detailLoader }); });
    return () => { active = false; };
  }, [detailLoader]);
  const loading = !current;
  const detail = current?.detail;
  const invoice = detail?.document;
  const write = canFinance(snapshot.role, "accounting_write");
  const blocked = disabled || busy || loading || !!current?.error;
  const issued = detail?.invoice;
  const displayNumber = issued?.displayNumber || String(issued?.number ?? invoice?.number ?? "").padStart(6, "0");
  const documentTitle = issued?.documentType === "advance" ? "فاتورة دفعة مقدمة" : issued?.documentType === "debit" ? "إشعار مدين" : "الفاتورة";
  const customer = issued?.customer.name || detail?.customer?.name || "عميل نقدي";
  const delivery = detail?.metadata.delivery ?? issued?.delivery;
  const savedSchedule = detail?.metadata.schedule;
  const documents = snapshot.documents.filter(item => item.kind === "sale");
  const index = documents.findIndex(item => item.id === id);
  const pdf = issued ? `/api/finance/${encodeURIComponent(slug)}/company-invoices/${issued.id}/pdf` : "";

  function reloadDetail() { cache.clear(); setRevision(value => value + 1); }

  async function update(input: Record<string, unknown>) {
    if (lock.current || blocked || !write) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await updateInvoiceManagementAction({ ...input, ids: [id] }, slug);
      if (!result.ok) { setError(result.message); return; }
      setMessage("تم حفظ بيانات الفاتورة"); setEditing(false); reloadDetail();
    } catch { setError("تعذر تأكيد الحفظ أعد تحميل التفاصيل قبل المحاولة مجددًا"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    if (lock.current || blocked || !write || !invoice || !onDraft) return;
    lock.current = true; setBusy(true); setError("");
    try {
      copyId.current ??= crypto.randomUUID();
      const result = await saveInvoiceDraftAction({ id: copyId.current, revision: 0, payload: invoiceCopyPayload(detail!) }, slug);
      if (!result.ok) { setError(result.message); return; }
      const shipping = await copyFinanceInvoiceShippingCharge(slug, id, result.data.id, result.data.revision);
      if (!shipping.ok) { setError(shipping.message); return; }
      const notes = await copyFinanceInvoiceLineNotes(slug, id, result.data.id, result.data.revision);
      if (!notes.ok) { setError(notes.message); return; }
      onDraft(result.data.id);
    } catch { setError("تعذر تأكيد نسخ الفاتورة راجع المسودات المحفوظة قبل المحاولة مجددًا"); }
    finally { lock.current = false; setBusy(false); }
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const current = visibleTabs.findIndex(item => item[0] === activeTab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? visibleTabs.length - 1 : event.key === "ArrowLeft" ? (current + 1) % visibleTabs.length : event.key === "ArrowRight" ? (current + visibleTabs.length - 1) % visibleTabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(visibleTabs[next][0]);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }
  const back = <button type="button" onClick={onBack}><ArrowRight size={16} aria-hidden="true" />إدارة الفواتير</button>;
  if (!invoice) return <section className={styles.page} aria-busy={loading}><div className={styles.toolbar}>{back}</div>{loading ? <p className={styles.empty} role="status">جار تحميل تفاصيل الفاتورة</p> : <div className={styles.empty} role="alert"><p>{current?.error ?? "الفاتورة غير متاحة"}</p><button type="button" onClick={reloadDetail}>إعادة المحاولة</button></div>}</section>;
  if (paymentEditor) return <FinancePaymentEditor key={paymentEditor.payment.id + ":" + paymentEditor.deleting} payment={paymentEditor.payment} invoiceNumber={invoice.number} snapshot={snapshot} collectors={detail?.paymentCollectors ?? []} deleting={paymentEditor.deleting} disabled={disabled || !write} onCancel={() => setPaymentEditor(null)} onSaved={async () => { setPaymentEditor(null); if (paymentEditor.deleting) setPaymentViewId(null); setTab("payments"); setMessage(paymentEditor.deleting ? "تم حذف الدفعة وتحديث رصيد الفاتورة" : "تم تحديث بيانات الدفع ورصيد الفاتورة"); reloadDetail(); await onChanged?.(); }} />;
  const receiptDialog = paymentSelection && <PaymentReceiptDialog key={paymentSelection.document.id} data={paymentReceiptData(paymentSelection.document, detail!, snapshot)} initialMode={paymentSelection.mode} onClose={() => setPaymentSelection(null)} />;
  if (paymentViewId) {
    const document = paymentViewId === invoice.id ? invoice : detail!.related.find(item => item.id === paymentViewId);
    return <>{loading && <p role="status">جار تحديث بيانات الدفعة</p>}{current?.error && <div className={styles.error} role="alert">{current.error}<button type="button" onClick={reloadDetail}>إعادة المحاولة</button></div>}{message && <p role="status">{message}</p>}{document ? <FinancePaymentDetail key={document.id} document={document} detail={detail!} snapshot={snapshot} disabled={blocked}
      onBack={() => { setPaymentViewId(null); setTab("payments"); }} onInvoice={() => { setPaymentViewId(null); setTab("invoice"); }}
      onCustomer={onCustomer ? customerId => onCustomer(customerId, document.id) : undefined}
      onJournal={onJournal && canFinance(snapshot.role, "reports") ? id => setJournalId(id) : undefined}
      onEdit={write ? payment => setPaymentEditor({ payment, deleting: false }) : undefined} onDelete={write ? payment => setPaymentEditor({ payment, deleting: true }) : undefined} onReceipt={mode => setPaymentSelection({ document, mode })} /> : <section className={styles.page}><p role="alert">الدفعة غير متاحة</p><button type="button" onClick={() => { setPaymentViewId(null); setTab("payments"); }}>المدفوعات</button></section>}{receiptDialog}
      {journalId && <FinanceJournalPreview id={journalId} slug={slug} onClose={() => setJournalId(null)} onOpen={id => { if (onJournal) onJournal(id, paymentViewId); }} />}
    </>;
  }
  if (activeTab === "installments" && editing && write) return <InvoiceInstallmentEditor detail={detail!} customer={customer} schedule={schedule} onChange={setSchedule} blocked={blocked} busy={busy} error={error} onSave={() => void update({ action: "schedule", schedule })} onDelete={() => void update({ action: "schedule", schedule: null })} onCancel={() => { setEditing(false); setError(""); }} />;
  const returned = invoice.refunded_total ?? 0;
  const paid = Math.max(0, invoice.total - returned - invoice.outstanding);
  const status = invoice.refunded ? "مرتجع كامل" : returned > .009 ? "مرتجع جزئي" : invoice.outstanding <= .009 ? "مدفوعة" : paid > .009 ? "مدفوعة جزئيًا" : "غير مدفوعة";
  return <section className={styles.page} aria-label={`تفاصيل ${documentTitle} ${displayNumber}`} aria-busy={loading || busy}>
    <header className={styles.header}>
      <div className={styles.identity}><div><h2>{documentTitle} <bdi>#{displayNumber}</bdi></h2><small>{financeDate(issued?.issuedAt ?? invoice.created_at)}</small></div><div><strong>{customer}</strong><small>{detail?.customer?.phone || issued?.customer.phone || ""}</small></div><span className={styles.badge} data-paid={invoice.outstanding <= .009}>{status}</span>{!simplifiedSales && <span className={styles.delivery} data-confirmed={delivery?.confirmed ?? false}>{delivery?.confirmed ? "مسلّم" : "لم يؤكد التسليم"}</span>}</div>
      <div className={styles.toolbar}>{back}<button type="button" className={styles.primary} disabled={blocked} onClick={() => onPrint(invoice)}><Printer size={16} aria-hidden="true" />طباعة</button><button type="button" aria-label="الفاتورة السابقة" disabled={index <= 0 || busy} onClick={() => onNavigate(documents[index - 1].id)}><ChevronUp size={16} /></button><button type="button" aria-label="الفاتورة التالية" disabled={index < 0 || index >= documents.length - 1 || busy} onClick={() => onNavigate(documents[index + 1].id)}><ChevronDown size={16} /></button></div>
    </header>
    <div className={styles.actionbar} aria-label="إجراءات الفاتورة">
      {write && <button type="button" disabled={blocked} onClick={() => setAmendmentOpen(true)}><Pencil size={16} aria-hidden="true" />تعديل</button>}
      <button type="button" disabled={blocked} onClick={() => onPrint(invoice)}><Printer size={16} aria-hidden="true" />طباعة</button>
      {pdf ? <a href={pdf} target="_blank" rel="noreferrer"><FileDown size={16} aria-hidden="true" />PDF</a> : <button type="button" disabled={blocked} onClick={() => onPrint(invoice)}><FileDown size={16} aria-hidden="true" />حفظ PDF</button>}
      {onSettle && <button type="button" className={activityStyles.paymentAction} disabled={blocked || invoice.refunded || invoice.outstanding <= .009} onClick={() => onSettle(invoice)}><CreditCard size={19} aria-hidden="true" /><span className={activityStyles.paymentActionText}><strong>إضافة عملية دفع</strong><small>{invoice.refunded ? "الفاتورة مرتجعة بالكامل" : invoice.outstanding <= .009 ? "لا يوجد مبلغ مستحق" : <>المستحق <Numeric value={invoice.outstanding} money /></>}</small></span></button>}
      {!simplifiedSales && <button type="button" onClick={() => setTab("payments")}><FileText size={16} aria-hidden="true" />قسائم</button>}
      {onRefund && <button type="button" disabled={blocked || invoice.refunded} onClick={() => onRefund(invoice)}><RotateCcw size={16} aria-hidden="true" />مرتجع</button>}
      {write && onDraft && <button type="button" disabled={blocked || !invoice.lines.length || (!issued?.currency && invoice.lines.some(line => !line.product_id))} onClick={() => void copy()} title="نسخ البنود إلى مسودة جديدة لمراجعتها"><Copy size={16} aria-hidden="true" />نسخ</button>}
      {!simplifiedSales && <button type="button" onClick={() => { setTab("installments"); setEditing(false); }}><FileText size={16} aria-hidden="true" />عرض اتفاقية تقسيط</button>}
      {!simplifiedSales && write && <button type="button" disabled={blocked} onClick={() => void update({ action: "delivery", confirmed: !delivery?.confirmed })}><Truck size={16} aria-hidden="true" />{delivery?.confirmed ? "إلغاء التسليم" : "تأكيد التسليم"}</button>}
    </div>
    <InvoiceAdvancedTools key={slug + ":" + id} detail={detail!} slug={slug} resource={advanced} disabled={blocked} canWrite={write} onBusyChange={setBusy} onNavigate={nextId => { if (mounted.current) onNavigate(nextId); }} onChanged={async () => { cache.clear(); await onChanged?.(); if (mounted.current) setRevision(value => value + 1); }} />
    {loading && <p role="status">جار تحديث تفاصيل الفاتورة</p>}
    {(error || current?.error) && <div className={styles.error} role="alert">{error || current?.error}<button type="button" onClick={reloadDetail}>إعادة تحميل التفاصيل</button></div>}
    {message && <p role="status">{message}</p>}
    <div className={styles.content}><div className={styles.tabs} role="tablist" aria-label="تبويبات الفاتورة">{visibleTabs.map(([key, label]) => <button key={key} type="button" role="tab" id={`invoice-tab-${key}`} aria-controls={`invoice-panel-${key}`} aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1} onKeyDown={moveTab} onClick={() => { setTab(key); setEditing(false); }}>{label}</button>)}</div>
      <div role="tabpanel" id="invoice-panel-invoice" aria-labelledby="invoice-tab-invoice" hidden={activeTab !== "invoice"} tabIndex={0} className={styles.panel}>
        <div className={styles.canvas}>{pdf ? <iframe key={pdf} src={`${pdf}#toolbar=0&navpanes=0&view=FitH`} title={`معاينة ${documentTitle} ${displayNumber}`} className={styles.preview} /> : <article className={styles.paper}>
          <div className={styles.paperHeader}><div><h3>{snapshot.cafe.name}</h3><small>فاتورة مبيعات</small></div><strong>فاتورة رقم <bdi>{String(invoice.number).padStart(6, "0")}</bdi></strong></div>
          <div className={styles.paperMeta}><div><span>فاتورة إلى</span><strong>{customer}</strong></div><dl><dt>رقم الفاتورة</dt><dd>{invoice.number}</dd><dt>تاريخ الفاتورة</dt><dd>{financeDate(invoice.created_at)}</dd><dt>المستودع</dt><dd>{detail?.warehouse?.name ?? "—"}</dd></dl></div>
          <div className={styles.tableWrap}><table><thead><tr><th>البند</th><th>سعر الوحدة</th><th>الكمية</th><th>الضريبة</th><th>المجموع</th></tr></thead><tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.name}</td><td><Numeric value={line.unit_price} /></td><td><Numeric value={line.quantity} /></td><td><Numeric value={line.tax} /></td><td><Numeric value={line.net + line.tax} /></td></tr>)}</tbody></table></div>
          <dl className={styles.totals}><dt>المجموع</dt><dd><Numeric value={invoice.subtotal} money /></dd><dt>الخصم</dt><dd><Numeric value={invoice.discount} money /></dd><dt>القيمة المضافة</dt><dd><Numeric value={invoice.tax} money /></dd><dt>الإجمالي</dt><dd><Numeric value={invoice.total} money /></dd>{returned > 0 && <><dt>المرتجع</dt><dd><Numeric value={returned} money /></dd></>}<dt>المدفوع</dt><dd><Numeric value={paid} money /></dd><dt>المبلغ المستحق</dt><dd><Numeric value={invoice.outstanding} money /></dd></dl>{invoice.note && <p className={styles.note}>{invoice.note}</p>}
        </article>}</div><div className={styles.liveBalance} aria-label="الرصيد الحالي للفاتورة"><span>المدفوع بعد الاسترداد <Numeric value={paid} money /></span><span>المبلغ المستحق <Numeric value={invoice.outstanding} money /></span>{issued && <small>المعاينة تعرض أصل الفاتورة المحفوظ عند الإصدار</small>}</div>
      </div>
      {activeTab !== "invoice" && <div role="tabpanel" id={`invoice-panel-${activeTab}`} aria-labelledby={`invoice-tab-${activeTab}`} tabIndex={0} className={styles.panel}>
        {activeTab === "details" && <div className={styles.body}>{renderInvoiceDetails(detail!, snapshot, canFinance(snapshot.role, "reports") ? onCustomerStatement : undefined)}
          <InvoiceOrderSourceSummary key={`${slug}:${id}`} reader={detailLoader.orderSource} />
          {editing && write && <div className={styles.editor}><p>{simplifiedSales ? "بيانات الفاتورة الصادرة محفوظة كما أُصدرت يمكنك تحديث بيانات العميل التشغيلية" : "بيانات الفاتورة الصادرة محفوظة كما أُصدرت يمكنك تحديث بيانات العميل التشغيلية وحالة التسليم واتفاقية التقسيط"}</p><div className={styles.toolbar}><button type="button" disabled={blocked || !invoice.party_id} onClick={() => void update({ action: "sync" })}>مزامنة بيانات العميل</button>{!simplifiedSales && <><button type="button" disabled={blocked} onClick={() => void update({ action: "delivery", confirmed: !delivery?.confirmed })}>{delivery?.confirmed ? "إلغاء التسليم" : "تأكيد التسليم"}</button><button type="button" disabled={blocked || !invoice.party_id || invoice.refunded} onClick={() => { setTab("installments"); setError(""); setSchedule(savedSchedule ?? newInvoiceSchedule()); }}>تعديل اتفاقية التقسيط</button></>}</div></div>}
          {issued?.extraFields.map((field, key) => <p key={key}><strong>{field.title}</strong> {field.value}</p>)}<InvoiceFileDownloads files={issued?.attachments ?? []} slug={slug} />
        </div>}
        {activeTab === "payments" && renderInvoicePayments({ detail: detail!, snapshot, blocked, order: paymentOrder, onOrder: setPaymentOrder, onEdit: write ? payment => setPaymentEditor({ payment, deleting: false }) : undefined, onDelete: write ? payment => setPaymentEditor({ payment, deleting: true }) : undefined, onPayment: (document, mode) => { if (mode === "view") { setPaymentViewId(document.id); setMessage(""); } else setPaymentSelection({ document, mode }); }, onSettle, onInvoice: () => setTab("invoice") })}
        {activeTab === "activity" && <InvoiceActivityTimeline activity={detail!.activity} />}
        {activeTab === "returns" && <InvoiceReturnsPanel key={id} detail={detail!} snapshot={snapshot} disabled={blocked} />}
        {activeTab === "stock" && renderInvoiceStock(detail!, delivery?.confirmed ?? false)}
        {activeTab === "profit" && profitAvailable && advanced.data?.profit && <InvoiceProfitPanel profit={advanced.data.profit} />}
        {activeTab === "installments" && <div className={styles.agreementBody}><h3 className={savedSchedule && !editing ? styles.visuallyHidden : undefined}>اتفاقية التقسيط</h3>{write && !editing && <button className={styles.agreementEdit} type="button" disabled={blocked || !invoice.party_id || invoice.refunded} onClick={() => { setSchedule(savedSchedule ?? newInvoiceSchedule()); setError(""); setEditing(true); }}>{savedSchedule ? "تعديل الاتفاقية" : "إضافة اتفاقية تقسيط"}</button>}{!invoice.party_id && <p className={styles.hint}>اتفاقية التقسيط متاحة للفواتير المرتبطة بعميل مسجل</p>}
          {savedSchedule && !editing ? renderInvoiceInstallments({ detail: detail!, schedule: savedSchedule, customer, frequency: frequencies[savedSchedule.frequency], paid, blocked, onCustomer: detail?.customer && onCustomer ? () => onCustomer(detail.customer!.id) : undefined, onInvoice: () => setTab("invoice"), onPayments: () => setTab("payments"), onSettle: write ? onSettle : undefined }) : !editing && <p className={styles.empty}>لا توجد اتفاقية تقسيط لهذه الفاتورة</p>}
        </div>}
      </div>}
    </div>
    {write && <InvoiceAmendmentDialog key={`${id}:${revision}`} open={amendmentOpen} detail={detail!} snapshot={snapshot} onClose={() => setAmendmentOpen(false)} onSaved={() => { cache.clear(); setAmendmentOpen(false); setMessage("تم حفظ تعديلات الفاتورة وتحديث الأرصدة"); setRevision(value => value + 1); void onChanged?.(); }} />}
    {receiptDialog}
  </section>;
}
