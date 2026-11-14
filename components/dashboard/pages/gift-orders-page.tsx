"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, CreditCard, ExternalLink, Gift, Leaf, PackageCheck, RefreshCw, Search, Settings2, ShoppingBag, Truck } from "lucide-react";
import { fetchOwnerGiftOrdersAction, saveGiftStoreSettingsAction, updateGiftOrderAction } from "@/app/actions/gift-orders";
import { Modal } from "@/components/dashboard/ui/modal";
import { giftOrderStatusLabel, giftPaymentStatusLabel, type GiftOrder, type GiftOrderCommand, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import styles from "./gift-orders-page.module.css";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";

export type GiftOrdersFinance = {
  accounts: { id: string; name: string; kind: string }[];
  warehouses: { id: string; name: string }[];
  shifts: { id: string; accountId: string; number: number | null }[];
};
type Props = {
  initialOrders: GiftOrder[]; initialSettings: GiftStoreSettings | null;
  cafe: { name: string; slug: string }; initialHasMore: boolean;
  finance: GiftOrdersFinance | null; financeMessage?: string; configError?: string;
};
const money = (value: number) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value)} ر.س`;
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(new Date(value));
const defaults: GiftStoreSettings = { enabled: false, deliveryEnabled: true, pickupEnabled: false, deliveryFee: 25, paymentMethods: ["cod"], pickupLocation: "", deliveryNotes: "", bankInstructions: "", vatRate: 0, taxInclusive: true };

export function GiftOrdersPage({ initialOrders, initialSettings, cafe, initialHasMore, finance, financeMessage, configError }: Props) {
  const retail = isFawaselStore(cafe.slug);
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [settings, setSettings] = useState(initialSettings);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [tab, setTab] = useState<"orders" | "settings">(!initialSettings && !configError ? "settings" : "orders");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(configError ?? "");
  const requests = useRef(new Map<string, string>());
  const order = orders.find(item => item.id === selected);
  const pending = orders.filter(item => item.status === "pending" || item.status === "quote_requested").length;
  const preparing = orders.filter(item => item.status === "accepted" || item.status === "preparing" || item.status === "ready").length;
  const visible = orders.filter(item => (filter === "all" || item.status === filter) && `${item.number} ${item.customerName} ${item.phone} ${item.items.map(line => line.name).join(" ")}`.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")));

  async function load(nextPage: number) {
    const result = await fetchOwnerGiftOrdersAction(nextPage);
    if (!result.ok) throw new Error(result.error);
    setOrders(result.orders); setSettings(result.settings); setHasMore(result.hasMore); setPage(result.page);
  }
  async function refresh(nextPage = page) {
    setBusy(true); setError(""); setMessage("");
    try { await load(nextPage); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحديث الطلبات حاول مجددًا"); }
    finally { setBusy(false); }
  }
  async function command(input: Omit<GiftOrderCommand, "requestId">) {
    const fingerprint = JSON.stringify(input);
    const requestId = requests.current.get(fingerprint) ?? crypto.randomUUID();
    requests.current.set(fingerprint, requestId);
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await updateGiftOrderAction({ ...input, requestId });
      if (!result.ok) { setError(result.error); return false; }
      requests.current.delete(fingerprint);
      setOrders(current => current.map(item => item.id === input.id ? { ...item, status: result.order.status, paymentStatus: result.order.paymentStatus, financeDocumentId: result.order.financeDocumentId } : item));
      setMessage(input.action === "confirm_payment" ? "تم تسجيل التحصيل وربط الفاتورة بالمالية" : "تم تحديث الطلب");
      try { await load(page); router.refresh(); } catch { setError("تم حفظ الإجراء لكن تعذر تحديث القائمة اضغط تحديث"); }
      return true;
    } catch { setError("تعذر تأكيد نتيجة العملية أعد المحاولة بنفس البيانات"); return false; }
    finally { setBusy(false); }
  }
  async function save(next: GiftStoreSettings) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveGiftStoreSettingsAction(next);
      if (!result.ok) { setError(result.error); return; }
      setSettings(next); setMessage("تم حفظ الإعدادات وتطبيقها في المتجر"); router.refresh();
    } catch { setError("تعذر حفظ الإعدادات حاول مجددًا"); }
    finally { setBusy(false); }
  }

  return <main className={styles.root} dir="rtl" aria-busy={busy}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}><ShoppingBag size={15} aria-hidden="true" /> {cafe.name}</span><h1>{retail ? "إطلالاتهم تبدأ هنا" : "من اختيار جميل"}<br /><span>{retail ? "وطلباتهم بين يديك" : "إلى هدية تصل"}</span></h1><p>{retail ? "طلبات المتجر والمقاسات والتوصيل والتحصيل في مكان واحد" : "طلبات المنتجات والخدمات في مكان واحد من أول طلب حتى التسليم"}</p></div>
      <div className={styles.heroSide}><span className={styles.heroMark}><Gift size={52} strokeWidth={1} aria-hidden="true" /></span><Link href={`/menu/${cafe.slug}`} target="_blank" rel="noopener noreferrer">عرض المتجر <ExternalLink size={16} aria-hidden="true" /></Link><button type="button" className={styles.settingsShortcut} onClick={() => setTab("settings")}><Truck size={18} aria-hidden="true" /><CreditCard size={18} aria-hidden="true" />إعداد التوصيل والدفع</button><span className={styles.storeStatus}><i data-open={settings?.enabled ?? false} />{settings?.enabled ? "استقبال الطلبات مفعّل" : "استقبال الطلبات متوقف"}</span></div>
    </header>
    <div className={styles.metrics} aria-label="ملخص طلبات الصفحة الحالية"><div><ShoppingBag aria-hidden="true" /><span>الطلبات المعروضة<strong>{orders.length}</strong></span></div><div><Gift aria-hidden="true" /><span>بانتظارك<strong>{pending}</strong></span></div><div><PackageCheck aria-hidden="true" /><span>قيد التنفيذ<strong>{preparing}</strong></span></div></div>
    <nav className={styles.tabs} aria-label="إدارة المتجر"><button type="button" aria-current={tab === "orders" ? "page" : undefined} onClick={() => setTab("orders")}><ShoppingBag size={18} aria-hidden="true" />الطلبات</button><button type="button" aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}><Settings2 size={18} aria-hidden="true" />التوصيل والدفع</button></nav>
    {!settings && !configError && <p className={styles.setupNotice}>لم تُحفظ إعدادات الطلبات بعد حدد التوصيل والدفع وفعّل استقبال الطلبات ثم احفظ الإعدادات لتظهر خيارات الطلب في المتجر</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}><Check size={18} aria-hidden="true" />{message}</p>}
    {tab === "settings" ? <SettingsForm key={JSON.stringify(settings)} initial={settings ?? defaults} busy={busy} onSave={save} /> : <section className={styles.orders} aria-label="طلبات المتجر">
      <div className={styles.toolbar}><label className={styles.search}><Search size={19} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في هذه الصفحة بالاسم أو الجوال أو رقم الطلب" aria-label="بحث في طلبات الصفحة الحالية" /></label><select aria-label="تصفية حسب حالة الطلب" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">جميع الحالات</option>{Object.entries(giftOrderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className={styles.secondary} disabled={busy} onClick={() => refresh()}><RefreshCw size={17} className={busy ? styles.spin : ""} aria-hidden="true" />تحديث</button></div>
      {!visible.length ? <div className={styles.empty}><ShoppingBag size={42} strokeWidth={1.2} aria-hidden="true" /><h2>{orders.length ? "لا توجد طلبات مطابقة" : "هنا تبدأ حكاية كل هدية"}</h2><p>{orders.length ? "غيّر البحث أو حالة الطلب لعرض النتائج" : "تظهر طلبات العملاء هنا فور إرسالها من متجرك"}</p>{!settings?.enabled && <button type="button" className={styles.primary} onClick={() => setTab("settings")}>إعداد استقبال الطلبات <ArrowLeft size={17} aria-hidden="true" /></button>}</div> : <div className={styles.orderList}>{visible.map(item => <button type="button" className={styles.orderCard} key={item.id} onClick={() => { setSelected(item.id); setError(""); setMessage(""); }}>
        <div className={styles.orderIdentity}><span className={styles.orderIcon}>{item.status === "quote_requested" ? <Leaf size={23} aria-hidden="true" /> : <ShoppingBag size={23} aria-hidden="true" />}</span><span><b>طلب #{item.number}</b><small>{date(item.createdAt)}</small></span></div>
        <div className={styles.customer}><strong>{item.customerName}</strong><span>{item.items.length} {item.items.length === 1 ? "صنف" : "أصناف"} <span aria-hidden="true"> / </span>{item.fulfillment === "delivery" ? "توصيل" : "استلام من المحل"}</span></div>
        <div className={styles.orderState}><span className={styles.badge} data-state={item.status}>{giftOrderStatusLabel[item.status]}</span><small>{giftPaymentStatusLabel[item.paymentStatus]}</small></div>
        <div className={styles.orderAmount}><strong>{item.status === "quote_requested" ? "بانتظار التسعير" : money(item.total)}</strong><span>تفاصيل الطلب <ArrowLeft size={15} aria-hidden="true" /></span></div>
      </button>)}</div>}
      <footer className={styles.pagination}><span>الصفحة {page} <small>حتى ٥٠ طلبًا في الصفحة</small></span><div><button type="button" className={styles.secondary} disabled={busy || page === 1} onClick={() => refresh(page - 1)}>السابق</button><button type="button" className={styles.secondary} disabled={busy || !hasMore} onClick={() => refresh(page + 1)}>التالي</button></div></footer>
    </section>}
    <Modal open={!!order} title={order ? `تفاصيل الطلب #${order.number}` : "تفاصيل الطلب"} onClose={() => { if (!busy) setSelected(null); }} panelClassName={styles.modal}>
      {order && <><div aria-live="polite">{error && <p role="alert" className={styles.error}>{error}</p>}{message && <p className={styles.success}>{message}</p>}</div><OrderDetails key={`${order.id}:${order.updatedAt}`} order={order} finance={finance} financeMessage={financeMessage} busy={busy} command={command} /></>}
    </Modal>
  </main>;
}

function SettingsForm({ initial, busy, onSave }: { initial: GiftStoreSettings; busy: boolean; onSave: (value: GiftStoreSettings) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const [validation, setValidation] = useState("");
  const patch = <K extends keyof GiftStoreSettings>(key: K, value: GiftStoreSettings[K]) => setForm(current => ({ ...current, [key]: value }));
  function method(value: "cod" | "bank_transfer", checked: boolean) { patch("paymentMethods", checked ? [...form.paymentMethods.filter(item => item !== value), value] : form.paymentMethods.filter(item => item !== value)); }
  function submit(event: FormEvent) { event.preventDefault(); if (busy) return; if (!form.deliveryEnabled && !form.pickupEnabled) { setValidation("فعّل التوصيل أو الاستلام من المحل"); return; } if (!form.paymentMethods.length) { setValidation("اختر طريقة دفع واحدة على الأقل"); return; } if (!Number.isFinite(form.deliveryFee) || form.deliveryFee < 0 || form.deliveryFee > 10000) { setValidation("أدخل رسوم توصيل صحيحة من صفر إلى ١٠٠٠٠ ريال"); return; } setValidation(""); void onSave(form); }
  return <form className={styles.settings} onSubmit={submit}>
    <div className={styles.settingsIntro}><div><span className={styles.eyebrow}>متجرك بطريقتك</span><h2>اضبط رحلة الطلب</h2><p>الخيارات التي تحفظها هنا تظهر للعملاء ويُحسب التوصيل حسب إعداداتك</p></div><label className={styles.toggle}><input type="checkbox" checked={form.enabled} onChange={event => patch("enabled", event.target.checked)} />استقبال الطلبات</label></div>
    <aside className={styles.gatewayPlaceholder} aria-label="حالة الدفع الإلكتروني"><span className={styles.gatewayIcon}><CreditCard size={24} aria-hidden="true" /></span><div><h3>الدفع الإلكتروني</h3><p>يُربط لاحقًا بحساب العلامة بعد تحديد بوابة الدفع</p></div><span className={styles.gatewayStatus}>غير مربوط</span></aside>
    <div className={styles.settingsGrid}>
      <fieldset><legend><Truck size={22} aria-hidden="true" />التوصيل والاستلام</legend><label className={styles.check}><input type="checkbox" checked={form.deliveryEnabled} onChange={event => patch("deliveryEnabled", event.target.checked)} />توصيل إلى العميل</label><label className={styles.field}>رسوم التوصيل بالريال<input type="number" min="0" max="10000" step="0.01" required value={form.deliveryFee} disabled={!form.deliveryEnabled} onChange={event => patch("deliveryFee", Number(event.target.value))} /></label><label className={styles.field}>مناطق وشروط التوصيل<textarea rows={3} maxLength={1000} value={form.deliveryNotes} onChange={event => patch("deliveryNotes", event.target.value)} placeholder="وضح المدن المتاحة ومدة التوصيل وأي تعليمات للعميل" /></label><label className={styles.check}><input type="checkbox" checked={form.pickupEnabled} onChange={event => patch("pickupEnabled", event.target.checked)} />استلام من المحل</label><label className={styles.field}>عنوان الاستلام<textarea rows={2} maxLength={1000} value={form.pickupLocation} onChange={event => patch("pickupLocation", event.target.value)} placeholder="عنوان المحل وأوقات الاستلام" /></label></fieldset>
      <fieldset><legend><CreditCard size={22} aria-hidden="true" />طرق الدفع</legend><label className={styles.check}><input type="checkbox" checked={form.paymentMethods.includes("cod")} onChange={event => method("cod", event.target.checked)} />الدفع عند الاستلام</label><label className={styles.check}><input type="checkbox" checked={form.paymentMethods.includes("bank_transfer")} onChange={event => method("bank_transfer", event.target.checked)} />التحويل البنكي</label><label className={styles.field}>تعليمات التحويل للعميل<textarea rows={5} maxLength={2000} value={form.bankInstructions} onChange={event => patch("bankInstructions", event.target.value)} placeholder="اسم المستفيد والبنك والآيبان وتعليمات تأكيد التحويل" /></label><p className={styles.hint}>يظهر الطلب بانتظار الدفع إلى أن تؤكد استلام المبلغ من تفاصيل الطلب ويرتبط التحصيل ببرندة المالية</p><p className={styles.hint}>الضريبة تُؤخذ من إعدادات المالية الحالية بنسبة {form.vatRate}% والأسعار {form.taxInclusive ? "شاملة الضريبة" : "قبل الضريبة"}</p></fieldset>
    </div>{validation && <p role="alert" className={styles.error}>{validation}</p>}<div className={styles.saveRow}><button className={styles.primary} type="submit" disabled={busy}>{busy ? "جارٍ الحفظ" : "حفظ وتطبيق الإعدادات"}<Check size={18} aria-hidden="true" /></button><span>التغييرات تسري على الطلبات الجديدة</span></div>
  </form>;
}

function OrderDetails({ order, finance, financeMessage, busy, command }: { order: GiftOrder; finance: GiftOrdersFinance | null; financeMessage?: string; busy: boolean; command: (value: Omit<GiftOrderCommand, "requestId">) => Promise<boolean> }) {
  const [mode, setMode] = useState<"payment" | "cancel" | null>(null);
  const [quote, setQuote] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccount] = useState("");
  const [warehouseId, setWarehouse] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const account = finance?.accounts.find(item => item.id === accountId);
  const shift = finance?.shifts.find(item => item.accountId === accountId);
  const terminal = ["cancelled", "refunded", "completed"].includes(order.status);
  const canPay = order.paymentStatus === "unpaid" && !terminal && order.status !== "quote_requested" && order.total > 0;
  async function submitPayment(event: FormEvent) { event.preventDefault(); if (busy || !canPay || !confirmed || !account || !finance?.warehouses.some(item => item.id === warehouseId) || (account.kind === "cash" && !shift)) return; if (await command({ id: order.id, action: "confirm_payment", amount: order.total, accountId, warehouseId, ...(account.kind === "cash" && shift ? { shiftId: shift.id } : {}), note })) setMode(null); }
  return <div className={styles.details}>
    <div className={styles.detailTop}><span className={styles.badge} data-state={order.status}>{giftOrderStatusLabel[order.status]}</span><span>{giftPaymentStatusLabel[order.paymentStatus]}</span><small>{date(order.createdAt)}</small></div>
    <div className={styles.infoGrid}><section><h3>العميل</h3><strong>{order.customerName}</strong><a dir="ltr" href={`tel:+${order.phone}`}>+{order.phone}</a><p>{order.fulfillment === "delivery" ? `توصيل إلى ${order.city}` : "استلام من المحل"}</p>{order.address && <p className={styles.pre}>{order.address}</p>}</section><section><h3>الدفع</h3><strong>{order.paymentMethod === "cod" ? "عند الاستلام" : "تحويل بنكي"}</strong><p>{giftPaymentStatusLabel[order.paymentStatus]}</p><span className={styles.detailTotal}>{order.status === "quote_requested" ? "طلب تسعير" : money(order.total)}</span></section></div>
    <section className={styles.items}><h3>تفاصيل الاختيار</h3>{order.items.map(line => <article key={line.id}><div><strong>{line.name}</strong><small>{line.catalogKind === "service" ? "خدمة" : "منتج"} <span aria-hidden="true"> / </span> الكمية {line.quantity}</small>{line.selections.map((selection, index) => <p key={`${selection.label}:${index}`}><span>{selection.label}</span> {selection.value}{selection.attachmentId && <a href={`/api/commerce/attachments/${encodeURIComponent(selection.attachmentId)}`} target="_blank" rel="noopener noreferrer"> تنزيل المرفق</a>}{selection.priceDelta > 0 ? ` + ${money(selection.priceDelta)}` : ""}</p>)}</div><b>{order.status === "quote_requested" ? "يحدد لاحقًا" : money(line.lineTotal)}</b></article>)}</section>
    {(order.giftMessage || order.notes) && <section className={styles.noteBox}>{order.giftMessage && <><h3>رسالة الهدية</h3><p className={styles.pre}>{order.giftMessage}</p></>}{order.notes && <><h3>ملاحظات العميل</h3><p className={styles.pre}>{order.notes}</p></>}</section>}
    {order.status !== "quote_requested" && <dl className={styles.totals}><div><dt>المنتجات والخدمات</dt><dd>{money(order.subtotal)}</dd></div><div><dt>التوصيل</dt><dd>{money(order.deliveryFee)}</dd></div><div><dt>الضريبة {order.taxInclusive ? "المشمولة" : "المضافة"} {order.vatRate}%</dt><dd>{money(order.tax)}</dd></div><div><dt>الإجمالي</dt><dd>{money(order.total)}</dd></div></dl>}
    {order.status === "quote_requested" && <form className={styles.actionBox} onSubmit={event => { event.preventDefault(); void command({ id: order.id, action: "quote", amount: Number(quote), note }); }}><h3>تسعير الخدمة</h3><p className={styles.hint}>أدخل قيمة الخدمة المتفق عليها مع العميل {order.taxInclusive ? "شاملة الضريبة" : "قبل الضريبة"} ويظهر الإجمالي في متابعة طلبه</p><label className={styles.field}>قيمة الخدمة بالريال<input required type="number" min="0.01" max="1000000" step="0.01" value={quote} onChange={event => setQuote(event.target.value)} /></label><button className={styles.primary} disabled={busy}>اعتماد التسعير</button></form>}
    {!finance && canPay && <div className={styles.notice}><p>{financeMessage || "تأكيد التحصيل يحتاج تفعيل برندة المالية وصلاحية إدارتها"}</p><Link href="/dashboard/subscription">الباقات والاشتراكات <ArrowLeft size={16} aria-hidden="true" /></Link></div>}
    {mode === "payment" && finance && <form className={styles.actionBox} onSubmit={submitPayment}><h3>تأكيد استلام {money(order.total)}</h3><p className={styles.hint}>يُسجل المبلغ في المالية وتُنشأ فاتورة مرتبطة بهذا الطلب بعد تأكيدك</p><div className={styles.formGrid}><label className={styles.field}>حساب التحصيل<select required value={accountId} onChange={event => { setAccount(event.target.value); setConfirmed(false); }}><option value="">اختر حساب التحصيل</option>{finance.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.field}>المستودع<select required value={warehouseId} onChange={event => setWarehouse(event.target.value)}><option value="">اختر المستودع</option>{finance.warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{account?.kind === "cash" && <p className={shift ? styles.hint : styles.error}>{shift ? `التحصيل على ورديتك المفتوحة${shift.number ? ` #${shift.number}` : ""}` : "لا توجد لك وردية مفتوحة على هذا الصندوق افتح ورديتك من المالية أو اختر حسابًا آخر"}</p>}<label className={styles.field}>ملاحظة التحصيل<textarea value={note} maxLength={1000} rows={2} onChange={event => setNote(event.target.value)} placeholder="مرجع التحويل أو ملاحظة التحصيل" /></label><label className={styles.check}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />أؤكد استلام المبلغ كاملًا في الحساب المحدد</label><div className={styles.actionRow}><button className={styles.primary} disabled={busy || !confirmed || !accountId || !warehouseId || (account?.kind === "cash" && !shift)}>تسجيل التحصيل والفاتورة</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setMode(null)}>رجوع</button></div></form>}
    {mode === "cancel" && <form className={styles.actionBox} onSubmit={async event => { event.preventDefault(); if (await command({ id: order.id, action: "cancel", note })) setMode(null); }}><label className={styles.field}>سبب إلغاء الطلب<textarea required minLength={3} maxLength={1000} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label><div className={styles.actionRow}><button className={styles.danger} disabled={busy}>تأكيد إلغاء الطلب</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setMode(null)}>رجوع</button></div></form>}
    <div className={styles.actionRow}>{order.status === "pending" && <button type="button" className={styles.primary} disabled={busy} onClick={() => command({ id: order.id, action: "accept" })}>قبول الطلب</button>}{order.status === "accepted" && <button type="button" className={styles.primary} disabled={busy} onClick={() => command({ id: order.id, action: "prepare" })}>بدء التجهيز</button>}{order.status === "preparing" && <button type="button" className={styles.primary} disabled={busy} onClick={() => command({ id: order.id, action: "ready" })}>جاهز للتسليم</button>}{["accepted", "preparing", "ready"].includes(order.status) && order.paymentStatus === "paid" && <button type="button" className={styles.primary} disabled={busy} onClick={() => command({ id: order.id, action: "complete" })}>تم التسليم</button>}{canPay && finance && mode !== "payment" && <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setMode("payment"); setNote(""); }}><CreditCard size={17} aria-hidden="true" />تأكيد التحصيل</button>}{!terminal && order.paymentStatus === "unpaid" && mode !== "cancel" && <button type="button" className={styles.danger} disabled={busy} onClick={() => { setMode("cancel"); setNote(""); }}>إلغاء الطلب</button>}</div>
    {order.financeDocumentId && <div className={styles.notice}><Check size={20} aria-hidden="true" /><div><strong>الطلب مرتبط بفاتورة في المالية</strong><p>لإجراء استرداد افتح فواتير المبيعات وابحث في ملاحظات الفاتورة عن طلب متجر #{order.number} باسم {order.customerName}</p><Link href="/dashboard/finance?section=sales">المبيعات والاسترداد <ArrowLeft size={16} aria-hidden="true" /></Link></div></div>}
  </div>;
}
