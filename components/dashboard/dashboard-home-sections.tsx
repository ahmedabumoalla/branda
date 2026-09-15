import Link from "next/link";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowUpLeft,
  Boxes,
  Clock3,
  ShoppingBag,
  Users,
} from "lucide-react";
import {
  getDashboardOrderTrend,
  getDashboardRecentOrders,
  getDashboardSummary,
} from "@/lib/data/dashboard-home";
import styles from "./dashboard-home.module.css";

const statusLabels: Record<string, string> = {
  pending_cafe: "طلب جديد",
  accepted: "مقبول",
  preparing: "قيد التجهيز",
  ready: "جاهز",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغي",
  not_completed: "غير مكتمل",
};

const statusTones: Record<string, string> = {
  pending_cafe: styles.statusNew,
  accepted: styles.statusAccepted,
  preparing: styles.statusPreparing,
  ready: styles.statusReady,
  completed: styles.statusCompleted,
  rejected: styles.statusDanger,
  cancelled: styles.statusMuted,
  not_completed: styles.statusDanger,
};

export function DashboardSectionSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} aria-label="جاري تحميل البيانات" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.skeletonRow} />
      ))}
    </div>
  );
}

export async function DashboardSummarySection() {
  let summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  try {
    summary = await getDashboardSummary();
  } catch {
    return <p className={styles.errorState}>تعذر تحميل المؤشرات الآن.</p>;
  }

  const cards = [
    { label: "طلبات اليوم", value: summary.todayOrders, icon: ShoppingBag, tone: "gold" },
    { label: "تحتاج إجراء", value: summary.actionOrders, icon: Clock3, tone: "coral" },
    { label: "إجمالي العملاء", value: summary.customers, icon: Users, tone: "blue" },
    { label: "المنتجات النشطة", value: summary.activeProducts, icon: Boxes, tone: "green" },
  ];

  return (
    <section aria-label="مؤشرات الأداء" className={styles.metricsGrid}>
      {cards.map(({ label, value, icon: Icon, tone }, index) => (
        <article
          key={label}
          className={styles.metricCard}
          data-tone={tone}
          style={{ "--metric-delay": `${index * 85}ms` } as CSSProperties}
        >
          <div className={styles.metricTopline}>
            <span className={styles.metricIndex}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.metricIcon}>
              <Icon aria-hidden="true" />
            </span>
          </div>
          <p>{label}</p>
          <strong>{new Intl.NumberFormat("ar-SA").format(value)}</strong>
          <span className={styles.metricRail} aria-hidden="true">
            <i />
          </span>
        </article>
      ))}
      {summary.unavailableProducts > 0 ? (
        <div className={styles.warningBanner}>
          <AlertTriangle aria-hidden="true" />
          يوجد {summary.unavailableProducts} منتج غير متاح ويحتاج إلى مراجعة.
        </div>
      ) : null}
    </section>
  );
}

export async function DashboardRecentOrdersSection() {
  let orders: Awaited<ReturnType<typeof getDashboardRecentOrders>>;
  try {
    orders = await getDashboardRecentOrders(5);
  } catch {
    return <p className={styles.errorState}>تعذر تحميل آخر الطلبات.</p>;
  }

  return (
    <section className={styles.panel} aria-labelledby="recent-orders-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.sectionKicker}>غرفة التشغيل</span>
            <h2 id="recent-orders-title">آخر الطلبات</h2>
          </div>
          <Link href="/dashboard/orders" className={styles.panelLink}>
            كل الطلبات
            <ArrowUpLeft aria-hidden="true" />
          </Link>
        </div>

        {orders.length ? (
          <div className={styles.ordersTable}>
            <div className={styles.ordersHeader} aria-hidden="true">
              <span>الطلب والعميل</span>
              <span>الحالة</span>
              <span>القيمة</span>
              <span>الوقت</span>
            </div>
            {orders.map((order, index) => (
              <div
                key={order.id}
                className={styles.orderRow}
                style={{ "--row-delay": `${index * 70}ms` } as CSSProperties}
              >
                <div className={styles.orderIdentity}>
                  <span className={styles.orderDot} aria-hidden="true" />
                  <div>
                    <strong>#{order.id.slice(0, 8).toUpperCase()}</strong>
                    <small>{order.customerName}</small>
                  </div>
                </div>
                <span className={`${styles.status} ${statusTones[order.status] ?? styles.statusMuted}`}>
                  {statusLabels[order.status] ?? order.status}
                </span>
                <strong className={styles.orderTotal}>{order.total.toFixed(2)} <small>ر.س</small></strong>
                <time className={styles.orderTime}>
                  {new Intl.DateTimeFormat("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Riyadh",
                  }).format(new Date(order.createdAt))}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <ShoppingBag aria-hidden="true" />
            <strong>الهدوء يسبق أول طلب</strong>
            <span>ستظهر الطلبات الجديدة هنا لحظة وصولها.</span>
          </div>
        )}
    </section>
  );
}

export async function DashboardTrendSection() {
  let values: Awaited<ReturnType<typeof getDashboardOrderTrend>>;
  try {
    values = await getDashboardOrderTrend();
  } catch {
    return <p className={styles.errorState}>تعذر تحميل اتجاه الطلبات.</p>;
  }

  const max = Math.max(...values, 1);
  const numberFormatter = new Intl.NumberFormat("ar-SA");
  const dayLabels = values.map((_, index) => {
    const daysAgo = values.length - 1 - index;
    if (daysAgo === 0) return "اليوم";
    if (daysAgo === 1) return "أمس";
    return `-${numberFormatter.format(daysAgo)}`;
  });

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="order-trend-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.sectionKicker}>آخر ٧ أيام</span>
            <h2 id="order-trend-title">نبض الطلبات</h2>
          </div>
          <span className={styles.liveChip}>
            <i aria-hidden="true" />
            مباشر
          </span>
        </div>

        <div className={styles.chartFrame} aria-label={`الطلبات اليومية: ${values.join(", ")}`}>
          <div className={styles.chartGrid} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className={styles.chartBars}>
            {values.map((value, index) => (
              <div key={index} className={styles.chartColumn}>
                <span className={styles.chartValue}>{value}</span>
                <span className={styles.barTrack}>
                  <i
                    className={styles.barFill}
                    style={
                      {
                        "--bar-height": `${Math.max((value / max) * 100, 5)}%`,
                        "--bar-delay": `${220 + index * 75}ms`,
                      } as CSSProperties
                    }
                  />
                </span>
                <small>{dayLabels[index]}</small>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.chartFooter}>
          <span>الطلب الأعلى</span>
          <strong>{Math.max(...values, 0)} طلب</strong>
        </div>
    </section>
  );
}
