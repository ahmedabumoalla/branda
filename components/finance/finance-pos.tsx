"use client";
import { useFinanceInvoiceMessages } from "./use-finance-invoice-messages";
import { FinanceInvoiceMessageStatus } from "./finance-invoice-message-status";

import Link from "next/link";
import dynamic from "next/dynamic";
import { isHospitalStore } from "@/lib/commerce/hospital-profile";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, CreditCard, Check, Eye, Clock3, ImageIcon, LogOut, Minus, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2 } from "lucide-react";
import { logoutFinanceAction } from "@/app/actions/finance-access";
import { isAldeemCafe } from "@/lib/platform/aldeem";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceDocument, FinanceProduct, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeMoney, getPrimaryFinanceAccount, previewFinanceTotals } from "@/lib/finance/brand-finance";
import { getProductStockQuantity } from "@/lib/finance/pos-offline";
import { butcherStockFactor, financeCartKey, financeProductSelection, financeSelectedCartLines, isButcherFinance, type FinanceCartLine } from "@/lib/finance/pos-product-selection";
import { FinanceOperationForm, type FinanceForm } from "./finance-operation-form";
import { Empty, Field, financeDate, financeDocumentStatus, Numeric } from "./finance-ui";
import { FinanceRefundRequests } from "./finance-refund-requests";
import { FinanceReceiptDialog } from "./finance-receipt-dialog";
import { createFinanceReceiptPreview } from "@/lib/finance/receipt-preview";
import { FinancePosFullscreen } from "./finance-pos-fullscreen";
import { FinancePosActions } from "./finance-pos-actions";
import shiftStyles from "./finance-pos-shift-controls.module.css";
import { FinancePosCustomerField, FinancePosPager, financePosCustomerNotice, usePosCustomer } from "./finance-pos-customer";
import { usePosFinance } from "./use-pos-finance";
import { FinancePosOfflineStatus } from "./finance-pos-offline-status";
import { useFinancePrinter } from "./use-finance-printer";
import styles from "./finance.module.css";
import checkoutStyles from "./finance-pos-checkout.module.css";
import butcherStyles from "./finance-pos-butcher.module.css";

type CartLine = FinanceCartLine;
const quoteOnlyLabel = "بانتظار اعتماد السعر";
type FinancePOSProps = { initialSnapshot: FinanceSnapshot; slug?: string; dashboardHref?: "/dashboard/finance"; offlineEntry?: boolean };
const HospitalPOS = dynamic(() => import("./hospital-pos").then(module => module.HospitalPOS), { loading: () => <p role="status">جار فتح الكاشير / Loading cashier</p> });
export function FinancePOS(props: FinancePOSProps) {
  return isHospitalStore(props.initialSnapshot.cafe.slug) ? <HospitalPOS key={`${props.initialSnapshot.cafe.id}:${props.initialSnapshot.userId}`} initialSnapshot={props.initialSnapshot} slug={props.slug} dashboardHref={props.dashboardHref} /> : <StandardFinancePOS {...props} />;
}
export function financeCartLines(cart: CartLine[], products: FinanceProduct[], butcher = false) {
  return financeSelectedCartLines(cart, products, butcher);
}
export function financeDiscount(subtotal: number, value: number, kind: "amount" | "percent") {
  return Math.round((kind === "percent" ? subtotal * value / 100 : value) * 100) / 100;
}

function CartProductImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.cartProductImage} aria-hidden="true">
    {src && !failed
      ? <Image src={src} alt="" width={44} height={44} unoptimized loading="lazy" onError={() => setFailed(true)} />
      : <ImageIcon size={20} />}
  </span>;
}

export function PosProductImage({ product }: { product: FinanceProduct }) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = fallback ? product.imageFallbackUrl : product.imageUrl;
  if (!src || failed) return <span className={styles.productPlaceholder}><ImageIcon size={30} aria-hidden="true" /></span>;
  return <Image className={styles.productImage} src={src} alt="" width={360} height={300} unoptimized loading="lazy" decoding="async"
    onError={() => { if (!fallback && product.imageFallbackUrl && product.imageFallbackUrl !== src) setFallback(true); else setFailed(true); }} />;
}

function StandardFinancePOS({ initialSnapshot, slug, dashboardHref, offlineEntry = false }: FinancePOSProps) {
  const router = useRouter();
  const state = usePosFinance(initialSnapshot, slug, offlineEntry);
  const printer = useFinancePrinter(initialSnapshot.cafe.id);
  const { snapshot: data, pending, stale, error, message } = state;
  const butcher = isButcherFinance(data);
  const customer = usePosCustomer(slug ?? data.cafe.slug);
  const [pagerRefreshKey, setPagerRefreshKey] = useState(0);
  const [customerNotice, setCustomerNotice] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitProductId, setUnitProductId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [unitQuantity, setUnitQuantity] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">("amount");
  const [paymentKind, setPaymentKind] = useState<"cash" | "pos" | "bank">("cash");
  const [warehouseId, setWarehouseId] = useState(data.warehouses.find((warehouse) => warehouse.active)?.id ?? "");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [form, setForm] = useState<FinanceForm | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [printQueue, setPrintQueue] = useState<string[]>([]);
  const [receiptPreview, setReceiptPreview] = useState<FinanceDocument | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shift = data.shifts.find((item) => item.user_id === data.userId && item.status === "open");
  const outgoing = data.shifts.find((item) => item.user_id === data.userId && item.status === "handover");
  const currentShiftNumber = (shift ?? outgoing)?.shift_number;
  const incoming = data.shifts.filter((item) => item.handover_to === data.userId && item.status === "handover");
  const disabled = pending || stale;
  const lines = useMemo(() => financeCartLines(cart, data.products, butcher), [cart, data.products, butcher]);
  const unitProduct = data.products.find(product => product.id === unitProductId);
  const selectedUnit = unitProduct?.butcherDetails?.units.find(unit => unit.id === selectedUnitId);
  const selectedQuantity = Number(unitQuantity);
  const unitQuantityValid = Number.isFinite(selectedQuantity) && selectedQuantity > 0 && selectedQuantity <= 9999 && Math.abs(selectedQuantity * 1000 - Math.round(selectedQuantity * 1000)) < 0.000001;
  const unitStockCompatible = !unitProduct?.stockTracked || !selectedUnit || butcherStockFactor(unitProduct.butcherDetails!.units[0].id, selectedUnit.id) !== null;
  const cartCount = butcher ? `${cart.length} صنف` : `${cart.reduce((sum, line) => sum + line.quantity, 0)} قطعة`;
  const subtotal = previewFinanceTotals(lines.map(line => ({ quantity: line.quantity, price: line.product.price })), 0, data.settings.vat_rate, data.settings.tax_inclusive).subtotal;
  const pricesChanged = lines.some(line => line.priceChanged);
  const needsShift = !shift && !butcher;
  const checkoutBlocker = pending ? "جار حفظ العملية انتظر حتى تكتمل"
    : stale ? error || "لم يكتمل تجهيز الكاشير حدّث المزامنة قبل الدفع"
    : loggingOut ? "جار تسجيل الخروج"
    : !cart.length ? "أضف منتجًا إلى السلة لبدء الدفع"
    : lines.some(line => line.product.quoteOnly) ? "يوجد صنف بانتظار اعتماد السعر احذفه من السلة أو اطلب تسعيره من المسؤول"
    : pricesChanged ? "اعتمد السعر الجديد للأصناف المتغيرة قبل الدفع"
    : shift?.supervisor_paused ? "الوردية موقوفة إداريًا تواصل مع المسؤول لاستئناف البيع"
    : needsShift && outgoing ? "الوردية بانتظار الاستلام أكمل تسليمها قبل بدء وردية جديدة"
    : needsShift && data.initialized === false ? "يجب تسجيل الأرصدة الافتتاحية من إدارة الوردية قبل بدء البيع"
    : needsShift && incoming.length > 1 ? "اختر الوردية المطلوب استلامها من إدارة الوردية أعلى الصفحة"
    : "";
  const checkoutHint = checkoutBlocker || (needsShift ? "ابدأ الوردية لإكمال الدفع ستبقى أصناف السلة محفوظة أثناء هذه الخطوة" : "");
  const discount = financeDiscount(subtotal, discountValue, discountKind);
  const totals = previewFinanceTotals(lines.map((line) => ({ quantity: line.quantity, price: line.product.price })), discount, data.settings.vat_rate, data.settings.tax_inclusive);
  const categories = [...new Set(data.products.filter((product) => product.available).map((product) => product.category))].filter(Boolean);
  const products = data.products.filter((product) => product.available && (!category || product.category === category) && product.name.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));
  const printId = printQueue[0];
  const printDocument = printId ? data.documents.find((document) => document.id === printId || state.offline.sales.some((sale) => sale.id === printId && sale.document.id === document.id)) : undefined;
  const accounts = data.accounts.filter((account) => account.active && account.kind === paymentKind && (paymentKind !== "cash" || (shift ? account.id === shift.account_id : butcher && account.is_cashier_drawer && account.availableWithoutShift !== false && !data.shifts.some(row => row.account_id === account.id && row.status !== "closed"))));
  const paymentAccountId = getPrimaryFinanceAccount(accounts)?.id;
  const receipt = data.documents.find((document) => document.id === receiptId || state.offline.sales.some((sale) => sale.id === receiptId && sale.document.id === document.id));
  const history = data.documents.filter((document) => document.kind === "sale" && (data.canManage || (butcher && document.created_by === data.userId) || data.shifts.some((item) => item.id === document.shift_id && item.user_id === data.userId)));
  const invoiceMessages = useFinanceInvoiceMessages({ scope: `${data.cafe.id}:${data.userId}`, slug: data.cafe.slug, documentIds: butcher ? [] : history.filter(document => !document.sync_status || document.sync_status === "synced").map(document => document.id), visible: showHistory && !butcher });
  const open = (next: FinanceForm) => { state.clearFeedback(); setLocalError(""); setForm(next); };
  async function finishLogout() {
    if (!slug || loggingOut) return;
    setLoggingOut(true);
    try {
      await state.offline.logout();
      await logoutFinanceAction();
      router.replace(data.role === "cashier" ? "/cashier/login?type=sales" : `/finance/${slug}/login`);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "تعذر تسجيل الخروج حاول مرة أخرى");
      setLoggingOut(false);
    }
  }
  function quantityAvailable(product: FinanceProduct) { return getProductStockQuantity(product, data.stock, warehouseId); }
  function setQuantity(productId: string, quantity: number, unitId?: string, acceptCurrentPrice = false) {
    if (disabled) return;
    const product = data.products.find((item) => item.id === productId);
    if (!product || !Number.isFinite(quantity) || quantity < 0 || quantity > 9999 || (butcher && Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001)) return;
    setLocalError("");
    const key = financeCartKey({ productId, unitId });
    let price: number;
    try { price = financeProductSelection(product, unitId, butcher).product.price; } catch { if (quantity !== 0) return; price = product.price; }
    setCart((current) => quantity === 0 ? current.filter((item) => financeCartKey(item) !== key) : current.some((item) => financeCartKey(item) === key) ? current.map((item) => financeCartKey(item) === key ? { ...item, quantity, ...(butcher && acceptCurrentPrice ? { unitPrice: price } : {}) } : item) : [...current, { productId, quantity, ...(unitId ? { unitId } : {}), ...(butcher ? { unitPrice: price } : {}) }]);
  }
  function addProduct(product: FinanceProduct) {
    if (product.quoteOnly) { setLocalError("هذا المنتج بانتظار اعتماد سعره من إدارة المنتجات ويمكنك إرساله كطلب للمعمل"); return; }
    if (butcher && product.butcherDetails?.units.length) {
      setUnitProductId(product.id); setSelectedUnitId(product.butcherDetails.units[0].id); setUnitQuantity(""); setLocalError("");
    } else setQuantity(product.id, (cart.find(line => line.productId === product.id)?.quantity ?? 0) + 1);
  }
  function addSelectedUnit() {
    if (!unitProduct || !selectedUnit || !unitQuantityValid || !unitStockCompatible) return;
    const currentQuantity = cart.find(line => line.productId === unitProduct.id && line.unitId === selectedUnit.id)?.quantity ?? 0;
    const quantity = Math.round((currentQuantity + selectedQuantity) * 1000) / 1000;
    if (quantity > 9999) { setLocalError("الكمية الإجمالية لهذه الوحدة تتجاوز الحد المسموح"); return; }
    setQuantity(unitProduct.id, quantity, selectedUnit.id, true); setUnitProductId(null);
  }
  useEffect(() => {
    if (!cart.length) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [cart.length]);
  function previewReceipt() {
    setLocalError("");
    try {
      setReceiptPreview(createFinanceReceiptPreview({ lines, settings: data.settings, discount, paymentKind, accountId: paymentAccountId, customerPhone: butcher ? null : customer.normalized, note, createdAt: new Date().toISOString() }));
      setShowCheckout(false);
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "تعذر تجهيز معاينة الإيصال"); }
  }
  function beginCheckout() {
    if (checkoutBlocker) return;
    setLocalError("");
    if (needsShift) {
      open(incoming.length === 1
        ? { operation: "shift_accept", title: "عد النقدية وتأكيد الاستلام", values: { shiftId: incoming[0].id } }
        : { operation: "shift_open", title: "بدء وردية لإكمال الدفع" });
      return;
    }
    setShowCheckout(true);
  }
  async function checkout() {
    if (disabled) return;
    setLocalError("");
    if (pricesChanged) { setLocalError("تغيّر سعر أحد الأصناف اعتمد السعر الجديد في السلة قبل التحصيل"); return; }
    if (!shift && !butcher) { setLocalError("ابدأ وردية مالية قبل تسجيل المبيعات"); return; }
    if (shift?.supervisor_paused) { setLocalError("الوردية موقوفة إداريًا تواصل مع المسؤول لاستئناف البيع"); return; }
    if (!cart.length || lines.length !== cart.length || lines.some((line) => !line.product.available || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 9999)) { setLocalError("راجع أصناف السلة والكميات قبل التحصيل"); return; }
    if (!warehouseId) { setLocalError("اختر مستودع البيع"); return; }
    if (discount < 0 || discount > subtotal || (discountKind === "percent" && discountValue > 100)) { setLocalError("الخصم يجب ألا يتجاوز قيمة المبيعات"); return; }
    if (!paymentAccountId) { setLocalError("أضف حساب تحصيل لهذا النوع من المالية ثم حدّث الأرصدة"); return; }
    let customerPayload: Record<string, unknown>;
    try { customerPayload = butcher ? {} : customer.payload(); } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع رقم العميل قبل حفظ الفاتورة"); return; }
    const saved = await state.execute("sale", { lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, expectedUnitPrice: line.product.price, ...(line.unitId ? { unitId: line.unitId } : {}) })), expectedTotal: totals.total, discount, accountId: paymentAccountId, ...customerPayload, warehouseId, ...(shift ? { shiftId: shift.id } : {}), note });
    if (saved) { setShowCheckout(false); setCart([]); setDiscountValue(0); setNote(""); customer.reset(); setCustomerNotice(financePosCustomerNotice(saved.customer)); setPagerRefreshKey((value) => value + 1); setPrintQueue((queue) => queue.includes(saved.id) ? queue : [...queue, saved.id]); searchRef.current?.focus(); }
  }

  return <div className={`${styles.page} ${styles.posPage}`} dir="rtl">
    <div className={styles.posLayout}>
    <div className={styles.posMain} role="region" aria-label="المنتجات وأدوات الكاشير">
    <div className={styles.posControls}>
    <header className={`${styles.header} ${styles.posHeader} ${shiftStyles.header}`}>
      <div><p className={styles.eyebrow}><ReceiptText size={16} aria-hidden="true" />برندة المالية · {data.cafe.name}</p><h1 className={styles.title}>الكاشير المالي</h1>
        <div className={styles.posShiftMeta} aria-label="الوردية الحالية"><Clock3 size={15} aria-hidden="true" /><span>{shift ? shift.supervisor_paused ? "ورديتك موقوفة إداريًا" : "ورديتك مفتوحة" : outgoing ? "ورديتك بانتظار الاستلام" : butcher ? "البيع متاح والوردية اختيارية" : "ابدأ ورديتك"}</span>{!!currentShiftNumber && <bdi dir="ltr">#{currentShiftNumber}</bdi>}</div>
      </div>
      <div className={`${styles.posHeaderTools} ${shiftStyles.headerTools}`}>
      <div className={shiftStyles.controls} aria-label="إدارة الوردية">
        {!shift && !outgoing && (incoming.length ? incoming.map(item => <button key={item.id} type="button" className={shiftStyles.start} disabled={disabled || !!shift || !!outgoing || loggingOut} title={data.accounts.find(account => account.id === item.account_id)?.name ?? "صندوق الكاشير"} onClick={() => open({ operation: "shift_accept", title: "عد النقدية وتأكيد الاستلام", values: { shiftId: item.id } })}><Plus size={16} aria-hidden="true" />استلام وبدء وردية</button>) : <button type="button" className={shiftStyles.start} disabled={disabled || !!shift || !!outgoing || loggingOut || data.initialized === false} onClick={() => open({ operation: "shift_open", title: "بدء وردية جديدة" })}><Plus size={16} aria-hidden="true" />بدء وردية جديدة</button>)}
        {shift ? <button type="button" className={shiftStyles.end} disabled={disabled || loggingOut || cart.length > 0} title={cart.length ? "احفظ السلة أو أفرغها قبل إنهاء الوردية" : "عد النقدية وحدد جهة التسليم لإقفال الوردية"} onClick={() => open({ operation: "shift_close", title: slug && !butcher ? "إنهاء الوردية وتسجيل الخروج" : "إنهاء الوردية", values: { shiftId: shift.id } })}><LogOut size={16} aria-hidden="true" />إنهاء الوردية</button> : slug && <button type="button" className={shiftStyles.exit} disabled={pending || loggingOut || !!outgoing || cart.length > 0} onClick={finishLogout}><LogOut size={16} aria-hidden="true" />خروج</button>}
      </div>
      {!butcher && <FinancePosPager slug={slug ?? data.cafe.slug} refreshKey={pagerRefreshKey} />}
      {!offlineEntry && isAldeemCafe(data.cafe) && <Link className={styles.secondary} href={`/finance/${data.cafe.slug}/lab`}><Plus size={17} aria-hidden="true" />طلب للمعمل</Link>}
      <FinancePosActions details={shift && <><span>{data.accounts.find((account) => account.id === shift.account_id)?.name ?? "الصندوق"}</span><span>بداية الوردية {financeDate(shift.opened_at)}</span><span>نقدية متوقعة <Numeric value={shift.expected_cash} money /></span></>}>
      <div className={styles.actions} aria-label="أدوات الكاشير والوردية">
        {shift && <button type="button" className={styles.secondary} disabled={disabled || shift.supervisor_paused} onClick={() => open({ operation: "supplier_payout", title: "سداد مورد من الصندوق", values: { shiftId: shift.id } })}>سداد الموردين</button>}
        <button className={styles.secondary} onClick={() => setShowHistory(true)}>سجل المبيعات</button>
        {shift && <button className={styles.secondary} disabled={disabled || shift.supervisor_paused} onClick={() => open({ operation: "shift_purchase", title: "فاتورة مشتريات", values: { shiftId: shift.id } })}>فاتورة مشتريات</button>}
        {data.canManage && <Link href={dashboardHref ?? (slug ? `/finance/${slug}` : "/dashboard/finance")} className={styles.secondary}><ArrowRight size={16} />الإدارة المالية</Link>}
      </div>
      </FinancePosActions>
      <FinancePosFullscreen />
      </div>
    </header>
      <div className={`${styles.toolbar} ${styles.posToolbar}`}><label className={styles.searchBox}><Search size={18} aria-hidden="true" /><input ref={searchRef} className={styles.search} placeholder="ابحث عن صنف" aria-label="البحث عن صنف" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Field label="مستودع البيع"><select value={warehouseId} disabled={disabled} onChange={(event) => setWarehouseId(event.target.value)}>{data.warehouses.filter((warehouse) => warehouse.active).map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></Field></div>
        <div className={styles.categories} aria-label="فئات الأصناف"><button className={styles.category} aria-pressed={!category} onClick={() => setCategory("")}>جميع الأصناف</button>{categories.map((name) => <button key={name} className={styles.category} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    </div>
    <div className={styles.posCatalog} role="region" aria-label="قائمة الأصناف القابلة للتمرير" tabIndex={0}>
    {message && <div className={styles.success} role="status"><Check size={16} style={{ display: "inline", marginInlineEnd: 7 }} aria-hidden="true" />{message}</div>}
    {customerNotice && <div className={styles.notice} role="status">{customerNotice}</div>}
    {(localError || error) && !form && <div className={styles.error} role="alert">{localError || error}</div>}
    {stale && <div className={styles.notice}>توقف تسجيل العمليات حتى تحديث الأرصدة العملية المحفوظة لا تحتاج إلى تكرار</div>}
    {data.initialized === false && <div className={styles.shiftSetup}><div><strong>الأرصدة الافتتاحية لم تسجل بعد</strong><p className={styles.muted}>يُسجل مالك العلامة النقدية الموجودة وأرصدة الشبكة قبل بدء أول وردية</p></div>{data.canInitialize && <button type="button" className={styles.primary} disabled={disabled} onClick={() => open({ operation: "opening_balances", title: "الأرصدة الافتتاحية" })}>تسجيل الأرصدة الافتتاحية</button>}</div>}
      <section aria-label="منتجات المنيو">
        {!products.length ? <div className={styles.panel}><Empty title={data.products.length ? "لا توجد أصناف مطابقة" : "المنيو خالٍ من الأصناف"}>{data.products.length ? "جرّب اسمًا آخر أو اختر جميع الأصناف" : "أضف منتجات العلامة وصورها وأسعارها من إدارة المنيو"}</Empty></div> : <div className={styles.products}>{products.map((product) => {
          const quantity = cart.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
          const stock = quantityAvailable(product);
          return <button type="button" key={product.id} className={styles.product} disabled={disabled || quantity >= 9999 || product.quoteOnly} aria-label={product.quoteOnly ? `${product.name} بانتظار اعتماد السعر` : `إضافة ${product.name} بسعر ${financeMoney(product.price)}`} onClick={() => addProduct(product)}>
            <PosProductImage key={product.imageUrl} product={product} />
            {quantity > 0 && <span className={styles.productQuantity}>{quantity}</span>}<span className={styles.productBody}><span className={styles.productName}>{product.name}</span><span className={styles.productPrice}>{product.quoteOnly ? <span className={styles.muted}>{quoteOnlyLabel}</span> : <>{butcher ? <bdi>{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 6 }).format(product.price)}</bdi> : <Numeric value={product.price} />}<small> ر س</small>{butcher && product.butcherDetails?.units[0] && <small> / {product.butcherDetails.units[0].label}</small>}</>}</span>{product.stockTracked && <span className={stock <= 0 ? styles.negative : styles.muted}>{`رصيد المخزون ${stock}`}</span>}</span>
          </button>;
        })}</div>}
      </section>
      <FinanceRefundRequests snapshot={data} pending={disabled} error={error} onExecute={state.execute} onReceipt={setReceiptId} />
    </div>
    </div>
      <aside className={`${styles.panel} ${styles.cart}`} aria-label="سلة المبيعات"><div className={styles.panelHeader}><h2 className={styles.panelTitle}><ShoppingBag size={18} style={{ display: "inline", marginInlineEnd: 7 }} aria-hidden="true" />طلب جديد</h2><span className={styles.badge}>{cartCount}</span></div>
        <div className={styles.cartBody} role="region" aria-label="الأصناف المختارة القابلة للتمرير" tabIndex={0}>
        {!cart.length ? <Empty title="ابدأ بإضافة صنف">اضغط على صورة الصنف لإضافته إلى السلة</Empty> : <div className={styles.cartLines}>{lines.map((line) => <div className={styles.cartLine} key={financeCartKey(line)}><div className={styles.cartLineDetails}><div className={styles.cartProductIdentity}><CartProductImage key={line.product.imageUrl ?? line.productId} src={line.product.imageUrl} /><div><strong>{line.product.name}</strong><small><Numeric value={line.product.price} money unitPrice={!!line.unitId} /> للوحدة</small>{line.priceChanged && <button type="button" className={butcherStyles.acceptPrice} disabled={disabled} onClick={() => setQuantity(line.productId, line.quantity, line.unitId, true)}>اعتماد السعر الجديد <Numeric value={line.currentUnitPrice} unitPrice /></button>}</div></div><div className={styles.quantity} style={{ marginTop: 10 }}><button type="button" disabled={disabled} aria-label={`تقليل كمية ${line.product.name}`} onClick={() => setQuantity(line.productId, Math.max(0, Math.round((line.quantity - 1) * 1000) / 1000), line.unitId)}><Minus size={14} /></button><input type="number" min="0" max="9999" step={butcher ? "0.001" : "1"} inputMode="decimal" disabled={disabled} value={line.quantity} aria-label={`كمية ${line.product.name}`} onChange={(event) => setQuantity(line.productId, Number(event.target.value), line.unitId)} /><button type="button" disabled={disabled || line.quantity >= 9999} aria-label={`زيادة كمية ${line.product.name}`} onClick={() => setQuantity(line.productId, Math.round((line.quantity + 1) * 1000) / 1000, line.unitId)}><Plus size={14} /></button></div></div><div><strong><Numeric value={line.product.price * line.quantity} money /></strong><button className={styles.iconButton} type="button" disabled={disabled} aria-label={`حذف ${line.product.name}`} onClick={() => setQuantity(line.productId, 0, line.unitId)}><Trash2 size={15} /></button></div></div>)}</div>}
        </div>
        <section className={checkoutStyles.dock} aria-label="ملخص الدفع الثابت">
          <div className={checkoutStyles.amountCard}><div className={checkoutStyles.amountCaption}><span>الإجمالي المستحق</span><small>{cartCount}</small></div><div className={checkoutStyles.amount}><bdi dir="ltr">{new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totals.total)}</bdi><small>ر س</small></div></div>
          {checkoutHint && <p id="pos-checkout-hint" className={checkoutStyles.hint} role="status">{checkoutHint}</p>}
          <button type="button" className={styles.primary} disabled={!!checkoutBlocker} aria-describedby={checkoutHint ? "pos-checkout-hint" : undefined} onClick={beginCheckout}>{needsShift && !checkoutBlocker ? "بدء الوردية ومتابعة الدفع" : "الدفع وإصدار الإيصال"}<ArrowRight size={18} aria-hidden="true" /></button>
          <div className={checkoutStyles.utilities}>
            <button type="button" className={styles.secondary} disabled={disabled || !cart.length} onClick={() => { setCart([]); setDiscountValue(0); setLocalError(""); }}><Trash2 size={15} aria-hidden="true" />إفراغ السلة</button>
            <div className={shiftStyles.syncTools}><button type="button" className={styles.iconButton} disabled={pending || state.offline.syncing || loggingOut} aria-label="تحديث ومزامنة الكاشير" title="تحديث ومزامنة الكاشير" onClick={state.refresh}><RefreshCw size={18} aria-hidden="true" /></button><FinancePosOfflineStatus state={state.offline} /></div>
          </div>
        </section>
      </aside>
    </div>
    <Modal open={!!unitProduct} title={unitProduct?.name ?? "وحدة البيع"} onClose={() => setUnitProductId(null)} panelClassName={checkoutStyles.dialog} footer={<button type="button" className={styles.primary} disabled={disabled || !selectedUnit || !unitQuantityValid || !unitStockCompatible} onClick={addSelectedUnit}><Plus size={18} aria-hidden="true" />إضافة إلى الطلب</button>}>
      <div className={butcherStyles.form}>
        {localError && <p className={styles.error} role="alert">{localError}</p>}
        <fieldset className={butcherStyles.units}><legend>اختر وحدة البيع</legend>{unitProduct?.butcherDetails?.units.map(unit => {
          const compatible = !unitProduct.stockTracked || butcherStockFactor(unitProduct.butcherDetails!.units[0].id, unit.id) !== null;
          return <button key={unit.id} type="button" className={butcherStyles.unit} aria-pressed={unit.id === selectedUnitId} disabled={!compatible || disabled} title={!compatible ? "هذه الوحدة تحتاج ربط مخزون متوافق" : undefined} onClick={() => { if (unit.id !== selectedUnitId) setUnitQuantity(""); setSelectedUnitId(unit.id); }}><strong className={butcherStyles.unitName}><i className={butcherStyles.selectionMark} aria-hidden="true">{unit.id === selectedUnitId && <Check size={18} strokeWidth={3} />}</i>{unit.label}</strong><span className={butcherStyles.unitPrice}><bdi>{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 6 }).format(unit.price)}</bdi>ر س</span></button>;
        })}</fieldset>
        <div className={butcherStyles.quantity}><Field label={`الكمية${selectedUnit ? ` بالـ${selectedUnit.label}` : ""}`}><input type="number" inputMode="decimal" min="0.001" max="9999" step="0.001" placeholder="أدخل الكمية" value={unitQuantity} disabled={disabled} aria-invalid={unitQuantity !== "" && !unitQuantityValid} aria-describedby="butcher-quantity-hint" onChange={event => setUnitQuantity(event.target.value)} /></Field><small id="butcher-quantity-hint" className={styles.muted}>يمكن إدخال أجزاء الوحدة حتى ثلاث خانات عشرية</small></div>
        {unitQuantity !== "" && !unitQuantityValid && <p className={styles.error} role="alert">أدخل كمية بين ٠٫٠٠١ و٩٩٩٩ بحد أقصى ثلاث خانات عشرية</p>}
        <div className={butcherStyles.total}><span>قيمة الصنف</span><Numeric value={unitQuantityValid && selectedUnit ? Math.round((selectedUnit.price * selectedQuantity + Number.EPSILON) * 100) / 100 : 0} money /></div>
      </div>
    </Modal>
    <Modal open={showCheckout} title="الدفع وإصدار الإيصال" onClose={() => { if (!pending) setShowCheckout(false); }} panelClassName={checkoutStyles.dialog} footer={<div className={checkoutStyles.footer}>
      <div className={checkoutStyles.amountCard}><div className={checkoutStyles.amountCaption}><span>الإجمالي المستحق</span><small>{cartCount}</small></div><div className={checkoutStyles.amount}><bdi dir="ltr">{new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totals.total)}</bdi><small>ر س</small></div></div>
      <div className={checkoutStyles.footerActions}>
        {checkoutHint && <p className={checkoutStyles.hint} role="status">{checkoutHint}</p>}
        <button type="button" className={styles.primary} disabled={!!checkoutBlocker || needsShift} onClick={checkout}>{pending ? "جار تسجيل العملية" : "تأكيد الاستلام وإصدار إيصال"}<Check size={17} aria-hidden="true" /></button>
        <button type="button" className={styles.secondary} disabled={pending || !lines.length} onClick={previewReceipt}><Eye size={18} aria-hidden="true" />معاينة الإيصال</button>
      </div>
    </div>}>
      {(localError || error) && <div className={styles.error} role="alert">{localError || error}</div>}
      {pricesChanged && <div className={styles.notice} role="alert">تغيّر سعر أحد الأصناف أغلق نافذة الدفع وراجع السعر الجديد في السلة قبل التحصيل</div>}
      {stale && <div className={styles.notice}>توقف تسجيل العمليات حتى تحديث الأرصدة</div>}
        <div className={checkoutStyles.body}><section className={checkoutStyles.breakdown} aria-label="الخصم وتفاصيل المبلغ"><h3 className={checkoutStyles.sectionTitle}>الخصم وتفاصيل المبلغ</h3><div className={styles.fields}><Field label="الخصم"><input type="number" min="0" max={discountKind === "percent" ? 100 : subtotal} step="0.01" value={discountValue} disabled={disabled} onChange={(event) => setDiscountValue(Number(event.target.value))} /></Field><Field label="نوع الخصم"><select value={discountKind} disabled={disabled} onChange={(event) => setDiscountKind(event.target.value as "amount" | "percent")}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></Field></div>
          <div className={styles.balanceLine}><span>قبل الخصم</span><Numeric value={totals.subtotal} money /></div><div className={styles.balanceLine}><span>الخصم</span><Numeric value={discount} money /></div><div className={styles.balanceLine}><span>الضريبة {data.settings.vat_rate}% {data.settings.tax_inclusive ? "ضمن السعر" : ""}</span><Numeric value={totals.tax} money /></div></section><section className={checkoutStyles.payment} aria-label="الدفع وبيانات العميل">
          <div className={`${styles.form} ${styles.cartFields}`}><fieldset className={styles.paymentMethods} disabled={disabled}>
              <legend>طريقة السداد</legend>
              <div className={styles.paymentChoices}>
                <button type="button" className={styles.paymentChoice} aria-pressed={paymentKind === "cash"} onClick={() => { if (paymentKind !== "cash") { setPaymentKind("cash"); } }}><Banknote size={27} aria-hidden="true" /><span>كاش</span>{paymentKind === "cash" && <Check size={14} className={styles.paymentSelected} aria-hidden="true" />}</button>
                <button type="button" className={styles.paymentChoice} aria-pressed={paymentKind === "pos"} onClick={() => { if (paymentKind !== "pos") { setPaymentKind("pos"); } }}><CreditCard size={27} aria-hidden="true" /><span>شبكة</span>{paymentKind === "pos" && <Check size={14} className={styles.paymentSelected} aria-hidden="true" />}</button>
              </div>
              <details className={styles.paymentOther}>
                <summary>{paymentKind === "bank" ? "تحويل بنكي" : "طرق سداد أخرى"}</summary>
                <div className={styles.paymentChoices}>
                  <button type="button" aria-pressed={paymentKind === "bank"} onClick={() => { if (paymentKind !== "bank") { setPaymentKind("bank"); } }}>تحويل بنكي</button>
                </div>
              </details>
            </fieldset>
            {!butcher && <FinancePosCustomerField state={customer} disabled={disabled} />}
            <Field label="ملاحظة الطلب"><input maxLength={500} value={note} disabled={disabled} onChange={(event) => setNote(event.target.value)} /></Field>
          </div>
          {paymentKind === "pos" && <p className={styles.notice} style={{ marginTop: 14 }}>أكمل الدفع على جهاز الشبكة وتأكد من نجاحه قبل تسجيل البيع هنا</p>}
          {paymentKind === "bank" && <p className={styles.notice} style={{ marginTop: 14 }}>تحقق من وصول التحويل البنكي قبل تسجيل البيع</p>}
        </section></div>
    </Modal>
    <Modal open={!!form} title={form?.title ?? "الوردية"} onClose={() => { if (!pending && !operationBusy) setForm(null); }} panelClassName={["refund", "shift_purchase"].includes(form?.operation ?? "") ? styles.invoicePanel : styles.shiftDialog}>{form && <FinanceOperationForm key={form.operation} form={form} snapshot={data} pending={pending} error={error} onInventoryBusyChange={setOperationBusy} onInventorySaved={state.applyInventoryCatalog} onInventoryUnitsChanged={state.applyInventoryUnits} onCancel={() => setForm(null)} onSubmit={async (operation, payload) => { const saved = await state.execute(operation, payload); if (saved) { setForm(null); if (operation === "shift_close" && slug && !butcher) await finishLogout(); if (operation === "refund" && saved.status !== "pending") setReceiptId(saved.id); } return !!saved; }} />}</Modal>
    <Modal open={showHistory} title="سجل المبيعات" onClose={() => setShowHistory(false)} panelClassName="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">{!butcher && <div className={styles.actions}><button type="button" className={styles.secondary} disabled={invoiceMessages.loading || !history.length} onClick={() => void invoiceMessages.refresh()}><RefreshCw size={16} aria-hidden="true" />تحديث حالة الرسائل</button></div>}{data.truncated && <p className={styles.notice}>يعرض السجل أحدث العمليات المتاحة</p>}{!history.length ? <Empty title="لا توجد مبيعات مسجلة" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>المستند</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th>{!butcher && <th>واتساب</th>}<th>الإجراء</th></tr></thead><tbody>{history.map((document) => <tr key={document.id}><td>{document.number ? `#${document.number}` : document.local_reference}{document.sync_status && document.sync_status !== "synced" && <small className={styles.muted}> بانتظار المزامنة</small>}</td><td>{financeDate(document.created_at)}</td><td><Numeric value={document.total} money /></td><td>{financeDocumentStatus(document)}</td>{!butcher && <td><FinanceInvoiceMessageStatus entry={invoiceMessages.entries[document.id]} offline={document.sync_status === "queued" || document.sync_status === "conflict"} /></td>}<td><div className={styles.actions}><button className={styles.secondary} onClick={() => { setShowHistory(false); setReceiptId(document.id); }}>الإيصال</button>{!document.refunded && (!document.sync_status || document.sync_status === "synced") && <button className={styles.danger} disabled={disabled} onClick={() => { setShowHistory(false); open({ operation: "refund", title: `مرتجع مبيعات #${document.number}`, values: { documentId: document.id } }); }}>إرجاع</button>}</div></td></tr>)}</tbody></table></div>}</Modal>
    {receiptPreview && <FinanceReceiptDialog preview receiptBrand={state.offline.brand} document={receiptPreview} snapshot={data} onClose={() => setReceiptPreview(null)} />}
    {printDocument && printer.ready && <FinanceReceiptDialog key={`${data.cafe.id}:automatic:${printId}`} document={printDocument} snapshot={data} receiptBrand={state.offline.brand} autoPrint={printer.autoEnabled} backgroundAutoPrint autoPrintKey={printId} onPrint={printer.handler(printId, true)} onClose={() => setPrintQueue((queue) => queue.filter((id) => id !== printId))} />}
    {receipt && <FinanceReceiptDialog key={`${data.cafe.id}:${receiptId}`} document={receipt} snapshot={data} receiptBrand={state.offline.brand} onPrint={printer.handler(receiptId ?? receipt.id, false)} onClose={() => setReceiptId(null)} />}
  </div>;
}
