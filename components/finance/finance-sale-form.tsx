"use client";

import { InvoiceCustomerSearch } from "./invoice-customer-search";
import { getAldeemInvoicePaymentOptions, searchAldeemInvoiceProducts, searchAldeemInvoiceCustomers } from "@/app/actions/aldeem-invoice-lookups";
import {CustomerPriceListSuggestion} from '@/components/erp/customers/price-list-suggestion';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Eye, Plus, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { AldeemCustomerForm } from "./aldeem-customer-form";
import customerDesign from "./aldeem-customer-form.module.css";
import { customerCreditAllocation } from "@/lib/finance/customer-credit-allocation";
import { useAldeemCustomerCredit } from "./use-aldeem-customer-credit";
import { useAldeemSalesPolicy, aldeemInvoiceSettings } from "./use-aldeem-sales-policy";
import { financeReceiptQr, getFinanceReceiptTaxStatus } from "@/lib/finance/receipt-tax";
import { FinanceCustomerForm } from "./finance-customer-form";
import { CompanyInvoiceLines } from "./company-invoice-lines";
import { InvoiceLinePricing, useInvoicePricingContext } from "./company-invoice-pricing";
import { useInventorySalesCatalog } from "./use-inventory-sales-catalog";
import { inventoryUnitPrice, type InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import { invoicePolicyLine } from "./company-invoice-policy";
import { CompanyInvoiceFiles } from "./company-invoice-files";
import { listInvoiceFilesAction } from "@/app/actions/finance-invoice-files";
import { invoiceDepositAmount, invoiceOptionsNote, invoiceShippingAddress, type InvoiceDelivery, type InvoiceDeposit, type InvoiceFile, type ShippingMode } from "@/lib/finance/company-invoice-options";
import { listInvoiceDraftsAction, openInvoiceDraftAction, saveInvoiceDraftAction } from "@/app/actions/finance-invoice-drafts";
import { useInvoiceOrderSource } from "./use-invoice-order-source";
import { useInvoiceLineNotes } from "./use-invoice-line-notes";
import { useInvoiceShippingCharge } from "./use-invoice-shipping-charge";
import { useInvoiceCustomFields } from "./use-invoice-custom-fields";
import { InvoiceLoadStatus } from "./invoice-load-status";
import { createInvoiceContextLoader } from "@/lib/finance/invoice-context-loader";
import { InvoiceCustomFieldValues } from "./invoice-custom-field-values";
import { InvoiceShippingChargeEditor } from "./invoice-shipping-charge-editor";
import { invoiceShippingAmounts } from "@/lib/finance/invoice-shipping-amounts";
import { canFinance } from "@/lib/finance/permissions";
import { defaultInvoiceSettings, invoiceSettingsMoney, type InvoiceSettings } from "@/lib/finance/invoice-settings";
import { findCompanyInvoiceAction, issueCompanyInvoiceAction, sendCompanyInvoiceEmailAction, sendCompanyInvoiceWhatsAppAction } from "@/app/actions/finance-company-invoices";
import { useCompanyInvoiceIssuer } from "./use-company-invoice-issuer";
import type { InvoiceDraftPayload, InvoiceDraftSummary } from "@/lib/finance/invoice-draft";
import { companyAmounts, moneyRound } from "@/lib/finance/company-invoice";
import { getPrimaryFinanceAccount, type FinanceSnapshot } from "@/lib/finance/brand-finance";

import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";
import editor from "./finance-sale-form.module.css";
import reference from "./finance-sale-reference.module.css";
import aldeem from "./finance-sale-aldeem.module.css";

type Invoice = Omit<InvoiceDraftPayload["invoice"], "paymentKind"> & { paymentKind: string };

function InvoiceHelp({ text }: { text: string }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return <span className={editor.help} tabIndex={0} aria-label="مساعدة" aria-describedby={id} onFocus={() => setDismissed(false)} onPointerEnter={() => setDismissed(false)} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setDismissed(true); } }}>
    <CircleHelp size={15} aria-hidden="true" /><span id={id} role="tooltip" hidden={dismissed}>{text}</span>
  </span>;
}

export function invoicePreview(data: FinanceSnapshot, invoice: Invoice) {
  return companyAmounts(invoice.lines, data.products, invoice.discountEnabled === false ? 0 : invoice.discountValue, invoice.discountKind, invoice.vatRate ?? data.settings.vat_rate, invoice.taxInclusive ?? data.settings.tax_inclusive);
}

export function invoiceLinePreview(data: FinanceSnapshot, invoice: Invoice) {
  return invoicePreview(data, invoice).rows;
}

/** Legacy shift-sale contract retained for compatibility; the company invoice editor never submits it. */
export function invoicePayload(data: FinanceSnapshot, invoice: Invoice) {
  if (!data.canManage) throw new Error("لا تملك صلاحية إضافة فاتورة من الإدارة المالية");
  const shift = data.shifts.find(item => item.user_id === data.userId && item.status === "open");
  if (!shift) throw new Error("ابدأ وردية مالية قبل حفظ الفاتورة");
  if (!data.warehouses.some(item => item.id === invoice.warehouseId && item.active)) throw new Error("اختر مستودع البيع");
  if (!invoice.lines.length || invoice.lines.length > 100 || new Set(invoice.lines.map(line => line.productId)).size !== invoice.lines.length) throw new Error("أضف أصنافًا مختلفة للفاتورة");
  const lines = invoice.lines.map(line => {
    const product = data.products.find(item => item.id === line.productId && item.available);
    if (!product || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 9999) throw new Error("راجع الأصناف والكميات قبل الحفظ");
    return { productId: product.id, quantity: line.quantity, expectedUnitPrice: product.price };
  });
  const totals = invoicePreview(data, invoice);
  if (invoice.discountEnabled !== false && (!Number.isFinite(invoice.discountValue) || invoice.discountValue < 0 || totals.discount > totals.subtotal || (invoice.discountKind === "percent" && invoice.discountValue > 100))) throw new Error("الخصم يجب ألا يتجاوز قيمة الفاتورة");
  const vatRate = invoice.vatRate ?? data.settings.vat_rate;
  const taxInclusive = invoice.taxInclusive ?? data.settings.tax_inclusive;
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || Math.abs(vatRate * 100 - Math.round(vatRate * 100)) > 0.000001 || typeof taxInclusive !== "boolean") throw new Error("أدخل نسبة ضريبة من ٠ إلى ١٠٠ بمنزلتين عشريتين كحد أقصى");
  if (invoice.partyId && !data.parties.some(party => party.id === invoice.partyId && party.kind === "customer" && party.active)) throw new Error("اختر عميلًا نشطًا");
  if (!["cash", "bank", "pos", "credit"].includes(invoice.paymentKind)) throw new Error("اختر طريقة السداد");
  if (invoice.paymentKind === "credit" && !invoice.partyId) throw new Error("اختر العميل لحفظ الفاتورة الآجلة");
  if (invoice.paymentKind !== "credit" && !data.accounts.some(account => account.id === invoice.accountId && account.active && account.kind === invoice.paymentKind && (account.kind !== "cash" || account.id === shift.account_id))) throw new Error("اختر حساب تحصيل صالحًا لطريقة السداد");
  return { lines, warehouseId: invoice.warehouseId, shiftId: shift.id, ...(invoice.partyId ? { partyId: invoice.partyId } : {}), ...(invoice.paymentKind !== "credit" ? { accountId: invoice.accountId } : {}), discount: totals.discount, vatRate, taxInclusive, expectedTotal: totals.total, note: invoice.note.trim() };
}

export function FinanceSaleForm({ snapshot: snapshotData, pending, stale, error, onCancel, onCreateCustomer, onIssued, initialDraftId, initialCustomerId, appearance = "default" }: {
  appearance?: "default" | "aldeem";
  snapshot: FinanceSnapshot; pending: boolean; stale: boolean; error: string; onCancel: () => void;
  onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
  onIssued?: () => void;
  initialDraftId?: string;
  initialCustomerId?: string;
}) {
  const onDemand = appearance === "aldeem";
  const accountPolicy = useAldeemSalesPolicy(onDemand);
  const aldeemPolicy = accountPolicy.policy;
  const [lookedUpProducts, setLookedUpProducts] = useState<InvoiceCatalogProduct[]>([]);
  const [lookedUpCustomers, setLookedUpCustomers] = useState<FinanceSnapshot["parties"]>([]);
  const [paymentOptions, setPaymentOptions] = useState<Pick<FinanceSnapshot, "accounts" | "warehouses" | "settings"> | null>(null);
  const data = { ...snapshotData, ...(paymentOptions ?? {}), parties: [...new Map([...snapshotData.parties, ...lookedUpCustomers].map(party => [party.id, party])).values()] };
  const paymentRequest = useRef<Promise<void> | null>(null);
  const loadPaymentOptions = () => {
    if (!onDemand || paymentOptions) return Promise.resolve();
    if (paymentRequest.current) return paymentRequest.current;
    const request = getAldeemInvoicePaymentOptions().then(result => {
      if (!result.ok) throw new Error(result.message);
      setPaymentOptions(result.data);
      setInvoice(current => ({ ...current, warehouseId: current.warehouseId || result.data.warehouses[0]?.id || "", taxInclusive: result.data.settings.tax_inclusive }));
    }).finally(() => { paymentRequest.current = null; });
    paymentRequest.current = request;
    return request;
  };
  const searchProducts = useCallback(async (query: string) => {
    const result = await searchAldeemInvoiceProducts(query);
    if (!result.ok) throw new Error(result.message);
    setLookedUpProducts(previous => [...new Map([...previous, ...result.data].map(product => [product.id, product])).values()]);
    return result.data.map(product => product.id);
  }, []);
  const contextLoader = useMemo(() => createInvoiceContextLoader(data.cafe.slug, onDemand), [data.cafe.slug, onDemand]);
  const [invoice, setInvoice] = useState<Invoice>({ lines: [{ key: 1, productId: "", quantity: 1 }], warehouseId: data.warehouses.find(item => item.active)?.id ?? "", partyId: data.parties.find(party => party.id === initialCustomerId && party.kind === "customer" && party.active)?.id ?? "", paymentKind: "cash", accountId: "", discountKind: "amount", discountValue: 0, discountEnabled: false, vatRate: data.settings.vat_rate, taxInclusive: data.settings.tax_inclusive, note: "" });
  const customerCredit = useAldeemCustomerCredit(onDemand, invoice.partyId);
  const CustomerForm = onDemand ? AldeemCustomerForm : FinanceCustomerForm;
  const inventoryCatalog = useInventorySalesCatalog(data.cafe.slug, contextLoader.inventoryCatalog);
  const invoiceProducts: InvoiceCatalogProduct[] = [...data.products, ...inventoryCatalog.products, ...lookedUpProducts];
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const settingsKey = JSON.stringify([data.cafe.slug, settingsAttempt]);
  const [settingsResult, setSettingsResult] = useState<{ key: string; settings?: InvoiceSettings; nextNumber?: number | null; error?: string } | null>(null);
  const currentSettings = settingsResult?.key === settingsKey ? settingsResult : null;
  const settingsReady = !!aldeemPolicy || !!currentSettings?.settings;
  const settings = aldeemPolicy ? aldeemInvoiceSettings(aldeemPolicy) : currentSettings?.settings ?? defaultInvoiceSettings;
  const defaultsApplied = useRef(false);
  const pricingContext = useInvoicePricingContext(data.cafe.slug, invoice.partyId, invoice.lines.map(line => line.productId), settingsReady && (!onDemand || !!invoice.partyId || invoice.lines.some(line => !!line.productId || !!line.name)));
  const [localError, setLocalError] = useState("");
  const [preparing, setPreparing] = useState(false);

  const [customerOpen, setCustomerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTimestamp, setPreviewTimestamp] = useState("");
  const [template, setTemplate] = useState<"standard" | "thermal">("standard");
  const [deliveryMethod, setDeliveryMethod] = useState<InvoiceDraftPayload["deliveryMethod"]>("print");
  const { issuer, restoreIssuer, loading: issuerLoading, error: issuerError, retry: retryIssuer } = useCompanyInvoiceIssuer(data.cafe.slug, data.cafe.name, contextLoader.issuer);
  const [supplyDate, setSupplyDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()));
  const [issued, setIssued] = useState<{ id: string; number: number; displayNumber?: string; deliveryMethod: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const previewMenu = useRef<HTMLDetailsElement>(null);
  const pdfRequest = useRef(0);
  useEffect(() => () => { pdfRequest.current++; }, []);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && previewMenu.current && !previewMenu.current.contains(event.target)) previewMenu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [details, setDetails] = useState<"discount" | "deposit" | "shipping" | "delivery" | "attachments">("discount");
  const [deposit, setDeposit] = useState<InvoiceDeposit>({ kind: "amount", value: 0, paid: false });
  const [shipping, setShipping] = useState<ShippingMode>("auto");
  const [delivery, setDelivery] = useState<InvoiceDelivery>({ confirmed: false, date: "" });
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [extraFields, setExtraFields] = useState<{ key: number; title: string; value: string }[]>([]);
  const extraKey = useRef(0);
  const draftIdentity = useRef({ id: "", revision: 0 });
  const [draftRenderId, setDraftRenderId] = useState(initialDraftId ?? "");
  const draftLock = useRef(false);
  const [draftBusy, setDraftBusy] = useState(!!initialDraftId);
  const [draftNotice, setDraftNotice] = useState("");
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState<InvoiceDraftSummary[]>([]);
  const [draftChoice, setDraftChoice] = useState("");
  const [initialDraftLoaded, setInitialDraftLoaded] = useState(!initialDraftId);
  const orderSource = useInvoiceOrderSource(data.cafe.slug, initialDraftId, contextLoader.orderSource);
  const loadOrderSource = orderSource.loadDraft;
  const lineNotes = useInvoiceLineNotes(data.cafe.slug, initialDraftId, contextLoader.lineNotes);
  const loadLineNotes = lineNotes.loadDraft;
  const shippingCharge = useInvoiceShippingCharge(data.cafe.slug, initialDraftId, contextLoader.shippingCharge);
  const loadShippingCharge = shippingCharge.loadDraft;
  const customFields = useInvoiceCustomFields(data.cafe.slug, initialDraftId, contextLoader.customFields);
  const loadCustomFields = customFields.loadDraft;
  const [customFilesBusy, setCustomFilesBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (onDemand) return;
    void contextLoader.settings().then(result => {
      if (!active) return;
      if (!result.ok) { setSettingsResult({ key: settingsKey, error: result.message }); return; }
      if (!initialDraftId && !draftIdentity.current.id && !defaultsApplied.current) {
        const preferences = result.data.settings;
        const currency = preferences.advanced.currencies.find(item => item.code === "SAR") ?? preferences.advanced.currencies[0];
        setInvoice(current => ({ ...current, paymentKind: preferences.defaultPaid ? preferences.advanced.defaultPaymentKind : "credit", accountId: preferences.defaultPaid ? preferences.advanced.defaultAccountId : "", currency: currency.code, exchangeRate: currency.rate, applyCredit: preferences.advanced.autoApplyCredit, vatRate: preferences.advanced.taxMode === "none" ? 0 : preferences.advanced.taxMode === "specific" ? preferences.advanced.specificTaxRate : 15 }));
        setDeliveryMethod(preferences.advanced.billingMethod);
        defaultsApplied.current = true;
      }
      setSettingsResult({ key: settingsKey, settings: result.data.settings, nextNumber: result.data.nextNumber });
    }).catch(() => { if (active) setSettingsResult({ key: settingsKey, error: "تعذر تحميل إعدادات الفواتير أعد المحاولة" }); });
    return () => { active = false; };
  }, [contextLoader, initialDraftId, settingsKey, onDemand]);

  useEffect(() => {
    if (!aldeemPolicy || initialDraftId || draftIdentity.current.id) return;
    const preferences = aldeemInvoiceSettings(aldeemPolicy);
    setInvoice(current => ({ ...current, vatRate: aldeemPolicy.taxEnabled ? aldeemPolicy.taxRate : 0,
      discountEnabled: aldeemPolicy.discounts && current.discountEnabled,
      paymentKind: (current.paymentKind === "credit" ? aldeemPolicy.credit : current.paymentKind === "cash" ? aldeemPolicy.cash : current.paymentKind === "pos" ? aldeemPolicy.network || aldeemPolicy.visa : aldeemPolicy.transfer) ? current.paymentKind : preferences.advanced.defaultPaymentKind,
    }));
    setDeliveryMethod(current => current === "whatsapp" && aldeemPolicy.whatsapp ? current : aldeemPolicy.print ? "print" : "whatsapp");
  }, [aldeemPolicy, initialDraftId]);

  const deliverIssued = async (id: string) => {
    const result = await sendCompanyInvoiceWhatsAppAction(id, data.cafe.slug);
    if (!result.ok) { setLocalError(result.message); return; }
    setDraftNotice(result.data.status === "queued" ? "الفاتورة صادرة وقبل مزود الواتساب طلب إرسالها" : result.data.status === "rejected" ? "الفاتورة صادرة ولم يقبل مزود الواتساب إرسالها" : "الفاتورة صادرة وحالة إرسال الواتساب غير مؤكدة لن نكررها تلقائيًا");
  };
  const emailIssued = async (id: string) => {
    const result = await sendCompanyInvoiceEmailAction(id, data.cafe.slug);
    if (!result.ok) { setLocalError(result.message); return; }
    setDraftNotice(result.data.status === "sent" || result.data.status === "queued" ? "الفاتورة صادرة وقبل مزود البريد طلب إرسالها" : result.data.status === "failed" || result.data.status === "rejected" ? "الفاتورة صادرة ولم يقبل مزود البريد إرسالها" : "الفاتورة صادرة وحالة البريد غير مؤكدة لن نكرره تلقائيًا");
  };
  const saveDraft = async (issue = false) => {
    if (draftLock.current || disabled) return;
    if (onDemand && !aldeemPolicy) { setLocalError(accountPolicy.error || "انتظر تحميل إعدادات حساب الديم قبل الحفظ"); return; }
    if (aldeemPolicy && issue) {
      if (!aldeemPolicy.credit && totals.total - paid > 0.005) { setLocalError("البيع الآجل مغلق في إعدادات إدارة الأقسام أكمل سداد الفاتورة"); return; }
      if (!aldeemPolicy.discounts && (invoice.discountEnabled && invoice.discountValue > 0 || invoice.lines.some(line => (line.discount ?? 0) > 0))) { setLocalError("الخصومات مغلقة في إعدادات إدارة الأقسام أزل الخصم قبل الإصدار"); return; }
    }
    if (onDemand && (resourcesPending || (!preparing && issue && !issuerReady))) {
      contextLoader.activate();
      setPreparing(true);
      setDraftNotice("نراجع الإعدادات المطلوبة للحفظ راجع الخيارات ثم أكد إصدار الفاتورة");
      try { await loadPaymentOptions(); } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "تعذر تحميل خيارات التحصيل"); }
      return;
    }
    if (issue && creditBlocked) { setLocalError(customerCredit.error || (customerCredit.loading ? "انتظر التحقق من مديونية العميل قبل البيع الآجل" : "المبلغ الآجل يتجاوز المتاح للعميل أكمل الجزء المطلوب نقدًا قبل الإصدار")); return; }
    if (issue && !issueReady) { setLocalError("راجع بيانات المنشأة والأسعار وطريقة التحصيل قبل الإصدار"); return; }
    const customError = contextLoader.isActive("customFields") ? customFields.validate(issue) : null;
    if (customError) { setLocalError(customError); return; }
    draftLock.current = true; setDraftBusy(true); setLocalError(""); setDraftNotice("");
    try {
      if (!draftIdentity.current.id) draftIdentity.current.id = crypto.randomUUID();
      const result = await saveInvoiceDraftAction({ ...draftIdentity.current, payload: {
        invoice: { ...invoice, applyCredit: !!invoice.applyCredit, accountId: invoice.paymentKind === "credit" ? "" : accountId, lines: invoice.lines.map(line => ({ ...line, price: line.price ?? pricedProducts.find(product => product.id === line.productId)?.price ?? 0 })) },
        template, extraFields, deliveryMethod, issuer, supplyDate, deposit, shipping, delivery, attachments: files.map(file => file.id),
      } }, data.cafe.slug);
      if (!result.ok) { setLocalError(result.message); return; }
      draftIdentity.current = result.data;
      setDraftRenderId(result.data.id);
      const sourceSaved = contextLoader.isActive("orderSource") ? await orderSource.save(result.data.id, result.data.revision) : { ok: true as const };
      if (!sourceSaved.ok) { setLocalError(sourceSaved.message); return; }
      const notesSaved = contextLoader.isActive("lineNotes") ? await lineNotes.save(result.data.id, result.data.revision, invoice.lines.map(line => line.key)) : { ok: true as const };
      if (!notesSaved.ok) { setLocalError(notesSaved.message); return; }
      const shippingSaved = contextLoader.isActive("shippingCharge") ? await shippingCharge.save(result.data.id, result.data.revision) : { ok: true as const };
      if (!shippingSaved.ok) { setLocalError(shippingSaved.message); return; }
      const customSaved = contextLoader.isActive("customFields") ? await customFields.save(result.data.id, result.data.revision) : { ok: true as const };
      if (!customSaved.ok) { setLocalError(customSaved.message); return; }
      setDraftNotice("تم حفظ المسودة يمكنك فتحها لاحقًا من المسودات المحفوظة");
      if (issue) {
        const posted = await issueCompanyInvoiceAction({ ...result.data, expectedTotal: totals.total }, data.cafe.slug);
        if (!posted.ok) { setLocalError(posted.message); return; }
        setIssued(posted.data); setDraftNotice(`تم إصدار الفاتورة رقم ${posted.data.displayNumber || posted.data.number}`); onIssued?.();
        if (posted.data.deliveryMethod === "whatsapp") await deliverIssued(posted.data.id);
        if (posted.data.deliveryMethod === "email" || posted.data.deliveryMethod === "both") await emailIssued(posted.data.id);
        if (posted.data.deliveryMethod === "both") { setPreviewOpen(true); setPdfUrl(`/api/finance/${encodeURIComponent(data.cafe.slug)}/company-invoices/${posted.data.id}/pdf`); }
      }
    } catch { setLocalError(issue ? "تعذر تأكيد نتيجة الإصدار أو الإرسال افتح المسودة نفسها للتحقق قبل إنشاء فاتورة جديدة" : "تعذر تأكيد حفظ المسودة أعد المحاولة بنفس المسودة"); }
    finally { draftLock.current = false; setDraftBusy(false); }
  };
  const showDrafts = async () => {
    if (draftLock.current) return;
    draftLock.current = true; setDraftBusy(true); setLocalError(""); setDraftChoice("");
    try {
      const result = await listInvoiceDraftsAction(data.cafe.slug);
      if (!result.ok) { setLocalError(result.message); return; }
      setDrafts(result.data); setDraftsOpen(true);
    } catch { setLocalError("تعذر تحميل المسودات أعد المحاولة"); }
    finally { draftLock.current = false; setDraftBusy(false); }
  };
  const restoreDraft = useCallback(async (id: string, loaded?: Awaited<ReturnType<typeof openInvoiceDraftAction>>) => {
    if (!id || draftLock.current) return;
    draftLock.current = true;
    try {
      const result = loaded ?? await openInvoiceDraftAction(id, data.cafe.slug);
      setLocalError("");
      if (!result.ok) { setLocalError(result.message); return; }
      const draft = result.data;
      if (onDemand) {
        contextLoader.restore();
        const ids = [...new Set(draft.payload.invoice.lines.map(line => line.productId).filter(Boolean))];
        const [products, parties] = await Promise.all([
          ids.length ? searchAldeemInvoiceProducts("", ids) : Promise.resolve({ ok: true as const, data: [] }),
          draft.payload.invoice.partyId ? searchAldeemInvoiceCustomers("", [draft.payload.invoice.partyId]) : Promise.resolve({ ok: true as const, data: [] }),
        ]);
        if (!products.ok) throw new Error(products.message);
        if (!parties.ok) throw new Error(parties.message);
        if (ids.some(id => !products.data.some(product => product.id === id))) throw new Error("أحد أصناف المسودة لم يعد متاحًا");
        setLookedUpProducts(previous => [...new Map([...previous, ...products.data].map(product => [product.id, product])).values()]);
        setLookedUpCustomers(previous => [...new Map([...previous, ...parties.data].map(party => [party.id, party])).values()]);
      }
      const posted = await findCompanyInvoiceAction(draft.id, data.cafe.slug);
      if (!posted.ok) { setLocalError(posted.message); return; }
      const library = draft.payload.attachments.length ? await listInvoiceFilesAction(data.cafe.slug) : { ok: true as const, data: [] as InvoiceFile[] };
      if (!library.ok) { setLocalError(library.message); return; }
      const restored = draft.payload.attachments.map(id => library.data.find(file => file.id === id));
      if (restored.some(file => !file)) { setLocalError("تعذر استعادة أحد المستندات المرتبطة بالمسودة"); return; }
      const linked = await Promise.all([loadOrderSource(draft.id), loadLineNotes(draft.id), loadShippingCharge(draft.id), loadCustomFields(draft.id)]);
      if (!linked.every(Boolean)) return;
      setFiles(restored as InvoiceFile[]); setDeposit(draft.payload.deposit); setShipping(draft.payload.shipping); setDelivery(draft.payload.delivery);
      setInvoice(draft.payload.invoice); setTemplate(draft.payload.template); setExtraFields(draft.payload.extraFields);
      setDeliveryMethod(draft.payload.deliveryMethod); setSupplyDate(draft.payload.supplyDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()));
      restoreIssuer(draft.payload.issuer);
      setIssued(posted.data);
      extraKey.current = Math.max(0, ...draft.payload.extraFields.map(field => field.key));
      draftIdentity.current = { id: draft.id, revision: draft.revision };
      setDraftRenderId(draft.id);
      setInitialDraftLoaded(true);
      setDraftsOpen(false); setDraftNotice("تم فتح المسودة لإكمال التعديل");
    } catch { setLocalError("تعذر فتح المسودة أعد المحاولة"); }
    finally { draftLock.current = false; setDraftBusy(false); }
  }, [data.cafe.slug, loadOrderSource, loadLineNotes, loadShippingCharge, loadCustomFields, restoreIssuer, onDemand, contextLoader]);

  useEffect(() => {
    if (!initialDraftId) return;
    let active = true;
    void openInvoiceDraftAction(initialDraftId, data.cafe.slug)
      .then(result => { if (active) return restoreDraft(initialDraftId, result); })
      .catch(() => { if (active) { setLocalError("تعذر فتح الفاتورة المحفوظة أعد المحاولة"); setDraftBusy(false); } });
    return () => { active = false; };
  }, [initialDraftId, data.cafe.slug, restoreDraft]);

  const resourcesPending = !settingsReady || (contextLoader.isActive("orderSource") && !orderSource.ready) || (contextLoader.isActive("lineNotes") && !lineNotes.ready) || (contextLoader.isActive("shippingCharge") && !shippingCharge.ready) || (contextLoader.isActive("customFields") && !customFields.ready) || (onDemand && !paymentOptions);
  const disabled = pending || stale || draftBusy || filesBusy || customFilesBusy || !!issued || !initialDraftLoaded || (!onDemand && resourcesPending) || (invoice.lines.some(line => line.catalogSource === "inventory") && !inventoryCatalog.ready);
  const issuerReady = !!issuer.name.trim() && /^3[0-9]{13}3$/.test(issuer.vatNumber) && issuer.address.trim().length >= 8;
  const currency = invoice.currency ?? "SAR";
  const exchangeRate = invoice.exchangeRate && Number.isFinite(invoice.exchangeRate) && invoice.exchangeRate > 0 ? invoice.exchangeRate : 1;
  const configuredCurrency = settings.advanced.currencies.find(item => item.code === currency);
  const exchangeConflict = !!configuredCurrency && !settings.advanced.showExchangeRate && exchangeRate !== configuredCurrency.rate;
  const priceLists = settings.advanced.priceLists.filter(list => list.active && (!list.partyIds.length || list.partyIds.includes(invoice.partyId)));
  const selectedPriceList = settings.advanced.priceListsEnabled ? priceLists.find(list => list.id === invoice.priceListId) : undefined;
  const pricedProducts = invoiceProducts.map(product => ({ ...product, price: moneyRound((selectedPriceList?.prices.find(item => item.productId === product.id)?.price ?? product.price) / exchangeRate) }));
  const selectableProducts = pricedProducts.map(product => {
    const kind = product.catalogSource === "inventory" ? product.kind ?? "product" : settings.advanced.productPolicies.find(item => item.productId === product.id)?.kind ?? "product";
    const allowed = !settings.advanced.excludedCategories.includes(product.category) && (settings.advanced.activityKind === "both" || (kind === "product" ? settings.advanced.activityKind === "products" : settings.advanced.activityKind === "services"));
    return { ...product, available: product.available && allowed };
  });
  const accounts = data.accounts.filter(account => account.active && !account.is_cashier_drawer && account.kind === invoice.paymentKind);
  const accountId = accounts.some(account => account.id === invoice.accountId) ? invoice.accountId : getPrimaryFinanceAccount(accounts)?.id ?? "";
  const adjustmentType = settings.advanced.adjustments.find(item => item.id === invoice.adjustment?.typeId);
  const adjustment = invoice.adjustment?.amount && adjustmentType ? { amount: invoice.adjustment.amount, kind: adjustmentType.kind, taxable: adjustmentType.taxable } : undefined;
  const effectiveLines = invoice.lines.map(line => invoicePolicyLine(line, settings.advanced));
  const itemTotals = companyAmounts(effectiveLines, pricedProducts, invoice.discountEnabled === false ? 0 : invoice.discountValue, invoice.discountKind, invoice.vatRate ?? data.settings.vat_rate, invoice.taxInclusive ?? data.settings.tax_inclusive, adjustment);
  const shippingTotals = invoiceShippingAmounts(shippingCharge.selection, exchangeRate);
  const totals = { ...itemTotals, tax: moneyRound(itemTotals.tax + shippingTotals.tax), total: moneyRound(itemTotals.total + shippingTotals.total) };
  const depositAmount = invoiceDepositAmount(totals.total, deposit);
  const creditAvailable = pricingContext.data?.creditBalance ?? 0;
  const creditApplied = invoice.applyCredit ? moneyRound(Math.min(totals.total, creditAvailable / exchangeRate)) : 0;
  const cashPaid = deposit.value > 0 ? deposit.paid ? depositAmount : 0 : invoice.paymentKind === "credit" ? 0 : moneyRound(Math.max(0, totals.total - creditApplied));
  const paid = moneyRound(cashPaid + creditApplied);
  const lineTotals = totals.rows;
  const codServiceLineIndices = effectiveLines.flatMap((line, index) => line.productId === shippingCharge.context?.codServiceId && settings.advanced.productPolicies.some(policy => policy.productId === line.productId && policy.kind === "service") ? [index] : []);
  const codGross = moneyRound(codServiceLineIndices.reduce((sum, index) => sum + moneyRound(lineTotals[index].price * invoice.lines[index].quantity), 0));
  const shippingLineLimit = shippingTotals.amount > 0 && invoice.lines.length > 99;
  const sarTotals = { tax: moneyRound(lineTotals.reduce((sum, row) => sum + moneyRound(row.tax * exchangeRate), 0) + shippingTotals.sar.tax), total: moneyRound(lineTotals.reduce((sum, row) => sum + moneyRound(row.net * exchangeRate) + moneyRound(row.tax * exchangeRate), 0) + shippingTotals.sar.total) };
  const allowance = customerCredit.data?.enabled && !customerCredit.data.overdue ? customerCredit.data.available : 0;
  const creditAllocation = customerCreditAllocation(sarTotals.total, moneyRound(creditApplied * exchangeRate), allowance, exchangeRate);
  const hasNewDebt = moneyRound(totals.total - paid) > 0;
  const creditBlocked = onDemand && hasNewDebt && (!invoice.partyId || !customerCredit.data || !!customerCredit.error || cashPaid + 0.000001 < creditAllocation.requiredCash || (creditAllocation.requiredCash > 0 && invoice.paymentKind !== "cash"));
  const issueReady = !creditBlocked && !resourcesPending && issuerReady && !!pricingContext.data && !pricingContext.error && !pricingContext.loading && !!configuredCurrency && !exchangeConflict && !shippingLineLimit && paid <= totals.total && totals.total >= 0 && totals.rows.every(row => row.net >= 0) && (invoice.exchangeRate === undefined || invoice.exchangeRate > 0);
  const savedNote = [invoice.note.trim(), ...extraFields.filter(field => field.title.trim() || field.value.trim()).map(field => `${field.title.trim()}: ${field.value.trim()}`)].filter(Boolean).join("\n");
  const patch = (values: Partial<Invoice>) => { setLocalError(""); setInvoice(current => ({ ...current, ...values })); };
  const customer = data.parties.find(party => party.id === invoice.partyId);
  const shippingAddress = invoiceShippingAddress(customer?.details, shipping);
  const optionsNote = invoiceOptionsNote({ address: shippingAddress }, delivery, files);
  const applySelectedPrices = () => {
    if (disabled) return;
    if (invoice.priceListId && !selectedPriceList) { setLocalError("قائمة الأسعار المحفوظة غير متاحة لهذا العميل اختر قائمة صالحة أو أسعار الكتالوج"); return; }
    patch({ lines: invoice.lines.map(line => {
      const product = selectableProducts.find(item => item.id === line.productId && item.available);
      return product ? { ...line, price: inventoryUnitPrice(product, line.unitName) } : line;
    }) });
  };
  const shareIssued = async () => {
    if (!issued || draftLock.current || !settings.advanced.socialEnabled || !settings.advanced.socialPlatforms.includes("native")) return;
    draftLock.current = true; setDraftBusy(true); setLocalError("");
    try {
      const response = await fetch(`/api/finance/${encodeURIComponent(data.cafe.slug)}/company-invoices/${issued.id}/pdf`);
      if (!response.ok) throw new Error("تعذر تحميل نسخة الفاتورة للمشاركة");
      const blob = await response.blob();
      const file = new File([blob], `invoice-${issued.displayNumber || issued.number}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) await navigator.share({ files: [file], title: `فاتورة ${issued.displayNumber || issued.number}` });
      else { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setDraftNotice("تم تنزيل ملف الفاتورة ويمكن مشاركته من جهازك"); }
    } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setLocalError("تعذرت مشاركة الفاتورة أعد المحاولة"); }
    finally { draftLock.current = false; setDraftBusy(false); }
  };
  const invoiceTypeLabel = customer && (customer.details?.customerType ?? "individual") === "individual" && !customer.tax_number?.trim() ? "فاتورة ضريبية مبسطة" : "فاتورة ضريبية";
  const previewTaxEnabled = onDemand && !!aldeemPolicy?.taxEnabled;
  const previewTaxQr = useMemo(() => previewOpen && previewTaxEnabled && previewTimestamp ? financeReceiptQr({
    kind: "sale", receipt_seller: { name: issuer.name, vatNumber: issuer.vatNumber }, created_at: previewTimestamp, total: sarTotals.total, tax: sarTotals.tax,
  }) : null, [previewOpen, previewTaxEnabled, previewTimestamp, issuer.name, issuer.vatNumber, sarTotals.total, sarTotals.tax]);
  const preparePreviewTax = () => { if (previewTaxEnabled && !issued) contextLoader.activate("issuer"); };
  const closePreview = () => { pdfRequest.current++; setPreviewOpen(false); setPdfLoading(false); setPdfUrl(""); };
  const openPreview = async (pdf = false) => {
    if (!issued && (!settingsReady || !settings.previewBeforeSave || disabled || (!onDemand && !pricingContext.data))) return;
    if (previewMenu.current) previewMenu.current.open = false;
    const request = ++pdfRequest.current;
    const timestamp = new Date().toISOString();
    setPreviewTimestamp(timestamp); preparePreviewTax();
    setLocalError(""); setPdfUrl(""); setPdfLoading(pdf); setPreviewOpen(true);
    if (issued) { setPdfLoading(false); setPdfUrl(`/api/finance/${encodeURIComponent(data.cafe.slug)}/company-invoices/${issued.id}/pdf`); return; }
    if (!pdf) return;
    try {
      const [pdfModule, identity] = await Promise.all([
        import("@/lib/export/company-invoice-preview-pdf"),
        previewTaxEnabled && (issuerLoading || issuerError) ? contextLoader.issuer() : Promise.resolve(null),
      ]);
      if (identity && !identity.ok) throw new Error(identity.message);
      const seller = identity?.ok ? identity.data : issuer;
      const taxReady = previewTaxEnabled && getFinanceReceiptTaxStatus({ kind: "sale", receipt_seller: seller, created_at: timestamp, total: sarTotals.total, tax: sarTotals.tax }) === "ready";
      const { createCompanyInvoicePreviewPdf } = pdfModule;
      const blob = await createCompanyInvoicePreviewPdf({
        brand: data.cafe.name, customer: customer?.name || "لم يُحدد العميل", taxNumber: customer?.tax_number || "",
        thermal: template === "thermal", currency, exchangeRate, decimalDisplay: settings.decimalDisplay, sar: sarTotals, cashPaid, creditApplied, note: [savedNote, optionsNote, previewTaxEnabled && !taxReady ? "أكمل الرقم الضريبي للمنشأة في إعدادات الحساب لإظهار رمز الضريبة" : ""].filter(Boolean).join("\n"), ...totals, paid,
        taxPreview: taxReady ? { sellerName: seller.name, sellerVat: seller.vatNumber, issuedAt: timestamp } : undefined,
        shippingCharge: shippingCharge.selection ? { ...shippingCharge.selection, ...shippingTotals } : undefined,
        codServiceLineIndices,
        lines: invoice.lines.map((line, index) => ({ ...lineTotals[index], name: invoiceProducts.find(product => product.id === line.productId)?.name || line.name || "لم يُحدد الصنف", description: line.description, unitName: line.unitName, notes: lineNotes.values[line.key] ?? [], quantity: line.quantity })),
      });
      if (pdfRequest.current === request) setPdfUrl(URL.createObjectURL(blob));
    } catch {
      if (pdfRequest.current === request) { setPreviewOpen(false); setLocalError("تعذر إنشاء معاينة PDF أعد المحاولة"); }
    } finally { if (pdfRequest.current === request) setPdfLoading(false); }
  };

  if (!data.canManage) return <p role="alert" className={styles.error}>لا تملك صلاحية إضافة فاتورة من الإدارة المالية</p>;
  return <><form inert={customerOpen || previewOpen || draftsOpen} className={`${styles.form} ${styles.invoiceForm} ${editor.editor} ${appearance === "aldeem" ? aldeem.form : reference.form}`} onInvalidCapture={event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
    const collapsed = input.closest("details:not([open])");
    if (collapsed instanceof HTMLDetailsElement) collapsed.open = true;
    const hiddenPanel = input.closest<HTMLElement>("[hidden][data-invoice-details]");
    if (!hiddenPanel) return;
    event.preventDefault();
    setDetails(hiddenPanel.dataset.invoiceDetails as typeof details);
    requestAnimationFrame(() => { if (input.isConnected && input.getClientRects().length) input.reportValidity(); });
  }} onSubmit={event => { event.preventDefault(); if (!disabled && (issueReady || onDemand)) void saveDraft(true); }}>
    <div className={editor.actionBar} data-invoice-toolbar>
      <div className={styles.actions}>{(issued || (settingsReady && settings.previewBeforeSave)) && <div className={editor.previewActions}>
        <button type="button" className={styles.secondary} disabled={pending || draftBusy || (!issued && (disabled || (!onDemand && !pricingContext.data)))} onPointerEnter={preparePreviewTax} onFocus={preparePreviewTax} onClick={() => void openPreview()}><Eye size={16} aria-hidden="true" />{issued ? "عرض الفاتورة الصادرة" : "معاينة"}</button>
        <details ref={previewMenu} className={editor.previewMenu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="خيارات المعاينة" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className={editor.previewOptions}><button type="button" disabled={disabled} onClick={() => void openPreview()}>معاينة على المتصفح</button><button type="button" disabled={disabled} onClick={() => void openPreview(true)}>عرض PDF</button></div>
        </details>
      </div>}<button type="button" className={styles.secondary} disabled={disabled} onClick={() => void saveDraft()}><Save size={16} aria-hidden="true" />{draftBusy ? "جار تنفيذ الطلب" : "حفظ كمسودة"}</button><button type="button" className={styles.secondary} disabled={disabled} onClick={() => void showDrafts()}>المسودات المحفوظة</button></div>
      <div className={styles.actions}><button type="submit" className={styles.primary} onClick={event => { if (onDemand && (resourcesPending || !issuerReady)) { event.preventDefault(); void saveDraft(true); } }} disabled={disabled || (!onDemand && !issueReady)}><Save size={16} aria-hidden="true" />{draftBusy ? "جار تنفيذ الطلب" : issued ? `فاتورة رقم ${issued.displayNumber || issued.number}` : deliveryMethod === "whatsapp" ? "إصدار وإرسال بالواتساب" : deliveryMethod === "email" || deliveryMethod === "both" ? "إصدار وإرسال بالبريد" : "إصدار الفاتورة"}</button><button type="button" className={styles.secondary} disabled={pending || draftBusy || filesBusy} onClick={onCancel}>{issued ? "العودة للفواتير" : "إلغاء"}</button></div>
    </div>
    {(localError || error) && <p className={styles.error} role="alert">{localError || error}</p>}
    {(!onDemand || preparing || accountPolicy.error || currentSettings?.error || orderSource.error || lineNotes.error || shippingCharge.error || customFields.error) && <InvoiceLoadStatus appearance={appearance} resources={[
      ...(onDemand ? [{ key: "issuer", label: "بيانات المنشأة", loading: issuerLoading, error: issuerError, retry: retryIssuer }] : []),
      { key: "order-source", label: "مصادر الطلب", loading: orderSource.loading, error: orderSource.error, retry: () => { void orderSource.retry(); } },
      { key: "line-notes", label: "ملاحظات البنود", loading: lineNotes.loading, error: lineNotes.error, retry: () => { void lineNotes.retry(); } },
      { key: "shipping", label: "خيارات الشحن", loading: shippingCharge.loading, error: shippingCharge.error, retry: () => { void shippingCharge.retry(); } },
      { key: "custom-fields", label: "حقول الفاتورة", loading: customFields.loading, error: customFields.error, retryDisabled: customFilesBusy || draftBusy, retry: () => { if (window.confirm("إعادة التحميل تستبدل تعديلات الحقول غير المحفوظة هل تريد المتابعة؟")) void customFields.retry(); } },
      { key: "inventory", label: "أصناف المخزون", loading: !inventoryCatalog.ready && !inventoryCatalog.error, error: inventoryCatalog.error, retry: inventoryCatalog.retry },
      { key: "settings", label: "إعدادات الفواتير", loading: !settingsReady && !(accountPolicy.error || currentSettings?.error), error: onDemand ? accountPolicy.error : currentSettings?.error, retry: onDemand ? accountPolicy.retry : () => setSettingsAttempt(value => value + 1) },
      { key: "pricing", label: "الأسعار ورصيد العميل", loading: settingsReady && !issued && pricingContext.loading, error: settingsReady && !issued ? pricingContext.error : undefined, retry: pricingContext.retry },
    ].filter(resource => !onDemand || !({ "order-source": !contextLoader.isActive("orderSource"), "line-notes": !contextLoader.isActive("lineNotes"), shipping: !contextLoader.isActive("shippingCharge"), "custom-fields": !contextLoader.isActive("customFields") } as Record<string, boolean>)[resource.key]).map(resource => onDemand && !preparing ? { ...resource, loading: false } : resource)} />}
    {paid > totals.total && <p className={styles.error} role="alert">الدفعة المحصلة تتجاوز المتبقي بعد استخدام رصيد العميل عدّل الدفعة أو ألغ استخدام الرصيد</p>}
    {shippingLineLimit && <p className={styles.error} role="alert">الفاتورة التي تحتوي رسوم شحن تقبل حتى ٩٩ بندًا احذف بندًا أو أزل رسوم الشحن قبل الإصدار</p>}
    {!initialDraftLoaded && <button type="button" className={styles.secondary} disabled={draftBusy} onClick={() => { setDraftBusy(true); void restoreDraft(initialDraftId!); }}>{draftBusy ? "جار فتح الفاتورة المحفوظة" : "إعادة فتح الفاتورة المحفوظة"}</button>}
    {draftNotice && <p className={styles.notice} role="status">{draftNotice}</p>}
    {issued && <button type="button" className={styles.secondary} disabled={draftBusy} onClick={async () => { if (draftLock.current) return; draftLock.current = true; setDraftBusy(true); setLocalError(""); try { await deliverIssued(issued.id); } catch { setLocalError("تعذر تأكيد الإرسال الفاتورة محفوظة"); } finally { draftLock.current = false; setDraftBusy(false); } }}>إرسال الفاتورة بالواتساب</button>}
    {issued && (deliveryMethod === "email" || deliveryMethod === "both" || (settings.advanced.socialEnabled && settings.advanced.socialPlatforms.includes("email"))) && <button type="button" className={styles.secondary} disabled={draftBusy} onClick={async () => { if (draftLock.current) return; draftLock.current = true; setDraftBusy(true); setLocalError(""); try { await emailIssued(issued.id); } catch { setLocalError("تعذر تأكيد إرسال البريد الفاتورة محفوظة"); } finally { draftLock.current = false; setDraftBusy(false); } }}>إرسال الفاتورة بالبريد</button>}
    {issued && settings.advanced.socialEnabled && settings.advanced.socialPlatforms.includes("native") && <button type="button" className={styles.secondary} disabled={draftBusy} onClick={() => void shareIssued()}>مشاركة ملف الفاتورة</button>}
    {stale && <p className={styles.notice}>حدّث الأرصدة قبل حفظ فاتورة جديدة</p>}
    <fieldset disabled={disabled} className={styles.invoiceLayout}>
      <div className={styles.invoiceMain}>
      <section className={`${styles.invoiceSection} ${editor.template}`} aria-label="قالب الفاتورة"><Field label="قالب الفاتورة"><select value={template} onChange={event => setTemplate(event.target.value as "standard" | "thermal")}><option value="standard">التصميم الافتراضي للفاتورة</option><option value="time" disabled>التصميم الافتراضي للوقت — غير مفعّل</option><option value="thermal">فاتورة حرارية</option></select></Field></section>
      <div className={`${editor.metadata} ${reference.metadata}`} data-invoice-metadata>
      <section className={styles.invoiceSection} aria-label="العميل والمستودع">
      {appearance === "aldeem" && <h3 className={aldeem.heading}><span>01</span>العميل وطريقة الإصدار</h3>}
      <div className={editor.customerFields}>
        <div className={reference.customerRow}><Field label="الطريقة" hint={deliveryMethod === "print" ? undefined : deliveryMethod === "whatsapp" ? "يُرسل الملف إلى جوال العميل بعد الإصدار" : "يُرسل الملف إلى بريد العميل بعد الإصدار"}><select value={deliveryMethod} onChange={event => setDeliveryMethod(event.target.value as InvoiceDraftPayload["deliveryMethod"])}><option disabled={!!aldeemPolicy && !aldeemPolicy.print} value="print">طباعة</option><option disabled={!!aldeemPolicy} value="email">إرسال بالبريد الإلكتروني</option><option disabled={!!aldeemPolicy} value="both">طباعة وإرسال بالبريد</option><option disabled={!!aldeemPolicy && !aldeemPolicy.whatsapp} value="whatsapp">أرسل عبر الواتساب</option></select></Field><InvoiceHelp text="اختر الطباعة أو إرسال الفاتورة بعد إصدارها لا يؤكد قبول طلب الإرسال وصول الملف إلى العميل" /></div>
        <div className={`${reference.customerRow} ${onDemand ? aldeem.customerRow : ""}`}>{onDemand ? <InvoiceCustomerSearch customer={customer} disabled={disabled} onSelect={party => { setLookedUpCustomers(previous => [...previous.filter(row => row.id !== party.id), party]); patch({ partyId: party.id }); }} /> : <Field label="العميل"><select value={invoice.partyId} required onChange={event => patch({ partyId: event.target.value })}><option value="">اختر الفرد أو الشركة</option>{data.parties.filter(party => party.active && party.kind === "customer").map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}<button type="button" className={styles.secondary} onClick={() => setCustomerOpen(true)}><Plus size={16} aria-hidden="true" />جديد</button></div>
        <div className={reference.customerRow}><Field label="العملة"><select value={currency} onChange={event => { const selected = settings.advanced.currencies.find(item => item.code === event.target.value); if (selected) patch({ currency: selected.code, exchangeRate: selected.rate }); }}>
            {settings.advanced.currencies.map(item => <option key={item.code} value={item.code}>{item.code}</option>)}
            {!settings.advanced.currencies.some(item => item.code === currency) && <option value={currency}>{currency} — عملة محفوظة غير متاحة</option>}
          </select></Field></div>
        <details className={reference.customerExtra}><summary>المستودع وبيانات التوريد</summary><div>
        {customer && <p className={styles.muted}>نوع الفاتورة: {invoiceTypeLabel}</p>}
        <Field label="مستودع البيع"><select onFocus={() => { if (onDemand) void loadPaymentOptions().catch(cause => setLocalError(cause.message)); }} value={invoice.warehouseId} required onChange={event => patch({ warehouseId: event.target.value })}><option value="">اختر المستودع</option>{data.warehouses.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="تاريخ التوريد"><input type="date" required value={supplyDate} onChange={event => setSupplyDate(event.target.value)} /></Field>
        <Field label="أنشئت بواسطة"><input readOnly value={data.staff.find(person => person.user_id === data.userId)?.name || "المستخدم الحالي"} /></Field>
        </div></details>
      </div>
      </section>
      <section className={styles.invoiceSection} aria-label="بيانات الفاتورة">
        {appearance === "aldeem" && <h3 className={aldeem.heading}><span>02</span>بيانات الفاتورة</h3>}
        <div className={editor.documentFields}>
          <Field label="رقم الفاتورة"><input title="يُحجز الرقم عند الإصدار ولا يمكن تغييره بعده" readOnly={!settings.advanced.numbering.manual || !!issued} value={issued ? issued.displayNumber || String(issued.number) : invoice.manualNumber ?? ""} maxLength={40} placeholder={`${settings.advanced.numbering.prefix}${String(currentSettings?.nextNumber ?? settings.advanced.numbering.next).padStart(settings.advanced.numbering.padding, "0")}`} onChange={event => { if (settings.advanced.numbering.manual) patch({ manualNumber: event.target.value }); }} /></Field>
          {!settings.advanced.numbering.manual && !!invoice.manualNumber && <button type="button" className={styles.secondary} onClick={() => patch({ manualNumber: "" })}>استخدام الترقيم التلقائي</button>}
          <Field label="تاريخ الفاتورة"><input readOnly value="وقت الحفظ بتوقيت الرياض" /></Field>
          {(!onDemand || !!initialDraftId) && <Field label="مسؤول مبيعات"><select title="تعيين مسؤول مستقل أو متعدد غير مفعّل" disabled defaultValue=""><option value="">غير مفعّل</option><option>متعدد</option></select></Field>}
          {(!onDemand || !!initialDraftId) && <Field label="مصدر الطلب" hint={orderSource.context?.settings.required ? "مطلوب عند إصدار الفاتورة" : undefined}><select onFocus={() => contextLoader.activate("orderSource")} value={orderSource.selected ?? ""} required={orderSource.context?.settings.required} onChange={event => orderSource.choose(event.target.value)}><option value="">لا شيء</option>{orderSource.context?.settings.sources.filter(source => source.active || source.id === orderSource.selected).map(source => <option key={source.id} value={source.id} disabled={!source.active}>{source.name}{source.active ? "" : " — غير نشط"}</option>)}{orderSource.selected && !orderSource.context?.settings.sources.some(source => source.id === orderSource.selected) && <option value={orderSource.selected} disabled>مصدر محفوظ غير متاح</option>}</select></Field>}
          <Field label="تاريخ الإصدار"><input readOnly value="يُحدد عند الحفظ" /></Field>
          {(!onDemand || !!initialDraftId) && <Field label="شروط الدفع"><input disabled placeholder="غير مفعّل حاليًا" /></Field>}

          {(settings.advanced.showExchangeRate || currency !== "SAR") && <Field label="سعر الصرف" hint={`ريال سعودي لكل وحدة ${currency}`}><input type="number" min="0.000001" max="1000000" step="0.000001" required readOnly={currency === "SAR" || !settings.advanced.showExchangeRate} value={invoice.exchangeRate ?? 1} onChange={event => { if (currency !== "SAR" && settings.advanced.showExchangeRate) patch({ exchangeRate: Number(event.target.value) }); }} /></Field>}
          {exchangeConflict && <div><p className={styles.notice}>سعر الصرف المحفوظ يختلف عن السعر المسموح حاليًا استخدم السعر الحالي قبل الإصدار</p><button type="button" className={styles.secondary} onClick={() => { if (configuredCurrency) patch({ exchangeRate: configuredCurrency.rate }); }}>استخدام سعر الصرف الحالي</button></div>}
          {(settings.advanced.customStatusesEnabled || invoice.statusId) && <Field label="حالة الفاتورة المخصصة"><select value={invoice.statusId ?? ""} onChange={event => patch({ statusId: event.target.value })}><option value="">بدون حالة مخصصة</option>{settings.advanced.customStatusesEnabled && settings.advanced.statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}{invoice.statusId && (!settings.advanced.customStatusesEnabled || !settings.advanced.statuses.some(status => status.id === invoice.statusId)) && <option value={invoice.statusId}>حالة محفوظة غير متاحة</option>}</select></Field>}
        </div>
        {extraFields.map((field, index) => <div className={editor.extraField} key={field.key}>
          <Field label={`عنوان إضافي ${index + 1}`}><input maxLength={60} placeholder="عنوان إضافي" value={field.title} onChange={event => setExtraFields(current => current.map(item => item.key === field.key ? { ...item, title: event.target.value } : item))} /></Field>
          <Field label={`بيانات إضافية ${index + 1}`}><input maxLength={200} placeholder="بيانات إضافية" value={field.value} onChange={event => setExtraFields(current => current.map(item => item.key === field.key ? { ...item, value: event.target.value } : item))} /></Field>
          <button type="button" className={styles.iconButton} aria-label={`حذف البيانات الإضافية ${index + 1}`} onClick={() => setExtraFields(current => current.filter(item => item.key !== field.key))}><Trash2 size={16} aria-hidden="true" /></button>
        </div>)}
        <button type="button" className={styles.secondary} disabled={extraFields.length >= 5} onClick={() => { const key = ++extraKey.current; setExtraFields(current => [...current, { key, title: "", value: "" }]); }}><Plus size={16} aria-hidden="true" />إضافة بيانات إضافية</button>
        {extraFields.length > 0 && <p className={styles.muted}>تُحفظ البيانات الإضافية ضمن ملاحظات الفاتورة</p>}
      </section>
      </div>
      <section className={`${styles.invoiceSection} ${styles.invoiceItems}`} aria-label="أصناف الفاتورة">
      <div className={styles.invoiceSectionHeader}><h3 className={styles.invoiceHeading}>أصناف الفاتورة <span className={styles.badge}>{invoice.lines.length}</span></h3><span className={styles.muted}>المبالغ بعملة {currency}</span></div>
      {(settings.advanced.priceListsEnabled || invoice.priceListId) && <div className={styles.fields}><CustomerPriceListSuggestion className={styles.secondary} slug={data.cafe.slug} customerId={invoice.partyId} lists={priceLists} selected={invoice.priceListId} disabled={disabled} onChoose={id=>patch({priceListId:id})}/><Field label="قائمة الأسعار" hint="تطبيق القائمة يستبدل أسعار البنود المسجلة فقط بعد اختيارك"><select value={invoice.priceListId ?? ""} onChange={event => patch({ priceListId: event.target.value })}><option value="">أسعار الكتالوج</option>{settings.advanced.priceListsEnabled && priceLists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}{invoice.priceListId && !selectedPriceList && <option value={invoice.priceListId}>قائمة محفوظة غير متاحة لهذا العميل</option>}</select></Field><button type="button" className={styles.secondary} onClick={applySelectedPrices}>تطبيق أسعار القائمة على البنود</button></div>}
      {currency !== "SAR" && <p className={styles.muted}>الأسعار المكتوبة بعملة الفاتورة تغيير العملة لا يحوّل البنود المحفوظة تلقائيًا أعد اختيار الصنف أو طبّق قائمة الأسعار لتحديث سعره</p>}
      {!settings.allowLineEditing && <p className={styles.muted}>تمنع إعدادات الفواتير تعديل سعر المنتج ووصفه يمكنك تعديل الكمية وإعادة اختيار المنتج نفسه لاستعادة سعره المسجل ومسح الوصف المخصص</p>}
      {settings.discountMode === "invoice" && <p className={styles.muted}>الخصم متاح على الفاتورة فقط أزل أي خصم محفوظ على البنود قبل الإصدار</p>}
      {!settings.allowBelowCost && <p className={styles.muted}>يتحقق الإصدار من التكلفة الفعلية ويمنع البيع دونها بعد الخصم أو عند عدم توفر تكلفة مؤكدة</p>}
      <CompanyInvoiceLines onSearchProducts={onDemand ? searchProducts : undefined} lines={invoice.lines} products={selectableProducts} vatRate={invoice.vatRate ?? 0} disabled={disabled} amounts={lineTotals} onChange={lines => patch({ lines })} lineNotes={{ enabled: !!lineNotes.context?.enabled, options: lineNotes.context?.notes ?? [], values: lineNotes.values, onChange: lineNotes.change, onSaveCustom: canFinance(data.role, "settings_manage") ? lineNotes.saveCustom : undefined }} allowLineEditing={settings.allowLineEditing} allowLineDiscount={(!aldeemPolicy || aldeemPolicy.discounts) && settings.discountMode !== "invoice"} decimalDisplay={settings.decimalDisplay} currency={currency} allowFreeItems={settings.allowLineEditing} advanced={settings.advanced} productHint={settingsReady && settings.priceHints === "last" ? (productId, line) => <InvoiceLinePricing unitRatio={line.catalogSource === "inventory" ? (line.unitFactor ?? 1) / (invoiceProducts.find(product => product.id === productId)?.unitFactor ?? 1) : 1} productId={productId} context={pricingContext} settings={settings} currency={currency} exchangeRate={exchangeRate} /> : undefined} summary={<section className={editor.totals} aria-label="ملخص الفاتورة">
        <div className={styles.balanceLine}><span>المجموع الفرعي</span><span className={styles.numeric}>{invoiceSettingsMoney(totals.subtotal, settings.decimalDisplay, currency)}</span></div>{totals.discount > 0 && <div className={styles.balanceLine}><span>الخصم</span><span className={styles.numeric}>{invoiceSettingsMoney(totals.discount, settings.decimalDisplay, currency)}</span></div>}{totals.tax > 0 && <div className={styles.balanceLine}><span>الضريبة</span><span className={styles.numeric}>{invoiceSettingsMoney(totals.tax, settings.decimalDisplay, currency)}</span></div>}{shippingCharge.selection && <div className={styles.balanceLine}><span>الشحن</span><span className={styles.numeric}>{invoiceSettingsMoney(shippingTotals.amount, settings.decimalDisplay, currency)}</span></div>}<div className={styles.balanceLine}><strong>الإجمالي</strong><strong><span className={styles.numeric}>{invoiceSettingsMoney(totals.total, settings.decimalDisplay, currency)}</span></strong></div>
        {adjustment && <div className={styles.balanceLine}><span>{adjustmentType?.name || "التسوية"}</span><span className={styles.numeric}>{invoiceSettingsMoney(totals.adjustment.total, settings.decimalDisplay, currency)}</span></div>}
        {deposit.value > 0 && <div className={styles.balanceLine}><span>الدفعة المقدمة المطلوبة</span><span className={styles.numeric}>{invoiceSettingsMoney(depositAmount, settings.decimalDisplay, currency)}</span></div>}
        {creditApplied > 0 && <div className={styles.balanceLine}><span>من رصيد العميل</span><span className={styles.numeric}>{invoiceSettingsMoney(creditApplied, settings.decimalDisplay, currency)}</span></div>}
        <div className={styles.balanceLine}><span>{onDemand ? "المبلغ المدفوع الآن" : "التحصيل الجديد"}</span><span className={styles.numeric}>{invoiceSettingsMoney(cashPaid, settings.decimalDisplay, currency)}</span></div><div className={styles.balanceLine}><strong>{onDemand ? "المتبقي على العميل" : "المبلغ المستحق"}</strong><strong><span className={styles.numeric}>{invoiceSettingsMoney(totals.total - paid, settings.decimalDisplay, currency)}</span></strong></div>
        {onDemand && <p className={styles.muted}>{totals.total === 0 ? "أضف الأصناف لاحتساب الإجمالي والمبلغ المتبقي" : invoice.paymentKind === "credit" ? "الفاتورة آجلة ويُسجل المتبقي على حساب العميل" : "خيار مدفوع بالفعل مفعّل ويُحتسب المبلغ ضمن التحصيل عند الإصدار"}</p>}
        {currency !== "SAR" && settings.advanced.showExchangeRate && <div className={styles.balanceLine}><span>ما يعادل بالريال</span><span className={styles.numeric}>{invoiceSettingsMoney(sarTotals.total, settings.decimalDisplay)}</span></div>}
      </section>} />
      </section>
      </div>

      {onDemand && invoice.partyId && <aside className={aldeem.credit} aria-label="إتاحة البيع الآجل">
        <h3>حساب العميل والبيع الآجل</h3>
        {customerCredit.loading && <p role="status">جار التحقق من رصيد العميل</p>}
        {customerCredit.error && <p role="alert">{customerCredit.error} <button type="button" onClick={customerCredit.retry}>إعادة المحاولة</button></p>}
        {customerCredit.data && <>
          <div className={aldeem.creditStats}><span>المديونية الحالية<strong>{invoiceSettingsMoney(customerCredit.data.balance)}</strong></span><span>الحد الائتماني<strong>{invoiceSettingsMoney(customerCredit.data.limit)}</strong></span><span>المتاح للشراء الآجل<strong>{invoiceSettingsMoney(allowance)}</strong></span></div>
          <p>{!customerCredit.data.enabled ? "البيع الآجل غير مفعّل لهذا العميل يلزم سداد الفاتورة كاملة" : customerCredit.data.overdue ? "توجد فاتورة تجاوزت مدة السداد يُوقف البيع الآجل حتى سداد المتأخرات" : `مدة السداد ${customerCredit.data.days} يوم ويُراجع الرصيد عند إصدار الفاتورة`}</p>
          {creditBlocked && <p role="alert">يلزم تحصيل {invoiceSettingsMoney(creditAllocation.requiredCash, settings.decimalDisplay, currency)} نقدًا على الأقل لهذه الفاتورة</p>}
          {creditBlocked && settings.allowDeposits && creditAllocation.requiredCash > 0 && <button type="button" disabled={disabled} onClick={() => {
            setDeposit({ kind: "amount", value: creditAllocation.requiredCash, paid: true }); patch({ paymentKind: "cash", accountId: "" });
            void loadPaymentOptions().catch(cause => setLocalError(cause.message));
          }}>تأكيد تحصيل {invoiceSettingsMoney(creditAllocation.requiredCash, settings.decimalDisplay, currency)} نقدًا والباقي آجل</button>}
          {creditBlocked && !settings.allowDeposits && <p>السداد الجزئي غير مفعّل في إعدادات الفواتير يلزم تفعيله أو سداد الفاتورة كاملة</p>}
        </>}
      </aside>}
      <section className={`${styles.invoiceSection} ${editor.details}`} aria-label="خيارات الفاتورة">
      <div className={editor.detailOptions} aria-label="أقسام خيارات الفاتورة">
        <button type="button" aria-pressed={details === "discount"} onClick={() => setDetails("discount")}>الخصم والتسوية</button>
        {([{ id: "deposit", label: "إيداع" }, { id: "shipping", label: "بيانات الشحن" }, { id: "delivery", label: "التسليم" }, { id: "attachments", label: "إرفاق المستندات" }] as const).filter(item => item.id !== "deposit" || settings.allowDeposits || deposit.value > 0).map(item => <button type="button" key={item.id} aria-pressed={details === item.id} onClick={() => { setDetails(item.id); if (item.id === "shipping" && (!onDemand || initialDraftId)) contextLoader.activate("shippingCharge"); }}>{item.label}</button>)}
      </div>
      <div className={editor.detailBody}>
      <div hidden={details !== "discount"} data-invoice-details="discount">
      <div className={styles.invoicePaymentFields}>
      <div className={styles.invoiceTaxFields}>
        <Field label="ضريبة الفاتورة"><input readOnly value={settings.advanced.taxMode === "product" ? "حسب ضريبة كل صنف" : settings.advanced.taxMode === "none" ? "خارج نطاق الضريبة" : `${settings.advanced.specificTaxRate}%`} /></Field>
        <Field label="مبلغ الضريبة"><output className={styles.invoiceTaxAmount}><span className={styles.numeric}>{invoiceSettingsMoney(totals.tax, settings.decimalDisplay, currency)}</span></output></Field>
      </div>
      <label className={styles.check}><input type="checkbox" checked={invoice.taxInclusive} onChange={event => patch({ taxInclusive: event.target.checked })} />السعر شامل الضريبة</label>
      {settings.advanced.discountCapsEnabled && pricingContext.data && <p className={styles.notice}>الحد الأقصى للخصم المسموح لحسابك {pricingContext.data.maxDiscountPercent}% ويشمل خصومات البنود والفاتورة والتسويات المخفضة</p>}
      {settings.discountMode === "line" && <p className={styles.muted}>الخصم متاح على البنود فقط ألغ تفعيل خصم الفاتورة المحفوظ قبل الإصدار</p>}
      <label className={styles.check}><input type="checkbox" checked={invoice.discountEnabled} disabled={(!!aldeemPolicy && !aldeemPolicy.discounts) || (settings.discountMode === "line" && !invoice.discountEnabled)} onChange={event => { if (settings.discountMode !== "line" || !event.target.checked) patch({ discountEnabled: event.target.checked }); }} />يوجد خصم على الفاتورة</label>
      {invoice.discountEnabled && <div className={styles.fields}>
        <Field label="الخصم"><input type="number" inputMode="decimal" min="0" max={invoice.discountKind === "percent" ? 100 : totals.subtotal} step="0.01" required value={invoice.discountValue} disabled={settings.discountMode === "line"} onChange={event => { if (settings.discountMode !== "line") patch({ discountValue: Number(event.target.value) }); }} /></Field>
        <Field label="نوع الخصم"><select value={invoice.discountKind} disabled={settings.discountMode === "line"} onChange={event => { if (settings.discountMode !== "line") patch({ discountKind: event.target.value === "percent" ? "percent" : "amount" }); }}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></Field>
      </div>}
      {(settings.advanced.adjustmentsEnabled || invoice.adjustment?.typeId) && <div className={styles.fields}>
        <Field label="نوع التسوية"><select value={invoice.adjustment?.typeId ?? ""} onChange={event => patch({ adjustment: { typeId: event.target.value, amount: invoice.adjustment?.amount ?? 0 } })}><option value="">بدون تسوية</option>{settings.advanced.adjustmentsEnabled && settings.advanced.adjustments.map(type => <option key={type.id} value={type.id}>{type.name} — {type.kind === "addition" ? "إضافة" : "خصم"}</option>)}{invoice.adjustment?.typeId && (!settings.advanced.adjustmentsEnabled || !adjustmentType) && <option value={invoice.adjustment.typeId}>تسوية محفوظة غير متاحة</option>}</select></Field>
        <Field label="مبلغ التسوية" hint={adjustmentType ? adjustmentType.taxable ? "تدخل في الأساس الضريبي" : "تسوية غير خاضعة للضريبة" : "اختر نوع التسوية"}><input type="number" min="0" max={adjustmentType?.kind === "deduction" ? Math.max(0, totals.subtotal - totals.discount) : 1000000000} step="0.01" disabled={!invoice.adjustment?.typeId || !settings.advanced.adjustmentsEnabled} value={invoice.adjustment?.amount ?? 0} onChange={event => patch({ adjustment: { typeId: invoice.adjustment?.typeId ?? "", amount: Number(event.target.value) } })} /></Field>
        {!!invoice.adjustment?.amount && <button type="button" className={styles.secondary} onClick={() => patch({ adjustment: { typeId: "", amount: 0 } })}>إزالة التسوية</button>}
      </div>}
      {totals.rows.some(row => row.net < 0) && <p role="alert" className={styles.error}>مبلغ التسوية المخفضة يتجاوز قيمة البنود عدّله قبل الإصدار</p>}
      </div>
      </div>
      <div hidden={details !== "deposit" || (!settings.allowDeposits && deposit.value <= 0)} data-invoice-details="deposit" className={editor.optionPanel}>
        {!settings.allowDeposits && deposit.value > 0 && <div><p className={styles.notice}>تمنع إعدادات الفواتير الدفعات المقدمة أزل الدفعة المحفوظة قبل الإصدار</p><button type="button" className={styles.secondary} disabled={disabled} onClick={() => { if (disabled) return; setDeposit({ kind: "amount", value: 0, paid: false }); patch({ paymentKind: "credit", accountId: "" }); }}>إزالة الدفعة المقدمة</button></div>}
        <div className={editor.compactFields}><Field label="الدفعة المقدمة"><input type="number" min="0" step="0.01" max={deposit.kind === "percent" ? 100 : totals.total} value={deposit.value} disabled={!settings.allowDeposits} onChange={event => { if (!settings.allowDeposits) return; const value = Number(event.target.value); setDeposit(current => ({ ...current, value })); patch({ paymentKind: value > 0 && deposit.paid ? "cash" : "credit", accountId: "" }); }} /></Field><Field label="نوع الدفعة"><select value={deposit.kind} disabled={!settings.allowDeposits} onChange={event => { if (settings.allowDeposits) setDeposit(current => ({ ...current, kind: event.target.value === "percent" ? "percent" : "amount" })); }}><option value="amount">المبلغ</option><option value="percent">نسبة مئوية (%)</option></select></Field><label className={styles.check}><input type="checkbox" role="switch" checked={deposit.paid} disabled={!deposit.value || !settings.allowDeposits} onChange={event => { if (!settings.allowDeposits) return; setDeposit(current => ({ ...current, paid: event.target.checked })); patch({ paymentKind: event.target.checked ? "cash" : "credit", accountId: "" }); }} />مدفوع بالفعل</label><InvoiceHelp text="أدخل الدفعة المقدمة المطلوبة وفعّل مدفوع بالفعل فقط عند تحصيلها يُسجل المبلغ المحصل ويُخصم من المتبقي عند إصدار الفاتورة" /></div>
        {deposit.value > 0 && <p className={styles.muted}>الدفعة المقدمة <span className={styles.numeric}>{invoiceSettingsMoney(depositAmount, settings.decimalDisplay, currency)}</span> — {deposit.paid ? "محصلة عند الإصدار" : "غير محصلة"}</p>}
      </div>
      <div hidden={details !== "shipping"} onFocusCapture={() => { if (!onDemand || initialDraftId) contextLoader.activate("shippingCharge"); }} data-invoice-details="shipping" className={editor.optionPanel}><div className={editor.compactFields}><Field label="بيانات الشحن"><select value={shipping} onChange={event => setShipping(event.target.value as ShippingMode)}><option value="auto">آلي</option><option value="none">لا تظهر</option><option value="main">أظهر عنوان العميل</option><option value="secondary">أظهر عنوان العميل الثانوي</option></select></Field><InvoiceHelp text="يظهر العنوان المختار في قسم الشحن إلى في الفاتورة ويُحفظ كما هو وقت الإصدار" /></div>{shipping !== "none" && <p className={styles.muted}>{shippingAddress || "أكمل العنوان المختار في بيانات العميل قبل الإصدار"}</p>}{(!onDemand || !!initialDraftId) && <InvoiceShippingChargeEditor resource={shippingCharge} disabled={disabled} />}</div>
      <div hidden={details !== "delivery"} data-invoice-details="delivery" className={editor.optionPanel}><div className={editor.compactFields}><label className={styles.check}><input type="checkbox" role="switch" checked={delivery.confirmed} onChange={event => setDelivery({ confirmed: event.target.checked, date: event.target.checked ? new Date().toISOString() : "" })} />تأكيد التسليم</label><Field label="تاريخ التسليم" hint="بتوقيت الرياض"><input type="datetime-local" disabled={!delivery.confirmed} required={delivery.confirmed} value={delivery.date ? new Date(new Date(delivery.date).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16) : ""} onChange={event => setDelivery(current => ({ ...current, date: event.target.value ? `${event.target.value}:00+03:00` : "" }))} /></Field></div></div>
      {!onDemand && <div hidden={details !== "attachments"} data-invoice-details="attachments"><CompanyInvoiceFiles slug={data.cafe.slug} files={files} onChange={setFiles} disabled={pending || stale || draftBusy || !!issued} onBusyChange={setFilesBusy} /></div>}
      </div>
      </section>
      <section className={styles.invoiceSection} aria-label="ملاحظات الفاتورة">
        <div className={editor.helpLine}><InvoiceHelp text="أضف شروط الدفع أو تفاصيل الطلب تُحفظ الملاحظات والبيانات الإضافية كنص ضمن الفاتورة بحد أقصى ٥٠٠ حرف" /><span>الملاحظات والشروط</span></div>
        <Field label="الملاحظات والشروط" hint="اختياري"><textarea maxLength={500} placeholder="أضف ملاحظات أو شروط الفاتورة" value={invoice.note} onChange={event => patch({ note: event.target.value })} /></Field>
        <span className={editor.noteCount} aria-live="polite">{savedNote.length} / 500</span>
      </section>
      <section className={styles.invoiceSection} aria-label="حالة سداد الفاتورة">
        {invoice.partyId && (creditAvailable > 0 || invoice.applyCredit || settings.advanced.autoApplyCredit) && <div className={editor.optionPanel}><p className={styles.notice}>الرصيد المقدم المتاح للعميل <span className={styles.numeric}>{invoiceSettingsMoney(creditAvailable, settings.decimalDisplay)}</span></p><label className={styles.check}><input type="checkbox" checked={!!invoice.applyCredit} disabled={!pricingContext.data} onChange={event => patch({ applyCredit: event.target.checked })} />استخدام رصيد العميل المقدم في هذه الفاتورة</label>{creditApplied > 0 && <p className={styles.muted}>سيُطبق <span className={styles.numeric}>{invoiceSettingsMoney(creditApplied, settings.decimalDisplay, currency)}</span> من الرصيد قبل التحصيل الجديد ويُعاد التحقق من المتاح عند الإصدار</p>}</div>}
        <div className={editor.helpLine}><label className={styles.check}><input type="checkbox" checked={invoice.paymentKind !== "credit" && deposit.value === 0} disabled={!!aldeemPolicy && !aldeemPolicy.credit} onChange={event => { setDeposit({ kind: "amount", value: 0, paid: false }); patch({ paymentKind: event.target.checked ? "cash" : "credit", accountId: "" }); }} />مدفوع بالفعل</label><InvoiceHelp text="عند التفعيل تُحفظ الفاتورة مدفوعة بالكامل على حساب التحصيل المحدد عند إلغائه يجب اختيار عميل وتُحفظ الفاتورة آجلة لتسجيل دفعات لاحقًا" /></div>
        {deposit.paid && deposit.value > 0 && <p className={styles.muted}>حساب تحصيل الدفعة المقدمة</p>}
        {invoice.paymentKind !== "credit" ? <div className={styles.fields}>
          <Field label="وسيلة دفع"><select onFocus={() => { if (onDemand) void loadPaymentOptions().catch(cause => setLocalError(cause.message)); }} value={invoice.paymentKind} onChange={event => patch({ paymentKind: event.target.value, accountId: "" })}><option disabled={!!aldeemPolicy && !aldeemPolicy.cash} value="cash">نقدي</option><option disabled={!!aldeemPolicy && !aldeemPolicy.network && !aldeemPolicy.visa} value="pos">نقطة بيع</option><option disabled={!!aldeemPolicy && !aldeemPolicy.transfer} value="bank">تحويل بنكي</option></select></Field>
          <Field label="حساب التحصيل"><select onFocus={() => { if (onDemand) void loadPaymentOptions().catch(cause => setLocalError(cause.message)); }} required={cashPaid > 0} value={accountId} onChange={event => patch({ accountId: event.target.value })}><option value="">اختر الحساب</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
          {(!onDemand || !!initialDraftId) && <Field label="رقم المعرّف" hint="غير مفعّل حاليًا"><input disabled placeholder="مرجع عملية الدفع" /></Field>}
        </div> : <p className={styles.muted}>فاتورة آجلة على العميل المحدد ويمكن تسجيل دفعة بعد الحفظ</p>}
        {onDemand && <div hidden={invoice.paymentKind !== "bank" && details !== "attachments"} className={editor.optionPanel} data-invoice-details="attachments">
          <h3 className={aldeem.heading}>{invoice.paymentKind === "bank" ? "إيصال التحويل البنكي" : "مرفقات الفاتورة"}</h3>
          {invoice.paymentKind === "bank" && <p className={styles.muted}>أرفق صورة الإيصال أو ملفه لحفظه مع الفاتورة</p>}
          <CompanyInvoiceFiles slug={data.cafe.slug} files={files} onChange={setFiles} disabled={pending || stale || draftBusy || !!issued} onBusyChange={setFilesBusy} />
        </div>}
      </section>
      {customFields.settings && <InvoiceCustomFieldValues key={`${data.cafe.slug}-${draftRenderId}`} slug={data.cafe.slug} settings={customFields.settings} settingsRevision={customFields.context!.settingsRevision} values={customFields.values} disabled={disabled} onChange={customFields.change} onBusyChange={setCustomFilesBusy} />}
      <div className={editor.bottomActions}><span className={styles.muted}>{!issuerReady && !issued ? "يمكن حفظ المسودة الآن ويتاح الإصدار بعد تجهيز بيانات المنشأة" : "بعد الإصدار تُحفظ نسخة ثابتة من الفاتورة ويُسجل أثرها المالي والمخزني"}</span><button type="submit" className={styles.primary} onClick={event => { if (onDemand && (resourcesPending || !issuerReady)) { event.preventDefault(); void saveDraft(true); } }} disabled={disabled || (!onDemand && !issueReady)}>{draftBusy ? "جار تنفيذ الطلب" : issued ? `فاتورة رقم ${issued.displayNumber || issued.number}` : deliveryMethod === "whatsapp" ? "إصدار وإرسال بالواتساب" : deliveryMethod === "email" || deliveryMethod === "both" ? "إصدار وإرسال بالبريد" : "إصدار الفاتورة"}</button></div>
    </fieldset>
  </form><div onKeyDown={event => event.stopPropagation()}>
  <Modal open={draftsOpen} title="المسودات المحفوظة" onClose={() => { if (!draftBusy) setDraftsOpen(false); }}>
    <div className={styles.form}>
      <p className={styles.muted}>فتح مسودة يستبدل البيانات الحالية احفظ تعديلاتك أولًا إذا أردت الاحتفاظ بها</p>
      {localError && <p className={styles.error} role="alert">{localError}</p>}
      {drafts.length ? <Field label="اختر المسودة"><select disabled={draftBusy} value={draftChoice} onChange={event => setDraftChoice(event.target.value)}><option value="">اختر المسودة</option>{drafts.map(draft => <option key={draft.id} value={draft.id}>{data.parties.find(party => party.id === draft.partyId)?.name || "بدون عميل"} — {new Date(draft.updatedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} — {draft.note || draft.id.slice(0, 8)}</option>)}</select></Field> : <p>لا توجد مسودات محفوظة</p>}
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={draftBusy || !draftChoice} onClick={() => { setDraftBusy(true); void restoreDraft(draftChoice); }}>{draftBusy ? "جار فتح المسودة" : "فتح المسودة"}</button><button type="button" className={styles.secondary} disabled={draftBusy} onClick={() => setDraftsOpen(false)}>إلغاء</button></div>
    </div>
  </Modal>
  <Modal open={previewOpen} title="معاينة الفاتورة" onClose={closePreview} panelClassName={styles.invoicePanel}>
    {pdfLoading ? <p role="status" className={editor.pdfLoading}>جار تجهيز معاينة PDF</p> : pdfUrl ? <div className={editor.pdfPreview}><p>{issued ? `فاتورة ضريبية رقم ${issued.displayNumber || issued.number}` : "معاينة غير محفوظة"}</p><a href={pdfUrl} download={issued ? `invoice-${issued.displayNumber || issued.number}.pdf` : "barnda-invoice-preview.pdf"}>تنزيل ملف الفاتورة</a><iframe src={pdfUrl} title="معاينة الفاتورة PDF" /><button type="button" className={styles.secondary} onClick={closePreview}>العودة للتعديل</button></div> : previewOpen && <div className={`${editor.preview} ${template === "thermal" ? editor.thermalPreview : ""}`}>
      <div className={editor.previewHeader}><div><h3>{data.cafe.name}</h3><p>فاتورة شركات</p></div><span className={styles.badge}>معاينة غير محفوظة</span></div>
      {previewTaxEnabled && (previewTaxQr ? <figure className={editor.taxQr}>
        <svg role="img" aria-label="رمز الضريبة للمعاينة" viewBox={`0 0 ${previewTaxQr.size} ${previewTaxQr.size}`} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges"><rect width={previewTaxQr.size} height={previewTaxQr.size} fill="#fff" /><path d={previewTaxQr.path} fill="#000" /></svg>
        <figcaption>رمز ضريبي للمعاينة يُعتمد الرمز النهائي عند إصدار الفاتورة</figcaption>
      </figure> : <p className={editor.previewNote} role="status">{issuerLoading ? "جار تحميل بيانات البائع لإظهار رمز الضريبة" : issuerError || "أكمل الرقم الضريبي للمنشأة في إعدادات الحساب لإظهار رمز الضريبة"}{issuerError && <button type="button" onClick={retryIssuer}>إعادة المحاولة</button>}</p>)}
      <p>العميل: {data.parties.find(party => party.id === invoice.partyId)?.name || "لم يُحدد العميل"}</p>
      {customer?.tax_number && <p>الرقم الضريبي: <bdi>{customer.tax_number}</bdi></p>}
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{invoice.lines.map((line, index) => codServiceLineIndices.includes(index) ? null : <tr key={line.key}><td>{invoiceProducts.find(product => product.id === line.productId)?.name || line.name || "لم يُحدد الصنف"}{line.description && <p className={editor.previewNote}>{line.description}</p>}{lineNotes.values[line.key]?.map(note => <p className={editor.previewNote} key={note}>{note}</p>)}</td><td><Numeric value={line.quantity} /></td><td><span className={styles.numeric}>{invoiceSettingsMoney(lineTotals[index].price, settings.decimalDisplay, currency)}</span></td><td><span className={styles.numeric}>{invoiceSettingsMoney(lineTotals[index].discount, settings.decimalDisplay, currency)}</span></td><td><span className={styles.numeric}>{invoiceSettingsMoney(lineTotals[index].tax, settings.decimalDisplay, currency)}</span></td><td><span className={styles.numeric}>{invoiceSettingsMoney(lineTotals[index].total, settings.decimalDisplay, currency)}</span></td></tr>)}</tbody></table></div>
      {codServiceLineIndices.length > 0 && <div className={styles.balanceLine}><span>رسوم الدفع عند الاستلام</span><span className={styles.numeric}>{invoiceSettingsMoney(codGross, settings.decimalDisplay, currency)}</span></div>}
      {shippingCharge.selection && <div className={styles.balanceLine}><span>الشحن: {shippingCharge.selection.name}</span><span className={styles.numeric}>{invoiceSettingsMoney(shippingTotals.amount, settings.decimalDisplay, currency)}</span></div>}
      <div className={styles.balanceLine}><span>إجمالي الفاتورة</span><strong><span className={styles.numeric}>{invoiceSettingsMoney(totals.total, settings.decimalDisplay, currency)}</span></strong></div>
      <div className={styles.balanceLine}><span>مدفوع</span><span className={styles.numeric}>{invoiceSettingsMoney(paid, settings.decimalDisplay, currency)}</span></div><div className={styles.balanceLine}><span>المبلغ المستحق</span><span className={styles.numeric}>{invoiceSettingsMoney(totals.total - paid, settings.decimalDisplay, currency)}</span></div>{[savedNote, optionsNote].filter(Boolean).map((note, index) => <p key={index} className={editor.previewNote}>{note}</p>)}
      <button type="button" className={styles.secondary} onClick={closePreview}>العودة للتعديل</button>
    </div>}
  </Modal>
  <Modal open={customerOpen} title="إضافة عميل" onClose={() => { if (!pending) setCustomerOpen(false); }} panelClassName={onDemand ? customerDesign.dialog : "flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"}>
    {customerOpen && <CustomerForm pending={disabled} error={error} onCancel={() => { if (!pending) setCustomerOpen(false); }} onSubmit={async (operation, payload) => operation === "party" && onCreateCustomer(payload)} onSaved={id => { patch({ partyId: id }); setCustomerOpen(false); }} />}
  </Modal></div></>;
}
