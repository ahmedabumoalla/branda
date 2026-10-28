"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import { Scissors, CalendarDays, ArrowUpLeft, ArrowDown, Clock3, MapPin, Camera, Gift, Sparkles, Check, ShoppingBag, X } from "lucide-react";
import { createSalonBookingAction } from "@/app/actions/salon";
import { salonInputTime, salonToday, type SalonAnnouncement } from "@/lib/salon/types";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { salonTheme } from "./salon-theme";
import styles from "./public-salon.module.css";

const money = (amount: number) => amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 });

export function PublicSalon({ menu, announcements, colors }: { menu: StandaloneMenu; announcements: SalonAnnouncement[]; colors: { background: string; foreground: string; accent: string } }) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [serviceId, setServiceId] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const services = menu.products.filter(p => p.catalogKind === "service");
  const products = menu.products.filter(p => p.catalogKind !== "service");
  const categories = (menu.categories ?? []).filter(c => services.some(p => p.categoryId === c.id));
  const visibleServices = category ? services.filter(p => p.categoryId === category) : services;
  const selected = services.find(p => p.id === serviceId);
  const offers = menu.highlights?.items ?? [];
  const hasOffers = offers.length > 0 || announcements.length > 0;
  const brandStyle = salonTheme({ name: menu.name, slug: menu.slug, logoUrl: menu.logoUrl, cardBackground: colors.background, cardForeground: colors.foreground, cardAccent: colors.accent });

  useEffect(() => {
    const element = dialog.current;
    if (!element || !bookingOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [bookingOpen]);

  function choose(id: string) {
    setServiceId(id);
    requestId.current = null;
    setBookingOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setError("");
    let start: string;
    try { start = salonInputTime(`${form.get("date")}T${form.get("time")}`); }
    catch { setError("حدد تاريخ الموعد ووقته"); return; }
    requestId.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        const result = await createSalonBookingAction({ id: requestId.current!, slug: menu.slug, name: String(form.get("name")), phone: String(form.get("phone")), serviceId: serviceId || null, start });
        if (result.ok) window.location.assign(result.data.url);
        else setError(result.error);
      } catch { setError("تعذر إرسال الطلب تحقق من اتصالك وحاول مرة أخرى"); }
    });
  }
  function item(product: StandaloneMenuProduct, service: boolean) {
    return <article className={styles.serviceCard} key={product.id}>
      <div className={styles.serviceMedia}>{product.images[0]
        ? <Image unoptimized width={480} height={360} src={product.images[0].url} alt={product.images[0].alt || product.name} />
        : <div className={styles.serviceArt} aria-hidden="true">{service ? <Scissors /> : <ShoppingBag />}<span>{service ? "GROOMING" : "CARE ESSENTIALS"}</span></div>}
        {product.category && <span className={styles.categoryTag}>{product.category}</span>}
      </div>
      <div className={styles.serviceBody}><div className={styles.serviceTitle}><h3>{product.name}</h3><span className={styles.price}>{money(product.price)} <small>ر س</small></span></div>
        {product.description && <p>{product.description}</p>}
        <div className={styles.serviceFoot}>{service && product.preparationTimeMinutes ? <span><Clock3 aria-hidden="true" />{product.preparationTimeMinutes} دقيقة تقريبًا</span> : <span>{service ? "عناية على ذوقك" : "لروتين عنايتك"}</span>}
          {service && <button type="button" disabled={pending} onClick={() => choose(product.id)} aria-label={`احجز خدمة ${product.name}`}>احجز الخدمة <ArrowUpLeft aria-hidden="true" /></button>}
        </div>
      </div>
    </article>;
  }
  return <main className={styles.page} style={brandStyle} dir="rtl">
    <a className={styles.skip} href="#services">انتقل إلى الخدمات</a>
    <div className={styles.opening}>
      <header className={styles.header}>
        <a href={`/salon/${menu.slug}`} className={styles.brand}>
          {menu.logoUrl ? <Image unoptimized width={64} height={64} src={menu.logoUrl} alt="" className={styles.logo} /> : <span className={styles.brandMark}><Scissors aria-hidden="true" /></span>}
          <span><strong>{menu.name}</strong><small>العناية بالرجل</small></span>
        </a>
        <nav className={styles.nav} aria-label="أقسام الصالون"><a href="#services">الخدمات والأسعار</a>{hasOffers && <a href="#offers">العروض والجديد</a>}{menu.loyaltyEnabled && <a href="#loyalty">بطاقة الولاء</a>}</nav>
        <button className={styles.headerBooking} onClick={() => setBookingOpen(true)}><CalendarDays aria-hidden="true" /><span>احجز موعدك</span><ArrowUpLeft aria-hidden="true" /></button>
      </header>
      <section className={styles.hero} aria-labelledby="salon-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span />تفاصيل صغيرة تصنع الفرق</p>
          <h1 id="salon-heading">أناقتك تبدأ<br /><em>من التفاصيل</em></h1>
          <p className={styles.heroDescription}>{menu.description || "وقت لك وإطلالة تشبهك اختر عنايتك واترك للتفاصيل أثرها"}</p>
          <div className={styles.heroActions}><button className={styles.primary} onClick={() => setBookingOpen(true)}>احجز وقتك <ArrowUpLeft aria-hidden="true" /></button><a className={styles.textLink} href="#services">اكتشف الخدمات <ArrowDown aria-hidden="true" /></a></div>
          <div className={styles.heroNote}><CalendarDays aria-hidden="true" /><span>موعدك على راحتك<small>اختر الوقت وسيصلك التأكيد عبر واتساب</small></span></div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.artFrame}><Image src="/salon/grooming-editorial.webp" width={1400} height={933} loading="eager" fetchPriority="high" sizes="(max-width: 720px) 150vh, 50vw" alt="" className={styles.heroImage} /><div className={styles.artCaption}><span dir="ltr">THE ART OF GROOMING</span><strong>العناية فن والتفاصيل توقيع</strong></div></div>
          <div className={styles.seal} aria-hidden="true"><Scissors /><span>على ذوقك</span></div>
          <span className={styles.visualNote} aria-hidden="true" dir="ltr">A MOMENT FOR YOURSELF</span>
        </div>
      </section>
      <div className={styles.openingFooter}><span><Scissors aria-hidden="true" />عناية تبدأ من هنا</span><div>{menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noreferrer"><MapPin aria-hidden="true" />موقع الصالون<ArrowUpLeft aria-hidden="true" /></a>}{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noreferrer"><Camera aria-hidden="true" />إنستغرام<ArrowUpLeft aria-hidden="true" /></a>}</div><a href="#services" className={styles.scrollLink}>اكتشف أكثر<ArrowDown aria-hidden="true" /></a></div>
    </div>
    <div className={styles.content}>
      <section id="services" className={styles.section} aria-labelledby="services-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>الخدمات والأسعار</p><h2 id="services-heading">عناية تليق <em>بتفاصيلك</em></h2></div><p className={styles.sectionDescription}>اختر خدمتك<br />وخلّ وقت العناية لك</p></div>
        {categories.length > 1 && <div className={styles.categories} aria-label="تصنيفات الخدمات"><button aria-pressed={!category} onClick={() => setCategory("")}>كل الخدمات <span>{services.length}</span></button>{categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>}
        {services.length ? <div className={styles.serviceGrid}>{visibleServices.map(p => item(p, true))}</div> : <div className={styles.emptyServices}><div className={styles.emptyMark} aria-hidden="true"><Scissors /></div><div><p className={styles.eyebrow}>نبدأ بموعد يناسبك</p><h3>لكل إطلالة تفاصيلها</h3><p>قائمة الخدمات تُجهّز لك<br />يمكنك حجز موعد وتحديد عنايتك مع الصالون</p></div><button className={styles.outline} onClick={() => setBookingOpen(true)}>احجز موعدك<ArrowUpLeft aria-hidden="true" /></button></div>}
      </section>
      {products.length > 0 && <section id="products" className={styles.section} aria-labelledby="products-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>العناية مستمرة</p><h2 id="products-heading">منتجات العناية</h2></div><ShoppingBag className={styles.headingIcon} aria-hidden="true" /></div><div className={styles.serviceGrid}>{products.map(p => item(p, false))}</div></section>}
      {hasOffers && <section id="offers" className={styles.section} aria-labelledby="offers-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>مساحة للجديد</p><h2 id="offers-heading">لك من الصالون</h2></div><span className={styles.sectionDescription}>العروض والخدمات الجديدة</span></div><div className={styles.offers}>
        {offers.map(offer => <article className={styles.offer} key={offer.id}>{offer.imageUrl && <Image unoptimized width={640} height={420} src={offer.imageUrl} alt="" className={styles.offerImage} />}<div className={styles.offerBody}><span className={styles.offerLabel}><Gift aria-hidden="true" />{offer.discountPercent != null ? `خصم ${offer.discountPercent}%` : "عرض من الصالون"}</span><h3>{offer.title}</h3><p>{offer.description}</p>{offer.code && <div className={styles.offerCode}>رمز العرض <b dir="ltr">{offer.code}</b></div>}{offer.productId && services.some(p => p.id === offer.productId) && <button className={styles.textLink} onClick={() => choose(offer.productId!)}>احجز الخدمة<ArrowUpLeft aria-hidden="true" /></button>}</div></article>)}
        {announcements.map(ad => <article className={`${styles.offer} ${styles.announcement}`} key={ad.id}><Sparkles className={styles.adIcon} aria-hidden="true" /><div className={styles.offerBody}><span className={styles.offerLabel}>جديد الصالون</span><h3>{ad.title}</h3><p>{ad.description}</p>{ad.service_id && services.some(p => p.id === ad.service_id) && <button className={styles.textLink} onClick={() => choose(ad.service_id!)}>احجز الخدمة<ArrowUpLeft aria-hidden="true" /></button>}</div></article>)}
      </div></section>}
      {menu.loyaltyEnabled && <section id="loyalty" className={styles.loyalty} aria-labelledby="loyalty-heading"><div className={styles.loyaltyCopy}><p className={styles.eyebrow}><Gift aria-hidden="true" />لأن رجعتك تسعدنا</p><h2 id="loyalty-heading">زياراتك لها <em>قيمة</em></h2><p>خلّ بطاقة الولاء معك<br />وتابع زياراتك ومكافآتك في مكان واحد</p><a className={styles.textLink} href={`/loyalty/${menu.slug}`}>افتح بطاقة الولاء<ArrowUpLeft aria-hidden="true" /></a></div><div className={styles.loyaltyArt} aria-hidden="true"><div className={styles.membership}><div className={styles.membershipTop}><span>{menu.name}</span><Scissors /></div><span className={styles.membershipLabel}>عناية تتجدد مع كل زيارة</span><strong>بطاقة الولاء</strong><div className={styles.stamps}>{Array.from({ length: 5 }, (_, i) => <span key={i}><Scissors /></span>)}</div><div className={styles.membershipBottom}><span>ولاؤك يستحق</span><span dir="ltr">MEMBERSHIP</span></div></div></div></section>}
      <section className={styles.bookingTeaser}><div><p className={styles.eyebrow}>وقت خاص لك</p><h2>جاهز لإطلالتك القادمة</h2></div><button className={styles.primary} onClick={() => setBookingOpen(true)}>احجز موعدك<ArrowUpLeft aria-hidden="true" /></button></section>
      <dialog ref={dialog} className={styles.bookingDialog} aria-labelledby="booking-heading" onCancel={event => { if (pending) event.preventDefault(); else setBookingOpen(false); }} onClose={() => setBookingOpen(false)}>
        <div className={styles.modalHeader}><span><Scissors aria-hidden="true" />{menu.name}</span><button type="button" aria-label="إغلاق نافذة الحجز" disabled={pending} onClick={() => setBookingOpen(false)}><X aria-hidden="true" /></button></div>
        <div className={styles.booking}>
        <div className={styles.bookingIntro}><p className={styles.eyebrow}>حان وقتك</p><h2 id="booking-heading"><span>موعدك القادم</span>{" "}<em>يبدأ هنا</em></h2><p>خذ وقتًا لنفسك وحدد الموعد الذي يناسب يومك</p><ol className={styles.steps}><li><span>١</span><div><strong>اختر خدمتك ووقتك</strong><p>طلب واحد بكل تفاصيل موعدك</p></div></li><li><span>٢</span><div><strong>يصلك رد الصالون</strong><p>تأكيد الموعد أو اقتراح وقت آخر عبر واتساب</p></div></li><li><Check aria-hidden="true" /><div><strong>ننتظرك في موعدك</strong><p>اعتماد الموعد بعد تأكيد الصالون</p></div></li></ol><p className={styles.timezone}><Clock3 aria-hidden="true" />جميع الأوقات بتوقيت السعودية</p></div>
        <form className={styles.form} onSubmit={submit} onChange={() => { if (!pending) requestId.current = null; }} aria-busy={pending}>
          <div className={styles.formHeading}><CalendarDays aria-hidden="true" /><div><h3>احجز موعدك</h3><p>{menu.loyaltyEnabled ? "حجزك وبطاقة ولائك في خطوة واحدة" : "خطوة بسيطة لعناية تستحقها"}</p></div></div>
          <label className={styles.field}>اسمك<input name="name" autoComplete="name" placeholder="كيف نناديك" minLength={2} maxLength={120} required disabled={pending} /></label>
          <label className={styles.field}>جوال واتساب<input name="phone" autoComplete="tel" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" maxLength={30} required disabled={pending} /></label>
          <label className={`${styles.field} ${styles.full}`}>الخدمة<select value={serviceId} onChange={e => setServiceId(e.target.value)} disabled={pending}><option value="">أحدد الخدمة مع الصالون</option>{services.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price)} ر س</option>)}</select></label>
          {selected && <div className={`${styles.selectedService} ${styles.full}`} role="status"><span><Scissors aria-hidden="true" />{selected.name}</span><strong>{money(selected.price)} <small>ر س</small></strong></div>}
          <label className={styles.field}>التاريخ<input ref={dateInput} type="date" name="date" dir="ltr" lang="en" min={salonToday()} required disabled={pending} /></label><label className={styles.field}>الوقت<input type="time" name="time" dir="ltr" lang="en" required disabled={pending} /></label>
          {error && <p role="alert" className={`${styles.error} ${styles.full}`}>{error}</p>}
          <button className={`${styles.submit} ${styles.full}`} disabled={pending}>{pending ? "جارٍ إرسال طلبك" : "إرسال طلب الحجز"}<ArrowUpLeft aria-hidden="true" /></button>
          <p className={`${styles.consent} ${styles.full}`}>{menu.loyaltyEnabled ? "بإرسال الطلب توافق على التسجيل في الولاء وتلقي بطاقة الولاء ورسائل الحجز والنداء والتقييم عبر واتساب" : "بإرسال الطلب توافق على تلقي رسائل هذا الحجز والنداء والتقييم عبر واتساب"}</p>
        </form>
        </div>
      </dialog>
      <footer className={styles.footer}><a href={`/salon/${menu.slug}`} className={styles.footerBrand}>{menu.logoUrl && <Image unoptimized width={44} height={44} src={menu.logoUrl} alt="" />}<span>{menu.name}<small>تفاصيل تعكس أناقتك</small></span></a><div>{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noreferrer">إنستغرام</a>}{menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noreferrer">موقع الصالون</a>}<a href="https://barndaksa.com">بواسطة برندة<ArrowUpLeft aria-hidden="true" /></a></div></footer>
    </div>
    <nav className={styles.dock} aria-label="الوصول السريع"><a href="#services"><Scissors aria-hidden="true" /><span>الخدمات</span></a>{menu.loyaltyEnabled && <a href={`/loyalty/${menu.slug}`}><Gift aria-hidden="true" /><span>ولائي</span></a>}<button className={styles.dockBooking} onClick={() => setBookingOpen(true)}><CalendarDays aria-hidden="true" />احجز موعدك<ArrowUpLeft aria-hidden="true" /></button></nav>
  </main>;
}
