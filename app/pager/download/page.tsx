import Link from "next/link";
import { Download, Laptop, Smartphone } from "lucide-react";
import styles from "@/components/pager/pager.module.css";

export const metadata = { title: "تطبيق النافذة العائمة | نداء برندة" };

export default function PagerDownloads() {
  return <main className={`${styles.root} ${styles.standalone}`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>نداء برندة</p><h1 className={styles.title}>النداء فوق تطبيق الكاشير</h1><p className={styles.muted}>نافذة مستقلة تتحرك معك خارج المتصفح وتستخدم حسابك وصلاحياتك في المنصة</p></div>
      <Link href="/pager" className={styles.secondary}>رجوع إلى النداء</Link>
    </header>
    <div className={styles.notice}>ثبّت التطبيق مرة واحدة ثم افتحه وسجّل الدخول بحساب الموظف أو المالك واتركه ظاهرًا أثناء استخدام الكاشير</div>
    <div className={styles.queue}>
      <section className={styles.entry} style={{ position: "static" }}>
        <Smartphone size={30} aria-hidden="true" /><h2>جوال وتابلت أندرويد</h2>
        <p className={styles.muted}>أندرويد ٨ فأحدث</p>
        <ol className={styles.installSteps}>
          <li>نزّل التطبيق وثبّته واسمح بالتثبيت من المتصفح إذا طلب الجهاز ذلك</li>
          <li>افتح نداء برندة واضغط السماح بالظهور فوق التطبيقات ثم فعّل الصلاحية وارجع للتطبيق</li>
          <li>اختر نافذة الموظف أو المالك وسجّل الدخول ثم اضغط النداء وافتح تطبيق الكاشير</li>
        </ol>
        <a href="/downloads/branda-pager-android.apk" download className={styles.button}><Download size={18} aria-hidden="true" />تنزيل تطبيق أندرويد</a>
        <p className={styles.hint}>يمكنك تحريك النافذة من عنوانها وتصغيرها وإغلاقها من النافذة أو الإشعار وتغلق عند قفل الشاشة</p>
      </section>
      <section className={styles.entry} style={{ position: "static" }}>
        <Laptop size={30} aria-hidden="true" /><h2>أجهزة الماك</h2>
        <p className={styles.muted}>ماك ١٢ فأحدث بمعالجات إنتل وآبل</p>
        <ol className={styles.installSteps}>
          <li>نزّل الملف وافتحه ثم انقل نداء برندة إلى مجلد التطبيقات</li>
          <li>افتح التطبيق واختر حساب الموظف أو المالك وسجّل الدخول ثم اضغط النداء</li>
          <li>انتقل للكاشير واترك نافذة نداء برندة ظاهرة فوقه</li>
        </ol>
        <a href="/downloads/branda-pager-macos.zip" download className={styles.button}><Download size={18} aria-hidden="true" />تنزيل تطبيق الماك</a>
        <p className={styles.hint}>التطبيق مستقل عن سفاري وكروم وإيدج وهذه النسخة غير موثقة لدى آبل وقد تحتاج السماح بفتحها من إعدادات الخصوصية والأمان بعد مراجعة المصدر</p>
      </section>
    </div>
    <div className={styles.toolbar} style={{ marginTop: 24 }}><a href="brandapager://open" className={styles.secondary}>فتح التطبيق المثبت</a><Link href="/login" className={styles.secondary}>دخول المالك من المتصفح</Link></div>
    <p className={styles.hint}>صلاحية الظهور فوق التطبيقات يوافق عليها صاحب الجهاز وقد تمنعها الأجهزة المدارة وبعض تطبيقات الدفع ولا يتيح الآيباد نافذة تفاعلية عامة فوق التطبيقات بهذه الطريقة</p>
  </main>;
}
