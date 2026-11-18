import { redirect } from "next/navigation";
import { Coffee, UtensilsCrossed, ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { getBrandManagement, managedBrandLogo } from "@/lib/brands/management";
import { logoutAction } from "@/app/actions/auth";
import styles from "./page.module.css";

const font = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });
export const dynamic = "force-dynamic";
export default async function BrandsPage() {
  const management = await getBrandManagement();
  if (!management) redirect("/login");
  const brands = await Promise.all(management.brands.map(async brand => ({ ...brand, logoUrl: await managedBrandLogo(brand.id) })));
  return <main dir="rtl" className={`${styles.page} ${font.className}`}>
    <header className={styles.header}><a href="/" aria-label="برندة الرئيسية"><img src="/brand/barndaksa-app-icon-192.png" width={44} height={44} alt="برندة" /></a><form action={logoutAction}><button className={styles.logout}><LogOut size={18} aria-hidden="true" /> تسجيل الخروج</button></form></header>
    <section className={styles.content} aria-labelledby="management-title">
      <span className={styles.eyebrow}>مساحة إدارة العلامات</span>
      <h1 id="management-title">{management.name}</h1>
      <p className={styles.intro}>اختر العلامة التي تريد إدارتها</p>
      <div className={styles.grid}>
        {brands.map(brand => { const restaurant = brand.businessCategory === "restaurants"; const Icon = restaurant ? UtensilsCrossed : Coffee;
          return <form key={brand.id} method="post" action="/brands/select" className={styles.card}>
            <input type="hidden" name="brandId" value={brand.id} />
            <div className={styles.identity}><Icon size={28} aria-hidden="true" /><span>{restaurant ? "المطعم" : "الكوفي"}</span></div>
            {brand.logoUrl && <img src={brand.logoUrl} alt={`شعار ${brand.name}`} width={320} height={150} className={styles.brandLogo} />}
            <h2>{brand.name}</h2><span className={styles.plan}>الولاء</span>
            <p>عملاء وبطاقات ومكافآت ورسائل مستقلة</p>
            <button className={styles.open} aria-label={`فتح لوحة ${brand.name}`}>فتح لوحة التحكم <ArrowLeft size={20} aria-hidden="true" /></button>
          </form>;
        })}
      </div>
      {management.brands.length === 0 && <div className={styles.empty}><ShieldCheck size={32} aria-hidden="true" /><h2>حساب الإدارة جاهز</h2><p>تظهر علاماتك هنا بعد إضافتها وربطها بالحساب</p></div>}
      <p className={styles.note}><ShieldCheck size={18} aria-hidden="true" />لكل علامة هويتها وعملاؤها ورصيد ولاء مستقل</p>
    </section>
  </main>;
}
