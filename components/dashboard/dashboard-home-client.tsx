"use client";

import Link from "next/link";
import {
  ArrowUpLeft,
  ExternalLink,
  Gift,
  PackagePlus,
  Settings,
  ShoppingBag,
  Tags,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import styles from "./dashboard-home.module.css";

type Props = {
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
  ownerName: string;
  logoUrl?: string;
  summary: ReactNode;
  recentOrders: ReactNode;
  trend: ReactNode;
  configError?: string;
};

const quickActions = [
  {
    href: "/dashboard/menu?new=1",
    label: "إضافة منتج",
    description: "أضف منتجًا جديدًا وانشره في الفرع",
    icon: PackagePlus,
  },
  {
    href: "/dashboard/menu",
    label: "إدارة المنتجات",
    description: "حدّث الأسعار والتوفر وترتيب القائمة",
    icon: ShoppingBag,
  },
  {
    href: "/dashboard/orders",
    label: "متابعة الطلبات",
    description: "انتقل مباشرة إلى غرفة التشغيل",
    icon: ArrowUpLeft,
  },
  {
    href: "/dashboard/offers",
    label: "إنشاء عرض",
    description: "أطلق عرضًا يحفّز المبيعات اليوم",
    icon: Tags,
  },
  {
    href: "/dashboard/loyalty",
    label: "إدارة المكافآت",
    description: "تابع الولاء وكافئ عملاءك",
    icon: Gift,
  },
  {
    href: "/dashboard/settings",
    label: "إعدادات العلامة",
    description: "اضبط الهوية وبيانات الفرع",
    icon: Settings,
  },
];

export function DashboardHomeClient({
  cafeSlug,
  cafeName,
  businessCategory,
  ownerName,
  logoUrl,
  summary,
  recentOrders,
  trend,
  configError,
}: Props) {
  const reduceMotion = useReducedMotion();
  const today = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(new Date());
  const businessLabel = businessCategory.includes("events") ? "مركز عمليات الفعالية" : "مركز عمليات العلامة";
  const branchHref = cafeSlug ? `/c/${encodeURIComponent(cafeSlug)}/products/popular` : "/dashboard/settings";

  const reveal = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24, filter: "blur(10px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
      };

  return (
    <div className={styles.page}>
      <div className={styles.ambientGrid} aria-hidden="true" />
      <div className={styles.pageInner}>
        <motion.header
          {...reveal}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className={styles.commandDeck}
        >
          <div className={styles.deckLines} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrow}>{businessLabel}</span>
              <span className={styles.date}>{today}</span>
            </div>

            <div className={styles.liveStatus}>
              <span className={styles.livePulse} aria-hidden="true" />
              {cafeSlug ? "الفرع الإلكتروني متصل ويعمل" : "أكمل إعداد الفرع الإلكتروني"}
            </div>

            <h1 className={styles.title}>{cafeName}</h1>
            <p className={styles.subtitle}>
              {ownerName
                ? `أهلًا ${ownerName}، هذه صورة علامتك الآن وما يستحق انتباهك.`
                : "صورة تشغيلية سريعة لعلامتك، من الطلب إلى المنتج والعميل."}
            </p>

            <div className={styles.heroActions}>
              <Link href="/dashboard/menu?new=1" className={styles.primaryAction}>
                <PackagePlus aria-hidden="true" />
                إضافة منتج
                <span className={styles.actionArrow} aria-hidden="true">
                  <ArrowUpLeft />
                </span>
              </Link>
              <Link
                href={branchHref}
                target={cafeSlug ? "_blank" : undefined}
                rel={cafeSlug ? "noreferrer" : undefined}
                className={styles.secondaryAction}
              >
                <ExternalLink aria-hidden="true" />
                {cafeSlug ? "فتح الفرع" : "إعداد الفرع"}
              </Link>
            </div>
          </div>

          <div className={styles.brandBeacon} aria-label={`شعار ${cafeName}`}>
            <div className={styles.logoHalo} aria-hidden="true" />
            <div className={styles.brandLogoStage}>
              <CafeLogo
                name={cafeName}
                logoUrl={logoUrl}
                size="xl"
                className={styles.heroBrandLogo}
              />
              <div className={styles.brandLogoMeta}>
                <span className={styles.brandConnection}>
                  <i aria-hidden="true" />
                  الهوية متصلة
                </span>
                <strong>{cafeName}</strong>
              </div>
            </div>
            <p>شعار علامتك</p>
          </div>
        </motion.header>

        {configError ? (
          <motion.p
            {...reveal}
            transition={{ duration: 0.6, delay: reduceMotion ? 0 : 0.08 }}
            className={styles.errorBanner}
          >
            {configError}
          </motion.p>
        ) : null}

        <motion.div
          {...reveal}
          transition={{ duration: 0.72, delay: reduceMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
          className={styles.summarySlot}
        >
          {summary}
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ duration: 0.72, delay: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={styles.insightsGrid}
        >
          {recentOrders}
          {trend}
        </motion.div>

        <motion.section
          {...reveal}
          transition={{ duration: 0.72, delay: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={styles.quickSection}
        >
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionKicker}>مسارات مختصرة</span>
              <h2>تحرّك بسرعة</h2>
            </div>
            <p>كل ما تحتاجه لإدارة يومك، على بعد خطوة.</p>
          </div>

          <div className={styles.quickGrid}>
            {quickActions.map(({ href, label, description, icon: Icon }, index) => (
              <motion.div
                key={href}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.55, delay: reduceMotion ? 0 : index * 0.045 }}
                whileHover={reduceMotion ? undefined : { y: -5 }}
              >
                <Link href={href} className={styles.quickAction}>
                  <span className={styles.quickIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.quickIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className={styles.quickCopy}>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowUpLeft className={styles.quickArrow} aria-hidden="true" />
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
