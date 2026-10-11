"use client";

import { BellRing, CheckCheck, Clock3, MessageCircle, Star, X } from "lucide-react";
import type { PagerOrder } from "@/lib/pager/types";
import { pagerDate, pagerElapsed } from "./pager-format";
import styles from "./pager.module.css";

const statuses = { waiting: "قيد التجهيز", ready: "بانتظار الاستلام", received: "تم الاستلام", cancelled: "ملغي" };

export function PagerOrderCard({ order, busy = false, onChange }: {
  order: PagerOrder;
  busy?: boolean;
  onChange?: (id: string, status: "ready" | "received" | "cancelled") => void;
}) {
  return (
    <article className={styles.card} data-status={order.status}>
      <div className={styles.cardHead}>
        <div><span className={styles.invoiceLabel}>رقم الفاتورة</span><h3 className={styles.invoice}><bdi>{order.invoiceNumber}</bdi></h3></div>
        <span className={styles.badge} data-status={order.status}>{statuses[order.status]}</span>
      </div>
      <p className={styles.phone}><bdi dir="ltr">{order.phone}</bdi></p>
      <div className={styles.cardMeta}><Clock3 size={14} aria-hidden="true" /><time dateTime={order.createdAt} dir="ltr">{pagerDate(order.createdAt)}</time><span>{order.createdStation || order.createdBy || "إدارة العلامة"}</span></div>
      {order.readyAt && <div className={styles.cardMeta}><BellRing size={14} aria-hidden="true" /><span>تم الاستدعاء</span><time dateTime={order.readyAt} dir="ltr">{pagerDate(order.readyAt)}</time></div>}
      {order.status === "ready" && <p className={styles.hint}>التذكير كل دقيقة حتى تأكيد الاستلام</p>}
      {onChange && (order.status === "waiting" || order.status === "ready") && (
        <div className={styles.cardActions}>
          {order.status === "waiting" ? <button type="button" className={styles.button} disabled={busy} onClick={() => onChange(order.id, "ready")}><BellRing size={17} aria-hidden="true" />الطلب جاهز</button>
            : <button type="button" className={styles.button} disabled={busy} onClick={() => onChange(order.id, "received")}><CheckCheck size={17} aria-hidden="true" />تم الاستلام</button>}
          <button type="button" className={styles.danger} disabled={busy} onClick={() => onChange(order.id, "cancelled")} aria-label={`إلغاء الفاتورة ${order.invoiceNumber}`}><X size={16} aria-hidden="true" />إلغاء</button>
        </div>
      )}
      <details className={styles.details}>
        <summary>تفاصيل الطلب والتواصل</summary>
        <dl className={styles.timeline}>
          <div><dt>أضيف بواسطة</dt><dd>{order.createdBy || "إدارة العلامة"}</dd></div>
          <div><dt>مكان الإضافة</dt><dd>{order.createdStation || "غير محدد"}</dd></div>
          <div><dt>استدعاه</dt><dd>{order.calledBy || "لم يتم الاستدعاء"}</dd></div>
          <div><dt>مكان الاستدعاء</dt><dd>{order.calledStation || "غير محدد"}</dd></div>
          <div><dt>وقت الاستلام</dt><dd dir="ltr">{pagerDate(order.receivedAt)}</dd></div>
          <div><dt>مدة التجهيز</dt><dd>{pagerElapsed(order.createdAt, order.readyAt)}</dd></div>
          <div><dt>الانتظار بعد الاستدعاء</dt><dd>{pagerElapsed(order.readyAt, order.receivedAt)}</dd></div>
          <div><dt>رسائل مرسلة</dt><dd>{order.messageCount}</dd></div>
          <div><dt><MessageCircle size={12} className="inline" aria-hidden="true" /> آخر إرسال</dt><dd dir="ltr">{pagerDate(order.lastMessageAt)}</dd></div>
          <div><dt>حالة الرسالة</dt><dd>{messageLabel(order.messageStatus)}</dd></div>
        </dl>
        {order.rating != null && <div className={styles.review}><span className={styles.rating}><Star size={15} aria-hidden="true" />{order.rating} من ٥</span><p>{order.notes || "بدون ملاحظات"}</p><p className={styles.hint}>{pagerDate(order.ratedAt)}</p></div>}
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
