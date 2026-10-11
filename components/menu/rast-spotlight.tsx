"use client";

import { ArrowUpLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Pause, Play, Utensils } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { productFinalPrice } from "@/lib/mock/menu";
import { menuDisplayText, type StandaloneHighlight, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./offer-preview.module.css";

export function RastSpotlight({ menu, onSelect, preview = false }: {
  menu: StandaloneMenu; onSelect: (product: StandaloneMenuProduct) => void; preview?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const inView = useInView(section, { amount: 0.25 });
  const reduce = useReducedMotion();
  const [selectedId, setSelectedId] = useState("");
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(menu.highlights?.asOf ?? 0);
  const hasExpiry = menu.highlights?.items.some((item) => item.expiresAt != null);
  useEffect(() => {
    if (!hasExpiry || preview) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasExpiry, preview]);
  const offers = (menu.highlights?.items ?? []).filter((item) => preview || item.expiresAt == null || item.expiresAt >= now);
  const fallback = menu.products.find((product) => product.available && product.images.length) ?? menu.products.find((product) => product.available);
  const items: StandaloneHighlight[] = offers.length ? offers : fallback ? [{
    id: `discover-${fallback.id}`, title: fallback.name, description: fallback.description,
    imageUrl: fallback.images[0]?.url ?? null, productId: fallback.id, discountPercent: null, code: null, expiresAt: null,
  }] : [];
  const idsKey = items.map((item) => item.id).join("\n");
  const rotating = !preview && !reduce && !paused && !hovered && !focused && inView && items.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const ids = idsKey.split("\n");
    const timer = setInterval(() => {
      if (!document.hidden) setSelectedId((id) => ids[(Math.max(0, ids.indexOf(id)) + 1) % ids.length]);
    }, 3000);
    return () => clearInterval(timer);
  }, [idsKey, rotating]);
  const active = items.find((item) => item.id === selectedId) ?? items[0];
  if (!active) return null;
  const index = items.indexOf(active);
  const product = menu.products.find((item) => item.id === active.productId && item.available);
  const discounted = product && active.discountPercent != null ? Math.round(product.price * (1 - active.discountPercent / 100) * 100) / 100 : null;
  const price = discounted ?? (product ? productFinalPrice(product.price, product.promo) : null);
  const hasDiscount = product && price != null && price < product.price;
  const general = active.kind === "general";
  const event = active.kind === "event";
  const select = (id: string) => { setSelectedId(id); setPaused(true); };
  const eventDay = active.eventDate ? new Date(`${active.eventDate}T12:00:00+03:00`) : null;
  const validEventDay = eventDay && Number.isFinite(eventDay.getTime()) ? eventDay : null;

  return <section ref={section} className={s.section} aria-label="تستاهل التجربة" aria-roledescription={items.length > 1 ? "عرض شرائح" : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    {!preview && <div className={s.heading}>
      <div><p className={s.eyebrow}>مساحة لمزاج مختلف</p><h2 id="rast-spotlight-title">تستاهل <span>التجربة</span></h2></div>
      <span className={s.edition} dir="ltr">WORTH A TASTE</span>
    </div>}
    <article key={active.id} className={`${s.feature} ${general ? s.general : event ? s.event : ""}`} aria-label={menuDisplayText(active.title)}>
      <div className={s.copy} aria-live={rotating ? "off" : "polite"}>
        <span className={s.badge}>{event ? `موعدنا في ${menu.name}` : general ? "على المنيو كاملًا" : offers.length ? active.discountPercent ? `خصم ${active.discountPercent}%` : `اختيار ${menu.name}` : "اكتشف من قائمتنا"}</span>
        <h3 dir="auto">{menuDisplayText(active.title || "عنوان بطاقتك هنا")}</h3>
        {active.productName && active.productName !== active.title && <p className={s.productName} dir="auto">{active.productName}</p>}
        <p className={s.description} dir="auto">{menuDisplayText(active.description || "خذ لك لحظة واكتشف تفاصيلها على ذوقك")}</p>
        {event && <div className={s.eventDetails}>
          {validEventDay && <span><CalendarDays aria-hidden="true" />{validEventDay.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" })}</span>}
          {active.eventTime && <span><Clock3 aria-hidden="true" /><bdi>{active.eventTime}</bdi><small>بتوقيت السعودية</small></span>}
          {active.eventLocation && <span><MapPin aria-hidden="true" />{active.eventLocation}</span>}
        </div>}
        {active.code && <p className={s.code}>كود العرض <b dir="ltr">{active.code}</b></p>}
        <div className={s.bottom}>
          {product && price != null && <div className={`${s.price} ${hasDiscount ? s.offerPrice : ""}`}>
            {hasDiscount && <span className={s.previousPrice}><span>قبل</span><s><bdi>{product.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</bdi> ريال</s></span>}
            <span className={s.currentPrice}><b dir="ltr">{price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b><span className={s.priceUnit}>ريال</span></span>
          </div>}
          {general && <span className={s.scopeNote}>كل اختياراتك مشمولة بالخصم</span>}
          {event ? <span className={s.invitation}>حيّاكم في راست <span aria-hidden="true">↖</span></span>
            : product ? <button type="button" disabled={preview} className={s.action} onClick={() => {
              setPaused(true);
              onSelect(discounted == null ? product : { ...product, promo: { kind: "خصم", discountMode: "fixed_price", discountedPrice: discounted, startDate: "2000-01-01", endDate: active.expiresAt ? new Date(active.expiresAt).toISOString() : "2099-12-31" } });
            }}>اكتشف الصنف<ArrowUpLeft aria-hidden="true" /></button>
              : preview ? <span className={s.action}>تصفح القائمة<ArrowUpLeft aria-hidden="true" /></span> : <a className={s.action} href="#rast-menu-items">تصفح القائمة<ArrowUpLeft aria-hidden="true" /></a>}
        </div>
      </div>
      <div className={s.media}>
        {general ? <div className={s.discountArt} aria-label={`خصم ${active.discountPercent ?? 0} بالمئة`}>
          <span className={s.artKicker} dir="ltr">A LITTLE TREAT FROM RAST</span>
          <span className={s.discountNumber} dir="ltr">{active.discountPercent ?? 0}<small>%</small></span>
          <span className={s.artTitle}>مزاجك أحلى مع الخصم</span><span className={s.artRule} />
          <span className={s.artFooter}>من أول رشفة لآخر لقمة <b dir="ltr">RAST</b></span>
        </div> : event ? <div className={`${s.eventArt} ${active.imageUrl ? s.eventWithPhoto : ""}`}>
          {active.imageUrl && <SpotlightImage src={active.imageUrl} alt="" />}
          <span className={s.eventArtTop} dir="ltr">RAST / THE GATHERING</span>
          <div className={s.eventArtCenter}>{validEventDay ? <><b dir="ltr">{validEventDay.getUTCDate().toString().padStart(2, "0")}</b><span>{validEventDay.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", timeZone: "Asia/Riyadh" })}</span></> : <b>نلتقي</b>}</div>
          <span className={s.eventArtBottom}>للقهوة جمعة <span>ولجمعتنا حكاية</span></span>
        </div> : <>
          {active.imageUrl ? <SpotlightImage key={active.imageUrl} src={active.imageUrl} alt={active.productName ?? active.title} />
            : <span className={s.typographicArt} aria-hidden="true">RAST<span>على ذوقك</span></span>}
          <span className={s.photoCaption} aria-hidden="true" dir="ltr">A MOMENT WORTH CHOOSING</span>
        </>}
      </div>
    </article>
    {items.length > 1 && <div className={s.controls}>
      <div className={s.transport}>
        <button type="button" onClick={() => select(items[(index - 1 + items.length) % items.length].id)} aria-label="البطاقة السابقة"><ChevronRight aria-hidden="true" /></button>
        {!preview && !reduce && <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "تشغيل التبديل التلقائي" : "إيقاف التبديل التلقائي"}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>}
        <button type="button" onClick={() => select(items[(index + 1) % items.length].id)} aria-label="البطاقة التالية"><ChevronLeft aria-hidden="true" /></button>
        <span className={s.counter} dir="ltr">{String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
      </div>
      <nav className={s.choices} aria-label="مختارات وعروض راست">
        {items.map((item, i) => <button type="button" key={item.id} aria-pressed={item.id === active.id} onClick={() => select(item.id)}>
          <span className={s.choiceNumber} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><span dir="auto">{menuDisplayText(item.productName ?? item.title)}</span>
        </button>)}
      </nav>
    </div>}
  </section>;
}

function SpotlightImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={s.typographicArt} role="img" aria-label={alt || "راست"}><Utensils aria-hidden="true" /><span>RAST</span></span>;
  // Tenant-owned signed campaign or catalog photography.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
