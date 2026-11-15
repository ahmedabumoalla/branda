import { useId } from "react";
import { FileClock, History, UserRound } from "lucide-react";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import styles from "./invoice-activity-timeline.module.css";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
const timeFormatter = new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: "Asia/Riyadh" });
const countFormatter = new Intl.NumberFormat("ar-SA");

export function InvoiceActivityTimeline({ activity }: { activity: InvoiceDetail["activity"] }) {
  const titleId = useId();
  const entries = activity.map(item => ({ item, timestamp: Date.parse(item.created_at) })).sort((a, b) => {
    if (!Number.isFinite(a.timestamp)) return Number.isFinite(b.timestamp) ? 1 : 0;
    if (!Number.isFinite(b.timestamp)) return -1;
    return b.timestamp - a.timestamp;
  });

  return (
    <section className={styles.section} dir="rtl" aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <History size={18} aria-hidden="true" />
          <h3 id={titleId}>سجل النشاطات</h3>
          <span className={styles.count} aria-label={`عدد النشاطات ${countFormatter.format(entries.length)}`}>
            {countFormatter.format(entries.length)}
          </span>
        </div>
        {entries.length > 0 && <span className={styles.order}>{entries.length === 1 ? "نشاط واحد مسجل" : "الأحدث أولًا"}</span>}
      </header>

      {entries.length ? (
        <ol className={styles.timeline} role="list" aria-label="نشاطات الفاتورة من الأحدث إلى الأقدم">
          {entries.map(({ item, timestamp }, index) => (
            <li className={styles.entry} key={item.id}>
              <span className={styles.marker} data-latest={index === 0} aria-hidden="true"><FileClock size={17} /></span>
              <div className={styles.content}>
                <div className={styles.event}>
                  <strong className={styles.action}>{item.action}</strong>
                  {index === 0 && entries.length > 1 && Number.isFinite(timestamp) && <span className={styles.latest}>آخر نشاط</span>}
                </div>
                <span className={styles.actor}>
                  <UserRound size={14} aria-hidden="true" />
                  <span>بواسطة <bdi>{item.actor || "مستخدم غير محدد"}</bdi></span>
                </span>
              </div>
              {Number.isFinite(timestamp) ? (
                <time className={styles.date} dateTime={item.created_at}>
                  <span>{dateFormatter.format(timestamp)}</span>
                  <span className={styles.time}>{timeFormatter.format(timestamp)}</span>
                </time>
              ) : <span className={styles.missingDate}>التاريخ غير متاح</span>}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true"><FileClock size={22} /></span>
          <div>
            <p className={styles.emptyTitle}>لا توجد نشاطات مسجلة</p>
            <p className={styles.emptyHint}>تظهر هنا الإجراءات المرتبطة بهذه الفاتورة عند تسجيلها</p>
          </div>
        </div>
      )}
    </section>
  );
}
