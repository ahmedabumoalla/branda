import Image from "next/image";
import { ArrowDown, ArrowUpLeft, CalendarDays } from "lucide-react";
import styles from "./public-salon.module.css";

export const degreesMark = "/salon/100-degrees/wordmark.webp";

export function DegreesOpening({ book, loyalty }: { book: () => void; loyalty: boolean }) {
  return <section className={styles.degreesCover} aria-labelledby="salon-heading">
    <div className={styles.degreesPhoto}>
      <Image src="/salon/editorial-portrait-v1.webp" width={1024} height={1536} sizes="100vw" priority alt="" />
    </div>
    <header className={styles.degreesHeader}>
      <Image src={degreesMark} width={411} height={156} alt="100 درجة" priority />
      <nav aria-label="أقسام الصالون"><a href="#services">خدماتنا</a>{loyalty && <a href="#loyalty">بطاقة الولاء</a>}</nav>
    </header>
    <div className={styles.degreesTitle}>
      <p>صالون 100 درجة الرجالي</p>
      <h1 id="salon-heading">الحلاقة والعناية</h1>
      <div><button className={styles.primary} onClick={book}><CalendarDays aria-hidden="true" />احجز موعدك</button>
        <a href="#services">استعرض الأسعار <ArrowDown size={17} aria-hidden="true" /></a></div>
    </div>
  </section>;
}

export function DegreesService({ name, price, book, unavailable }: { name: string; price: string; book: () => void; unavailable?: boolean }) {
  return <button type="button" className={styles.degreesService} onClick={book} disabled={unavailable} aria-label={unavailable ? `${name} غير متاحة للحجز` : `احجز ${name} — ${price}`}>
    <span>{name}</span><span>{price}</span><ArrowUpLeft size={17} aria-hidden="true" />
  </button>;
}
