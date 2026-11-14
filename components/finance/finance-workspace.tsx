"use client";
import { isAldeemCafe } from "@/lib/platform/aldeem";
import { FinanceShiftMonitor } from "./finance-shift-monitor";
import { FinanceCashierManagement } from "./finance-cashier-management";
import { FinancePhoneStaff } from "./finance-phone-staff";
import { NAQWA_CAFE_ID } from "@/lib/platform/naqwa";
import { FinancePrinterSettings } from "./finance-printer-settings";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { financeSections as sections, resolveFinanceSection, resolveFinanceParty, financeSectionAllowed, type FinanceSection as Section } from "./finance-navigation";
import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, CircleDollarSign, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceDocument, FinanceSnapshot, FinanceParty } from "@/lib/finance/brand-finance";

import { FinanceInvoices } from "./finance-invoices";






import { readInvoiceDetailAction } from "@/app/actions/finance-invoice-management";
import { saveInvoiceDraftAction } from "@/app/actions/finance-invoice-drafts";
import { copyFinanceInvoiceLineNotes } from "@/app/actions/finance-invoice-line-notes";
import { copyFinanceInvoiceShippingCharge } from "@/app/actions/finance-invoice-shipping-charge";
import { invoiceCopyPayload } from "@/lib/finance/invoice-copy";
import type { JournalDetail } from "@/lib/finance/journal-detail";
import type { InvoicePayment } from "@/lib/finance/payment-management";


import { FinanceSalesReturns, navigateSalesReturns } from "./finance-sales-returns";
import { FinanceCustomerPayments, navigateCustomerPayments } from "./finance-customer-payments";

import { FinanceCustomerForm } from "./finance-customer-form";
import { FinanceOperationForm, type FinanceForm } from "./finance-operation-form";
import { documentKindNames, downloadFinanceCsv, Empty, financeDate, financeDocumentStatus, Metric, Numeric, Panel } from "./finance-ui";
import { FinanceRefundRequests } from "./finance-refund-requests";

import { FinanceTreasury } from "./finance-treasury";
import { FinanceTrialBalance } from "./finance-trial-balance";
import { FinanceShiftDetails } from "./finance-shift-details";
import { FinanceCashDifferences } from "./finance-cash-differences";
import { FinanceCashHandovers } from "./finance-cash-handovers";
import { useFinance } from "./use-finance";
import { canFinance, canFinanceOperation, financeRoleLabels } from "@/lib/finance/permissions";

import { FinanceControlPanel, FinanceJournalExport, FinancePeriodHistory } from "./finance-control-panel";
import { ledgerPilotEnabled } from "@/lib/finance/ledger";
import styles from "./finance.module.css";
import { isHospitalStore } from "@/lib/commerce/hospital-profile";

function FinanceViewLoading() { return <p role="status" aria-live="polite">جارٍ فتح الصفحة</p>; }
const HospitalDebtsPanel = dynamic(() => import("./hospital-debts").then(module => module.HospitalDebtsPanel), { loading: FinanceViewLoading });
const FinanceSaleForm = dynamic(() => import("./finance-sale-form").then(module => module.FinanceSaleForm), { loading: FinanceViewLoading });
const FinanceInvoiceImport = dynamic(() => import("./finance-invoice-import").then(module => module.FinanceInvoiceImport), { loading: FinanceViewLoading });
const FinanceSalesSettings = dynamic(() => import("./finance-sales-settings").then(module => module.FinanceSalesSettings), { loading: FinanceViewLoading });
const FinanceInvoiceDetail = dynamic(() => import("./finance-invoice-detail").then(module => module.FinanceInvoiceDetail), { loading: FinanceViewLoading });
const FinanceCustomerDetail = dynamic(() => import("./finance-customer-detail").then(module => module.FinanceCustomerDetail), { loading: FinanceViewLoading });
const FinanceJournalDetail = dynamic(() => import("./finance-journal-detail").then(module => module.FinanceJournalDetail), { loading: FinanceViewLoading });
const FinancePaymentEditor = dynamic(() => import("./finance-payment-editor").then(module => module.FinancePaymentEditor), { loading: FinanceViewLoading });
const FinanceRecurringInvoices = dynamic(() => import("./finance-recurring-invoices").then(module => module.FinanceRecurringInvoices), { loading: FinanceViewLoading });
const FinanceCreditNotes = dynamic(() => import("./finance-credit-notes").then(module => module.FinanceCreditNotes), { loading: FinanceViewLoading });
const FinanceQuotes = dynamic(() => import("./finance-quotes").then(module => module.FinanceQuotes), { loading: FinanceViewLoading });
const FinanceReceiptDialog = dynamic(() => import("./finance-receipt-dialog").then(module => module.FinanceReceiptDialog), { loading: FinanceViewLoading });
const FinanceInventoryReport = dynamic(() => import("./finance-inventory-report").then(module => module.FinanceInventoryReport), { loading: FinanceViewLoading });

const salesCashierLabel = "إضافة كاشير مبيعات";
const labEntryLabel = "شاشة طلبات المعمل";
const staffLabel = "إدارة موظف مالي";

export function FinanceWorkspace({ initialSnapshot, slug }: { initialSnapshot: FinanceSnapshot; slug?: string }) {
  const state = useFinance(initialSnapshot, slug);
  const { snapshot: data, pending, error, message, stale } = state;
  const params = useSearchParams();
  const canManageCashiers = data.canAdminister || data.canManageCashiers === true;
  const phoneStaffManagement = data.cafe.id === NAQWA_CAFE_ID && data.role === "owner" && data.userId === data.ownerUserId;
  const [localSection, setSection] = useState<Section>(() => resolveFinanceSection(params.get("section"), data.canAdminister, canManageCashiers));
  const requestedSection = slug ? localSection : params.get("section") === "settings" ? "settings" : params.get("section") === "cashiers" ? "cashiers" : resolveFinanceSection(params.get("section"), data.canAdminister, canManageCashiers);
  const section = requestedSection === "cashiers" ? requestedSection : financeSectionAllowed(requestedSection,data.role,canManageCashiers) ? requestedSection : canFinance(data.role,"reports") ? "overview" : "inventory";
  const allows = (operation: string) => operation === "journal" && ledgerPilotEnabled(data.cafe.id) ? false : (operation === "sales_cashier_create" || operation === "staff") && canManageCashiers ? true : operation === "staff_create" ? canFinance(data.role,"staff_manage") : canFinanceOperation(data.role,operation);
  const [query, setQuery] = useState("");
  const [invoiceImportMode, setInvoiceImportMode] = useState<"sheet" | "ai" | null>(null);
  const [localPartyKind, setLocalPartyKind] = useState("all");
  const partyKind = slug ? localPartyKind : resolveFinanceParty(params.get("party"));
  const inventoryView = !slug && params.get("view") === "items" ? "items" : !slug && params.get("view") === "movements" ? "movements" : "all";
  const [localInvoiceId, setLocalInvoiceId] = useState<string | null>(() => {
    const invoice = params.get("invoice");
    return slug && params.get("view") === "invoice" && invoice && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(invoice) ? invoice : null;
  });
  const [localPaymentId, setLocalPaymentId] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState<{ kind: "customer" | "journal"; id: string; invoiceId?: string; paymentId?: string; customerId?: string } | null>(() => {
    const kind = params.get("view"), id = params.get(kind === "customer" ? "customer" : "entry");
    return slug && (kind === "customer" || kind === "journal") && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? { kind, id } : null;
  });
  const [creationCustomer, setCreationCustomer] = useState<FinanceParty | null>(null);
  const [journalRevision, setJournalRevision] = useState(0);
  const [journalReversal, setJournalReversal] = useState<{ payment: InvoicePayment; invoiceNumber: number; collectors: { id: string; name: string }[] } | null>(null);
  const journalCopy = useRef<{ sourceId: string; draftId: string } | null>(null);
  const isCustomerDetail = section === "parties" && (slug ? localRecord?.kind === "customer" : params.get("view") === "customer");
  const isJournalDetail = section === "reports" && (slug ? localRecord?.kind === "journal" : params.get("view") === "journal");
  const recordId = slug ? localRecord?.id ?? "" : params.get(isCustomerDetail ? "customer" : "entry") ?? "";
  const invoiceId = (slug ? localInvoiceId : params.get("invoice")) ?? "";
  const paymentId = slug ? localPaymentId : params.get("payment");
  const creationSnapshot = creationCustomer && !data.parties.some(party => party.id === creationCustomer.id) ? { ...data, parties: [...data.parties, creationCustomer] } : data;
  const salesView = slug && localInvoiceId ? "invoice" : !slug && ["invoice", "create", "returns", "return-detail", "payments", "payment-detail", "payment-edit", "payment-delete", "sales-settings", "quotes", "quote-create", "credit-notes", "credit-create", "credit-note", "recurring", "recurring-create", "recurring-detail"].includes(params.get("view") ?? "") ? params.get("view") : "invoices";
  const isInvoiceManagement = section === "sales" && salesView === "invoices";
  const isInvoiceEditor = section === "sales" && salesView === "create";
  const isQuotePage = section === "sales" && (salesView === "quotes" || salesView === "quote-create");
  const isCreditNotePage = section === "sales" && ["credit-notes", "credit-create", "credit-note"].includes(salesView ?? "");
  const isSalesReturnPage = section === "sales" && ["returns", "return-detail"].includes(salesView ?? "");
  const isRecurringInvoicePage = section === "sales" && ["recurring", "recurring-create", "recurring-detail"].includes(salesView ?? "");
  const isInvoiceDetail = section === "sales" && salesView === "invoice";
  const isSalesSettings = section === "sales" && salesView === "sales-settings";
  const isCustomerPaymentsPage = section === "sales" && ["payments", "payment-detail", "payment-edit", "payment-delete"].includes(salesView ?? "");
  const isInvoicePage = isCustomerPaymentsPage || isRecurringInvoicePage || isSalesReturnPage || isCreditNotePage || isInvoiceManagement || isInvoiceEditor || isQuotePage || isInvoiceDetail || isSalesSettings;
  const isShiftPage = section === "shifts";
  const isDocumentPage = isInvoicePage || isCustomerDetail || isJournalDetail || isShiftPage;
  function showInvoice(id: string, paymentId?: string | null) {
    if (slug) { setLocalRecord(null); setSection("sales"); setLocalInvoiceId(id); setLocalPaymentId(paymentId ?? null); return; }
    const next = new URLSearchParams({ section: "sales", view: "invoice", invoice: id });
    if (paymentId) next.set("payment", paymentId);
    window.history.pushState(null, "", `/dashboard/finance?${next}`);
  }
  function showSalesInvoices() { if (slug) { setLocalInvoiceId(null); setLocalPaymentId(null); setLocalRecord(null); return; } window.history.pushState(null, "", "/dashboard/finance?section=sales"); }
  function showRecord(kind: "customer" | "journal", id: string, invoiceId?: string, paymentId?: string, customerId?: string, customerPaymentId?: string) {
    const target = kind === "customer" ? "parties" : "reports";
    if (slug) { setSection(target); setLocalRecord({ kind, id, invoiceId, paymentId, customerId }); return; }
    if (invoiceId && paymentId && params.get("view") === "invoice" && params.get("invoice") === invoiceId && params.get("payment") !== paymentId) {
      const previous = new URLSearchParams(params.toString()); previous.set("payment", paymentId);
      window.history.replaceState(null, "", `/dashboard/finance?${previous}`);
    }
    const next = new URLSearchParams({ section: target, view: kind, [kind === "customer" ? "customer" : "entry"]: id });
    if (kind === "customer") next.set("party", "customer");
    if (invoiceId) next.set("returnInvoice", invoiceId);
    if (paymentId) next.set("returnPayment", paymentId);
    if (customerId) next.set("returnCustomer", customerId);
    if (customerPaymentId) next.set("returnCustomerPayment", customerPaymentId);
    window.history.pushState(null, "", `/dashboard/finance?${next}`);
  }
  function returnFromRecord() {
    if (!slug && params.get("returnCustomerPayment")) { navigateCustomerPayments(params.get("returnCustomerPayment")!); return; }
    const invoice = slug ? localRecord?.invoiceId : params.get("returnInvoice"), payment = slug ? localRecord?.paymentId : params.get("returnPayment"), customer = slug ? localRecord?.customerId : params.get("returnCustomer");
    if (invoice) { showInvoice(invoice, payment); return; }
    if (customer) { showRecord("customer", customer); return; }
    if (slug) { setLocalRecord(null); return; }
    window.history.pushState(null, "", isCustomerDetail ? "/dashboard/finance?section=parties&party=customer" : "/dashboard/finance?section=reports");
  }
  function createForCustomer(customer: FinanceParty, quote: boolean) {
    setCreationCustomer(customer);
    if (slug) { open({ operation: "sale", title: "إضافة فاتورة مبيعات", values: { customerId: customer.id } }); return; }
    const next = new URLSearchParams({ section: "sales", view: quote ? "quote-create" : "create", customer: customer.id });
    window.history.pushState(null, "", `/dashboard/finance?${next}`);
  }
  async function journalSourceAction(journal: JournalDetail, reverse: boolean) {
    if (disabled || !canFinance(data.role, "accounting_write") || !journal.invoiceId) throw new Error("الإجراء غير متاح لهذا القيد");
    const response = await readInvoiceDetailAction(journal.invoiceId, data.cafe.slug);
    if (!response.ok) throw new Error(response.message);
    const detail = response.data, invoice = detail.document;
    if (journal.document.kind === "sale") {
      if (reverse) {
        if (invoice.refunded) throw new Error("الفاتورة مرتجعة بالكامل");
        setDetailOperationDocument(invoice);
        open({ operation: "refund", title: "قيد عكسي من مرتجع الفاتورة", values: { documentId: invoice.id, journalOrigin: true } });
      } else {
        if (journalCopy.current?.sourceId !== invoice.id) journalCopy.current = { sourceId: invoice.id, draftId: crypto.randomUUID() };
        const result = await saveInvoiceDraftAction({ id: journalCopy.current.draftId, revision: 0, payload: invoiceCopyPayload(detail) }, data.cafe.slug);
        if (!result.ok) throw new Error(result.message);
        const shipping = await copyFinanceInvoiceShippingCharge(data.cafe.slug, invoice.id, result.data.id, result.data.revision);
        if (!shipping.ok) throw new Error(shipping.message);
        const notes = await copyFinanceInvoiceLineNotes(data.cafe.slug, invoice.id, result.data.id, result.data.revision);
        if (!notes.ok) throw new Error(notes.message);
        journalCopy.current = null;
        if (slug) open({ operation: "sale", title: "مراجعة نسخة الفاتورة", values: { draftId: result.data.id } });
        else window.history.pushState(null, "", `/dashboard/finance?section=sales&view=create&draft=${encodeURIComponent(result.data.id)}`);
      }
    } else if (journal.document.kind === "settlement") {
      const payment = detail.payments.find(payment => payment.id === journal.document.id);
      if (!payment) throw new Error("الدفعة غير متاحة");
      if (reverse) {
        if (!payment.canDelete) throw new Error(payment.blockedReason || "لا يمكن عكس الدفعة حاليًا");
        setJournalReversal({ payment, invoiceNumber: invoice.number, collectors: detail.paymentCollectors });
      } else {
        if (invoice.refunded || invoice.outstanding <= .009) throw new Error("لا يوجد مبلغ مستحق لتسجيل دفعة إضافية");
        setDetailOperationDocument(invoice);
        open({ operation: "settlement", title: "مراجعة نسخة الدفعة", values: { documentId: invoice.id, remaining: invoice.outstanding, amount: payment.amount, accountId: payment.accountId, note: payment.details, journalOrigin: true } });
      }
    } else throw new Error("استخدم المستند المصدر لتصحيح هذا القيد");
  }
  function showInvoiceSettings() {
    if (slug) { setSection("settings"); return; }
    window.history.pushState(null, "", "/dashboard/finance?section=sales&view=sales-settings");
  }
  function showInvoiceReports() {
    if (slug) { setSection("reports"); return; }
    window.history.pushState(null, "", "/dashboard/finance?section=reports");
  }
  function setPartyKind(value: string) {
    if (slug) { setLocalPartyKind(value); return; }
    const next = new URLSearchParams(params.toString());
    next.set("section", "parties");
    if (value === "all") next.delete("party"); else next.set("party", value);
    window.history.pushState(null, "", `/dashboard/finance?${next}`);
  }
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<FinanceForm | null>(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<FinanceDocument | null>(null);
  const [detailOperationDocument, setDetailOperationDocument] = useState<FinanceDocument | null>(null);
  const receipt = detailReceipt ?? data.documents.find((item) => item.id === receiptId);
  const operationSnapshot = detailOperationDocument && form?.values?.documentId === detailOperationDocument.id ? { ...data, documents: [...data.documents.filter(item => item.id !== detailOperationDocument.id), detailOperationDocument] } : data;
  const disabled = pending || stale;
  const posHref = `/finance/${encodeURIComponent(slug ?? data.cafe.slug)}/pos`;
  const match = (value: string) => value.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar"));
  const dateMatch = (value: string) => { const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); return (!from || date >= from) && (!to || date <= to); };
  const accountName = (id: string | null) => data.accounts.find((account) => account.id === id)?.name ?? "—";
  const partyName = (id: string | null) => data.parties.find((party) => party.id === id)?.name ?? "عميل نقدي";
  const itemName = (id: string) => data.items.find((item) => item.id === id)?.name ?? "صنف";
  const warehouseName = (id: string) => data.warehouses.find((warehouse) => warehouse.id === id)?.name ?? "مستودع";
  const open = (next: FinanceForm) => { if (!allows(next.operation)) return; state.clearFeedback(); setForm(next); };
  const addButton = (next: FinanceForm, label = next.title) => allows(next.operation) && <button className={styles.primary} disabled={disabled} onClick={() => open(next)}><Plus size={16} aria-hidden="true" />{label}</button>;
  const exportButton = (name: string, rows: (string | number)[][]) => <button type="button" className={styles.secondary} onClick={() => downloadFinanceCsv(name, rows)}><ArrowDownToLine size={16} aria-hidden="true" />تصدير الجدول</button>;
  const searches = <div className={styles.toolbar}><label className={styles.searchBox}><Search size={18} aria-hidden="true" /><input className={styles.search} aria-label="البحث في السجل" placeholder="ابحث بالاسم أو رقم المستند" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{["sales", "purchases", "reports", "shifts"].includes(section) && <div className={styles.actions}><label className={styles.field}>من<input aria-label="من تاريخ" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className={styles.field}>إلى<input aria-label="إلى تاريخ" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label></div>}</div>;
  function documentsTable(documents: FinanceDocument[], title: string) {
    const showPaid = section === "sales" && salesView === "payments";
    const filtered = documents.filter((document) => dateMatch(document.created_at) && match(`${document.number} ${partyName(document.party_id)} ${document.note}`));
    return <Panel title={title} action={exportButton("branda-finance-documents.csv", [["الرقم", "النوع", "التاريخ", "الطرف", "الإجمالي", "المدفوع", "المتبقي"], ...filtered.map((document) => [document.number, documentKindNames[document.kind] ?? document.kind, financeDate(document.created_at), partyName(document.party_id), document.total, document.total - (document.refunded_total ?? 0) - document.outstanding, document.refunded ? 0 : document.outstanding])])}>
      {!filtered.length ? <Empty title="لا توجد مستندات مطابقة">ستظهر العمليات المحفوظة هنا مع المبالغ وحالة السداد</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>المستند</th><th>التاريخ</th><th>الطرف</th><th>الإجمالي</th>{showPaid && <th>المحصّل بعد الاسترداد</th>}<th>المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map((document) => <tr key={document.id}><td><strong>#{document.number}</strong><br /><small>{documentKindNames[document.kind] ?? document.kind}</small></td><td>{financeDate(document.created_at)}</td><td>{partyName(document.party_id)}</td><td><Numeric value={document.total} money /></td>{showPaid && <td><Numeric value={document.refunded ? 0 : Math.max(0, document.total - (document.refunded_total ?? 0) - document.outstanding)} money /></td>}<td><Numeric value={document.refunded ? 0 : document.outstanding} money /></td><td><span className={styles.badge}>{financeDocumentStatus(document)}</span></td><td><div className={styles.actions}><button className={styles.secondary} onClick={() => setReceiptId(document.id)}>التفاصيل</button>{allows("settlement") && !document.refunded && document.outstanding > .009 && ["sale", "purchase"].includes(document.kind) && <button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "settlement", title: `تسوية مستند #${document.number}`, values: { documentId: document.id, remaining: document.outstanding } })}>تسجيل دفعة</button>}{allows("refund") && !document.refunded && ["sale", "purchase"].includes(document.kind) && <button className={styles.danger} disabled={disabled} onClick={() => open({ operation: "refund", title: `إرجاع مستند #${document.number}`, values: { documentId: document.id } })}>مرتجع</button>}</div></td></tr>)}</tbody></table></div>}
    </Panel>;
  }
  const cash = data.accounts.filter((account) => account.kind === "cash").reduce((sum, account) => sum + account.balance, 0);
  const bank = data.accounts.filter((account) => account.kind === "bank").reduce((sum, account) => sum + account.balance, 0);
  const pos = data.accounts.filter((account) => account.kind === "pos").reduce((sum, account) => sum + account.balance, 0);
  const employee = data.accounts.filter((account) => account.kind === "employee").reduce((sum, account) => sum + account.balance, 0);
  const lowStock = data.items.filter((item) => item.active && item.quantity <= item.min_quantity);
  const filteredParties = data.parties.filter((party) => (partyKind === "all" || party.kind === partyKind) && match(`${party.name} ${party.phone} ${party.email}`));
  const journals = data.journal.filter((line) => dateMatch(line.created_at) && match(`${accountName(line.account_id)} ${line.memo}`));

  const accessibleForm = form && allows(form.operation) ? form : null;
  if (!canFinance(data.role, "dashboard")) return <Empty title="لا تملك صلاحية عرض لوحة المالية" />;

  return <div className={`${styles.page} ${isDocumentPage ? styles.invoiceManagementPage : ""}`} dir="rtl">
    {isDocumentPage ? <header className={styles.invoiceManagementHeader}><div><p className={styles.eyebrow}>نظام برندة المتكامل / {isShiftPage ? sections.find(item => item.id === "shifts")?.label : isCustomerDetail ? "العملاء" : isJournalDetail ? "القيود اليومية" : "المبيعات"}</p><h1 className={styles.panelTitle}>{isShiftPage ? sections.find(item => item.id === "shifts")?.label : isCustomerDetail ? "ملف العميل" : isJournalDetail ? "قيد اليومية" : isRecurringInvoicePage ? "الفواتير الدورية" : isSalesReturnPage ? "الفواتير المرتجعة" : isCreditNotePage ? salesView === "credit-create" ? "إنشاء إشعار دائن" : "الإشعارات الدائنة" : isQuotePage ? salesView === "quote-create" ? "إنشاء عرض سعر" : "إدارة عروض الأسعار" : isInvoiceDetail ? "تفاصيل الفاتورة" : isSalesSettings ? "إعدادات المبيعات" : isInvoiceEditor ? "إضافة فاتورة" : "إدارة الفواتير"}</h1></div><span className={styles.muted}>{data.cafe.name}</span></header> : <header className={styles.header}><div><p className={styles.eyebrow}><CircleDollarSign size={16} aria-hidden="true" />نظام برندة المتكامل {data.cafe.name}</p><h1 className={styles.title}>حركة علامتك بالأرقام</h1><p className={styles.subtitle}>المبيعات والمخزون والخزينة في دفتر واحد</p></div><div className={styles.actions}><button className={styles.secondary} onClick={state.refresh} disabled={pending}><RefreshCw size={16} aria-hidden="true" />{pending ? "جار التحديث" : "تحديث الأرصدة"}</button>{phoneStaffManagement && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => { if (slug) setSection("cashiers"); else window.history.pushState(null, "", "/dashboard/finance?section=cashiers"); }}>إدارة المستخدمين والصلاحيات</button>}{!phoneStaffManagement && allows("sales_cashier_create") && <button type="button" className={styles.secondary} disabled={disabled || !canManageCashiers} aria-describedby={!canManageCashiers ? "cashier-owner-hint" : undefined} onClick={() => { if (canManageCashiers) open({ operation: "sales_cashier_create", title: "إضافة كاشير مبيعات" }); }}><Plus size={16} aria-hidden="true" />إضافة كاشير مبيعات</button>}{canFinance(data.role,"pos") && <Link className={styles.primary} href={posHref}>فتح الكاشير المالي<ArrowLeft size={17} aria-hidden="true" /></Link>}</div></header>}
    {!isDocumentPage && isAldeemCafe(data.cafe) && <Link href={`/finance/${data.cafe.slug}/lab`} className={styles.secondary}>{labEntryLabel}<ArrowLeft size={16} aria-hidden="true" /></Link>}
    {!isDocumentPage && !canManageCashiers && <p id="cashier-owner-hint" className={styles.muted}>إضافة الكاشيرات متاحة لمالك العلامة</p>}
    {!isDocumentPage && canFinance(data.role,"pos") && <Link href="/cashier/login?type=sales" className={styles.secondary}>صفحة دخول كاشير المبيعات<ArrowLeft size={16} aria-hidden="true" /></Link>}
    {slug && <nav className={styles.navigation} aria-label="أقسام المالية">{sections.filter((item) => financeSectionAllowed(item.id,data.role,canManageCashiers)).map(({ id, label, icon: Icon }) => <button type="button" aria-current={section === id ? "page" : undefined} key={id} className={`${styles.navItem} ${section === id ? styles.navActive : ""}`} onClick={() => { setSection(id); setQuery(""); }}><Icon size={16} aria-hidden="true" />{label}</button>)}</nav>}
    {message && <div className={styles.success} role="status">{message}</div>}
    {error && !form && <div className={styles.error} role="alert">{error}</div>}
    {stale && <div className={styles.notice}>البيانات المعروضة قديمة مؤقتًا حدّث الأرصدة لاستئناف العمليات</div>}
    {!isDocumentPage && Object.values(state.historyMore).some(Boolean) && <div className={styles.notice}>الجداول تعرض أحدث العمليات استخدم تحميل المزيد لاستعراض الأقدم الأرصدة وميزان المراجعة يشملان كامل السجل</div>}
    <div className={styles.workspace}>
      {isHospitalStore(data.cafe.slug) && section === "parties" && !isCustomerDetail && <HospitalDebtsPanel snapshot={data} language="ar" onChanged={() => { void state.refresh(); }} />}
      {isCustomerDetail && <FinanceCustomerDetail key={recordId} id={recordId} snapshot={data} disabled={disabled} onBack={returnFromRecord}
        onInvoice={id => showInvoice(id)} onPayment={(invoiceId, paymentId) => showInvoice(invoiceId, paymentId)}
        onQuote={!slug && canFinance(data.role, "accounting_write") ? id => window.history.pushState(null, "", `/dashboard/finance?section=sales&view=quote-create&quote=${encodeURIComponent(id)}`) : undefined}
        onJournal={id => showRecord("journal", id, undefined, undefined, recordId)}
        onEdit={allows("party") ? customer => open({ operation: "party", title: "تعديل بيانات العميل", values: { ...customer, taxNumber: customer.tax_number } }) : undefined}
        onCreateInvoice={canFinance(data.role, "accounting_write") ? customer => createForCustomer(customer, false) : undefined}
        onCreateQuote={!slug && canFinance(data.role, "accounting_write") ? customer => createForCustomer(customer, true) : undefined} />}
      {isJournalDetail && journalReversal?.payment.id === recordId && <FinancePaymentEditor payment={journalReversal.payment} invoiceNumber={journalReversal.invoiceNumber} collectors={journalReversal.collectors} snapshot={data} disabled={disabled || !canFinance(data.role, "accounting_write")} deleting onCancel={() => setJournalReversal(null)} onSaved={async () => { setJournalReversal(null); setJournalRevision(value => value + 1); await state.refresh(); }} />}
      {isJournalDetail && journalReversal?.payment.id !== recordId && <FinanceJournalDetail key={`${recordId}:${journalRevision}`} id={recordId} slug={data.cafe.slug} brand={data.cafe.name} disabled={disabled} onBack={returnFromRecord}
        onCopySource={journal => journalSourceAction(journal, false)} onReverseSource={journal => journalSourceAction(journal, true)}
        onOpenDraft={id => window.location.assign(`${slug ? `/finance/${encodeURIComponent(slug)}` : "/dashboard/finance"}/ledger?draft=${encodeURIComponent(id)}`)}
        onSource={(invoiceId, paymentId) => showInvoice(invoiceId, paymentId)}
        onNavigate={id => showRecord("journal", id, (slug ? localRecord?.invoiceId : params.get("returnInvoice")) ?? undefined, (slug ? localRecord?.paymentId : params.get("returnPayment")) ?? undefined, (slug ? localRecord?.customerId : params.get("returnCustomer")) ?? undefined)} />}
      {canFinance(data.role,"reports") && <FinanceControlPanel key={data.cafe.id} slug={slug} snapshotVersion={data} visible={section === "overview" || section === "reports" && !isJournalDetail} />}
      {section === "overview" && <>
        <div className={styles.metrics}>
          <Metric label="إجمالي المبيعات شامل الضريبة" value={data.summary.salesGross ?? data.summary.sales} note="بعد المرتجعات المعتمدة والخصومات" />
          <Metric label="ضريبة المبيعات" value={data.summary.salesTax ?? 0} note="الضريبة المدرجة في إجمالي المبيعات" />
          <Metric label="صافي المبيعات" value={data.summary.sales} note="بعد استبعاد الضريبة" />
          <Metric label="هامش الربح الدفتري" value={data.summary.sales > 0 ? Math.round(data.summary.profit / data.summary.sales * 10000) / 100 : 0} percent note={data.summary.sales > 0 ? "الربح التشغيلي ÷ صافي المبيعات" : "لا توجد مبيعات لحساب النسبة"} />
          <Metric label="الربح الدفتري" value={data.summary.profit} note="حسب القيود المسجلة راجع جودة التكلفة في الرقابة المحاسبية" />
          <Metric label="مستحقات الموردين" value={data.summary.payables} />
          <Metric label="مبالغ مستحقة على العملاء" value={data.summary.receivables} note="مبيعات آجلة لم تُحصّل بعد" />
        </div>
        <div className={styles.twoColumns}><Panel title="أين أرصدة العلامة؟" action={<Wallet size={19} aria-hidden="true" />}><div className={styles.panelBody}>{[["النقدية", cash], ["البنوك", bank], ["نقاط البيع", pos], ["عهد الموظفين", employee], ["قيمة المخزون", data.summary.inventoryValue]].map(([label, value]) => <div key={String(label)} className={styles.balanceLine}><span>{label}</span><strong><Numeric value={Number(value)} money /></strong></div>)}</div></Panel><Panel title="متابعة التشغيل"><div className={styles.panelBody}><div className={styles.balanceLine}><span>ورديات مفتوحة</span><strong>{data.shifts.filter((shift) => shift.status === "open").length}</strong></div><div className={styles.balanceLine}><span>ورديات تنتظر الاستلام</span><strong>{data.shifts.filter((shift) => shift.status === "handover").length}</strong></div><div className={styles.balanceLine}><span>أصناف عند حد التنبيه</span><strong className={lowStock.length ? styles.negative : styles.positive}>{lowStock.length}</strong></div>{lowStock.slice(0, 4).map((item) => <div key={item.id} className={styles.balanceLine}><span>{item.name}</span><span><Numeric value={item.quantity} /> {item.unit}</span></div>)}</div></Panel></div>
        {documentsTable(data.documents.filter((document) => document.kind === "sale").slice(0, 6), "آخر المبيعات")}
      </>}
      {isCreditNotePage && <FinanceCreditNotes snapshot={data} view={salesView ?? "credit-notes"} noteId={params.get("creditNote")} copy={params.get("copy") === "1"} stale={stale} pending={pending} onChanged={() => { void state.refresh(); }} onCreateCustomer={async payload => allows("party") && !!(await state.execute("party", payload))} />}
      {isRecurringInvoicePage && <FinanceRecurringInvoices snapshot={creationSnapshot} view={salesView ?? "recurring"} recurringId={params.get("recurring")} stale={stale} pending={pending} onChanged={() => { void state.refresh(); }} onCreateCustomer={async payload => allows("party") && !!(await state.execute("party", payload))} />}
      {isSalesReturnPage && <FinanceSalesReturns snapshot={data} view={salesView ?? "returns"} returnId={params.get("return")} stale={stale} pending={pending} onChanged={() => { void state.refresh(); }} />}
      {isQuotePage && (canFinance(data.role, "accounting_write") ? <FinanceQuotes key={`${salesView}:${params.get("quote") ?? "new"}:${params.get("customer") ?? ""}`} snapshot={creationSnapshot} initialCustomerId={params.get("customer") ?? undefined} create={salesView === "quote-create"} quoteId={params.get("quote")} stale={stale} pending={pending} onCreateCustomer={async payload => allows("party") && !!(await state.execute("party", payload))} /> : <Empty title="لا تملك صلاحية إدارة عروض الأسعار" />)}
      {section === "sales" && salesView === "create" && (canFinance(data.role, "accounting_write") ? <FinanceSaleForm key={`${params.get("draft") ?? "new"}:${params.get("customer") ?? ""}`} initialDraftId={params.get("draft") ?? undefined} initialCustomerId={params.get("customer") ?? undefined} onIssued={() => { void state.refresh(); }} snapshot={creationSnapshot} pending={pending} stale={stale} error={error} onCancel={showSalesInvoices} onCreateCustomer={async payload => allows("party") && !!(await state.execute("party", payload))} /> : <Empty title="لا تملك صلاحية إنشاء الفواتير" />)}
      {isSalesSettings && <FinanceSalesSettings snapshot={data} slug={data.cafe.slug} settings={data.settings} disabled={disabled} onEditInvoices={allows("settings") ? () => open({ operation: "settings", title: "تعديل إعدادات المبيعات", values: { vatRate: data.settings.vat_rate, closedThrough: data.settings.closed_through ?? "", taxInclusive: data.settings.tax_inclusive } }) : undefined} />}
      {isInvoiceDetail && <FinanceInvoiceDetail key={`${invoiceId}:${paymentId ?? ""}`} id={invoiceId} initialPaymentId={paymentId} onCustomer={(customerId, paymentId) => showRecord("customer", customerId, invoiceId, paymentId)} onJournal={(id, paymentId) => showRecord("journal", id, invoiceId, paymentId)} onChanged={state.refresh} snapshot={data} disabled={disabled} onBack={showSalesInvoices} onNavigate={showInvoice} onPrint={document => { setReceiptId(null); setDetailReceipt(document); }} onDraft={!slug ? id => window.history.pushState(null, "", `/dashboard/finance?section=sales&view=create&draft=${encodeURIComponent(id)}`) : undefined} onSettle={allows("settlement") ? (document, amount) => { setDetailOperationDocument(document); open({ operation: "settlement", title: `تسجيل دفعة للفاتورة #${document.number}`, values: { documentId: document.id, remaining: document.outstanding, ...(amount === undefined ? {} : { amount }) } }); } : undefined} onRefund={allows("refund") ? document => { setDetailOperationDocument(document); open({ operation: "refund", title: `إرجاع مستند #${document.number}`, values: { documentId: document.id } }); } : undefined} />}
      {isInvoiceManagement && <FinanceInvoices onImport={canFinance(data.role, "accounting_write") && !disabled ? setInvoiceImportMode : undefined} currentUserId={data.userId} onSettings={allows("settings") ? showInvoiceSettings : undefined} onReports={canFinance(data.role, "reports") ? showInvoiceReports : undefined} documents={data.documents} parties={data.parties} staff={data.staff} shifts={data.shifts} pending={pending} disabled={disabled} hasMore={state.historyMore.documents} onRefresh={state.refresh} onLoadMore={() => state.loadMore("documents")} onCreate={allows("sale") ? () => { if (slug) open({ operation: "sale", title: "إضافة فاتورة مبيعات" }); else { state.clearFeedback(); window.history.pushState(null, "", "/dashboard/finance?section=sales&view=create"); } } : undefined} onReceipt={showInvoice} onSettle={allows("settlement") ? document => open({ operation: "settlement", title: `تسوية مستند #${document.number}`, values: { documentId: document.id, remaining: document.outstanding } }) : undefined} onRefund={allows("refund") ? document => open({ operation: "refund", title: `إرجاع مستند #${document.number}`, values: { documentId: document.id } }) : undefined} />}
      {isCustomerPaymentsPage && <FinanceCustomerPayments key={`${data.cafe.id}:${data.userId}:${data.role}`} snapshot={data} view={salesView ?? "payments"} paymentId={paymentId} disabled={disabled} onChanged={() => { void state.refresh(); }} onInvoice={showInvoice} onCustomer={(id, payment) => showRecord("customer", id, undefined, undefined, undefined, payment)} onJournal={(id, payment) => showRecord("journal", id, undefined, undefined, undefined, payment)} />}
      {section === "purchases" && <><div className={styles.toolbar}><div><h2 className={styles.panelTitle}>مشتريات العلامة</h2><p className={styles.muted}>استلام الأصناف وتكلفتها وسداد المورد في عملية واحدة</p></div>{addButton({ operation: "purchase", title: "تسجيل مشتريات" })}</div>{searches}{documentsTable(data.documents.filter((document) => document.kind === "purchase"), "فواتير الموردين")}</>}
      {section === "parties" && !isCustomerDetail && <><div className={styles.toolbar}><div className={styles.actions}><button className={styles.category} aria-pressed={partyKind === "all"} onClick={() => setPartyKind("all")}>الكل</button>{[["customer", "العملاء"], ["supplier", "الموردون"], ["employee", "الموظفون"]].map(([kind, name]) => <button className={styles.category} key={kind} aria-pressed={partyKind === kind} onClick={() => setPartyKind(kind)}>{name}</button>)}</div>{addButton({ operation: "party", title: "إضافة عميل أو مورد أو موظف", values: { kind: partyKind === "all" ? "customer" : partyKind } }, "إضافة طرف")}</div>{searches}<Panel title="العملاء والموردون والموظفون">{!filteredParties.length ? <Empty title="ابدأ بإضافة أطراف التعامل">أضف عملاءك ومورديك لربط المبيعات والمشتريات بحساباتهم</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الاسم</th><th>النوع</th><th>التواصل</th><th>الرصيد</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{filteredParties.map((party) => <tr key={party.id}><td>{party.kind === "customer" ? <button type="button" className={styles.secondary} onClick={() => showRecord("customer", party.id)}>{party.name}</button> : <strong>{party.name}</strong>}</td><td>{party.kind === "customer" ? "عميل" : party.kind === "supplier" ? "مورد" : "موظف"}</td><td>{party.phone || party.email || "—"}</td><td><Numeric value={party.balance} money /></td><td>{party.active ? "نشط" : "موقوف"}</td><td>{allows("party") && <button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "party", title: "تعديل بيانات الطرف", values: { ...party, taxNumber: party.tax_number } })}>تعديل</button>}</td></tr>)}</tbody></table></div>}</Panel></>}
      {section === "inventory" && <>
        {isHospitalStore(data.cafe.slug) && allows("settings") && <div className={styles.toolbar}><button type="button" disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "settings", title: "إعدادات ضريبة الأسعار", values: { vatRate: data.settings.vat_rate, closedThrough: data.settings.closed_through ?? "", taxInclusive: data.settings.tax_inclusive } })}>إعدادات ضريبة الأسعار</button><span className={styles.muted}>{data.settings.tax_inclusive ? "الأسعار الحالية شاملة الضريبة" : "الأسعار الحالية غير شاملة الضريبة"}</span></div>}
        <div className={styles.toolbar}><div className={styles.actions}>{addButton({ operation: "item", title: "إضافة صنف مخزني" })}{allows("stock_adjust") && <button disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "stock_adjust", title: "تسوية كمية أو جرد" })}>جرد وتسوية كمية</button>}{allows("stock_transfer") && data.warehouses.filter(warehouse => warehouse.active).length > 1 && <button disabled={disabled} className={styles.secondary} onClick={() => open({ operation: "stock_transfer", title: "تحويل بين المستودعات" })}>تحويل مخزون</button>}</div>{canFinance(data.role,"settings_manage") && <Link href="/dashboard/menu" className={styles.secondary}>صور وأسعار المنيو</Link>}</div>
        {inventoryView !== "movements" && <FinanceInventoryReport snapshot={data} disabled={disabled} onAdjust={allows("stock_adjust") ? row => open({ operation: "stock_adjust", title: "جرد وتسوية كمية", values: { itemId: row.item.id, warehouseId: row.warehouseId } }) : undefined} onItemEdit={allows("item") ? item => open({ operation: "item", title: "تعديل الصنف", values: { ...item, menuProductId: item.menu_product_id ?? "", minQuantity: item.min_quantity } }) : undefined} />}
        {inventoryView !== "items" && <><h2 className={styles.panelTitle}>تصفية سجل الحركات</h2>{searches}<label className={styles.field}>مستودع الحركة<select value={warehouseId} onChange={event=>setWarehouseId(event.target.value)}><option value="">جميع المستودعات</option>{data.warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <Panel title="حركات المخزون">{!data.movements.length ? <Empty title="لا توجد حركة مخزون بعد" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>التاريخ</th><th>الصنف</th><th>المستودع</th><th>حركة الكمية</th><th>تكلفة الوحدة</th></tr></thead><tbody>{data.movements.filter((move) => (!warehouseId || move.warehouse_id === warehouseId) && match(itemName(move.item_id))).map((move) => <tr key={move.id}><td>{financeDate(move.created_at)}</td><td>{itemName(move.item_id)}</td><td>{warehouseName(move.warehouse_id)}</td><td className={move.quantity < 0 ? styles.negative : styles.positive}><Numeric value={move.quantity} /></td><td><Numeric value={move.unit_cost} money /></td></tr>)}</tbody></table></div>}</Panel></>}
      </>}
      {section === "treasury" && <FinanceTreasury snapshot={data} slug={slug} onRefresh={state.refresh} />}
      {section === "printer" && <FinancePrinterSettings brandId={data.cafe.id} />}
      {section === "shifts" && <>
        {canFinance(data.role,"shifts_read") && <FinanceShiftMonitor snapshot={data} slug={slug} onInvoice={showInvoice} onChanged={() => { void state.refresh(); }} />}
        <details className={styles.panel}><summary className={styles.panelTitle}>التسليم وفروقات النقدية</summary>
        <FinanceCashDifferences role={data.role} slug={slug} onSettled={() => { void state.refresh(); }} />
        <FinanceCashHandovers snapshot={data} slug={slug} onReceived={() => { void state.refresh(); }} />
        <div className={styles.toolbar}><p className={styles.muted}>بداية الوردية وإقفالها وتسليمها من الكاشير المالي</p>{canFinance(data.role,"pos") && <Link href={posHref} className={styles.primary}>إدارة الكاشير<ArrowLeft size={16} aria-hidden="true" /></Link>}</div>
        </details>
      </>}
      {section === "reports" && !isJournalDetail && <>
        {ledgerPilotEnabled(data.cafe.id) && <Panel title="دفتر الأستاذ والاعتماد" action={<Link className={styles.secondary} href={slug ? `/finance/${encodeURIComponent(slug)}/ledger` : '/dashboard/finance/ledger'}>فتح دفتر الأستاذ</Link>}><p className={styles.subtitle}>أنشئ مسودة قيد وراجع اعتمادها ثم تابع ترحيلها وأثرها في الحسابات</p></Panel>}
        <div className={styles.metrics}><Metric label="صافي المبيعات" value={data.summary.sales} /><Metric label="المشتريات" value={data.summary.purchases} /><Metric label="المصروفات" value={data.summary.expenses} /><Metric label="الربح الدفتري" value={data.summary.profit} /></div>
        <p className={styles.muted}>ملخص الأرصدة حتى آخر تحديث مرشحات التاريخ أدناه تخص سجل القيود المعروض</p>
        <Panel title="ميزان المراجعة" action={exportButton("branda-trial-balance.csv", [["الحساب", "مدين", "دائن", "الرصيد"], ...data.trialBalance.map((line) => [line.name, line.debit, line.credit, line.balance])])}><FinanceTrialBalance lines={data.trialBalance} onSelectAccount={setSelectedAccountId} /></Panel>
        {searches}<Panel title="دفتر اليومية" action={<div className={styles.actions}>{addButton({ operation: "journal", title: "ترحيل قيد يدوي متوازن" })}<FinanceJournalExport slug={slug} from={from} to={to} query={query} /></div>}>{!journals.length ? <Empty title="لا توجد قيود مطابقة" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>التاريخ</th><th>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{journals.map((line) => <tr key={line.id}><td>{financeDate(line.created_at)}</td><td>{accountName(line.account_id)}</td><td>{line.memo || "—"}</td><td><Numeric value={line.debit} money /></td><td><Numeric value={line.credit} money /></td></tr>)}</tbody></table></div>}</Panel>
      </>}
      {canFinance(data.role,"reports") && <div hidden={isJournalDetail || section !== "reports" && section !== "settings"}><FinancePeriodHistory key={`${data.cafe.id}:${data.settings.closed_through}`} slug={slug} visible={section === "reports" && !isJournalDetail || section === "settings"} /></div>}
      {phoneStaffManagement && (section === "cashiers" || section === "settings") && <FinancePhoneStaff snapshot={data} disabled={disabled} onRefresh={state.refresh} onEdit={staff => open({ operation: "staff", title: "الصلاحيات والحالة", values: { userId: staff.user_id, name: staff.name, role: staff.role, active: staff.active } })} />}
      {section === "cashiers" && !canManageCashiers && <Panel title="إدارة الكاشير"><Empty title="إدارة الكاشير غير متاحة لهذا الحساب">ادخل بحساب مالك العلامة أو افتح جلسة صيانة سارية لهذه العلامة ثم حدّث الصفحة</Empty></Panel>}
      {section === "cashiers" && canManageCashiers && !phoneStaffManagement && <FinanceCashierManagement staff={data.staff} userId={data.userId} disabled={disabled}
        onAdd={() => open({ operation: "sales_cashier_create", title: "إضافة موظف كاشير" })}
        onEdit={cashier => open({ operation: "staff", title: "تعديل الكاشير", values: { userId: cashier.user_id, name: cashier.name, role: cashier.role, active: cashier.active } })} />}
      {section === "settings" && !data.canAdminister && <Panel title="الإعدادات وفريق المالية"><Empty title="إضافة الكاشير متاحة لمالك العلامة">ادخل بحساب مالك العلامة ثم اختر إضافة كاشير مبيعات</Empty></Panel>}
      {section === "settings" && data.canAdminister && <>
        {isHospitalStore(data.cafe.slug) && <Panel title="بيانات العلامة والضريبة"><div className={styles.panelBody}><p className={styles.muted}>أضف الرقم الضريبي للعلامة من إعدادات الحساب عند توفره</p><Link className={styles.secondary} href={slug ? `/finance/${encodeURIComponent(slug)}/system/settings/general` : "/dashboard/system/settings/general"}>بيانات الحساب والرقم الضريبي</Link></div></Panel>}
        <div className={styles.twoColumns}><Panel title="السياسة المحاسبية" action={<button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "settings", title: "إعدادات المالية", values: { vatRate: data.settings.vat_rate, closedThrough: data.settings.closed_through ?? "", taxInclusive: data.settings.tax_inclusive } })}>تعديل الإعدادات</button>}><div className={styles.panelBody}><div className={styles.balanceLine}><span>العملة</span><strong>الريال السعودي</strong></div><div className={styles.balanceLine}><span>ضريبة القيمة المضافة</span><strong>{data.settings.vat_rate}%</strong></div><div className={styles.balanceLine}><span>الأسعار</span><strong>{data.settings.tax_inclusive ? "شاملة الضريبة" : "غير شاملة الضريبة"}</strong></div><div className={styles.balanceLine}><span>آخر فترة مقفلة</span><strong>{data.settings.closed_through ?? "لا توجد فترة مقفلة"}</strong></div></div></Panel><Panel title="دخول فريق المالية"><div className={styles.panelBody}><p className={styles.muted}>وزّع العمل بين مدير التشغيل والمحاسب وأمين المستودع والمراجع والكاشير تعيين الأدوار للمالك فقط</p><Link href={`/finance/${data.cafe.slug}/login`} className={styles.secondary}>فتح صفحة دخول المالية<ArrowLeft size={16} /></Link></div></Panel></div>
        {!phoneStaffManagement && <Panel title="فريق المالية" action={<div className={styles.actions}>{addButton({ operation: "sales_cashier_create", title: salesCashierLabel })}{addButton({ operation: "staff", title: staffLabel })}</div>}>{!data.staff.length ? <Empty title="لم تضف موظفين ماليين">يمكنك تشغيل الكاشير بصفتك صاحب العلامة أو إضافة حسابات خاصة بفريقك</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{data.staff.map((staff) => <tr key={staff.user_id}><td>{staff.name}</td><td>{financeRoleLabels[staff.role]}</td><td>{staff.active ? "نشط" : "موقوف"}</td><td>{staff.user_id !== data.userId && <button className={styles.secondary} disabled={disabled} onClick={() => open({ operation: "staff", title: "تعديل الموظف المالي", values: { userId: staff.user_id, name: staff.name, role: staff.role, active: staff.active } })}>تعديل الصلاحية</button>}</td></tr>)}</tbody></table></div>}</Panel>}
      </>}
      {section === "purchases" && state.historyMore.documents && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("documents")}>{pending ? "جار تحميل المستندات" : "تحميل مستندات أقدم"}</button>}
      {section === "reports" && !isJournalDetail && state.historyMore.journal && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("journal")}>{pending ? "جار تحميل القيود" : "تحميل قيود أقدم"}</button>}
      {section === "inventory" && inventoryView !== "items" && state.historyMore.movements && <button className={styles.secondary} disabled={pending} onClick={() => state.loadMore("movements")}>{pending ? "جار تحميل الحركات" : "تحميل حركات مخزون أقدم"}</button>}
    </div>
    {canFinance(data.role,"accounting_write") && (section === "overview" || (section === "sales" && ["invoices", "returns"].includes(salesView ?? ""))) && <FinanceRefundRequests snapshot={data} pending={disabled} error={error} onExecute={state.execute} onReceipt={id => { if (slug) setReceiptId(id); else navigateSalesReturns(id); }} />}
    {invoiceImportMode && canFinance(data.role, "accounting_write") && <FinanceInvoiceImport mode={invoiceImportMode} slug={data.cafe.slug} onClose={() => setInvoiceImportMode(null)} onImported={id => { setInvoiceImportMode(null); if (slug) open({ operation: "sale", title: "مراجعة الفاتورة المستوردة", values: { draftId: id } }); else window.history.pushState(null, "", `/dashboard/finance?section=sales&view=create&draft=${encodeURIComponent(id)}`); }} />}
    <Modal open={!!accessibleForm} title={accessibleForm?.title ?? "عملية مالية"} onClose={() => { if (!pending && !inventoryBusy) setForm(null); }} panelClassName={["sale", "refund"].includes(accessibleForm?.operation ?? "") ? styles.invoicePanel : "flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"}>{accessibleForm?.operation === "sale" ? <FinanceSaleForm initialDraftId={typeof accessibleForm.values?.draftId === "string" ? accessibleForm.values.draftId : undefined} initialCustomerId={String(accessibleForm.values?.customerId ?? "")} onIssued={() => { void state.refresh(); }} snapshot={creationSnapshot} pending={pending} stale={stale} error={error} onCancel={() => { if (!pending) setForm(null); }} onCreateCustomer={async payload => allows("party") && !!(await state.execute("party", payload))} /> : accessibleForm?.operation === "party" && accessibleForm.values?.kind === "customer" ? <FinanceCustomerForm values={accessibleForm.values} pending={disabled} error={error} onCancel={() => { if (!pending) setForm(null); }} onSubmit={async (operation, payload) => allows(operation) && !!(await state.execute(operation, payload))} onSaved={() => setForm(null)} /> : accessibleForm && <FinanceOperationForm key={`${accessibleForm.operation}:${String(accessibleForm.values?.id ?? accessibleForm.values?.documentId ?? "new")}`} form={accessibleForm} snapshot={operationSnapshot} pending={pending} error={error} onInventorySaved={state.applyInventoryCatalog} onInventoryUnitsChanged={state.applyInventoryUnits} onInventoryBusyChange={setInventoryBusy} onCancel={() => setForm(null)} onSubmit={async (operation, payload) => { if (!allows(operation)) return false; const result = await state.execute(operation, payload); if (result) { setForm(null); if (accessibleForm.values?.journalOrigin && result.status !== "pending") { setJournalRevision(value => value + 1); showRecord("journal", result.id, detailOperationDocument?.id); } else if (operation === "refund" && result.status !== "pending") setReceiptId(result.id); } return !!result; }} />}</Modal>
    {canFinance(data.role,"reports") && receipt && <FinanceReceiptDialog key={`${data.cafe.id}:${receipt.id}`} document={receipt} snapshot={data} onClose={() => { setReceiptId(null); setDetailReceipt(null); }} />}
    {canFinance(data.role,"reports") && selectedAccountId && <FinanceTreasury key={selectedAccountId} snapshot={data} slug={slug} onRefresh={state.refresh} initialAccountId={selectedAccountId} detailOnly onCloseAccount={() => setSelectedAccountId(null)} />}
      {canFinance(data.role,"shifts_read") && selectedShiftId && <FinanceShiftDetails key={selectedShiftId} shiftId={selectedShiftId} snapshot={data} slug={slug} pending={disabled} onExecute={state.execute} onClose={() => setSelectedShiftId(null)} />}
  </div>;
}
