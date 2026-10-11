import { redirect } from "next/navigation";
import { PagerConsole } from "@/components/pager/pager-console";
import { getPagerPage, getStaffPagerContext } from "@/lib/data/pager";
import { getCashierToken } from "@/lib/data/cashier";
import { logoutCashierAction } from "@/app/actions/cashier";
import styles from "@/components/pager/pager.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata = { title: "نداء برندة", robots: { index: false, follow: false } };

export default async function PagerPage() {
  if (!(await getCashierToken())) redirect("/cashier/login?next=pager");
  const context = await getStaffPagerContext().catch(() => null);
  if (!context) return <main className={`${styles.root} ${styles.feedback}`} dir="rtl"><h1 className={styles.title}>نظام النداء غير متاح الآن</h1><p className={styles.muted}>تحقق من صلاحية الاستدعاء والاشتراك لدى إدارة العلامة أو سجل الدخول من جديد</p><form action={logoutCashierAction} style={{ marginTop: 20 }}><button className={styles.button} type="submit">تسجيل الدخول من جديد</button></form></main>;
  const initialPage = await getPagerPage({ status: "active" }, "staff");
  return <PagerConsole context={context} initialPage={initialPage} />;
}
