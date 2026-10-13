"use client";

import { BellRing, CheckCheck, Clock3, MessageCircle, Star, X } from "lucide-react";
import type { PagerOrder } from "@/lib/pager/types";
import { pagerDate, pagerElapsed } from "./pager-format";
import styles from "./pager.module.css";
import { useCashierLanguage } from "@/components/cashier/cashier-language";

const statuses = { waiting: "قيد التجهيز", ready: "بانتظار الاستلام", received: "تم الاستلام", cancelled: "ملغي" };

export function PagerOrderCard({ order, busy = false, onChange }: {
  order: PagerOrder;
  busy?: boolean;
  onChange?: (id: string, status: "ready" | "received" | "cancelled") => void;
}) {
  const { t, locale } = useCashierLanguage();
  return (
    <article className={styles.card} data-status={order.status}>
      <div className={styles.cardHead}>
        <div><span className={styles.invoiceLabel}>{t("رقم الفاتورة")} </span><h3 className={styles.invoice}><bdi>{order.invoiceNumber}</bdi></h3></div>
        <span className={styles.badge} data-status={order.status}>{t(statuses[order.status])}</span>
      </div>
      <p className={styles.phone}><bdi dir="ltr">{order.phone}</bdi></p>
      <div className={styles.cardMeta}><Clock3 size={14} aria-hidden="true" /><time dateTime={order.createdAt} dir="ltr">{pagerDate(order.createdAt, locale)}</time><span>{order.createdStation || order.createdBy || t("إدارة العلامة")}</span></div>
      {order.readyAt && <div className={styles.cardMeta}><BellRing size={14} aria-hidden="true" /><span>{t("تم الاستدعاء")} </span><time dateTime={order.readyAt} dir="ltr">{pagerDate(order.readyAt, locale)}</time></div>}
      {order.status === "ready" && <p className={styles.hint}>{t("التذكير كل دقيقة حتى تأكيد الاستلام")} </p>}
      {onChange && (order.status === "waiting" || order.status === "ready") && (
        <div className={styles.cardActions}>
          {order.status === "waiting" ? <button type="button" className={styles.button} disabled={busy} onClick={() => onChange(order.id, "ready")}><BellRing size={17} aria-hidden="true" />{t("الطلب جاهز")} </button>
            : <button type="button" className={styles.button} disabled={busy} onClick={() => onChange(order.id, "received")}><CheckCheck size={17} aria-hidden="true" />{t("تم الاستلام")} </button>}
          <button type="button" className={styles.danger} disabled={busy} onClick={() => onChange(order.id, "cancelled")} aria-label={t({ text: "إلغاء الفاتورة {invoice}", values: { invoice: order.invoiceNumber } })}><X size={16} aria-hidden="true" />{t("إلغاء")} </button>
        </div>
      )}
      <details className={styles.details}>
        <summary>{t("تفاصيل الطلب والتواصل")} </summary>
        <dl className={styles.timeline}>
          <div><dt>{t("أضيف بواسطة")} </dt><dd>{order.createdBy || t("إدارة العلامة")}</dd></div>
          <div><dt>{t("مكان الإضافة")} </dt><dd>{order.createdStation || t("غير محدد")}</dd></div>
          <div><dt>{t("استدعاه")} </dt><dd>{order.calledBy || t("لم يتم الاستدعاء")}</dd></div>
          <div><dt>{t("مكان الاستدعاء")} </dt><dd>{order.calledStation || t("غير محدد")}</dd></div>
          <div><dt>{t("وقت الاستلام")} </dt><dd dir="ltr">{pagerDate(order.receivedAt, locale)}</dd></div>
          <div><dt>{t("مدة التجهيز")} </dt><dd>{pagerElapsed(order.createdAt, order.readyAt, locale)}</dd></div>
          <div><dt>{t("الانتظار بعد الاستدعاء")} </dt><dd>{pagerElapsed(order.readyAt, order.receivedAt, locale)}</dd></div>
          <div><dt>{t("رسائل مرسلة")} </dt><dd>{order.messageCount}</dd></div>
          <div><dt><MessageCircle size={12} className="inline" aria-hidden="true" />{t("آخر إرسال")} </dt><dd dir="ltr">{pagerDate(order.lastMessageAt, locale)}</dd></div>
          <div><dt>{t("حالة الرسالة")} </dt><dd>{t(messageLabel(order.messageStatus))}</dd></div>
        </dl>
        {order.rating != null && <div className={styles.review}><span className={styles.rating}><Star size={15} aria-hidden="true" />{order.rating} {t("من ٥")} </span><p>{order.notes || t("بدون ملاحظات")}</p><p className={styles.hint}>{pagerDate(order.ratedAt, locale)}</p></div>}
      </details>
    </article>
  );
}

function messageLabel(status: string | null | undefined) {
  if (status === "provider_queued") return "قبلها مزود واتساب للإرسال";
  if (status === "sent") return "أرسلت إلى واتساب";
  if (status === "delivered") return "تم التسليم";
  if (status === "read") return "تمت القراءة";
  if (status === "failed") return "تعذر الإرسال";
  if (status === "pending" || status === "queued") return "بانتظار الإرسال";
  if (status === "sending" || status === "processing") return "جار الإرسال";
  if (status === "cancelled") return "توقف الإرسال";
  return "لم ترسل رسالة بعد";
}
