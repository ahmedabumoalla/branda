"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, MessageCircle, Printer, ReceiptText, RefreshCw } from "lucide-react";
import { readInvoiceDetailAction } from "@/app/actions/finance-invoice-management";
import { sendSalesInvoiceWhatsAppAction } from "@/app/actions/aldeem-invoice-preview";
import { Modal } from "@/components/dashboard/ui/modal";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import type { FinanceDocument, FinanceParty } from "@/lib/finance/brand-finance";
import styles from "./aldeem-sales-invoices.module.css";
import detailStyles from "./aldeem-sales-invoice-detail.module.css";

const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 6 }).format(value);
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(parsed);
};
const paymentMethods = { cash: "نقدي", bank: "تحويل بنكي", pos: "نقطة بيع", credit: "رصيد العميل" };
const paymentStates = { completed: "مكتملة", pending: "معلقة", deleted: "محذوفة" };

type InvoicePdf = { key: string; url: string; error: string };
type InvoicePdfResource = InvoicePdf & { controller?: AbortController; request?: Promise<void> };

/** One open invoice owns its PDF; closing only the dialog does not regenerate it. */
function useInvoicePdf(id: string, slug: string) {
  const key = `/api/finance/${encodeURIComponent(slug)}/sales-invoices/${encodeURIComponent(id)}/pdf`;
  const resource = useRef<InvoicePdfResource>({ key, url: "", error: "" });
  const [pdf, setPdf] = useState<InvoicePdf>({ key, url: "", error: "" });
  const load = useCallback((retry = false) => {
    let entry = resource.current;
    if (entry.key !== key || retry) {
      entry.controller?.abort();
      if (entry.url) URL.revokeObjectURL(entry.url);
      entry = { key, url: "", error: "" }; resource.current = entry;
    }
    if (entry.url || entry.error || entry.request) return entry.request;
    const controller = new AbortController(); entry.controller = controller;
    setPdf({ key, url: "", error: "" });
    entry.request = fetch(key, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403 ? "لا تملك صلاحية استعراض هذه الفاتورة" : response.status === 404 ? "الفاتورة غير متاحة" : "تعذر تجهيز ملف الفاتورة أعد المحاولة");
        if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("تعذر قراءة ملف الفاتورة أعد المحاولة");
        const blob = await response.blob();
        if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new Error("تعذر قراءة ملف الفاتورة أعد المحاولة");
        if (resource.current !== entry || controller.signal.aborted) return;
        entry.url = URL.createObjectURL(blob); setPdf({ key, url: entry.url, error: "" });
      }).catch(cause => {
        if (resource.current !== entry || controller.signal.aborted) return;
        entry.error = cause instanceof Error ? cause.message : "تعذر تجهيز ملف الفاتورة أعد المحاولة";
        setPdf({ key, url: "", error: entry.error });
      }).finally(() => { entry.request = undefined; });
    return entry.request;
  }, [key]);
  useEffect(() => () => {
    const entry = resource.current;
    entry.controller?.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    resource.current = { key: "", url: "", error: "" };
  }, [key]);
  return { pdf: pdf.key === key ? pdf : { key, url: "", error: "" }, load };
}

/** Paint the authorized register snapshot immediately, then refresh only this invoice. */
export function AldeemSalesInvoiceDetail({ initialInvoice, initialCustomer, slug, onBack }: { initialInvoice: FinanceDocument; initialCustomer?: FinanceParty; slug: string; onBack: () => void }) {
  const id = initialInvoice.id;
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { pdf, load: loadPdf } = useInvoicePdf(id, slug);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    setRefreshing(true); setError("");
    void readInvoiceDetailAction(id, slug).then(result => {
      if (!active) return;
      if (!result.ok) { setError(result.message); return; }
      if (result.data.document.id !== id || result.data.document.kind !== "sale") {
        setError("الفاتورة غير متاحة في سجل المبيعات"); return;
      }
      setDetail(result.data);
    }).catch(() => { if (active) setError("تعذر تحديث تفاصيل الفاتورة أعد المحاولة"); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [id, slug, attempt]);
  useEffect(() => { if (detail) void loadPdf(); }, [detail, loadPdf]);

  const invoice = detail?.document ?? initialInvoice;
  const issued = detail?.invoice;
  const number = issued?.displayNumber || invoice?.display_number || invoice?.number;
  const customer = issued?.customer.name || detail?.metadata.customer?.name || detail?.customer?.name || initialCustomer?.name || "عميل نقدي";
  const phone = issued?.customer.phone || detail?.metadata.customer?.phone || detail?.customer?.phone || initialCustomer?.phone || invoice.customer_phone;
  const taxNumber = issued?.customer.vatNumber || detail?.metadata.customer?.tax_number || detail?.customer?.tax_number || initialCustomer?.tax_number;
  const returned = invoice?.refunded_total ?? 0;
  const collected = invoice ? Math.max(0, invoice.total - returned - invoice.outstanding) : 0;
  const status = invoice?.refunded ? "مرتجعة بالكامل" : returned > 0 ? "مرتجعة جزئيًا" : invoice && invoice.outstanding <= 0.009 ? "مدفوعة" : collected > 0 ? "مدفوعة جزئيًا" : "آجلة";

  return <section className={detailStyles.page} aria-labelledby="aldeem-invoice-detail-title">
    <header className={styles.toolbar}>
      <div><span className={styles.eyebrow}>فواتير المبيعات</span><h2 id="aldeem-invoice-detail-title" ref={heading} tabIndex={-1}>تفاصيل الفاتورة {number !== undefined && <bdi>#{number}</bdi>}</h2><p>بيانات الفاتورة والأصناف والتحصيل</p></div>
      <div className={detailStyles.actions}><button type="button" className={styles.primary} onPointerEnter={() => { void loadPdf(); }} onFocus={() => { void loadPdf(); }} onClick={() => { void loadPdf(); setPreviewOpen(true); }}><Eye size={17} aria-hidden="true" />استعراض الفاتورة</button><button type="button" disabled={refreshing} onClick={() => { setAttempt(value => value + 1); void loadPdf(true); }}><RefreshCw size={17} aria-hidden="true" />تحديث التفاصيل</button><button type="button" onClick={onBack}><ArrowRight size={17} aria-hidden="true" />العودة إلى سجل الفواتير</button></div>
    </header>
    {refreshing && <p className={detailStyles.refreshStatus} role="status">جار تحديث تفاصيل الفاتورة</p>}
    {error && <div className={styles.error} role="alert">{error}<button type="button" disabled={refreshing} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}
      <div className={detailStyles.identity}>
        <div className={detailStyles.identityTitle}><ReceiptText size={25} aria-hidden="true" /><div><strong>{customer}</strong><span>{date(issued?.issuedAt || invoice.created_at)}</span></div></div>
        <div className={detailStyles.badges}><span className={styles.source}>{invoice.shift_id ? "نقطة بيع" : "المالية"}</span><span className={returned > 0 || invoice.refunded ? styles.neutral : invoice.outstanding > 0.009 ? styles.unpaid : styles.paid}>{status}</span></div>
      </div>
      <div className={detailStyles.overview}>
        <section className={detailStyles.panel} aria-labelledby="aldeem-invoice-customer"><h3 id="aldeem-invoice-customer">بيانات العميل</h3><dl>
          <div><dt>العميل</dt><dd>{customer}</dd></div>
          <div><dt>الجوال</dt><dd><bdi>{phone || "—"}</bdi></dd></div>
          <div><dt>الرقم الضريبي</dt><dd><bdi>{taxNumber || "—"}</bdi></dd></div>
          {issued?.customer.address && <div><dt>العنوان</dt><dd>{issued.customer.address}</dd></div>}
        </dl></section>
        <section className={detailStyles.panel} aria-labelledby="aldeem-invoice-info"><h3 id="aldeem-invoice-info">بيانات الفاتورة</h3><dl>
          <div><dt>رقم الفاتورة</dt><dd><bdi>#{number}</bdi></dd></div>
          <div><dt>تاريخ الإصدار</dt><dd>{date(issued?.issuedAt || invoice.created_at)}</dd></div>
          <div><dt>المستودع</dt><dd>{detail?.warehouse?.name || "—"}</dd></div>
          <div><dt>أنشأها</dt><dd>{detail?.creator?.name || "—"}</dd></div>
          {issued?.supplyDate && <div><dt>تاريخ التوريد</dt><dd>{date(issued.supplyDate)}</dd></div>}
        </dl></section>
      </div>
      <section className={styles.register} aria-labelledby="aldeem-invoice-lines"><div className={detailStyles.sectionHeading}><h3 id="aldeem-invoice-lines">أصناف الفاتورة</h3><span>المبالغ بالريال السعودي</span></div>
        <div className={styles.tableScroll} role="region" aria-label="جدول أصناف الفاتورة" tabIndex={0}><table><thead><tr>{["الصنف", "الكمية", "سعر الوحدة", "الصافي", "الضريبة", "الإجمالي"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{invoice.lines.map(line => <tr key={line.id}>
          <td className={detailStyles.itemName}><strong>{line.name}</strong>{line.description && <small>{line.description}</small>}{line.unit_label && <small>{line.unit_label}</small>}</td><td className={styles.money}>{quantity(line.quantity)}</td><td className={styles.money}>{money(line.unit_price)}</td><td className={styles.money}>{money(line.net)}</td><td className={styles.money}>{money(line.tax)}</td><td className={styles.money}>{money(line.net + line.tax)}</td>
        </tr>)}</tbody></table></div>
        {!invoice.lines.length && <p className={detailStyles.empty}>{detail ? "لا توجد تفاصيل أصناف محفوظة لهذه الفاتورة" : refreshing ? "جار تحميل تفاصيل الأصناف" : "تعذر تحميل تفاصيل الأصناف"}</p>}
      </section>
      <div className={detailStyles.summaryRow}>
        <section className={detailStyles.panel} aria-labelledby="aldeem-invoice-notes"><h3 id="aldeem-invoice-notes">الملاحظات</h3><p className={detailStyles.note}>{issued?.note || invoice.note || "لا توجد ملاحظات"}</p>{issued?.extraFields?.length ? <dl>{issued.extraFields.map((field, index) => <div key={index}><dt>{field.title}</dt><dd>{field.value}</dd></div>)}</dl> : null}</section>
        <section className={`${detailStyles.panel} ${detailStyles.totals}`} aria-labelledby="aldeem-invoice-totals"><h3 id="aldeem-invoice-totals">ملخص المبالغ</h3><dl>
          <div><dt>المجموع</dt><dd>{money(invoice.subtotal)}</dd></div><div><dt>الخصم</dt><dd>{money(invoice.discount)}</dd></div><div><dt>ضريبة القيمة المضافة</dt><dd>{money(invoice.tax)}</dd></div><div className={detailStyles.total}><dt>إجمالي الفاتورة</dt><dd>{money(invoice.total)}</dd></div>
          {returned > 0 && <div><dt>قيمة المرتجع</dt><dd>{money(returned)}</dd></div>}
          <div><dt>{returned > 0 ? "المدفوع بعد الاسترداد" : "المدفوع"}</dt><dd>{money(collected)}</dd></div><div className={detailStyles.balance}><dt>المتبقي</dt><dd>{money(invoice.outstanding)}</dd></div>
        </dl></section>
      </div>
      <section className={styles.register} aria-labelledby="aldeem-invoice-payments"><div className={detailStyles.sectionHeading}><h3 id="aldeem-invoice-payments">سجل المدفوعات</h3></div>
        {detail?.payments?.length ? <div className={styles.tableScroll} role="region" aria-label="جدول مدفوعات الفاتورة" tabIndex={0}><table><thead><tr>{["التاريخ", "طريقة الدفع", "الحساب", "المبلغ", "الحالة"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{detail.payments.map(payment => <tr key={payment.id}><td>{date(payment.date)}{payment.reference && <small>{payment.reference}</small>}</td><td>{paymentMethods[payment.method] || "—"}</td><td>{payment.accountName || "—"}</td><td className={styles.money}>{money(payment.amount)}</td><td><span className={payment.status === "completed" ? styles.paid : payment.status === "pending" ? styles.unpaid : styles.neutral}>{paymentStates[payment.status]}</span></td></tr>)}</tbody></table></div> : <p className={detailStyles.empty}>{detail ? "لا توجد دفعات مسجلة لهذه الفاتورة" : refreshing ? "جار تحميل سجل المدفوعات" : "تعذر تحميل سجل المدفوعات"}</p>}
      </section>
    {previewOpen && <InvoicePdfPreview id={id} slug={slug} number={String(number)} phone={phone || undefined} pdf={pdf} onRetry={() => { void loadPdf(true); }} onClose={() => setPreviewOpen(false)} />}
  </section>;
}

function InvoicePdfPreview({ id, slug, number, phone, pdf, onRetry, onClose }: { id: string; slug: string; number: string; phone?: string; pdf: InvoicePdf; onRetry: () => void; onClose: () => void }) {
  const { url: pdfUrl, error: pdfError } = pdf;
  const [frameReady, setFrameReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendLocked, setSendLocked] = useState(false);
  const [sendError, setSendError] = useState("");
  const [message, setMessage] = useState("");
  const sendLock = useRef(false);
  const mounted = useRef(true);
  const preview = useRef<HTMLIFrameElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFrameReady(false); }, [pdfUrl]);

  async function sendWhatsApp() {
    if (sendLock.current || sendLocked) return;
    sendLock.current = true; setSending(true); setSendError(""); setMessage("");
    try {
      const result = await sendSalesInvoiceWhatsAppAction(id, slug);
      if (!mounted.current) return;
      if (!result.ok) { setSendError(result.message); return; }
      const status = result.data.status;
      if (status === "queued" || status === "sent") {
        setSendLocked(true);
        setMessage(result.data.repeated ? "سبق قبول طلب إرسال الفاتورة ولن تتكرر الرسالة" : "قبل مزود الواتساب طلب إرسال الفاتورة إلى العميل");
      } else if (status === "rejected" || status === "failed") {
        setSendError("لم يقبل مزود الواتساب طلب الإرسال أعد المحاولة لاحقًا");
      } else {
        setSendLocked(true);
        setMessage("طلب الإرسال قيد المعالجة أو يحتاج مراجعة ولن يتكرر تلقائيًا");
      }
    } catch { if (mounted.current) setSendError("تعذر تأكيد حالة إرسال الفاتورة أعد المحاولة للتحقق من حالتها"); }
    finally { sendLock.current = false; if (mounted.current) setSending(false); }
  }
  function print() {
    setSendError(""); setMessage("");
    try {
      if (!preview.current?.contentWindow || !frameReady) return;
      preview.current.contentWindow.focus(); preview.current.contentWindow.print();
    } catch { setSendError("تعذر فتح الطباعة من المعاينة افتح الملف في نافذة مستقلة ثم اطبعه"); }
  }

  return <Modal open title={`استعراض الفاتورة #${number}`} onClose={onClose} panelClassName={detailStyles.previewPanel}>
    <div className={detailStyles.previewContent}>
      <div className={detailStyles.actions}>
        <button type="button" className={styles.primary} disabled={!pdfUrl || !frameReady} onClick={print}><Printer size={17} aria-hidden="true" />طباعة الفاتورة</button>
        <button type="button" disabled={!pdfUrl || sending || sendLocked} onClick={() => void sendWhatsApp()}><MessageCircle size={17} aria-hidden="true" />{sending ? "جار إرسال الفاتورة" : sendLocked ? "طلب الإرسال مسجل" : "إرسال للعميل عبر الواتساب"}</button>
        {pdfUrl && <a className={detailStyles.previewLink} href={pdfUrl} target="_blank" rel="noreferrer">فتح في نافذة مستقلة</a>}
        {pdfUrl && <a className={detailStyles.previewLink} href={pdfUrl} download={`invoice-${id}.pdf`}>تنزيل الفاتورة</a>}
      </div>
      {phone && <p className={detailStyles.refreshStatus}>جوال العميل <bdi>{phone}</bdi></p>}
      {message && <p className={detailStyles.feedback} role="status">{message}</p>}
      {sendError && <p className={styles.error} role="alert">{sendError}</p>}
      {pdfError ? <div className={styles.error} role="alert">{pdfError}<button type="button" onClick={onRetry}>إعادة المحاولة</button></div> : pdfUrl ? <iframe ref={preview} src={`${pdfUrl}#view=FitH`} title={`ملف الفاتورة ${number} الجاهز للطباعة`} tabIndex={0} className={detailStyles.pdfFrame} onLoad={() => setFrameReady(true)} /> : <div className={detailStyles.pdfLoading} role="status">جار تجهيز ملف الفاتورة للطباعة</div>}
    </div>
  </Modal>;
}
