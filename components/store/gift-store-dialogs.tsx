"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Leaf, Minus, Plus, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { submitGiftOrderAction, trackGiftOrderAction } from "@/app/actions/gift-orders";
import { giftOrderInputSchema, giftOrderStatusLabel, giftPaymentStatusLabel, previewGiftOrderTotal, type GiftOrderReceipt, type GiftOrderTracking, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { selectedProductPrice, selectionError, selectionSummary, type GiftCartLine, type GiftSelection } from "@/lib/commerce/storefront-cart";
import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";
import { pendingGiftRequest, clearPendingGiftRequest } from "@/lib/commerce/checkout-request";
import { togetherResponsiveImage, STORE_CARD_IMAGE_SIZES, STORE_DETAIL_IMAGE_SIZES } from "@/lib/menu/together-images";
import { rememberStorePhoto, warmStorePhoto } from "@/lib/ui/store-image-cache";
import s from "./together-store.module.css";

export const StoreRetailContext = createContext(false);

export function StoreMoney({ amount }: { amount: number }) {
  return <span className={s.money}><bdi>{amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</bdi><small>ريال</small></span>;
}

export function StorePhoto({ src, alt, eager = false, className = "", sizes = STORE_CARD_IMAGE_SIZES }: { src?: string; alt: string; eager?: boolean; className?: string; sizes?: string }) {
  const [failed, setFailed] = useState("");
  if (!src || failed === src) return <span className={`${s.photoPlaceholder} ${className}`} role="img" aria-label={alt}><Leaf aria-hidden="true" /><span>{alt}</span></span>;
  const responsive = togetherResponsiveImage(src, sizes);
  // Reuse optimized widths and browser cache; preserve raw URLs for unrelated media.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={responsive?.src || src} srcSet={responsive?.srcSet} sizes={responsive?.sizes} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" onLoad={event => rememberStorePhoto(src, sizes, event.currentTarget)} onError={() => setFailed(src)} />;
}

export function StoreDialog({ title, close, children, wide = false, open = true }: { title: string; close: () => void; children: ReactNode; wide?: boolean; open?: boolean }) {
  const retail = useContext(StoreRetailContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    const unlock = lockPageScroll();
    return () => { node?.close(); unlock(); previous?.focus({ preventScroll: true }); };
  }, [open]);
  return <dialog ref={ref} className={`${s.dialog} ${wide ? s.wideDialog : ""} ${retail ? s.retailDialog : ""}`} dir="rtl" aria-label={title} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className={s.dialogHeader}><span>{title}</span><button type="button" className={s.iconButton} aria-label="إغلاق" onClick={close} autoFocus><X aria-hidden="true" /></button></div>{children}
  </dialog>;
}

export function GiftProductDialog({ product, close, add, orderingEnabled, open = true }: { product: StandaloneMenuProduct; close: () => void; add: (product: StandaloneMenuProduct, line: Omit<GiftCartLine, "key" | "productId">) => string | null; orderingEnabled: boolean; open?: boolean }) {
  const retail = useContext(StoreRetailContext);
  const [image, setImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [optionId, setOptionId] = useState("");
  const [selections, setSelections] = useState<GiftSelection[]>([]);
  const [error, setError] = useState("");
  const imageIndex = Math.min(image, Math.max(0, product.images.length - 1));
  const nextImage = product.images.length > 1 ? product.images[(imageIndex + 1) % product.images.length]?.url : undefined;
  useEffect(() => { if (open) warmStorePhoto(nextImage, STORE_DETAIL_IMAGE_SIZES); }, [nextImage, open]);
  const details = product.commerceDetails ?? {};
  const quote = details.quoteOnly === true;
  const unitPrice = selectedProductPrice(product, selections, optionId);
  function choose(groupId: string, value: Partial<GiftSelection>) { setSelections(items => [...items.filter(i => i.groupId !== groupId), { groupId, ...value }]); setError(""); }
  function submit(e: FormEvent) { e.preventDefault(); const invalid = selectionError(product, selections, optionId); if (invalid) { setError(invalid); return; } const message = add(product, { quantity: quote ? 1 : quantity, optionId: optionId || undefined, selections }); if (message) setError(message); else { setError(""); setQuantity(1); setOptionId(""); setSelections([]); } }
  return <StoreDialog title={retail ? "تفاصيل المنتج" : product.catalogKind === "service" ? "خدمات وتجارب Together" : "تفاصيل غرسَتك"} close={close} open={open} wide>
    <div className={s.productDetail}>
      <div className={s.detailGallery}>
        <div className={s.detailImage}><StorePhoto src={product.images[imageIndex]?.url} alt={product.images[imageIndex]?.alt || product.name} sizes={STORE_DETAIL_IMAGE_SIZES} eager /></div>
        {product.images.length > 1 && <nav className={s.imageNavigation} aria-label="التنقل بين صور المنتج">
          <button type="button" aria-label="الصورة السابقة" onClick={() => setImage((imageIndex - 1 + product.images.length) % product.images.length)}><ChevronRight /></button>
          <span className={s.imageCounter} aria-live="polite"><bdi>{imageIndex + 1} / {product.images.length}</bdi><small>صور المنتج</small></span>
          <button type="button" aria-label="الصورة التالية" onClick={() => setImage((imageIndex + 1) % product.images.length)}><ChevronLeft /></button>
        </nav>}
        {product.images.length > 1 && <nav className={s.thumbnails} aria-label="صور المنتج">{product.images.map((photo, i) => <button type="button" key={photo.url} aria-label={`الصورة ${i + 1}`} aria-pressed={imageIndex === i} onClick={() => setImage(i)}><StorePhoto src={photo.url} alt="" sizes="60px" /></button>)}</nav>}
      </div>
      <form className={s.detailBody} onSubmit={submit}>
        <p className={s.eyebrow}>{product.category}</p><h2>{product.name}</h2>
        <div className={s.detailPrice}>{quote ? <strong>مصمّم لمساحتك</strong> : <StoreMoney amount={unitPrice} />}<span>{!product.available ? "غير متاح حاليًا" : quote ? "السعر بعد معرفة التفاصيل" : details.optionGroups?.length ? "السعر يتحدث حسب اختياراتك" : ""}</span></div>
        {product.description && <div className={s.description}>{product.description}</div>}
        {!!details.attributes?.length && <dl className={s.attributes}>{details.attributes.map((a, i) => <div key={i}><dt>{a.label}</dt><dd>{a.value}</dd></div>)}</dl>}
        {!!details.options?.length && <fieldset className={s.optionGroup}><legend>اختر الخيار المناسب <small>مطلوب</small></legend>{details.options.map(o => <label key={o.id} className={s.choice}><input type="radio" name="variant" value={o.id} checked={optionId === o.id} disabled={!o.available || o.stock === 0} onChange={() => setOptionId(o.id)} /><span>{o.label}</span><StoreMoney amount={o.price} /></label>)}</fieldset>}
        {details.optionGroups?.map(group => {
          const value = selections.find(i => i.groupId === group.id);
          return <fieldset key={group.id} className={s.optionGroup}><legend>{group.label} <small>{group.required ? "مطلوب" : "اختياري"}</small></legend>{group.hint && <p>{group.hint}</p>}{group.type === "text" ? <textarea aria-label={group.label} required={group.required} maxLength={1000} value={value?.text ?? ""} onChange={e => choose(group.id, { text: e.target.value })} rows={3} /> : (group.choices ?? []).map(choice => <label key={choice.id} className={s.choice}><input type={group.type === "select" ? "radio" : "checkbox"} name={group.id} checked={value?.choiceIds?.includes(choice.id) ?? false} onChange={e => choose(group.id, { choiceIds: group.type === "select" ? [choice.id] : e.target.checked ? [...(value?.choiceIds ?? []), choice.id] : (value?.choiceIds ?? []).filter(id => id !== choice.id) })} /><span>{choice.label}</span><span className={s.optionDelta}>{choice.priceDelta ? <><span>+</span><StoreMoney amount={choice.priceDelta} /></> : "دون إضافة"}</span></label>)}</fieldset>;
        })}
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.buyBar}>{!quote && <div className={s.quantity}><button type="button" aria-label="تقليل الكمية" disabled={quantity <= 1} onClick={() => setQuantity(q => q - 1)}><Minus /></button><output>{quantity}</output><button type="button" aria-label="زيادة الكمية" disabled={quantity >= 99} onClick={() => setQuantity(q => q + 1)}><Plus /></button></div>}<button type="submit" className={s.primary} disabled={!product.available || !orderingEnabled}>{!product.available ? "غير متاح حاليًا" : !orderingEnabled ? "الطلبات متوقفة مؤقتًا" : quote ? "اطلب تصميمًا لمساحتك" : "أضف إلى السلة"}{product.available && orderingEnabled && <ShoppingBag aria-hidden="true" />}</button></div>
      </form>
    </div>
  </StoreDialog>;
}

export function GiftCheckoutDialog({ slug, lines, products, settings, setLines, close, onReceipt }: { slug: string; lines: GiftCartLine[]; products: StandaloneMenuProduct[]; settings: GiftStoreSettings; setLines: (items: GiftCartLine[]) => void; close: () => void; onReceipt: (receipt: GiftOrderReceipt) => void }) {
  const retail = useContext(StoreRetailContext);
  const router = useRouter();
  const [selectedFulfillment, setFulfillment] = useState<"delivery" | "pickup">(settings.deliveryEnabled ? "delivery" : "pickup");
  const [selectedPayment, setPayment] = useState<"cod" | "bank_transfer">(settings.paymentMethods[0] ?? "cod");
  const fulfillment = (selectedFulfillment === "delivery" ? settings.deliveryEnabled : settings.pickupEnabled) ? selectedFulfillment : settings.deliveryEnabled ? "delivery" : "pickup";
  const payment = settings.paymentMethods.includes(selectedPayment) ? selectedPayment : settings.paymentMethods[0] ?? "cod";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const quote = lines.some(line => products.find(p => p.id === line.productId)?.commerceDetails?.quoteOnly);
  const resolved = lines.map(line => ({ line, product: products.find(p => p.id === line.productId) }));
  const subtotal = resolved.reduce((sum, { line, product }) => sum + (product ? selectedProductPrice(product, line.selections, line.optionId) * line.quantity : 0), 0);
  const totals = previewGiftOrderTotal(subtotal, fulfillment, settings);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (lock.current) return;
    if (resolved.some(r => !r.product || selectionError(r.product, r.line.selections, r.line.optionId))) { setError("بعض الأصناف أو الخيارات تغيّرت راجع سلتك قبل إرسال الطلب"); return; }
    const f = new FormData(e.currentTarget);
    const payload = { slug, customerName: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? ""), fulfillment, city: String(f.get("city") ?? ""), address: String(f.get("address") ?? ""), paymentMethod: payment, giftMessage: String(f.get("giftMessage") ?? ""), notes: String(f.get("notes") ?? ""), expectedTotal: quote ? 0 : totals.total, items: lines.map(({ productId, optionId, quantity, selections }) => ({ productId, optionId, quantity, selections })) };
    const normalized = giftOrderInputSchema.omit({ requestId: true }).safeParse(payload);
    if (!normalized.success) { setError("راجع الاسم ورقم الجوال وتفاصيل اختياراتك"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const requestId = await pendingGiftRequest(slug, normalized.data);
      const result = await submitGiftOrderAction({ ...normalized.data, requestId });
      if (!result.ok) { setError(result.error); router.refresh(); return; }
      clearPendingGiftRequest(slug, requestId);
      setLines([]); onReceipt(result.order);
    } catch { setError("تعذر الاتصال حاول مرة أخرى وسيُحفظ طلبك مرة واحدة"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <StoreDialog title={retail ? "سلة التسوق" : quote ? "تصميم ينمو مع مساحتك" : "سلة الغراس"} close={() => { if (!busy) close(); }}>
    <div className={s.checkoutBody}>{!lines.length ? <div className={s.empty}><ShoppingBag /><h2>{retail ? "إطلالتك القادمة تبدأ هنا" : "سلتك تنتظر غرسَتها الأولى"}</h2><button className={s.primary} onClick={close}>اكتشف المنتجات</button></div> : <>
      <div className={s.cartLines}>{resolved.map(({ line, product }) => <article key={line.key}><div className={s.cartImage}><StorePhoto src={product?.images[0]?.url} alt={product?.name || "صنف غير متاح"} sizes="64px" /></div><div><strong>{product?.name || "صنف غير متاح"}</strong>{product && <p>{selectionSummary(product, line.selections, line.optionId)}</p>}{!quote && <span>{line.quantity} × <StoreMoney amount={product ? selectedProductPrice(product, line.selections, line.optionId) : 0} /></span>}</div><button className={s.iconButton} type="button" disabled={busy} aria-label={`حذف ${product?.name || "الصنف"}`} onClick={() => setLines(lines.filter(i => i.key !== line.key))}><Trash2 /></button></article>)}</div>
      <form onSubmit={submit} className={s.checkoutForm}>
        <h3>{retail ? "تفاصيل طلبك" : quote ? "عرّفنا على مساحتك" : "لمن نجهّز هذا الجمال؟"}</h3>
        <div className={s.formRow}><label>الاسم<input name="name" autoComplete="name" required minLength={2} maxLength={120} disabled={busy} /></label><label>رقم الجوال<input name="phone" type="tel" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" autoComplete="tel" required pattern="(05|9665|\+9665|009665)[0-9]{8}" maxLength={16} disabled={busy} /></label></div>
        <fieldset className={s.optionGroup}><legend>{quote ? "طريقة تقديم الخدمة" : "كيف يصلك طلبك؟"}</legend>{settings.deliveryEnabled && <label className={s.choice}><input type="radio" name="fulfillment" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} disabled={busy} /><Truck aria-hidden="true" /><span>توصيل</span>{!quote && <StoreMoney amount={settings.deliveryFee} />}</label>}{settings.pickupEnabled && <label className={s.choice}><input type="radio" name="fulfillment" checked={fulfillment === "pickup"} onChange={() => setFulfillment("pickup")} disabled={busy} /><ShoppingBag aria-hidden="true" /><span>استلام من المحل</span></label>}</fieldset>
        {fulfillment === "delivery" ? <><div className={s.formRow}><label>المدينة<input name="city" autoComplete="address-level2" required minLength={2} maxLength={100} disabled={busy} /></label><label>الحي والعنوان<input name="address" autoComplete="street-address" required minLength={5} maxLength={1000} disabled={busy} /></label></div>{settings.deliveryNotes && <p className={s.formHint}>{settings.deliveryNotes}</p>}</> : settings.pickupLocation && <p className={s.formHint}>{settings.pickupLocation}</p>}
        {!quote && <fieldset className={s.optionGroup}><legend>طريقة الدفع</legend>{settings.paymentMethods.map(method => <label key={method} className={s.choice}><input type="radio" name="payment" checked={payment === method} onChange={() => setPayment(method)} disabled={busy} /><span>{method === "cod" ? "الدفع عند الاستلام" : "تحويل بنكي"}</span></label>)}{payment === "bank_transfer" && <p className={s.formHint}>{settings.bankInstructions || "يؤكد المتجر تفاصيل التحويل وحالة الدفع معك"}</p>}</fieldset>}
        {!quote && <label>رسالة الإهداء <small>اختياري</small><textarea name="giftMessage" rows={2} maxLength={1000} placeholder="كلماتك التي ترافق الهدية" disabled={busy} /></label>}
        <label>{quote ? "تفاصيل المساحة والخدمة المطلوبة" : "ملاحظات للمتجر"}<textarea name="notes" rows={3} maxLength={1000} required={quote} disabled={busy} /></label>
        {quote ? <p className={s.formHint}>هذا طلب عرض سعر يتواصل معك المتجر لتحديد التفاصيل والتكلفة قبل التنفيذ</p> : <dl className={s.orderTotals}><div><dt>المنتجات والخدمات</dt><dd><StoreMoney amount={totals.subtotal} /></dd></div><div><dt>التوصيل</dt><dd><StoreMoney amount={totals.deliveryFee} /></dd></div>{totals.tax > 0 && <div><dt>{settings.taxInclusive ? "الضريبة المشمولة" : "الضريبة"}</dt><dd><StoreMoney amount={totals.tax} /></dd></div>}<div><dt>الإجمالي</dt><dd><StoreMoney amount={totals.total} /></dd></div></dl>}
        {error && <p role="alert" className={s.error}>{error}</p>}<button className={s.primary} disabled={busy || !settings.enabled} type="submit">{busy ? "جارٍ إرسال طلبك" : quote ? "أرسل طلب التصميم" : "تأكيد وإرسال الطلب"}<ArrowLeft aria-hidden="true" /></button><p className={s.formHint}>يصلك رقم للمتابعة بعد حفظ الطلب لدى المتجر</p>
      </form>
    </>}</div>
  </StoreDialog>;
}

export function GiftTrackingDialog({ slug, token, receipt, close }: { slug: string; token: string; receipt?: GiftOrderReceipt | null; close: () => void }) {
  const retail = useContext(StoreRetailContext);
  const [tracking, setTracking] = useState<GiftOrderTracking | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function refresh() { setBusy(true); setError(""); try { const result = await trackGiftOrderAction({ slug, trackingToken: token }); if (result.ok) setTracking(result.order); else setError(result.error); } catch { setError("تعذر تحديث حالة الطلب حاول مجددًا"); } finally { setBusy(false); } }
  useEffect(() => { let live = true; trackGiftOrderAction({ slug, trackingToken: token }).then(result => { if (live) { if (result.ok) setTracking(result.order); else setError(result.error); } }).catch(() => { if (live) setError("تعذر تحديث حالة الطلب حاول مجددًا"); }); return () => { live = false; }; }, [slug, token]);
  const order = tracking ?? receipt;
  const trackingPath = `/menu/${slug}?order=${encodeURIComponent(token)}`;
  return <StoreDialog title="متابعة طلبك" close={close}>
    <div className={s.tracking}>
      <div className={s.successMark}>{order ? <Check /> : <Leaf />}</div>
      <p className={s.eyebrow}>{retail ? order ? "طلبك وصلنا" : "متابعة طلبك" : order ? "غرسَتك في أيدينا" : "متابعة الغراس"}</p>
      <h2>{order ? `طلبك رقم ${order.number}` : error ? "تعذر عرض الطلب" : "جارٍ تحميل الطلب"}</h2>
      {order && <><p className={s.statusTag}>{giftOrderStatusLabel[order.status]}</p><p>{giftPaymentStatusLabel[order.paymentStatus]}</p>{order.status !== "quote_requested" && <StoreMoney amount={order.total} />}</>}
      {tracking && <ul className={s.trackingItems}>{tracking.items.map((item, i) => <li key={i}><span>{item.name} × {item.quantity}</span><StoreMoney amount={item.lineTotal} /></li>)}</ul>}
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.trackingActions}>
        <button className={s.primary} onClick={refresh} disabled={busy}>{busy ? "جارٍ التحديث" : "تحديث حالة الطلب"}</button>
        <button className={s.secondary} onClick={async () => {
          try { await navigator.clipboard.writeText(`${window.location.origin}${trackingPath}`); setCopied(true); }
          catch { setError("تعذر النسخ افتح رابط المتابعة أدناه واحتفظ به"); }
        }}><Copy />{copied ? "نُسخ رابط المتابعة" : "نسخ رابط المتابعة"}</button>
        <a className={s.textLink} href={trackingPath}>افتح رابط المتابعة</a>
      </div>
      <p className={s.formHint}>احتفظ بالرابط لمتابعة التجهيز وحالة الدفع</p>
    </div>
  </StoreDialog>;
}
