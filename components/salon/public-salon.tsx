"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import { Scissors, CalendarDays, ArrowUpLeft, Clock3 } from "lucide-react";
import { createSalonBookingAction } from "@/app/actions/salon";
import { salonInputTime, salonToday, type SalonAnnouncement } from "@/lib/salon/types";
import { salonTheme } from "./salon-theme";
import loyalty from "@/components/rast-loyalty/rast-loyalty.module.css";
import type { StandaloneMenu, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import styles from "./salon.module.css";

export function PublicSalon({ menu, announcements, colors }: { menu: StandaloneMenu; announcements: SalonAnnouncement[]; colors: { background: string; foreground: string; accent: string } }) {
  const [serviceId, setServiceId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const services = menu.products.filter(p => p.catalogKind === "service");
  const products = menu.products.filter(p => p.catalogKind !== "service");
  const brandStyle = salonTheme({ name: menu.name, slug: menu.slug, logoUrl: menu.logoUrl, cardBackground: colors.background, cardForeground: colors.foreground, cardAccent: colors.accent });
  function choose(id: string) { setServiceId(id); document.getElementById("booking")?.scrollIntoView({ behavior: "auto" }); dateInput.current?.focus({ preventScroll: true }); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget); setError("");
    let start: string;
    try { start = salonInputTime(`${form.get("date")}T${form.get("time")}`); } catch { setError("حدد تاريخ الموعد ووقته"); return; }
    requestId.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await createSalonBookingAction({ id: requestId.current, slug: menu.slug, name: String(form.get("name")), phone: String(form.get("phone")), serviceId: serviceId || null, start });
      if (result.ok) window.location.assign(result.data.url); else setError(result.error);
    });
  }
  function item(product: StandaloneMenuProduct, service: boolean) { return <article className={styles.service} key={product.id}>
    {/* Uploaded tenant media is already signed and validated on the server */}
    {product.images[0] ? <Image unoptimized width={76} height={90} className={styles.serviceImage} src={product.images[0].url} alt={product.name} /> : <span className={styles.serviceIcon}><Scissors size={24} aria-hidden="true" /></span>}
    <div className={styles.serviceInfo}><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}{service && product.preparationTimeMinutes ? <p><Clock3 size={12} className="inline" aria-hidden="true" /> {product.preparationTimeMinutes} دقيقة تقريبًا</p> : null}{service && <button onClick={() => choose(product.id)}>احجز الخدمة <ArrowUpLeft size={12} className="inline" aria-hidden="true" /></button>}</div>
    <div className={styles.price}>{product.price.toLocaleString("ar-SA")} <small>ر س</small></div>
  </article>; }
  return <main className={`${loyalty.dashboard} ${styles.page}`} style={brandStyle} dir="rtl">
    <header className={styles.header}><a href={`/salon/${menu.slug}`} className={styles.brand}>{menu.logoUrl && <Image unoptimized width={64} height={64} src={menu.logoUrl} alt="" className={styles.logo} />}<div><strong>{menu.name}</strong><small>العناية بالرجل</small></div></a><nav className={styles.nav} aria-label="أقسام الصالون"><a href="#services">الخدمات والأسعار</a><a href="#offers">العروض</a><a href="#booking">حجز موعد</a></nav></header>
    <section className={styles.hero}><div className={styles.eyebrow}><Scissors size={18} aria-hidden="true" /> تفاصيل تعكس أناقتك</div><h1>{menu.name}</h1><p>{menu.description || "خدمات العناية والحلاقة في مكان واحد اختر خدمتك واطلب الموعد الذي يناسبك"}</p><div className={styles.heroActions}><a className={styles.button} href="#booking"><CalendarDays size={18} aria-hidden="true" /> حجز موعد</a><span>اختر موعدك والتأكيد من الصالون</span></div></section>
    <div className={styles.content}>
      <section id="services" className={styles.section}><div className={styles.sectionHead}><div><h2>الخدمات والأسعار</h2><p>عناية تليق بك من أول التفاصيل</p></div><Scissors aria-hidden="true" /></div>
        {services.length ? <div className={styles.serviceList}>{services.map(p => item(p, true))}</div> : <p className={styles.empty}>سيعرض الصالون خدماته هنا قريبًا يمكنك طلب موعد والتواصل مع الصالون لتحديد الخدمة</p>}
      </section>
      {products.length > 0 && <section className={styles.section}><div className={styles.sectionHead}><h2>منتجات العناية</h2></div><div className={styles.serviceList}>{products.map(p => item(p, false))}</div></section>}
      <section id="offers" className={styles.section}><div className={styles.sectionHead}><div><h2>عروض الصالون</h2><p>اكتشف العروض والخدمات الجديدة</p></div></div><div className={styles.cards}>
        {(menu.highlights?.items ?? []).map(offer => <article className={styles.card} key={offer.id}>{offer.imageUrl && <Image unoptimized width={400} height={220} src={offer.imageUrl} alt="" />}<h3>{offer.title}</h3><p>{offer.description}</p>{offer.discountPercent != null && <span className={styles.pill}>خصم {offer.discountPercent}%</span>}{offer.code && <p>رمز العرض: <b dir="ltr">{offer.code}</b></p>}{offer.productId && services.some(p => p.id === offer.productId) && <button className={styles.button} onClick={() => choose(offer.productId!)}>احجز الخدمة</button>}</article>)}
        {announcements.map(ad => <article className={styles.card} key={ad.id}><Scissors size={20} aria-hidden="true" /><h3 className="mt-3">{ad.title}</h3><p>{ad.description}</p>{ad.service_id && services.some(p => p.id === ad.service_id) && <button className={styles.button} onClick={() => choose(ad.service_id!)}>احجز الخدمة</button>}</article>)}
      </div>{!menu.highlights?.items.length && !announcements.length && <p className={styles.hint}>تابع هذه المساحة لمعرفة جديد الصالون</p>}</section>
      <section id="booking" className={`${styles.section} ${styles.booking}`}><div className={styles.bookingIntro}><CalendarDays size={28} aria-hidden="true" /><h2 className="mt-4">موعدك القادم</h2><p>حدد اليوم والوقت المناسبين لك<br />يراجع الصالون طلبك ويرسل لك التأكيد أو يقترح موعدًا آخر عبر واتساب</p><p className={styles.hint}>الحجز للصالون والمالك ينظم المواعيد<br />جميع الأوقات بتوقيت السعودية</p></div>
        <form className={styles.form} onSubmit={submit} onChange={() => { if (!pending) requestId.current = null; }}>
          <label className={styles.field}>اسمك<input name="name" autoComplete="name" minLength={2} maxLength={120} required disabled={pending} /></label>
          <label className={styles.field}>جوال واتساب<input name="phone" autoComplete="tel" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" maxLength={30} required disabled={pending} /></label>
          <label className={`${styles.field} ${styles.full}`}>الخدمة<select value={serviceId} onChange={e => setServiceId(e.target.value)} disabled={pending}><option value="">أحدد الخدمة مع الصالون</option>{services.map(p => <option key={p.id} value={p.id}>{p.name} — {p.price} ر س</option>)}</select></label>
          <label className={styles.field}>التاريخ<input ref={dateInput} type="date" name="date" min={salonToday()} required disabled={pending} /></label><label className={styles.field}>الوقت<input type="time" name="time" required disabled={pending} /></label>
          {error && <p role="alert" className={`${styles.error} ${styles.full}`}>{error}</p>}
          <p className={`${styles.hint} ${styles.full}`}>بإرسال الطلب توافق على تلقي رسائل هذا الحجز والنداء والتقييم عبر واتساب</p><button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "جارٍ إرسال طلبك" : "إرسال طلب الحجز"}<ArrowUpLeft size={18} aria-hidden="true" /></button>
        </form>
      </section>
      {menu.loyaltyEnabled && <section className={styles.section}><div className={styles.sectionHead}><div><h2>ولاؤك يستحق</h2><p>بطاقتك ومكافآتك معك في كل زيارة</p></div><a href={`/loyalty/${menu.slug}`} className={`${styles.button} ${styles.secondary}`}>بطاقة الولاء</a></div></section>}
      <footer className={styles.footer}><strong>{menu.name}</strong><div className="flex gap-5">{menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noreferrer">إنستغرام</a>}{menu.contacts.location && <a href={menu.contacts.location.googleUrl} target="_blank" rel="noreferrer">موقع الصالون</a>}<a href="https://barndaksa.com">بواسطة برندة</a></div></footer>
    </div><div className={styles.dock}><span>موعدك يبدأ من هنا</span><a href="#booking" className={styles.button}>حجز موعد <CalendarDays size={16} aria-hidden="true" /></a></div>
  </main>;
}
