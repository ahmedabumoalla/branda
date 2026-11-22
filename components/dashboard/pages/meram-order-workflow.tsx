"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Check, MessageCircle } from "lucide-react";
import type { GiftOrder, GiftOrderCommand } from "@/lib/commerce/gift-orders";
import styles from "./gift-orders-page.module.css";

type Props = {
  order: GiftOrder;
  busy: boolean;
  command: (value: Omit<GiftOrderCommand, "requestId">) => Promise<boolean>;
};

function customerConversation(order: GiftOrder) {
  if (!/^\+?\d{9,15}$/.test(order.phone)) return null;
  const message = `أهلًا ${order.customerName}، معك فريق ميرام بخصوص طلبك رقم ${order.number} لتنسيق الدفع والتسليم`;
  return `https://wa.me/${order.phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}

export function MeramOrderWorkflow({ order, busy, command }: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const submitting = useRef(false);
  const conversation = customerConversation(order);
  const inProgress = ["accepted", "preparing", "ready"].includes(order.status);
  const canReject = (order.status === "pending" || order.status === "quote_requested") && order.paymentStatus === "unpaid";

  async function acceptAndContact() {
    if (!conversation || busy || submitting.current) return;
    submitting.current = true;
    try {
      if (await command({ id: order.id, action: "accept" })) window.location.assign(conversation);
    } finally {
      submitting.current = false;
    }
  }

  async function reject(event: FormEvent) {
    event.preventDefault();
    if (!canReject || reason.trim().length < 3 || busy || submitting.current) return;
    submitting.current = true;
    try {
      if (await command({ id: order.id, action: "cancel", note: reason.trim() })) setRejecting(false);
    } finally {
      submitting.current = false;
    }
  }

  if (order.status === "cancelled") {
    return <section className={styles.noteBox}>
      <h3>سبب رفض الطلب</h3><p className={styles.pre}>{order.rejectionReason || "لم يُسجّل سبب لهذا الطلب"}</p>
      {order.notificationStatus && <p className={styles.hint}>{
        order.notificationStatus === "sent" ? "قبل واتساب إشعار الرفض للإرسال" :
        order.notificationStatus === "pending" ? "إشعار الرفض بانتظار الإرسال عبر واتساب ميرام" :
        order.notificationStatus === "failed" ? "رفض واتساب إرسال الإشعار" : "تعذر تأكيد إرسال إشعار واتساب"
      }</p>}
      {(order.notificationStatus === "pending" || order.notificationStatus === "failed") &&
        <Link className={styles.meramNavLink} href="/dashboard/brand-phone">إدارة ربط واتساب ميرام</Link>}
    </section>;
  }
  if (order.status === "completed" || order.status === "refunded") return null;

  return <section className={styles.actionBox} aria-label="إجراءات طلب ميرام">
    {rejecting ? <form onSubmit={reject}>
      <label className={styles.field}>سبب الرفض الذي سيصل للعميل
        <textarea required autoFocus minLength={3} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      <div className={styles.actionRow}>
        <button type="submit" className={styles.danger} disabled={busy || reason.trim().length < 3}>رفض وإشعار العميل</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => setRejecting(false)}>رجوع</button>
      </div>
    </form> : <div className={styles.actionRow}>
      {order.status === "pending" && <button type="button" className={styles.primary} disabled={busy || !conversation} onClick={acceptAndContact}><MessageCircle size={17} aria-hidden="true" />تأكيد وتواصل</button>}
      {inProgress && <>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => command({ id: order.id, action: "complete" })}><Check size={17} aria-hidden="true" />تم التسليم</button>
        {conversation && <a href={conversation} className={styles.secondary} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" />تواصل مع العميل</a>}
      </>}
      {canReject && <button type="button" className={styles.danger} disabled={busy} onClick={() => setRejecting(true)}>رفض الطلب</button>}
    </div>}
  </section>;
}
