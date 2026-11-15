"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Banknote, BellRing, Building2, Check, Coffee, CreditCard, MapPin, Printer, RefreshCw, UserRound, Volume2, VolumeX, Wallet, X } from "lucide-react";
import { manageHospitalOrderAction, readHospitalReceiptAction } from "@/app/actions/hospital-orders";
import type { HospitalOrder, HospitalOrderCommand, HospitalOrderCommandResult, HospitalOrderStatus } from "@/lib/commerce/hospital-orders";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { previewFinanceTotals } from "@/lib/finance/brand-finance";
import { hospitalCheckoutAccounts, hospitalPricesConfirmed } from "@/lib/finance/hospital-pos-model";
import { hospitalAccountEntryHref } from "@/lib/commerce/hospital-account-routing";
import { FinancePosModal, useFinancePosLocale } from "./finance-pos-locale";
import { FinanceReceiptDialog } from "./finance-receipt-dialog";
import { useFinancePrinter } from "./use-finance-printer";
import { useHospitalInbox } from "./use-hospital-inbox";
import { useHospitalOrderSound } from "./use-hospital-order-sound";
import s from "./hospital-orders-toolbar.module.css";

const labels: Record<HospitalOrderStatus, [string, string]> = {
  pending: ["طلب جديد", "New order"], accepted: ["تم التأكيد", "Confirmed"], preparing: ["قيد التحضير", "Preparing"], ready: ["جاهز للتسليم", "Ready"], completed: ["مكتمل", "Completed"], cancelled: ["مرفوض", "Rejected"],
};
const statusOrder: Record<HospitalOrderStatus, number> = { pending: 0, accepted: 1, preparing: 2, ready: 3, completed: 4, cancelled: 5 };

function OrderPhoto({ src, quantity }: { src?: string | null; quantity?: number }) {
  const [failed, setFailed] = useState(false);
  const { number, t } = useFinancePosLocale();
  return <span className={s.photo}>{src && !failed ? <Image src={src} alt="" width={80} height={80} unoptimized loading="lazy" onError={() => setFailed(true)} /> : <Coffee size={22} aria-hidden="true" />}{quantity !== undefined && <b aria-label={`${t("الكمية", "Quantity")}: ${number(quantity)}`}><bdi>{number(quantity)}</bdi><span aria-hidden="true">×</span></b>}</span>;
}

export function HospitalOrdersToolbar({ snapshot, onRefresh }: { snapshot: FinanceSnapshot; onRefresh: () => unknown }) {
  const { language, dir, t, displayName, number } = useFinancePosLocale();
  const inbox = useHospitalInbox(snapshot.cafe.slug, snapshot.cafe.id, snapshot.userId);
  const sound = useHospitalOrderSound(inbox.notice?.id);
  const [open, setOpen] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null), [filter, setFilter] = useState<"active" | "pending" | "all">("active");
  const [receipt, setReceipt] = useState<FinanceDocument | null>(null), [receiptBusy, setReceiptBusy] = useState(false), [receiptError, setReceiptError] = useState("");
  const [updated, setUpdated] = useState<Record<string, HospitalOrderCommandResult>>({});
  const printer = useFinancePrinter(snapshot.cafe.id);
  const orders = inbox.orders.filter(order => order.source === "menu").map(order => {
    const update = updated[order.id];
    if (!update || statusOrder[order.status] > statusOrder[update.status] || (order.status === update.status && (order.financeDocumentId || !update.financeDocumentId))) return order;
    return { ...order, ...update };
  });
  const newCount = orders.filter(order => order.status === "pending").length;
  const visible = orders.filter(order => filter === "all" || (filter === "pending" ? order.status === "pending" && !order.financeDocumentId : !order.financeDocumentId && !["completed", "cancelled"].includes(order.status)));
  const selected = orders.find(order => order.id === selectedId) ?? null;
  function show(orderId?: string) { setOpen(true); setSelectedId(orderId ?? selectedId); inbox.dismiss(); void inbox.refresh(); }
  async function saved(result: HospitalOrderCommandResult) {
    setUpdated(current => ({ ...current, [result.id]: result }));
    const refreshed = await Promise.allSettled([inbox.refresh(), Promise.resolve().then(onRefresh)]);
    if (refreshed.some(result => result.status === "rejected")) setReceiptError(t("تم حفظ العملية لكن تعذر تحديث الأرصدة حدّث البيانات دون تكرار العملية", "The action was saved but balances could not refresh Refresh the data without repeating the action"));
  }
  async function print(order: HospitalOrder) {
    if (!order.financeDocumentId || receiptBusy) return;
    setReceiptError("");
    const existing = snapshot.documents.find(document => document.id === order.financeDocumentId);
    if (existing) { setReceipt(existing); return; }
    setReceiptBusy(true);
    try {
      const result = await readHospitalReceiptAction(snapshot.cafe.slug, order.id);
      if (result.ok) setReceipt(result.document);
      else setReceiptError(t("تعذر تحميل الفاتورة حدّث الطلب وحاول مجددًا", "Could not load the invoice Refresh the order and retry"));
    } catch { setReceiptError(t("تعذر الاتصال لتحميل الفاتورة", "Could not connect to load the invoice")); }
    finally { setReceiptBusy(false); }
  }
  return <>
    <div className={s.toolbar}>
      <button type="button" className={`${s.trigger} ${newCount ? s.pending : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => show()}><BellRing size={18} aria-hidden="true" />{t("طلبات المستشفى", "Hospital orders")}<b>{number(newCount)}</b></button>
      <button type="button" className={s.sound} title={sound.status === "on" ? t("كتم تنبيه الطلبات", "Mute order alerts") : t("تفعيل صوت الطلبات", "Enable order sound")} aria-label={sound.status === "on" ? t("كتم تنبيه الطلبات", "Mute order alerts") : t("تفعيل صوت الطلبات", "Enable order sound")} aria-pressed={sound.status === "on"} onClick={() => { if (sound.status === "on") sound.mute(); else void sound.arm(); }}>{sound.status === "on" ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
    </div>
    {inbox.notice && <div className={s.toast} dir={dir} role="alert"><BellRing size={28} aria-hidden="true" /><div className={s.toastText}><strong>{t("طلب مستشفى جديد", "New hospital order")} #{number(inbox.notice.number)}</strong><span>{displayName(inbox.notice.doctor || inbox.notice.customerName)} · {displayName(inbox.notice.floor)} · {displayName(inbox.notice.clinic)}</span>{sound.status !== "on" && <span>{t("اضغط رمز الصوت لتفعيل التنبيه المسموع", "Tap the sound icon to enable audible alerts")}</span>}</div><button type="button" onClick={() => show(inbox.notice!.id)}>{t("عرض الطلب", "View order")}</button><button type="button" onClick={inbox.dismiss} aria-label={t("إغلاق التنبيه", "Dismiss alert")}><X size={16} /></button></div>}
    <FinancePosModal open={open && !receipt} title={t("طلبات المستشفى", "Hospital orders")} onClose={() => setOpen(false)} panelClassName={s.panel}>
      <div className={s.body} dir={dir} lang={language}>
        <div className={s.top}><div className={s.tabs} role="tablist" aria-label={t("حالة الطلبات", "Order status")}>{([["active", "المفتوحة", "Open"], ["pending", "الجديدة", "New"], ["all", "كل الطلبات", "All orders"]] as const).map(([value, ar, en]) => <button type="button" role="tab" aria-selected={filter === value} key={value} className={s.tab} onClick={() => setFilter(value)}>{t(ar, en)}</button>)}</div><button type="button" className={s.refresh} onClick={() => void inbox.refresh()}><RefreshCw size={16} aria-hidden="true" />{t("تحديث", "Refresh")}</button></div>
        {inbox.failed && <p className={s.error} role="alert">{t("تعذر تحديث الطلبات آخر بيانات ظاهرة قد تكون قديمة", "Orders could not refresh Displayed information may be outdated")}</p>}
        {receiptError && <p className={s.error} role="alert">{receiptError}</p>}
        {!inbox.loaded && !inbox.failed ? <div className={s.empty} role="status">{t("جار تحميل طلبات المستشفى", "Loading hospital orders")}</div> : <div className={s.columns}>
          <div className={s.list}>{visible.length === 0 ? <div className={s.empty}><BellRing size={32} aria-hidden="true" /><p>{t("لا توجد طلبات في هذه القائمة", "No orders in this list")}</p></div> : visible.map(order => <button type="button" className={s.card} key={order.id} aria-pressed={selectedId === order.id} onClick={() => { setSelectedId(order.id); inbox.dismiss(); setReceiptError(""); }}>
            <div className={s.cardHead}><strong>#{number(order.number)}</strong><span className={`${s.badge} ${order.status === "pending" ? s.new : ""}`}>{t(...labels[order.status])}</span><small>{new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(order.createdAt))}</small></div>
            <strong>{displayName(order.doctor || order.customerName)}</strong><span className={s.location}><MapPin size={16} aria-hidden="true" />{t("الدور", "Floor")} {displayName(order.floor)} · {displayName(order.clinic)}</span>
            <span className={s.previews}>{order.items.slice(0, 4).map((item, index) => <OrderPhoto key={`${item.productId}:${index}`} src={item.imageUrl ?? snapshot.products.find(product => product.id === item.productId)?.imageUrl} quantity={item.quantity} />)}{order.items.length > 4 && <small>+{number(order.items.length - 4)}</small>}</span>
          </button>)}</div>
          {selected ? <HospitalOrderDetails key={selected.id} order={selected} snapshot={snapshot} saved={saved} print={() => void print(selected)} printBusy={receiptBusy} stale={inbox.failed} /> : <div className={s.empty}><Building2 size={42} aria-hidden="true" /><p>{t("اختر طلبًا لمراجعة الأصناف ومكان الدكتور", "Select an order to review items and the doctor’s location")}</p></div>}
        </div>}
      </div>
    </FinancePosModal>
    {receipt && <FinanceReceiptDialog document={receipt} snapshot={snapshot} onClose={() => setReceipt(null)} onPrint={printer.handler(receipt.id, false)} />}
  </>;
}

function HospitalOrderDetails({ order, snapshot, saved, print, printBusy, stale }: { order: HospitalOrder; snapshot: FinanceSnapshot; saved: (result: HospitalOrderCommandResult) => Promise<void>; print: () => void; printBusy: boolean; stale: boolean }) {
  const { language, t, displayName, productName, money, number } = useFinancePosLocale();
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [success, setSuccess] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "credit">("cash"), [accountId, setAccountId] = useState(""), [warehouseId, setWarehouseId] = useState(snapshot.warehouses.find(warehouse => warehouse.active)?.id ?? "");
  const [prices, setPrices] = useState(order.items.map(item => item.priceMode === "cashier" ? "" : String(item.unitPrice)));
  const lock = useRef(false), retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const shift = snapshot.shifts.find(row => row.user_id === snapshot.userId && row.status === "open" && !row.supervisor_paused);
  const accounts = hospitalCheckoutAccounts(snapshot.accounts, method, shift);
  const account = accounts.find(row => row.id === accountId) ?? accounts.find(row => row.is_primary) ?? accounts[0];
  // The price comes from the menu product card: only a product the owner marked as priced by the cashier asks for a price here, every other product is invoiced at its menu price.
  const confirmed = hospitalPricesConfirmed(order.items, prices);
  const totals = previewFinanceTotals(order.items.map((item, index) => ({ quantity: item.quantity, price: confirmed ? Number(prices[index]) : item.unitPrice })), 0, snapshot.settings.vat_rate, snapshot.settings.tax_inclusive);
  const invoiceable = !order.financeDocumentId && ["accepted", "preparing", "ready"].includes(order.status);
  const checkoutIssue = stale ? t("حدّث الطلبات لاستعادة الاتصال قبل إصدار الفاتورة", "Refresh orders to reconnect before issuing the invoice")
    : !confirmed ? t("أدخل سعر الوحدة لكل صنف حتى يتفعّل زر إصدار الفاتورة", "Enter each item unit price to enable invoicing")
    : !shift ? t("ابدأ ورديتك أولًا حتى يتفعّل زر إصدار الفاتورة", "Open your shift to enable invoicing")
    : !warehouseId ? t("اختر مستودع البيع حتى يتفعّل زر إصدار الفاتورة", "Select a sales warehouse to enable invoicing")
    : method !== "credit" && !account ? t("اختر حساب تحصيل متاحًا لطريقة السداد", "Select an available collection account for this payment method") : "";
  async function command(action: HospitalOrderCommand["action"]) {
    if (lock.current || stale) return;
    if (action === "cancel" && reason.trim().length < 3) { setError(t("اكتب سبب رفض واضحًا من ثلاثة أحرف على الأقل", "Enter a clear rejection reason of at least three characters")); return; }
    if (action === "checkout" && (!shift || !confirmed || !warehouseId || (method !== "credit" && !account))) return;
    const payload = { id: order.id, action, ...(action === "cancel" ? { note: reason.trim() } : {}), ...(action === "checkout" ? { paymentMethod: method, ...(account && method !== "credit" ? { accountId: account.id } : {}), warehouseId, shiftId: shift!.id, debtorType: "doctor" as const, debtorName: order.doctor || order.customerName, debtorPhone: order.phone, confirmedPrices: prices.map((price, index) => ({ index, unitPrice: Number(price) })) } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      const result = await manageHospitalOrderAction(snapshot.cafe.slug, { ...payload, requestId: retry.current.requestId });
      if (!result.ok) { setError(language === "ar" ? result.error : t("تعذر حفظ الإجراء راجع الاتصال وبيانات الطلب ثم أعد المحاولة", "The action could not be saved Check the connection and order details, then retry")); return; }
      retry.current = null; setRejecting(false);
      await saved(result.order);
      setSuccess(action === "accept" ? t("تم تأكيد الطلب ويبقى مفتوحًا لإصدار الفاتورة", "Order confirmed It stays open until invoiced") : action === "cancel" ? t("تم رفض الطلب وحفظ السبب", "Order rejected and reason saved") : action === "checkout" ? t("تم إصدار الفاتورة يمكنك طباعتها الآن", "Invoice issued You can print it now") : t("تم تحديث حالة الطلب", "Order status updated"));
    } catch { setError(t("تعذر تأكيد الحفظ حدّث الطلب وأعد المحاولة بنفس الخيارات لمنع التكرار", "Could not confirm the save Refresh and retry the same action to avoid duplication")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={s.details} aria-label={`${t("تفاصيل الطلب", "Order details")} ${number(order.number)}`}>
    <div className={s.cardHead}><h3>{t("طلب", "Order")} #{number(order.number)}</h3><span className={s.badge}>{t(...labels[order.status])}</span></div>
    <div className={s.doctor}><UserRound size={26} aria-hidden="true" /><div><strong>{displayName(order.doctor || order.customerName)}</strong><a href={`tel:+${order.phone}`}><bdi dir="ltr">+{order.phone}</bdi></a></div></div>
    <div className={s.location}><MapPin size={22} aria-hidden="true" /><strong>{t("الدور", "Floor")} {displayName(order.floor)} · {t("العيادة", "Clinic")} {displayName(order.clinic)}</strong></div>
    {order.notes && <p className={s.muted}>{t("ملاحظات الطلب", "Order notes")}: {displayName(order.notes)}</p>}
    <div className={s.items}>{order.items.map((item, index) => <div className={s.item} key={`${item.productId}:${index}`}><OrderPhoto src={item.imageUrl ?? snapshot.products.find(product => product.id === item.productId)?.imageUrl} /><div className={s.itemText}><strong>{productName(item)}</strong><span className={s.quantity}><span>{t("الكمية", "Quantity")}</span><bdi>{number(item.quantity)}</bdi></span>{item.optionLabel && <small>{displayName(item.optionLabel)}</small>}<small>{item.priceMode === "cashier" && !order.financeDocumentId ? <>{t("يحدد الكاشير السعر", "Price set by cashier")}{item.unitPrice > 0 && <> · {t("سعر المنيو", "Menu price")} {money(item.unitPrice)}</>}</> : money(item.unitPrice)}</small></div>{invoiceable && item.priceMode === "cashier" && <label className={`${s.field} ${s.price}`}><span>{t("سعر الوحدة", "Unit price")}</span><input required aria-label={`${t("سعر الوحدة", "Unit price")} ${productName(item)}`} type="number" inputMode="decimal" min={0.01} max={100000} step="0.01" placeholder={item.unitPrice > 0 ? String(item.unitPrice) : undefined} value={prices[index]} disabled={busy} onChange={event => setPrices(current => current.map((value, position) => position === index ? event.target.value : value))} /></label>}</div>)}</div>
    {error && <p className={s.error} role="alert">{error}</p>}{success && <p className={s.success} role="status">{success}</p>}
    {order.notificationStatus && <p className={s.muted}>{order.notificationStatus === "queued" ? t("قبل مزود الواتساب رسالة تحديث الطلب", "WhatsApp provider accepted the order update") : ["pending", "processing", "dispatching"].includes(order.notificationStatus) ? t("تحديث الطلب بانتظار الإرسال بالواتساب", "Order update is waiting to be sent on WhatsApp") : t("تعذر تأكيد إرسال تحديث الواتساب راجع حالة الإرسال", "WhatsApp delivery could not be confirmed Review its status")}</p>}
    {order.rejectionReason && <p className={s.error}>{t("سبب الرفض", "Rejection reason")}: {displayName(order.rejectionReason)}</p>}
    {order.status === "pending" && <div className={s.actions}><button type="button" className={s.primary} disabled={busy || stale} onClick={() => void command("accept")}><Check size={18} aria-hidden="true" />{t("تأكيد الطلب", "Confirm order")}</button><button type="button" className={s.reject} disabled={busy || stale} onClick={() => setRejecting(value => !value)}><X size={18} aria-hidden="true" />{t("رفض الطلب", "Reject order")}</button></div>}
    {rejecting && <div className={s.fields}><label className={s.field}>{t("سبب رفض الطلب المرسل للدكتور", "Rejection reason sent to the doctor")}<textarea value={reason} minLength={3} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)} /></label><button type="button" className={s.reject} disabled={busy || reason.trim().length < 3 || stale} onClick={() => void command("cancel")}>{t("تأكيد الرفض وإبلاغ الدكتور", "Confirm rejection and notify doctor")}</button></div>}
    {invoiceable && <>
      <div className={s.summary}><span>{t("إجمالي الفاتورة", "Invoice total")}</span><strong>{confirmed ? money(totals.total) : t("بانتظار السعر", "Awaiting price")}</strong></div>
      {!confirmed && <p className={s.muted}>{t("أدخل سعر كل صنف قبل إصدار الفاتورة", "Enter each item price before issuing the invoice")}</p>}
      <fieldset className={s.payment}><legend>{t("طريقة السداد", "Payment method")}</legend>{([["cash", "كاش", "Cash", Banknote], ["card", "شبكة", "Card", CreditCard], ["credit", "آجل على الدكتور", "Doctor account", Wallet]] as const).map(([value, ar, en, Icon]) => <button type="button" key={value} className={s.secondary} aria-pressed={method === value} disabled={busy} onClick={() => { setMethod(value); setAccountId(""); }}><Icon size={17} aria-hidden="true" />{t(ar, en)}</button>)}</fieldset>
      <div className={s.fields}><label className={s.field}>{t("مستودع البيع", "Sales warehouse")}<select value={warehouseId} disabled={busy} onChange={event => setWarehouseId(event.target.value)}><option value="">{t("اختر المستودع", "Select warehouse")}</option>{snapshot.warehouses.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{displayName(row.name)}</option>)}</select></label>{method !== "credit" && <label className={s.field}>{t("حساب التحصيل", "Collection account")}<select value={account?.id ?? ""} disabled={busy} onChange={event => setAccountId(event.target.value)}><option value="">{t("اختر الحساب", "Select account")}</option>{accounts.map(row => <option key={row.id} value={row.id}>{displayName(row.name)}</option>)}</select></label>}</div>
      {method === "credit" && <p className={s.muted}>{t("تسجل الفاتورة في حساب الدكتور ويظهر المبلغ ضمن مديونيته دون تسجيل تحصيل", "The invoice is charged to the doctor's account as an outstanding balance without recording payment")}</p>}
      {!shift && <p className={s.error}>{t("ابدأ ورديتك من أعلى الكاشير قبل إصدار الفاتورة", "Open your shift from the cashier header before issuing the invoice")}</p>}
      {checkoutIssue && <p id="hospital-checkout-reason" className={s.muted} role="status">{checkoutIssue}</p>}
      <button type="button" className={s.primary} aria-describedby={checkoutIssue ? "hospital-checkout-reason" : undefined} disabled={busy || !!checkoutIssue} onClick={() => void command("checkout")}><ReceiptIcon />{busy ? t("جار إصدار الفاتورة", "Issuing invoice") : method === "credit" ? t("إصدار الفاتورة الآجلة", "Issue credit invoice") : t("تأكيد التحصيل وإصدار الفاتورة", "Confirm payment and issue invoice")}</button>
    </>}
    {order.financeDocumentId && <><p className={s.success}>{order.paymentStatus === "credit" ? t("الفاتورة مسجلة في مديونية الدكتور", "Invoice recorded in the doctor's balance") : t("تم تسجيل تحصيل الفاتورة", "Invoice payment recorded")}</p><button type="button" className={s.primary} disabled={printBusy} onClick={print}><Printer size={18} aria-hidden="true" />{t("طباعة الفاتورة", "Print invoice")}</button></>}
    <Link href={hospitalAccountEntryHref(snapshot.cafe.slug)} className={s.muted} target="_blank" rel="noopener noreferrer">{t("صفحة فواتير الدكتور يتطلب الدخول برقم جواله", "Doctor invoice page Sign in with the doctor's mobile")}</Link>
  </section>;
}

function ReceiptIcon() { return <Printer size={18} aria-hidden="true" />; }
