"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Banknote, BellRing, Check, Coffee, CreditCard, Languages, LogOut, Minus, Plus, Printer, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { createHospitalCounterOrderAction, manageHospitalOrderAction, readHospitalCatalogAction, readHospitalDebtsAction } from "@/app/actions/hospital-orders";
import { logoutFinanceAction } from "@/app/actions/finance-access";
import { fetchFinanceCashHandoversAction } from "@/app/actions/finance-cash-handovers";
import type { HospitalOrder, HospitalOrderCommand, HospitalOrderStatus } from "@/lib/commerce/hospital-orders";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { previewFinanceTotals } from "@/lib/finance/brand-finance";
import { hospitalCheckoutAccounts, hospitalPricesConfirmed } from "@/lib/finance/hospital-pos-model";
import type { CashHandoversPage } from "@/lib/finance/cash-handovers";
import { hospitalCategoryName, hospitalProductName } from "@/lib/commerce/hospital-labels";
import { useHospitalInbox } from "./use-hospital-inbox";
import { useFinance } from "./use-finance";
import { useFinancePrinter } from "./use-finance-printer";
import type { ReceiptBrand } from "./finance-receipt-print";
import { HospitalDebtsPanel, type HospitalDebtCustomer } from "./hospital-debts";
import { HospitalDialog, HospitalField, hospitalDate, hospitalFailure, hospitalMoney, hospitalText, type HospitalLanguage } from "./hospital-ui";
import s from "./hospital-pos.module.css";

type CartLine = { productId: string; quantity: number; priceOptionIndex?: number };
const lineKey = (line: CartLine) => `${line.productId}:${line.priceOptionIndex ?? "base"}`;
const orderLabels: Record<HospitalOrderStatus, [string, string]> = { pending: ["طلب جديد", "New order"], accepted: ["مقبول", "Accepted"], preparing: ["قيد التحضير", "Preparing"], ready: ["جاهز للتسليم", "Ready"], completed: ["مكتمل", "Completed"], cancelled: ["ملغى", "Cancelled"] };

function HospitalProductPhoto({ product }: { product: StandaloneMenuProduct }) {
  const [failed, setFailed] = useState(false);
  return <span className={s.productPhoto}>{product.images[0]?.url && !failed ? <Image src={product.images[0].url} alt="" width={360} height={300} unoptimized loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Coffee size={38} aria-hidden="true" />}</span>;
}

export function HospitalPOS({ initialSnapshot, slug, dashboardHref }: { initialSnapshot: FinanceSnapshot; slug?: string; dashboardHref?: "/dashboard/finance" }) {
  const router = useRouter();
  const state = useFinance(initialSnapshot, slug), data = state.snapshot;
  const [language, setLanguage] = useState<HospitalLanguage>("ar");
  const t = (ar: string, en: string) => hospitalText(language, ar, en);
  const inbox = useHospitalInbox(data.cafe.slug, data.cafe.id, data.userId);
  const [catalog, setCatalog] = useState<{ menu?: StandaloneMenu; error?: string } | null>(null), [catalogAttempt, setCatalogAttempt] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]), [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [pick, setPick] = useState<StandaloneMenuProduct | null>(null), [option, setOption] = useState(0), [quantity, setQuantity] = useState(1);
  const [panel, setPanel] = useState<"orders" | "debts" | "history" | null>(null), [orderFilter, setOrderFilter] = useState("active");
  const [selected, setSelected] = useState<HospitalOrder | null>(null), [receiptId, setReceiptId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState<"open" | "close" | "opening" | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const counterRetry = useRef<{ fingerprint: string; requestId: string } | null>(null), lock = useRef(false);
  const [customerName, setCustomerName] = useState(""), [phone, setPhone] = useState(""), [clinic, setClinic] = useState(""), [floor, setFloor] = useState("");
  const [counterDetails, setCounterDetails] = useState(false);
  const shift = data.shifts.find(item => item.user_id === data.userId && item.status === "open");
  const pending = busy || state.pending || state.stale;
  useEffect(() => {
    let alive = true;
    readHospitalCatalogAction(data.cafe.slug).then(result => { if (alive) setCatalog(result.ok ? { menu: result.menu } : { error: result.error }); }).catch(() => { if (alive) setCatalog({ error: "unavailable" }); });
    return () => { alive = false; };
  }, [data.cafe.slug, catalogAttempt]);
  useEffect(() => {
    if (!cart.length) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [cart.length]);
  const products = catalog?.menu?.products.filter(product => product.available && (!category || product.categoryId === category) && `${product.name} ${hospitalProductName(product.name, "en")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const lines = cart.flatMap(line => { const product = catalog?.menu?.products.find(item => item.id === line.productId); if (!product) return []; const price = line.priceOptionIndex === undefined ? product.priceRange?.min ?? product.price : product.priceOptions?.[line.priceOptionIndex] ?? product.price; return [{ ...line, product, price, maxPrice: line.priceOptionIndex === undefined ? product.priceRange?.max ?? price : price }]; });
  const minTotal = lines.reduce((total, line) => total + line.price * line.quantity, 0), maxTotal = lines.reduce((total, line) => total + line.maxPrice * line.quantity, 0);
  const filteredOrders = inbox.orders.filter(order => orderFilter === "all" || orderFilter === "active" ? orderFilter === "all" || !["completed", "cancelled"].includes(order.status) : order.status === orderFilter);
  const newCount = inbox.orders.filter(order => order.status === "pending").length;
  const receipt = data.documents.find(document => document.id === receiptId);
  function addProduct(product: StandaloneMenuProduct) {
    if (product.priceOptions?.length) { setPick(product); setOption(0); setQuantity(1); return; }
    addLine({ productId: product.id, quantity: 1 });
  }
  function addLine(line: CartLine) {
    setCart(current => {
      const existing = current.find(item => lineKey(item) === lineKey(line));
      if (!existing && current.length >= 30) { setError(t("الحد الأقصى للطلب ٣٠ صنفًا", "An order can contain up to 30 items")); return current; }
      return existing ? current.map(item => lineKey(item) === lineKey(line) ? { ...item, quantity: Math.min(50, item.quantity + line.quantity) } : item) : [...current, line];
    });
  }
  async function prepareCounter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || !cart.length || pending) return;
    const payload = { items: cart, language, customerName: customerName.trim(), phone: phone.trim(), clinic: clinic.trim(), floor: floor.trim(), doctor: "", notes: "" };
    const fingerprint = JSON.stringify(payload);
    if (counterRetry.current?.fingerprint !== fingerprint) counterRetry.current = { fingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await createHospitalCounterOrderAction(data.cafe.slug, { ...payload, requestId: counterRetry.current.requestId });
      if (!result.ok) { setError(hospitalFailure(language, result.error, result.code)); return; }
      counterRetry.current = null; setCart([]); setCounterDetails(false); setCustomerName(""); setPhone(""); setClinic(""); setFloor(""); setSelected(result.order); void inbox.refresh();
    } catch { setError(hospitalFailure(language)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function logout() {
    if (lock.current || cart.length || shift) return;
    lock.current = true; setBusy(true);
    try { await logoutFinanceAction(); router.replace(`/finance/${encodeURIComponent(data.cafe.slug)}/login`); }
    catch { setError(hospitalFailure(language)); lock.current = false; setBusy(false); }
  }
  return <main className={s.pos} dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
    <header className={s.header}><div className={s.identity}><strong className={s.brand} dir="ltr">MIND</strong><div><h1>{t("كاشير المستشفى", "Hospital cashier")}</h1><p>{shift ? t("الوردية مفتوحة", "Shift open") : t("الوردية مغلقة", "Shift closed")}{shift?.shift_number ? ` · #${shift.shift_number}` : ""}</p></div></div><nav className={s.tools} aria-label={t("أدوات الكاشير", "Cashier tools")}>
      <button className={`${s.secondary} ${s.inboxButton}`} onClick={() => setPanel("orders")}><BellRing />{t("الطلبات", "Orders")}<b>{newCount}</b></button><button className={s.secondary} onClick={() => setPanel("debts")}><Wallet />{t("المديونيات", "Receivables")}</button><button className={s.secondary} onClick={() => setPanel("history")}><ReceiptText />{t("الفواتير", "Invoices")}</button><button className={s.secondary} disabled={pending || !!cart.length} onClick={() => setShiftForm(shift ? "close" : "open")}>{shift ? t("إقفال الوردية", "Close shift") : t("بدء الوردية", "Open shift")}</button><button className={s.secondary} onClick={() => setLanguage(value => value === "ar" ? "en" : "ar")}><Languages />{language === "ar" ? "English" : "العربية"}</button>{data.canManage ? <Link className={s.secondary} href={dashboardHref ?? `/finance/${data.cafe.slug}`}>{t("لوحة التحكم", "Dashboard")}</Link> : <button className={s.icon} disabled={pending || !!cart.length || !!shift} onClick={() => void logout()} aria-label={t("خروج بعد إقفال الوردية", "Sign out after closing shift")}><LogOut /></button>}
    </nav></header>
    <div className={s.layout}><section className={s.catalog} aria-label={t("منتجات المنيو", "Menu products")}><div className={s.catalogTools}><label className={s.search}><Search size={19} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("ابحث عن منتج", "Search products")} aria-label={t("ابحث عن منتج", "Search products")} /></label><button className={s.icon} disabled={pending} onClick={() => { void state.refresh(); void inbox.refresh(); setCatalogAttempt(value => value + 1); }} aria-label={t("تحديث", "Refresh")}><RefreshCw size={18} /></button><span className={s.status}><i />{t("طلبات المنيو تتحدث تلقائيًا", "Menu orders update automatically")}</span></div>
      {(error || state.error) && <p className={s.error} role="alert">{error || hospitalFailure(language, state.error)}</p>}{state.stale && <p className={s.notice}>{t("حدّث الأرصدة قبل تنفيذ عملية أخرى", "Refresh balances before another transaction")}</p>}{inbox.failed && <p className={s.notice} role="status">{t("تأخر تحديث الطلبات نعيد الاتصال تلقائيًا ويمكنك التحديث يدويًا", "Order updates are delayed Reconnecting automatically or refresh manually")}</p>}
      {data.initialized === false && <div className={s.notice}><p>{t("سجّل الأرصدة الافتتاحية الفعلية قبل بدء البيع", "Record actual opening balances before sales")}</p>{data.canInitialize && <button className={s.secondary} onClick={() => setShiftForm("opening")}>{t("الأرصدة الافتتاحية", "Opening balances")}</button>}</div>}
      <nav className={s.categories} aria-label={t("الأقسام", "Categories")}><button aria-pressed={!category} onClick={() => setCategory("")}>{t("الكل", "All")}</button>{catalog?.menu?.categories.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{hospitalCategoryName(item.name, language)}</button>)}</nav>
      {!catalog ? <p className={s.empty} role="status">{t("جار تحميل المنيو", "Loading menu")}</p> : catalog.error ? <p className={s.error}>{hospitalFailure(language, catalog.error)}</p> : <div className={s.products}>{products.map(product => <button className={s.product} key={product.id} disabled={pending} onClick={() => addProduct(product)}><HospitalProductPhoto product={product} /><span className={s.productBody}><strong>{hospitalProductName(product.name, language)}</strong><b>{hospitalMoney(product.priceRange?.min ?? product.price, language)}{product.priceRange ? ` – ${hospitalMoney(product.priceRange.max, language)}` : ""}</b>{product.priceRange && <small>{t("يؤكد السعر عند إصدار الفاتورة", "Price confirmed at checkout")}</small>}</span></button>)}</div>}
    </section><aside className={s.cart} aria-label={t("سلة البيع", "Sale cart")}><div className={s.cartHeading}><h2><ShoppingBag size={20} /> {t("طلب الكاشير", "Counter order")}</h2><span>{cart.reduce((total, line) => total + line.quantity, 0)} {t("قطعة", "items")}</span></div><div className={s.cartBody}>{!lines.length ? <p className={s.empty}>{t("اختر منتجًا لإضافته إلى الطلب", "Select a product to start an order")}</p> : lines.map(line => <div className={s.cartLine} key={lineKey(line)}><div><strong>{hospitalProductName(line.product.name, language)}</strong><b>{hospitalMoney(line.price * line.quantity, language)}</b></div>{line.maxPrice !== line.price && <p>{t("حتى", "Up to")} {hospitalMoney(line.maxPrice * line.quantity, language)}</p>}<div className={s.quantity}><button disabled={pending} aria-label={t("تقليل الكمية", "Decrease quantity")} onClick={() => setCart(current => current.map(item => lineKey(item) === lineKey(line) ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}><Minus size={15} /></button><input type="number" aria-label={t("الكمية", "Quantity")} min={1} max={50} value={line.quantity} disabled={pending} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 50) setCart(current => current.map(item => lineKey(item) === lineKey(line) ? { ...item, quantity: value } : item)); }} /><button disabled={pending || line.quantity >= 50} aria-label={t("زيادة الكمية", "Increase quantity")} onClick={() => setCart(current => current.map(item => lineKey(item) === lineKey(line) ? { ...item, quantity: item.quantity + 1 } : item))}><Plus size={15} /></button><button className={s.remove} disabled={pending} aria-label={t("حذف الصنف", "Remove item")} onClick={() => setCart(current => current.filter(item => lineKey(item) !== lineKey(line)))}><Trash2 size={16} /></button></div></div>)}</div><div className={s.cartFooter}><div className={s.total}><span>{t("القيمة التقديرية", "Estimated amount")}</span><strong>{hospitalMoney(minTotal, language)}</strong></div>{maxTotal > minTotal && <small>{t("قد تصل إلى", "Up to")} {hospitalMoney(maxTotal, language)}</small>}<button className={s.primary} disabled={pending || !cart.length || !shift || shift.supervisor_paused} onClick={() => { setError(""); setCounterDetails(true); }}>{t("مراجعة الطلب والدفع", "Review order and payment")}</button>{!shift && <p className={s.notice}>{t("ابدأ الوردية لتسجيل المبيعات", "Open your shift to record sales")}</p>}<button className={s.secondary} disabled={pending || !cart.length} onClick={() => setCart([])}><Trash2 size={16} />{t("إفراغ السلة", "Clear cart")}</button></div></aside></div>
    {inbox.notice && <aside className={s.popup} role="alert" aria-live="assertive"><h2><BellRing />{t("وصل طلب جديد", "New order received")} #{inbox.notice.number}</h2><p>{inbox.notice.customerName}<br />{t("الدور", "Floor")} {inbox.notice.floor} · {t("العيادة", "Clinic")} {inbox.notice.clinic}</p><div><button className={s.primary} onClick={() => { setSelected(inbox.notice); inbox.dismiss(); }}>{t("فتح الطلب", "Open order")}</button><button className={s.secondary} onClick={inbox.dismiss}>{t("إغلاق الإشعار", "Dismiss")}</button></div></aside>}
    {pick && <HospitalDialog title={hospitalProductName(pick.name, language)} language={language} close={() => setPick(null)}><div className={s.form}><HospitalField label={t("اختر السعر أو الحجم", "Choose price or size")}><select value={option} onChange={event => setOption(Number(event.target.value))}>{pick.priceOptions?.map((price, index) => <option key={index} value={index}>{hospitalMoney(price, language)}</option>)}</select></HospitalField><HospitalField label={t("الكمية", "Quantity")}><input type="number" min={1} max={50} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></HospitalField><button className={s.primary} disabled={!Number.isInteger(quantity) || quantity < 1 || quantity > 50} onClick={() => { addLine({ productId: pick.id, quantity, priceOptionIndex: option }); setPick(null); }}>{t("إضافة للطلب", "Add to order")}</button></div></HospitalDialog>}
    {counterDetails && <HospitalDialog title={t("بيانات الطلب", "Order details")} language={language} busy={busy} close={() => setCounterDetails(false)}><form className={s.form} onSubmit={prepareCounter}>{error && <p className={s.error} role="alert">{error}</p>}<p>{t("البيانات اختيارية للطلب المباشر ويمكن اختيار الحساب الآجل في الخطوة التالية", "Details are optional for counter orders Select a credit account in the next step")}</p><div className={s.fields}><HospitalField label={t("اسم العميل", "Customer name")}><input value={customerName} maxLength={120} onChange={event => setCustomerName(event.target.value)} /></HospitalField><HospitalField label={t("الجوال", "Mobile phone")}><input type="tel" value={phone} maxLength={30} onChange={event => setPhone(event.target.value)} /></HospitalField><HospitalField label={t("الدور", "Floor")}><input value={floor} maxLength={60} onChange={event => setFloor(event.target.value)} /></HospitalField><HospitalField label={t("العيادة", "Clinic")}><input value={clinic} maxLength={120} onChange={event => setClinic(event.target.value)} /></HospitalField></div><button className={s.primary} disabled={busy}>{busy ? t("جار تجهيز الطلب", "Preparing order") : t("متابعة لتأكيد الأسعار والدفع", "Continue to confirm prices and payment")}</button></form></HospitalDialog>}
    {panel === "orders" && <HospitalDialog title={t("طلبات المستشفى", "Hospital orders")} language={language} wide close={() => setPanel(null)}><nav className={s.tabs}>{[["active", "الطلبات المفتوحة", "Open orders"], ["pending", "الجديدة", "New"], ["completed", "المكتملة", "Completed"], ["all", "الكل", "All"]].map(([value, ar, en]) => <button key={value} aria-pressed={orderFilter === value} onClick={() => setOrderFilter(value)}>{t(ar, en)}</button>)}<button onClick={() => void inbox.refresh()}><RefreshCw size={17} /></button></nav>{!inbox.loaded && <p role="status">{t("جار تحميل الطلبات", "Loading orders")}</p>}<div className={s.orderGrid}>{filteredOrders.map(order => <button className={s.order} key={order.id} onClick={() => { setPanel(null); setSelected(order); }}><div><h3>#{order.number} {order.customerName || t("طلب كاشير", "Counter order")}</h3><span className={s.badge}>{t(...orderLabels[order.status])}</span></div><p>{order.floor && `${t("الدور", "Floor")} ${order.floor} · `}{order.clinic || t("الكاشير", "Counter")}</p><p>{order.items.length} {t("صنف", "items")} · {hospitalMoney(order.total, language)}</p><small>{hospitalDate(order.createdAt, language)}</small></button>)}</div>{inbox.loaded && !filteredOrders.length && <p className={s.empty}>{t("لا توجد طلبات في هذا القسم", "No orders in this view")}</p>}</HospitalDialog>}
    {panel === "debts" && <HospitalDialog title={t("المديونيات والتحصيل", "Receivables and collections")} language={language} wide close={() => setPanel(null)}><HospitalDebtsPanel snapshot={data} language={language} onChanged={() => void state.refresh()} /></HospitalDialog>}
    {panel === "history" && <HospitalDialog title={t("فواتير المبيعات", "Sales invoices")} language={language} wide close={() => setPanel(null)}><div className={s.tableWrap}><table className={s.table}><thead><tr><th>{t("الفاتورة", "Invoice")}</th><th>{t("التاريخ", "Date")}</th><th>{t("الإجمالي", "Total")}</th><th>{t("المتبقي", "Outstanding")}</th><th>{t("عرض", "View")}</th></tr></thead><tbody>{data.documents.filter(document => document.kind === "sale").map(document => <tr key={document.id}><td>#{document.number}</td><td>{hospitalDate(document.created_at, language)}</td><td>{hospitalMoney(document.total, language)}</td><td>{hospitalMoney(document.outstanding, language)}</td><td><button className={s.secondary} onClick={() => { setPanel(null); setReceiptId(document.id); }}>{t("الإيصال", "Receipt")}</button></td></tr>)}</tbody></table></div></HospitalDialog>}
    {selected && <HospitalOrderPanel key={selected.id} order={selected} snapshot={data} language={language} close={() => setSelected(null)} saved={async id => { setSelected(null); await state.refresh(); void inbox.refresh(); if (id) setReceiptId(id); }} />}
    {shiftForm && <HospitalShiftPanel key={shiftForm} mode={shiftForm} snapshot={data} language={language} state={state} close={() => setShiftForm(null)} />}
    {receipt && <HospitalReceipt document={receipt} snapshot={data} language={language} close={() => setReceiptId(null)} />}
  </main>;
}

function HospitalOrderPanel({ order, snapshot, language, close, saved }: { order: HospitalOrder; snapshot: FinanceSnapshot; language: HospitalLanguage; close: () => void; saved: (id?: string | null) => Promise<void> }) {
  const t = (ar: string, en: string) => hospitalText(language, ar, en);
  const [prices, setPrices] = useState(order.items.map(item => item.maxUnitPrice > item.unitPrice ? "" : String(item.unitPrice)));
  const [method, setMethod] = useState<"cash" | "card" | "credit">("cash"), [accountId, setAccountId] = useState(""), [warehouseId, setWarehouseId] = useState(snapshot.warehouses.find(warehouse => warehouse.active)?.id ?? "");
  const [debtorType, setDebtorType] = useState<"doctor" | "clinic">("doctor"), [partyId, setPartyId] = useState(""), [debtorName, setDebtorName] = useState(order.doctor || order.customerName), [debtorPhone, setDebtorPhone] = useState(order.phone), [note, setNote] = useState("");
  const [customers, setCustomers] = useState<HospitalDebtCustomer[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const shift = snapshot.shifts.find(item => item.user_id === snapshot.userId && item.status === "open" && !item.supervisor_paused);
  const accounts = hospitalCheckoutAccounts(snapshot.accounts, method, shift);
  const chosenAccount = accounts.find(account => account.id === accountId) ?? accounts.find(account => account.is_primary) ?? accounts[0];
  const confirmed = hospitalPricesConfirmed(order.items, prices);
  const totals = previewFinanceTotals(order.items.map((item, index) => ({ quantity: item.quantity, price: prices[index] === "" ? item.unitPrice : Number(prices[index]) || 0 })), 0, snapshot.settings.vat_rate, snapshot.settings.tax_inclusive);
  useEffect(() => {
    let alive = true;
    readHospitalDebtsAction(snapshot.cafe.slug).then(result => { if (alive && result.ok) setCustomers(result.customers); }).catch(() => { /* Existing account selection remains empty; server verifies every submitted account. */ });
    return () => { alive = false; };
  }, [snapshot.cafe.slug]);
  async function command(action: HospitalOrderCommand["action"]) {
    if (lock.current) return;
    if (action === "cancel" && note.trim().length < 3) { setError(t("اكتب سبب الإلغاء في ملاحظة الكاشير قبل إلغاء الطلب", "Enter a cancellation reason in the cashier note before cancelling the order")); return; }
    if (action === "checkout" && (!confirmed || !shift || !warehouseId || (method !== "credit" && !chosenAccount))) { setError(t("راجع الأسعار والوردية وحساب التحصيل قبل حفظ الفاتورة", "Review prices, shift and collection account before saving")); return; }
    if (action === "checkout" && method === "credit" && !partyId && (!debtorName.trim() || (debtorType === "doctor" && !debtorPhone.trim()))) { setError(t("حدد العميل أو أدخل اسم صاحب المديونية وجوال الدكتور", "Select a customer or enter the debtor name and the doctor's mobile number")); return; }
    const payload = { id: order.id, action, note: note.trim(), ...(action === "checkout" ? { paymentMethod: method, warehouseId, shiftId: shift!.id, confirmedPrices: prices.map((price, index) => ({ index, unitPrice: Number(price) })), ...(method === "credit" ? { debtorType, ...(partyId ? { partyId } : { debtorName: debtorName.trim(), debtorPhone: debtorPhone.trim() }) } : { accountId: chosenAccount!.id }) } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await manageHospitalOrderAction(snapshot.cafe.slug, { ...payload, requestId: retry.current.requestId });
      if (!result.ok) { setError(hospitalFailure(language, result.error, result.code)); return; }
      retry.current = null; await saved(action === "checkout" ? result.order.financeDocumentId : undefined);
    } catch { setError(hospitalFailure(language)); }
    finally { lock.current = false; setBusy(false); }
  }
  const unpaid = !order.financeDocumentId && order.status !== "cancelled" && order.status !== "completed";
  return <HospitalDialog language={language} title={`${t("طلب", "Order")} #${order.number}`} busy={busy} close={close}>
    <dl className={s.details}>{[[t("العميل", "Customer"), order.customerName], [t("الجوال", "Mobile"), order.phone], [t("الدور", "Floor"), order.floor], [t("العيادة", "Clinic"), order.clinic], [t("الدكتور", "Doctor"), order.doctor], [t("الحالة", "Status"), t(...orderLabels[order.status])]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
    {order.notes && <p className={s.notice}>{order.notes}</p>}{error && <p className={s.error} role="alert">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void command("checkout"); }} className={s.form}>
      <div className={s.orderItems}>{order.items.map((item, index) => <div className={s.orderItem} key={`${item.productId}:${index}`}><div><strong>{language === "en" && item.nameEn ? item.nameEn : hospitalProductName(item.name, language)}</strong><span>× {item.quantity}</span></div>{unpaid ? <HospitalField label={t("سعر الوحدة المعتمد بالريال", "Confirmed unit price in SAR")}><input type="number" inputMode="decimal" required min={item.unitPrice} max={item.maxUnitPrice} step="0.01" value={prices[index]} disabled={busy || item.maxUnitPrice === item.unitPrice} placeholder={item.maxUnitPrice > item.unitPrice ? `${item.unitPrice} – ${item.maxUnitPrice}` : undefined} onChange={event => setPrices(current => current.map((value, n) => n === index ? event.target.value : value))} />{item.maxUnitPrice > item.unitPrice && <small>{t("أدخل السعر بعد تأكيد الحجم أو الكمية مع العميل", "Confirm the size or portion with the customer, then enter its price")}</small>}</HospitalField> : <p>{hospitalMoney(item.unitPrice, language)}</p>}</div>)}</div>
      {unpaid && <><div className={s.total}><span>{confirmed ? t("الإجمالي شامل الضريبة", "Total including VAT") : t("التقدير حتى تأكيد الأسعار", "Estimate until prices are confirmed")}</span><strong>{hospitalMoney(totals.total, language)}</strong></div><small>{t("ضريبة القيمة المضافة", "VAT")} {snapshot.settings.vat_rate}% · {hospitalMoney(totals.tax, language)}</small><div className={s.paymentMethods}><button type="button" aria-pressed={method === "cash"} onClick={() => { setMethod("cash"); setAccountId(""); }}><Banknote />{t("كاش", "Cash")}</button><button type="button" aria-pressed={method === "card"} onClick={() => { setMethod("card"); setAccountId(""); }}><CreditCard />{t("شبكة", "Card")}</button><button type="button" aria-pressed={method === "credit"} onClick={() => setMethod("credit")}><Wallet />{t("آجل", "Credit")}</button></div><div className={s.fields}><HospitalField label={t("مستودع البيع", "Sales warehouse")}><select required value={warehouseId} onChange={event => setWarehouseId(event.target.value)} disabled={busy}>{snapshot.warehouses.filter(warehouse => warehouse.active).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></HospitalField>{method !== "credit" && <HospitalField label={t("حساب التحصيل", "Collection account")}><select required value={chosenAccount?.id ?? ""} disabled={busy} onChange={event => setAccountId(event.target.value)}><option value="">{t("اختر الحساب", "Select account")}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></HospitalField>}</div>
      {method === "credit" && <><div className={s.fields}><HospitalField label={t("تسجيل المديونية على", "Charge receivable to")}><select value={debtorType} onChange={event => { const type = event.target.value as "doctor" | "clinic"; setDebtorType(type); setPartyId(""); setDebtorName(type === "clinic" ? order.clinic : order.doctor || order.customerName); }}><option value="doctor">{t("الدكتور", "Doctor")}</option><option value="clinic">{t("العيادة", "Clinic")}</option></select></HospitalField><HospitalField label={t("حساب العميل", "Customer account")}><select value={partyId} onChange={event => setPartyId(event.target.value)}><option value="">{t("حساب جديد", "New account")}</option>{customers.filter(customer => customer.debtorType === debtorType).map(customer => <option value={customer.id} key={customer.id}>{customer.name} · {hospitalMoney(customer.balance, language)}</option>)}</select></HospitalField></div>{!partyId && <div className={s.fields}><HospitalField label={t("اسم صاحب المديونية", "Debtor name")}><input required maxLength={120} value={debtorName} onChange={event => setDebtorName(event.target.value)} /></HospitalField><HospitalField label={t("رقم الجوال", "Mobile number")}><input type="tel" required={debtorType === "doctor"} maxLength={30} value={debtorPhone} onChange={event => setDebtorPhone(event.target.value)} /></HospitalField></div>}<p className={s.notice}>{t("تُسجل فاتورة آجلة ومديونية في حساب العميل دون تسجيل مبلغ محصل", "A credit invoice and customer receivable will be recorded without collecting payment")}</p></>}
      <HospitalField label={t("ملاحظة الكاشير", "Cashier note")}><textarea value={note} maxLength={500} onChange={event => setNote(event.target.value)} disabled={busy} /></HospitalField>{!shift && <p className={s.notice}>{t("ابدأ الوردية قبل إصدار الفاتورة", "Open a shift before issuing the invoice")}</p>}<button className={s.primary} disabled={busy || !shift || !confirmed || !warehouseId || (method !== "credit" && !chosenAccount)}><Check size={18} />{busy ? t("جار تسجيل الفاتورة", "Recording invoice") : method === "credit" ? t("تأكيد تسجيل الفاتورة الآجلة", "Confirm credit invoice") : t("تأكيد استلام المبلغ وإصدار الإيصال", "Confirm payment received and issue receipt")}</button></>}
    </form>
    <div className={s.actions}>{order.status === "pending" && <button className={s.secondary} disabled={busy} onClick={() => void command("accept")}>{t("قبول الطلب", "Accept order")}</button>}{order.status === "accepted" && <button className={s.secondary} disabled={busy} onClick={() => void command("prepare")}>{t("بدء التحضير", "Start preparing")}</button>}{order.status === "preparing" && <button className={s.secondary} disabled={busy} onClick={() => void command("ready")}>{t("جاهز للتسليم", "Ready for delivery")}</button>}{(order.status === "ready" || (order.source === "counter" && ["accepted", "preparing"].includes(order.status))) && order.financeDocumentId && <button className={s.primary} disabled={busy} onClick={() => void command("complete")}>{t("تأكيد التسليم", "Confirm delivered")}</button>}{unpaid && <button className={s.danger} disabled={busy} onClick={() => void command("cancel")}>{t("إلغاء الطلب", "Cancel order")}</button>}</div>
    {order.financeDocumentId && <p className={s.success}>{order.paymentStatus === "credit" ? t("تم تسجيل الطلب على حساب العميل الآجل", "This order was invoiced to the customer credit account") : t("تم إصدار فاتورة هذا الطلب", "An invoice has been issued for this order")}</p>}
  </HospitalDialog>;
}

function HospitalShiftPanel({ mode, snapshot, language, state, close }: { mode: "open" | "close" | "opening"; snapshot: FinanceSnapshot; language: HospitalLanguage; state: ReturnType<typeof useFinance>; close: () => void }) {
  const t = (ar: string, en: string) => hospitalText(language, ar, en);
  const [context, setContext] = useState<CashHandoversPage | null>(null), [error, setError] = useState("");
  const [count, setCount] = useState(""), [drawer, setDrawer] = useState(""), [confirmed, setConfirmed] = useState(false), [handover, setHandover] = useState<"next_shift" | "accountant" | "other">("next_shift"), [recipient, setRecipient] = useState(""), [recipientName, setRecipientName] = useState(""), [recipientPhone, setRecipientPhone] = useState(""), [note, setNote] = useState("");
  const [opening, setOpening] = useState<Record<string, string>>({});
  const shift = snapshot.shifts.find(item => item.user_id === snapshot.userId && item.status === "open");
  const title = mode === "opening" ? t("الأرصدة الافتتاحية", "Opening balances") : mode === "open" ? t("بدء وردية", "Open shift") : t("إقفال الوردية", "Close shift");
  useEffect(() => {
    if (mode === "opening") return;
    let alive = true;
    fetchFinanceCashHandoversAction(0, snapshot.cafe.slug).then(result => { if (!alive) return; if (result.ok) setContext(result.data); else setError(hospitalFailure(language, result.message)); }).catch(() => { if (alive) setError(hospitalFailure(language)); });
    return () => { alive = false; };
  }, [mode, snapshot.cafe.slug, language]);
  const drawers = context?.cashierDrawers ?? [], selectedDrawer = drawers.find(item => item.id === drawer) ?? (drawers.filter(item => !item.busy).length === 1 ? drawers.find(item => !item.busy) : undefined);
  const liquid = snapshot.accounts.filter(account => account.active && ["cash", "bank", "pos"].includes(account.kind));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (state.pending) return;
    setError("");
    if (mode === "opening") {
      if (!confirmed || liquid.some(account => opening[account.id] === undefined || !Number.isFinite(Number(opening[account.id])) || Number(opening[account.id]) < 0)) { setError(t("أدخل جميع الأرصدة الفعلية وأكد مراجعتها", "Enter and confirm all actual opening balances")); return; }
      const result = await state.execute("opening_balances", { balances: liquid.map(account => ({ accountId: account.id, amount: Number(opening[account.id]) })), note });
      if (result) close(); return;
    }
    if (count === "" || !Number.isFinite(Number(count)) || Number(count) < 0 || !confirmed) { setError(t("أدخل النقدية المعدودة وأكد مراجعتها", "Enter and confirm the actual cash count")); return; }
    if (mode === "open" && (!selectedDrawer || selectedDrawer.busy)) { setError(t("اختر صندوق كاشير متاحًا", "Select an available cashier drawer")); return; }
    const payload = mode === "open" ? { accountId: selectedDrawer!.id, openingCash: Number(count), note } : { shiftId: shift?.id, countedCash: Number(count), handoverType: Number(count) === 0 ? "no_cash" : handover, ...(Number(count) > 0 && handover === "accountant" ? { recipientUserId: recipient } : Number(count) > 0 && handover === "other" ? { recipientName, recipientPhone } : {}), note };
    const result = await state.execute(mode === "open" ? "shift_open" : "shift_close", payload);
    if (result) close();
  }
  return <HospitalDialog title={title} language={language} busy={state.pending} close={close}><form className={s.form} onSubmit={submit}>
    {(error || state.error) && <p className={s.error} role="alert">{error || hospitalFailure(language, state.error)}</p>}
    {mode === "opening" ? <><p>{t("سجّل النقدية والأرصدة الفعلية لا تُنشأ أرصدة افتراضية", "Record actual cash and account balances")}</p>{liquid.map(account => <HospitalField key={account.id} label={account.name}><input required type="number" min={0} step="0.01" value={opening[account.id] ?? ""} onChange={event => { setOpening(value => ({ ...value, [account.id]: event.target.value })); setConfirmed(false); }} /></HospitalField>)}</> : <>{!context && !error && <p role="status">{t("جار تحميل الصناديق", "Loading drawers")}</p>}{mode === "open" && <HospitalField label={t("صندوق الكاشير", "Cashier drawer")}><select required value={selectedDrawer?.id ?? ""} onChange={event => setDrawer(event.target.value)}><option value="">{t("اختر الصندوق", "Select drawer")}</option>{drawers.map(item => <option value={item.id} key={item.id} disabled={item.busy}>{item.name}{item.busy ? ` · ${t("مشغول", "In use")}` : ""}</option>)}</select></HospitalField>}{mode === "close" && <div className={s.debtSummary}><span>{t("النقدية المتوقعة", "Expected cash")}</span><strong>{hospitalMoney(shift?.expected_cash ?? 0, language)}</strong></div>}<HospitalField label={t("النقدية المعدودة فعليًا", "Actual counted cash")}><input required type="number" min={0} max={999999999} step="0.01" value={count} onChange={event => { setCount(event.target.value); setConfirmed(false); }} /></HospitalField>{mode === "close" && Number(count) > 0 && <><HospitalField label={t("تسليم النقدية", "Cash handover")}><select value={handover} onChange={event => setHandover(event.target.value as typeof handover)}><option value="next_shift">{t("تترك بالصندوق للوردية التالية", "Leave in drawer for next shift")}</option><option value="accountant">{t("تسليم للمحاسب", "Hand over to accountant")}</option><option value="other">{t("تسليم لشخص آخر", "Hand over to another recipient")}</option></select></HospitalField>{handover === "accountant" && <HospitalField label={t("المحاسب المستلم", "Receiving accountant")}><select required value={recipient} onChange={event => setRecipient(event.target.value)}><option value="">{t("اختر المحاسب", "Select accountant")}</option>{context?.accountants.map(item => <option key={item.user_id} value={item.user_id}>{item.name}</option>)}</select></HospitalField>}{handover === "other" && <div className={s.fields}><HospitalField label={t("اسم المستلم", "Recipient name")}><input required maxLength={120} value={recipientName} onChange={event => setRecipientName(event.target.value)} /></HospitalField><HospitalField label={t("جوال المستلم", "Recipient mobile")}><input required type="tel" maxLength={30} value={recipientPhone} onChange={event => setRecipientPhone(event.target.value)} /></HospitalField></div>}</>}</>}
    <HospitalField label={t("ملاحظة", "Note")}><textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></HospitalField><label className={s.check}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("أؤكد مراجعة وعد المبالغ المدخلة", "I confirm the entered amounts have been counted and reviewed")}</label><button className={s.primary} disabled={state.pending || !confirmed || (mode !== "opening" && !context) || (mode === "open" && snapshot.initialized === false)}>{state.pending ? t("جار الحفظ", "Saving") : title}</button>
  </form></HospitalDialog>;
}

function HospitalReceipt({ document, snapshot, language, close }: { document: FinanceDocument; snapshot: FinanceSnapshot; language: HospitalLanguage; close: () => void }) {
  const t = (ar: string, en: string) => hospitalText(language, ar, en);
  const content = useRef<HTMLDivElement>(null), printer = useFinancePrinter(snapshot.cafe.id);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [printed, setPrinted] = useState(false);
  const [brand, setBrand] = useState<ReceiptBrand | null>(null), [brandReady, setBrandReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timeout = setTimeout(() => controller.abort(), 2500);
    fetch(`/api/finance/${encodeURIComponent(snapshot.cafe.slug)}/receipt-brand`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Brand unavailable"); return response.json() as Promise<ReceiptBrand>; })
      .then(value => { if (alive) setBrand(value); }).catch(() => { /* Retain the actual tenant name when its logo is unavailable. */ })
      .finally(() => { clearTimeout(timeout); if (alive) setBrandReady(true); });
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [snapshot.cafe.slug]);
  const customer = snapshot.parties.find(party => party.id === document.party_id), account = snapshot.accounts.find(item => item.id === document.account_id);
  return <HospitalDialog title={`${t("إيصال", "Receipt")} #${document.number}`} language={language} close={close} busy={busy}>
    <div ref={content}><article className={s.receipt} data-finance-receipt dir={language === "ar" ? "rtl" : "ltr"} lang={language}><header data-receipt-header>{brand?.logoUrl && <Image src={brand.logoUrl} alt={brand.name} width={180} height={70} unoptimized style={{ objectFit: "contain", margin: "0 auto 12px" }} />}<h3>{brand?.name || snapshot.cafe.name}</h3><p data-receipt-title>{t("فاتورة مبيعات", "Sales invoice")} #{document.number}</p><p>{hospitalDate(document.created_at, language)}</p></header><div data-receipt-meta>{customer && <p>{t("العميل", "Customer")}: {customer.name}</p>}{document.customer_phone && <p>{t("الجوال", "Mobile")}: <bdi>{document.customer_phone}</bdi></p>}<p>{t("طريقة السداد", "Payment")}: {account ? account.kind === "cash" ? t("كاش", "Cash") : account.kind === "pos" ? t("شبكة", "Card") : account.name : t("آجل", "Credit")}</p></div><table data-receipt-items><thead><tr><th>{t("الصنف", "Item")}</th><th>{t("الكمية", "Qty")}</th><th>{t("الإجمالي", "Total")}</th></tr></thead><tbody>{document.lines.map(line => <tr key={line.id}><td>{hospitalProductName(line.name, language)}<small>{hospitalMoney(line.unit_price, language)}</small></td><td>{line.quantity}</td><td>{hospitalMoney(line.net + line.tax, language)}</td></tr>)}</tbody></table><div data-receipt-row><span>{t("قبل الضريبة", "Before VAT")}</span><b>{hospitalMoney(document.total - document.tax, language)}</b></div><div data-receipt-row><span>{t("ضريبة القيمة المضافة", "VAT")}</span><b>{hospitalMoney(document.tax, language)}</b></div><div data-receipt-row data-receipt-total><span>{t("الإجمالي", "Total")}</span><b>{hospitalMoney(document.total, language)}</b></div><div data-receipt-row><span>{t("المدفوع", "Paid")}</span><b>{hospitalMoney(document.total - document.outstanding, language)}</b></div><div data-receipt-row><span>{t("المتبقي", "Outstanding")}</span><b>{hospitalMoney(document.outstanding, language)}</b></div>{document.note && <p data-receipt-note>{document.note}</p>}<footer data-receipt-footer>{t("شكرًا لزيارتكم", "Thank you for visiting")}</footer></article></div>
    {error && <p className={s.error} role="alert">{error}</p>}{printed && <p className={s.success} role="status">{t("تم فتح مهمة الطباعة تأكد من خروج الورقة", "Print job opened Please verify the printed receipt")}</p>}<div className={s.footerActions}><button className={s.primary} disabled={busy || !printer.ready || !brandReady} onClick={async () => { setBusy(true); setError(""); try { await printer.handler(document.id, false)(content.current, "auto", { newCopy: true }); setPrinted(true); } catch { setError(t("تعذرت الطباعة حاول مجددًا", "Printing failed Please retry")); } finally { setBusy(false); } }}><Printer size={18} />{t("طباعة الإيصال", "Print receipt")}</button></div>
  </HospitalDialog>;
}
