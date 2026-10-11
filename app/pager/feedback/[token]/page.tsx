import { PagerFeedbackForm } from "@/components/pager/pager-feedback";
import { getPagerFeedback } from "@/lib/data/pager";
import styles from "@/components/pager/pager.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata = { title: "تقييم الخدمة | برندة", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const feedback = await getPagerFeedback(token);
  if (!feedback) return <main className={`${styles.root} ${styles.feedback}`} dir="rtl"><h1 className={styles.title}>رابط التقييم غير متاح</h1><p className={styles.muted}>افتح رابط التقييم الذي وصلك على واتساب بعد استلام طلبك</p></main>;
  return <PagerFeedbackForm token={token} initialFeedback={feedback} />;
}
