"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, CreditCard, Check, Eye, Clock3, ImageIcon, LogOut, Minus, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2 } from "lucide-react";
import { logoutFinanceAction } from "@/app/actions/finance-access";
import { Modal } from "@/components/dashboard/ui/modal";
import type { FinanceDocument, FinanceProduct, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeMoney, getPrimaryFinanceAccount, previewFinanceTotals } from "@/lib/finance/brand-finance";
import { FinanceOperationForm, type FinanceForm } from "./finance-operation-form";
import { Empty, Field, financeDate, financeDocumentStatus, Numeric } from "./finance-ui";
import { FinanceRefundRequests } from "./finance-refund-requests";
import { FinanceReceiptDialog } from "./finance-receipt-dialog";
import { createFinanceReceiptPreview } from "@/lib/finance/receipt-preview";
import { FinancePosCustomerField, FinancePosPager, financePosCustomerNotice, usePosCustomer } from "./finance-pos-customer";
import { usePosFinance } from "./use-pos-finance";
import { FinancePosOfflineStatus } from "./finance-pos-offline-status";
import { useFinancePrinter } from "./use-finance-printer";
import styles from "./finance.module.css";

type CartLine = { productId: string; quantity: number };
export function financeCartLines(cart: CartLine[], products: FinanceProduct[]) {
  return cart.flatMap((line) => { const product = products.find((item) => item.id === line.productId); return product ? [{ ...line, product }] : []; });
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

export function FinancePOS({ initialSnapshot, slug, dashboardHref, offlineEntry = false }: { initialSnapshot: FinanceSnapshot; slug?: string; dashboardHref?: "/dashboard/finance"; offlineEntry?: boolean }) {
  const router = useRouter();
  const state = usePosFinance(initialSnapshot, slug, offlineEntry);
  const printer = useFinancePrinter(initialSnapshot.cafe.id);
  const { snapshot: data, pending, stale, error, message } = state;
  const customer = usePosCustomer(slug ?? data.cafe.slug);
  const [pagerRefreshKey, setPagerRefreshKey] = useState(0);
  const [customerNotice, setCustomerNotice] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">("amount");
  const [paymentKind, setPaymentKind] = useState("cash");
  const [accountId, setAccountId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [warehouseId, setWarehouseId] = useState(data.warehouses.find((warehouse) => warehouse.active)?.id ?? "");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const [form, setForm] = useState<FinanceForm | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [autoPrintId, setAutoPrintId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<FinanceDocument | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const shift = data.shifts.find((item) => item.user_id === data.userId && item.status === "open");
  const outgoing = data.shifts.find((item) => item.user_id === data.userId && item.status === "handover");
  const currentShiftNumber = (shift ?? outgoing)?.shift_number;
  const incoming = data.shifts.filter((item) => item.handover_to === data.userId && item.status === "handover");
  const disabled = pending || stale;
  const lines = useMemo(() => financeCartLines(cart, data.products), [cart, data.products]);
  const subtotal = Math.round(lines.reduce((sum, line) => sum + Math.round(line.quantity * line.product.price * 100) / 100, 0) * 100) / 100;
  const discount = financeDiscount(subtotal, discountValue, discountKind);
  const totals = previewFinanceTotals(lines.map((line) => ({ quantity: line.quantity, price: line.product.price })), discount, data.settings.vat_rate, data.settings.tax_inclusive);
  const categories = [...new Set(data.products.filter((product) => product.available).map((product) => product.category))].filter(Boolean);
  const products = data.products.filter((product) => product.available && (!category || product.category === category) && product.name.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));
  const accounts = data.accounts.filter((account) => account.active && account.kind === paymentKind && (paymentKind !== "cash" || account.id === shift?.account_id));
  const paymentAccountId = accounts.some((account) => account.id === accountId) ? accountId : getPrimaryFinanceAccount(accounts)?.id;
  const receipt = data.documents.find((document) => document.id === receiptId || state.offline.sales.some((sale) => sale.id === receiptId && sale.document.id === document.id));
  const history = data.documents.filter((document) => document.kind === "sale" && (data.canManage || data.shifts.some((item) => item.id === document.shift_id && item.user_id === data.userId)));
  const open = (next: FinanceForm) => { state.clearFeedback(); setLocalError(""); setForm(next); };
  function quantityAvailable(product: FinanceProduct) { return product.stockTracked ? data.stock.find((stock) => stock.item_id === product.itemId && stock.warehouse_id === warehouseId)?.quantity ?? 0 : Infinity; }
  function setQuantity(productId: string, quantity: number) {
    if (disabled) return;
    const product = data.products.find((item) => item.id === productId);
    if (!product || !Number.isFinite(quantity) || quantity < 0 || quantity > 9999) return;
    if (quantity > quantityAvailable(product)) { setLocalError(`الكمية المتاحة من ${product.name} أقل من المطلوب`); return; }
    setLocalError("");
    setCart((current) => quantity === 0 ? current.filter((item) => item.productId !== productId) : current.some((item) => item.productId === productId) ? current.map((item) => item.productId === productId ? { ...item, quantity } : item) : [...current, { productId, quantity }]);
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
      setReceiptPreview(createFinanceReceiptPreview({ lines, settings: data.settings, discount, paymentKind, accountId: paymentAccountId, partyId, customerPhone: customer.normalized, note, createdAt: new Date().toISOString() }));
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "تعذر تجهيز معاينة الإيصال"); }
  }
  async function checkout() {
    if (disabled) return;
    setLocalError("");
    if (!shift) { setLocalError("ابدأ وردية مالية قبل تسجيل المبيعات"); return; }
    if (!cart.length || lines.length !== cart.length || lines.some((line) => !line.product.available || line.quantity <= 0 || line.quantity > quantityAvailable(line.product))) { setLocalError("راجع أصناف السلة والكميات المتاحة قبل التحصيل"); return; }
    if (!warehouseId) { setLocalError("اختر مستودع البيع"); return; }
    if (discount < 0 || discount > subtotal || (discountKind === "percent" && discountValue > 100)) { setLocalError("الخصم يجب ألا يتجاوز قيمة المبيعات"); return; }
    if (paymentKind === "credit" && !partyId) { setLocalError("اختر العميل لتسجيل المبيعات الآجلة"); return; }
    if (paymentKind !== "credit" && !paymentAccountId) { setLocalError("أضف حساب تحصيل لهذا النوع من المالية ثم حدّث الأرصدة"); return; }
    let customerPayload: Record<string, unknown>;
    try { customerPayload = customer.payload(); } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع رقم العميل قبل حفظ الفاتورة"); return; }
    const saved = await state.execute("sale", { lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, expectedUnitPrice: line.product.price })), expectedTotal: totals.total, discount, ...(paymentKind !== "credit" ? { accountId: paymentAccountId } : {}), ...(partyId ? { partyId } : {}), ...customerPayload, warehouseId, shiftId: shift.id, note });
    if (saved) { setCart([]); setDiscountValue(0); setPartyId(""); setNote(""); customer.reset(); setCustomerNotice(financePosCustomerNotice(saved.customer)); setPagerRefreshKey((value) => value + 1); setReceiptId(saved.id); setAutoPrintId(saved.id); searchRef.current?.focus(); }
  }

  return <div className={`${styles.page} ${styles.posPage}`} dir="rtl">
    <div className={styles.posLayout}>
    <div className={styles.posMain} role="region" aria-label="المنتجات وأدوات الكاشير" tabIndex={0}>
    <header className={`${styles.header} ${styles.posHeader}`}>
      <div><p className={styles.eyebrow}><ReceiptText size={16} aria-hidden="true" />برندة المالية · {data.cafe.name}</p><h1 className={styles.title}>الكاشير المالي</h1>
        <div className={styles.posShiftMeta} aria-label="الوردية الحالية"><Clock3 size={15} aria-hidden="true" /><span>{shift ? "ورديتك مفتوحة" : outgoing ? "ورديتك بانتظار الاستلام" : "ابدأ ورديتك"}</span>{!!currentShiftNumber && <bdi dir="ltr">#{currentShiftNumber}</bdi>}{shift && <><span>{data.accounts.find((account) => account.id === shift.account_id)?.name ?? "الصندوق"} · {financeDate(shift.opened_at)}</span><span>نقدية متوقعة <Numeric value={shift.expected_cash} money /></span></>}</div>
      </div>
      <div className={styles.actions} aria-label="أدوات الكاشير والوردية">
        {shift ? <><button className={styles.secondary} disabled={disabled || cart.length > 0} onClick={() => open({ operation: "shift_handover", title: "تسليم الوردية", values: { shiftId: shift.id, expectedCash: shift.expected_cash } })}>تسليم الوردية</button><button className={styles.primary} disabled={disabled || cart.length > 0} onClick={() => open({ operation: "shift_close", title: "إقفال الوردية", values: { shiftId: shift.id, expectedCash: shift.expected_cash } })}>نهاية الوردية</button></> : !outgoing && <button className={styles.primary} disabled={disabled || incoming.length > 0} onClick={() => open({ operation: "shift_open", title: "بداية وردية مالية" })}><Plus size={16} />بداية وردية</button>}
      <button className={styles.secondary} onClick={() => setShowHistory(true)}>سجل المبيعات</button>
      <FinancePosPager slug={slug ?? data.cafe.slug} refreshKey={pagerRefreshKey} />
      {incoming.map((item) => <button key={item.id} disabled={disabled || !!shift} className={styles.primary} title={`وردية ${item.shift_number ?? ""} — ${data.accounts.find((account) => account.id === item.account_id)?.name ?? "الصندوق"} — النقدية المسلمة ${financeMoney(item.counted_cash ?? 0)}`} onClick={() => open({ operation: "shift_accept", title: "استلام الوردية", values: { shiftId: item.id, expectedCash: item.counted_cash ?? item.expected_cash } })}>عد النقدية واستلم</button>)}
        {data.canManage && <Link href={dashboardHref ?? (slug ? `/finance/${slug}` : "/dashboard/finance")} className={styles.secondary}><ArrowRight size={16} />الإدارة المالية</Link>}<button className={styles.iconButton} disabled={pending} aria-label="تحديث الأسعار والأرصدة" onClick={state.refresh}><RefreshCw size={18} /></button>{slug && <button className={styles.secondary} disabled={disabled || loggingOut || cart.length > 0} title={cart.length ? "احفظ السلة أو أفرغها قبل الخروج" : undefined} onClick={async () => { setLoggingOut(true); try { await state.offline.logout(); await logoutFinanceAction(); router.replace(data.role === "cashier" ? "/cashier/login?type=sales" : `/finance/${slug}/login`); } catch { setLocalError("تعذر تسجيل الخروج حاول مرة أخرى"); setLoggingOut(false); } }}><LogOut size={16} />خروج</button>}
      </div>
    </header>
    {message && <div className={styles.success} role="status"><Check size={16} style={{ display: "inline", marginInlineEnd: 7 }} aria-hidden="true" />{message}</div>}
    {customerNotice && <div className={styles.notice} role="status">{customerNotice}</div>}
    {(localError || error) && !form && <div className={styles.error} role="alert">{localError || error}</div>}
    {stale && <div className={styles.notice}>توقف تسجيل العمليات حتى تحديث الأرصدة العملية المحفوظة لا تحتاج إلى تكرار</div>}
      <section aria-label="منتجات المنيو"><div className={styles.toolbar}><label className={styles.searchBox}><Search size={18} aria-hidden="true" /><input ref={searchRef} className={styles.search} placeholder="ابحث عن صنف" aria-label="البحث عن صنف" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Field label="مستودع البيع"><select value={warehouseId} disabled={disabled} onChange={(event) => setWarehouseId(event.target.value)}>{data.warehouses.filter((warehouse) => warehouse.active).map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></Field></div>
        <div className={styles.categories} aria-label="فئات الأصناف"><button className={styles.category} aria-pressed={!category} onClick={() => setCategory("")}>جميع الأصناف</button>{categories.map((name) => <button key={name} className={styles.category} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
        {!products.length ? <div className={styles.panel}><Empty title={data.products.length ? "لا توجد أصناف مطابقة" : "المنيو خالٍ من الأصناف"}>{data.products.length ? "جرّب اسمًا آخر أو اختر جميع الأصناف" : "أضف منتجات العلامة وصورها وأسعارها من إدارة المنيو"}</Empty></div> : <div className={styles.products}>{products.map((product) => {
          const quantity = cart.find((line) => line.productId === product.id)?.quantity ?? 0;
          const stock = quantityAvailable(product);
          return <button type="button" key={product.id} className={styles.product} disabled={disabled || stock <= quantity} aria-label={`إضافة ${product.name} بسعر ${financeMoney(product.price)}`} onClick={() => setQuantity(product.id, quantity + 1)}>
            {product.imageUrl ? <Image className={styles.productImage} src={product.imageUrl} alt="" width={360} height={300} unoptimized loading="lazy" /> : <span className={styles.productPlaceholder}><ImageIcon size={30} aria-hidden="true" /></span>}
            {quantity > 0 && <span className={styles.productQuantity}>{quantity}</span>}<span className={styles.productBody}><span className={styles.productName}>{product.name}</span><span className={styles.productPrice}><Numeric value={product.price} /><small> ر س</small></span>{product.stockTracked && <span className={styles.muted}>{stock <= 0 ? "نفدت الكمية" : `متاح ${stock}`}</span>}</span>
          </button>;
        })}</div>}
      </section>
      <FinanceRefundRequests snapshot={data} pending={disabled} error={error} onExecute={state.execute} onReceipt={setReceiptId} />
    </div>
      <aside className={`${styles.panel} ${styles.cart}`} aria-label="سلة المبيعات"><div className={styles.panelHeader}><h2 className={styles.panelTitle}><ShoppingBag size={18} style={{ display: "inline", marginInlineEnd: 7 }} aria-hidden="true" />طلب جديد</h2><span className={styles.badge}>{cart.reduce((sum, line) => sum + line.quantity, 0)} قطعة</span></div>
        <div className={styles.cartBody} role="region" aria-label="محتويات الطلب والمبلغ" tabIndex={0}>
        {!cart.length ? <Empty title="ابدأ بإضافة صنف">اضغط على صورة الصنف لإضافته إلى السلة</Empty> : <div className={styles.cartLines}>{lines.map((line) => <div className={styles.cartLine} key={line.productId}><div className={styles.cartLineDetails}><div className={styles.cartProductIdentity}><CartProductImage key={line.product.imageUrl ?? line.productId} src={line.product.imageUrl} /><div><strong>{line.product.name}</strong><small><Numeric value={line.product.price} money /> للوحدة</small></div></div><div className={styles.quantity} style={{ marginTop: 10 }}><button type="button" disabled={disabled} aria-label={`تقليل كمية ${line.product.name}`} onClick={() => setQuantity(line.productId, line.quantity - 1)}><Minus size={14} /></button><input type="number" min="0" max="9999" step="1" disabled={disabled} value={line.quantity} aria-label={`كمية ${line.product.name}`} onChange={(event) => setQuantity(line.productId, Number(event.target.value))} /><button type="button" disabled={disabled || line.quantity >= quantityAvailable(line.product)} aria-label={`زيادة كمية ${line.product.name}`} onClick={() => setQuantity(line.productId, line.quantity + 1)}><Plus size={14} /></button></div></div><div><strong><Numeric value={line.product.price * line.quantity} money /></strong><button className={styles.iconButton} type="button" disabled={disabled} aria-label={`حذف ${line.product.name}`} onClick={() => setQuantity(line.productId, 0)}><Trash2 size={15} /></button></div></div>)}</div>}
        <div className={styles.cartSummary}><div className={styles.fields}><Field label="الخصم"><input type="number" min="0" max={discountKind === "percent" ? 100 : subtotal} step="0.01" value={discountValue} disabled={disabled} onChange={(event) => setDiscountValue(Number(event.target.value))} /></Field><Field label="نوع الخصم"><select value={discountKind} disabled={disabled} onChange={(event) => setDiscountKind(event.target.value as "amount" | "percent")}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></Field></div>
          <div className={styles.balanceLine}><span>قبل الخصم</span><Numeric value={totals.subtotal} money /></div><div className={styles.balanceLine}><span>الخصم</span><Numeric value={discount} money /></div><div className={styles.balanceLine}><span>الضريبة {data.settings.vat_rate}% {data.settings.tax_inclusive ? "ضمن السعر" : ""}</span><Numeric value={totals.tax} money /></div><div className={`${styles.balanceLine} ${styles.total}`}><span>الإجمالي</span><Numeric value={totals.total} money /></div>
          <div className={`${styles.form} ${styles.cartFields}`}><fieldset className={styles.paymentMethods} disabled={disabled}>
              <legend>طريقة السداد</legend>
              <div className={styles.paymentChoices}>
                <button type="button" className={styles.paymentChoice} aria-pressed={paymentKind === "cash"} onClick={() => { if (paymentKind !== "cash") { setPaymentKind("cash"); setAccountId(""); } }}><Banknote size={27} aria-hidden="true" /><span>كاش</span>{paymentKind === "cash" && <Check size={14} className={styles.paymentSelected} aria-hidden="true" />}</button>
                <button type="button" className={styles.paymentChoice} aria-pressed={paymentKind === "pos"} onClick={() => { if (paymentKind !== "pos") { setPaymentKind("pos"); setAccountId(""); } }}><CreditCard size={27} aria-hidden="true" /><span>شبكة</span>{paymentKind === "pos" && <Check size={14} className={styles.paymentSelected} aria-hidden="true" />}</button>
              </div>
              <details className={styles.paymentOther}>
                <summary>{paymentKind === "bank" ? "تحويل بنكي" : paymentKind === "credit" ? "آجل على العميل" : "طرق سداد أخرى"}</summary>
                <div className={styles.paymentChoices}>
                  <button type="button" aria-pressed={paymentKind === "bank"} onClick={() => { if (paymentKind !== "bank") { setPaymentKind("bank"); setAccountId(""); } }}>تحويل بنكي</button>
                  <button type="button" aria-pressed={paymentKind === "credit"} onClick={() => { if (paymentKind !== "credit") { setPaymentKind("credit"); setAccountId(""); } }}>آجل على العميل</button>
                </div>
              </details>
            </fieldset>
            {paymentKind !== "credit" && <Field label="حساب التحصيل"><select disabled={disabled} value={paymentAccountId ?? ""} onChange={(event) => setAccountId(event.target.value)}><option value="">اختر الحساب</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>}
            <Field label={paymentKind === "credit" ? "العميل مطلوب للبيع الآجل" : "العميل اختياري"}><select value={partyId} disabled={disabled} onChange={(event) => setPartyId(event.target.value)}><option value="">عميل نقدي</option>{data.parties.filter((party) => party.kind === "customer" && party.active).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
            <FinancePosCustomerField state={customer} disabled={disabled} />
            <Field label="ملاحظة الطلب"><input maxLength={500} value={note} disabled={disabled} onChange={(event) => setNote(event.target.value)} /></Field>
          </div>
          {paymentKind === "pos" && <p className={styles.notice} style={{ marginTop: 14 }}>أكمل الدفع على جهاز الشبكة وتأكد من نجاحه قبل تسجيل البيع هنا</p>}
          {paymentKind === "bank" && <p className={styles.notice} style={{ marginTop: 14 }}>تحقق من وصول التحويل البنكي قبل تسجيل البيع</p>}
        </div>
        </div>
        <div className={styles.cartFooter}>
          <button type="button" className={`${styles.secondary} ${styles.payButton}`} disabled={pending || !lines.length} onClick={previewReceipt}><Eye size={19} aria-hidden="true" />معاينة الإيصال</button>
          <button className={`${styles.primary} ${styles.payButton}`} disabled={disabled || !cart.length || !shift} onClick={checkout}>{pending ? "جار تسجيل العملية" : paymentKind === "credit" ? "تسجيل المبيعات الآجلة" : "تأكيد الاستلام وإصدار إيصال"}<Check size={17} /></button>
          {cart.length > 0 && <button className={styles.secondary} style={{ width: "100%", marginTop: 8 }} disabled={disabled} onClick={() => { setCart([]); setDiscountValue(0); setLocalError(""); }}>إفراغ السلة</button>}
        </div>
        <div className={styles.cartConnection}><FinancePosOfflineStatus state={state.offline} /></div>
      </aside>
    </div>
    <Modal open={!!form} title={form?.title ?? "الوردية"} onClose={() => { if (!pending) setForm(null); }} panelClassName={form?.operation === "refund" ? styles.invoicePanel : "flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"}>{form && <FinanceOperationForm key={form.operation} form={form} snapshot={data} pending={pending} error={error} onCancel={() => setForm(null)} onSubmit={async (operation, payload) => { const saved = await state.execute(operation, payload); if (saved) { setForm(null); if (operation === "refund" && saved.status !== "pending") setReceiptId(saved.id); } return !!saved; }} />}</Modal>
    <Modal open={showHistory} title="سجل المبيعات" onClose={() => setShowHistory(false)} panelClassName="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">{data.truncated && <p className={styles.notice}>يعرض السجل أحدث العمليات المتاحة</p>}{!history.length ? <Empty title="لا توجد مبيعات مسجلة" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>المستند</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{history.map((document) => <tr key={document.id}><td>{document.number ? `#${document.number}` : document.local_reference}{document.sync_status && document.sync_status !== "synced" && <small className={styles.muted}> بانتظار المزامنة</small>}</td><td>{financeDate(document.created_at)}</td><td><Numeric value={document.total} money /></td><td>{financeDocumentStatus(document)}</td><td><div className={styles.actions}><button className={styles.secondary} onClick={() => { setShowHistory(false); setReceiptId(document.id); }}>الإيصال</button>{!document.refunded && (!document.sync_status || document.sync_status === "synced") && <button className={styles.danger} disabled={disabled} onClick={() => { setShowHistory(false); open({ operation: "refund", title: `مرتجع مبيعات #${document.number}`, values: { documentId: document.id } }); }}>إرجاع</button>}</div></td></tr>)}</tbody></table></div>}</Modal>
    {receiptPreview && <FinanceReceiptDialog preview receiptBrand={state.offline.brand} document={receiptPreview} snapshot={data} onClose={() => setReceiptPreview(null)} />}
    {receipt && <FinanceReceiptDialog key={`${data.cafe.id}:${receiptId}`} document={receipt} snapshot={data} receiptBrand={state.offline.brand} autoPrint={autoPrintId === receiptId && printer.ready && printer.autoEnabled} autoPrintKey={autoPrintId ?? undefined} onPrint={printer.handler(receiptId ?? receipt.id, autoPrintId === receiptId)} onClose={() => { setReceiptId(null); setAutoPrintId(null); }} />}
  </div>;
}
