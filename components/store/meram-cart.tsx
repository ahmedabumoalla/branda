"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, LocateFixed, Minus, PackageCheck, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { submitGiftOrderAction, trackGiftOrderAction } from "@/app/actions/gift-orders";
import { pendingGiftRequest, clearPendingGiftRequest } from "@/lib/commerce/checkout-request";
import { giftOrderDraftSchema, giftOrderStatusLabel, previewGiftOrderTotal, type GiftOrderReceipt, type GiftOrderTracking, type GiftStoreSettings } from "@/lib/commerce/gift-orders";
import { meramMapLink } from "@/lib/commerce/meram-location";
import { selectedProductPrice, selectionError, selectionSummary, type GiftCartLine } from "@/lib/commerce/storefront-cart";
import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { StoreDialog, StorePhoto } from "./gift-store-dialogs";
import s from "./meram-store.module.css";

const money = (amount: number) => `${amount.toLocaleString("ar-SA", {maximumFractionDigits: 2})} ر.س`;

type CartProps = { slug: string; products: StandaloneMenuProduct[]; lines: GiftCartLine[]; setLines: (items: GiftCartLine[]) => void; settings: GiftStoreSettings | null; close: () => void; onReceipt: (order: GiftOrderReceipt) => void };

export function MeramCart({ slug, products, lines, setLines, settings, close, onReceipt }: CartProps) {
  const router = useRouter();
  const [step, setStep] = useState<"bag" | "details">("bag");
  const [location, setLocation] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const locateRequest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { locateRequest.current++; }, []);
  useEffect(() => { if (step === "details") heading.current?.focus(); }, [step]);
  const resolved = lines.map(line => ({line, product: products.find(p => p.id === line.productId)}));
  const subtotal = resolved.reduce((sum, {product,line}) => sum + (product ? selectedProductPrice(product,line.selections,line.optionId) * line.quantity : 0), 0);
  const totals = settings ? previewGiftOrderTotal(subtotal,"delivery",settings) : null;
  const manualDelivery = Boolean(settings && settings.deliveryFee === 0);
  const quote = resolved.some(({product}) => product?.commerceDetails?.quoteOnly);
  const ordering = settings?.enabled && settings.deliveryEnabled && settings.paymentMethods.includes("bank_transfer");
  const changed = resolved.some(({product,line}) => !product || Boolean(selectionError(product,line.selections,line.optionId)));
  function locate() {
    setLocationStatus("");
    if (!navigator.geolocation) { setLocationStatus("الصق رابط الموقع من تطبيق الخرائط"); return; }
    const attempt = ++locateRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locateRequest.current) return;
      setLocation(`https://www.google.com/maps?q=${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`);
      setLocationStatus("تم تحديد موقعك"); setLocating(false);
    }, () => {
      if (attempt !== locateRequest.current) return;
      setLocationStatus("تعذر تحديد موقعك الصق رابط الموقع من تطبيق الخرائط"); setLocating(false);
    }, {enableHighAccuracy:true, timeout:12000, maximumAge:120000});
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;
    if (!ordering || !totals || !lines.length || changed) { setError("راجع السلة وتوفر المنتجات قبل الإرسال"); return; }
    const address = meramMapLink(location);
    if (!address) { setError("أضف رابط موقع من خرائط Google أو Apple أو حدد موقعك الحالي"); return; }
    const data = new FormData(event.currentTarget);
    const payload = giftOrderDraftSchema.safeParse({
      slug, customerName:data.get("customerName"), phone:data.get("phone"), city:data.get("city"), address,
      giftMessage:data.get("giftMessage"), notes:data.get("notes"), fulfillment:"delivery", paymentMethod:"bank_transfer",
      expectedTotal:quote ? 0 : totals.total, items:lines.map(({productId, optionId, quantity, selections}) => ({productId, optionId, quantity, selections}))
    });
    if (!payload.success) { setError("راجع الاسم ورقم الجوال والمدينة وتفاصيل الهدية"); return; }
    sendingRef.current = true; setSending(true); setError("");
    try {
      const requestId = await pendingGiftRequest(slug,payload.data);
      const response = await submitGiftOrderAction({...payload.data,requestId});
      if (!response.ok) { setError(response.error); router.refresh(); return; }
      clearPendingGiftRequest(slug,requestId); onReceipt(response.order);
    } catch { setError("تعذر تأكيد وصول الطلب حاول مجددًا بنفس التفاصيل"); }
    finally { sendingRef.current = false; setSending(false); }
  }
  function next() { setError(""); setStep("details"); }
  return <StoreDialog title={step === "bag" ? "سلة الهدايا" : "تفاصيل الطلب"} close={() => { if (!sendingRef.current) close(); }}>
    <div className={s.panel}>
      {!lines.length ? <div className={s.cartEmpty}><ShoppingBag size={32}/><h2>سلتك فارغة</h2><button className={s.cta} onClick={close}>اختر هدية<ArrowLeft size={16}/></button></div> : <>
        <div hidden={step !== "bag"}>
          <h2>هداياك المختارة</h2>
          <ul className={s.cartLines}>{resolved.map(({line,product}) => <li key={line.key}>
            {product && <StorePhoto src={product.images[0]?.url} alt="" className={s.cartPhoto} />}
            <div><strong>{product?.name ?? "صنف لم يعد متاحًا"}</strong>{product && <small>{selectionSummary(product,line.selections,line.optionId)}</small>}
              <div className={s.quantity}><button aria-label="تقليل الكمية" disabled={line.quantity <= 1} onClick={() => setLines(lines.map(item => item.key === line.key ? {...item,quantity:item.quantity-1} : item))}><Minus size={14}/></button><bdi>{line.quantity}</bdi><button aria-label="زيادة الكمية" disabled={line.quantity >= 99 || quote} onClick={() => setLines(lines.map(item => item.key === line.key ? {...item,quantity:item.quantity+1} : item))}><Plus size={14}/></button></div>
            </div><div>{product && !product.commerceDetails?.quoteOnly && <strong>{money(selectedProductPrice(product,line.selections,line.optionId)*line.quantity)}</strong>}<button className={s.remove} aria-label={`حذف ${product?.name ?? "الصنف"}`} onClick={() => setLines(lines.filter(item => item.key !== line.key))}><Trash2 size={16}/></button></div>
          </li>)}</ul>
        </div>
        {totals && !quote && <dl className={s.totals}><div><dt>قيمة الهدايا</dt><dd>{money(totals.subtotal)}</dd></div>{manualDelivery ? <div><dt>رسوم التوصيل</dt><dd>تُحدد حسب الموقع</dd></div> : <div><dt>التوصيل</dt><dd>{money(totals.deliveryFee)}</dd></div>}{totals.tax > 0 && <div><dt>{settings?.taxInclusive ? "الضريبة المشمولة" : "الضريبة"}</dt><dd>{money(totals.tax)}</dd></div>}<div><dt>{manualDelivery ? "إجمالي المنتجات" : "الإجمالي"}</dt><dd>{money(totals.total)}</dd></div></dl>}
        {manualDelivery && <p className={s.checkoutNote}>تؤكد ميرام رسوم التوصيل معك قبل الدفع</p>}
        {changed && <p role="alert" className={s.error}>تغيّر توفر أحد الأصناف أو خياراته احذفه وأعد الاختيار</p>}
        {!ordering && <p role="status" className={s.error}>استقبال الطلبات متوقف مؤقتًا</p>}
        {step === "bag" && <button className={s.cta} disabled={!ordering || changed} onClick={next}>إضافة الإهداء وبيانات التسليم<ArrowLeft size={17}/></button>}
        <form hidden={step !== "details"} onSubmit={submit} className={s.checkoutForm}>
          <h2 ref={heading} tabIndex={-1}>تفاصيل الإهداء والتسليم</h2>
          <fieldset disabled={sending}>
            <label>رسالة الإهداء <small>اختياري</small><textarea name="giftMessage" maxLength={1000} rows={2} placeholder="اكتب كلماتك لبطاقة الإهداء" /></label>
            <div className={s.formPair}><label>اسم العميل<input name="customerName" autoComplete="name" minLength={2} maxLength={120} required/></label><label>رقم الجوال<input type="tel" name="phone" dir="ltr" autoComplete="tel" maxLength={30} placeholder="05xxxxxxxx" required/></label></div>
            <label>المدينة<input name="city" autoComplete="address-level2" required maxLength={100}/></label>
            <label>موقع التسليم<input name="location" dir="ltr" required maxLength={1000} value={location} onChange={e => { locateRequest.current++; setLocating(false); setLocation(e.target.value); setLocationStatus(""); }} placeholder="رابط الخرائط أو إحداثيات الموقع" /></label>
            <button type="button" className={s.textButton} onClick={locate} disabled={locating}><LocateFixed size={17} />{locating ? "جارٍ تحديد الموقع" : "استخدم موقعي الحالي"}</button>
            {locationStatus && <small role="status">{locationStatus}</small>}
            <label>تفاصيل إضافية للطلب <small>اختياري</small><textarea name="notes" rows={2} maxLength={1000} placeholder="مثل وقت التسليم أو وصف المدخل" /></label>
          </fieldset>
          <p className={s.checkoutNote}>بعد تأكيد ميرام للطلب يتواصل الفريق معك عبر واتساب لترتيب الدفع والتسليم</p>
          {error && <p className={s.error} role="alert">{error}</p>}
          <button className={s.cta} disabled={sending || changed || !ordering} type="submit">{sending ? "جارٍ إرسال طلبك" : "إرسال الطلب إلى ميرام"}<ArrowLeft size={17}/></button>
          <button type="button" className={s.textButton} disabled={sending} onClick={() => setStep("bag")}>الرجوع إلى السلة</button>
        </form>
      </>}
    </div>
  </StoreDialog>;
}

export function MeramTracking({slug,token,receipt,close}:{slug:string;token:string;receipt:GiftOrderReceipt|null;close:()=>void}) {
  const [order,setOrder] = useState<GiftOrderTracking|null>(null);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  const [copied,setCopied] = useState(false);
  const current = order ?? receipt;
  const path = `/menu/${slug}#order=${encodeURIComponent(token)}`;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await trackGiftOrderAction({slug,trackingToken:token});
        if (!live) return;
        if (!response.ok) { setError(response.error); timer = setTimeout(refresh,30000); return; }
        setOrder(response.order); setError("");
        if (!["completed","cancelled","refunded"].includes(response.order.status)) timer = setTimeout(refresh,30000);
      } catch { if (live) { setError("تعذر تحديث حالة طلبك"); timer = setTimeout(refresh,30000); } }
    }
    void refresh();
    return () => { live = false; clearTimeout(timer); };
  },[slug,token,attempt]);
  const rejected = current?.status === "cancelled";
  return <StoreDialog title="متابعة طلب ميرام" close={close}><div className={s.panel}>
    <PackageCheck size={32} /><h2>{current ? `طلب رقم ${current.number}` : "متابعة الطلب"}</h2>
    {current && <div role="status" className={rejected ? s.error : s.checkoutNote}><strong>{rejected ? "اعتذرت ميرام عن قبول طلبك" : current.status === "completed" ? "تم تسليم طلبك" : current.status === "pending" ? "وصل طلبك إلى ميرام" : giftOrderStatusLabel[current.status]}</strong>{rejected && order?.rejectionReason && <p>سبب الرفض — {order.rejectionReason}</p>}{current.status === "pending" && <p>يتواصل معك فريق ميرام عبر واتساب بعد تأكيد طلبك</p>}</div>}
    {order && <ul className={s.trackingItems}>{order.items.map((item,index) => <li key={index}><span>{item.name} × {item.quantity}</span><bdi>{money(item.lineTotal)}</bdi></li>)}</ul>}
    {current && <p className={s.totalLine}>{order?.deliveryFee === 0 ? "إجمالي المنتجات" : "قيمة الطلب المسجلة"} <bdi>{money(current.total)}</bdi></p>}
    {order?.deliveryFee === 0 && !rejected && current?.status !== "completed" && <p className={s.checkoutNote}>تؤكد ميرام رسوم التوصيل حسب الموقع قبل الدفع</p>}
    {error && <p role="alert" className={s.error}>{error}</p>}
    <div className={s.trackLinks}><button className={s.cta} onClick={() => setAttempt(n => n+1)}>تحديث الحالة</button>
    <button className={s.outline} onClick={async () => { try { await navigator.clipboard.writeText(new URL(path,window.location.origin).href); setCopied(true); } catch { setError("افتح رابط المتابعة للاحتفاظ به"); } }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "تم النسخ" : "نسخ رابط المتابعة"}</button><a className={s.textButton} href={path}>رابط المتابعة</a></div>
  </div></StoreDialog>;
}
