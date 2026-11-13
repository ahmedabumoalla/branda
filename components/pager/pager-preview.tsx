"use client";

import { useState } from "react";
import { PagerConsole, type pagerActions } from "./pager-console";
import type { PagerFilter, PagerOrder, PagerPage } from "@/lib/pager/types";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import styles from "./pager.module.css";

// Isolated in-memory data: this adapter never invokes server actions or providers.
function previewStore() {
  let orders: PagerOrder[] = Array.from({ length: 6 }, (_, index) => ({
    id: `preview-${index}`, cafeId: "preview", invoiceNumber: String(1048 - index), phone: "05••••••01",
    status: index < 3 ? "waiting" : "ready", createdAt: `2026-11-13T13:${String(20 - index * 2).padStart(2, "0")}:00Z`,
    readyAt: index < 3 ? null : "2026-11-13T13:22:00Z", receivedAt: null,
    createdBy: "أحمد", createdStation: "الكاشير", calledBy: index < 3 ? null : "سارة", calledStation: index < 3 ? null : "التسليم",
    rating: null, notes: "", ratedAt: null, messageStatus: index < 3 ? null : index === 5 ? "failed" : "provider_queued",
    lastMessageAt: index < 3 ? null : "2026-11-13T13:22:00Z", messageCount: index < 3 || index === 5 ? 0 : 1,
  }));
  function page(filter: PagerFilter = {}): PagerPage {
    const query = (filter.query || "").toLowerCase();
    const matches = orders.filter(order => (filter.status === "all" || !filter.status || filter.status === "active" && ["waiting", "ready"].includes(order.status) || order.status === filter.status) && (order.invoiceNumber.toLowerCase().includes(query) || order.phone.includes(query)));
    const current = filter.page || 0;
    return { orders: matches.slice(current * 30, (current + 1) * 30), page: current, pageSize: 30, total: matches.length,
      metrics: { total: orders.length, waiting: orders.filter(o => o.status === "waiting").length, ready: orders.filter(o => o.status === "ready").length, received: orders.filter(o => o.status === "received").length, cancelled: orders.filter(o => o.status === "cancelled").length, averagePreparationSeconds: null, averageCollectionSeconds: null, averageRating: null, ratedCount: 0 } };
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 250));
  const actions: typeof pagerActions = {
    async fetchPage(filter) { await pause(); return page(filter); },
    async createOrder(input) {
      await pause();
      const draft = input as { id: string; invoiceNumber: string; phone: string };
      const duplicate = orders.find(o => o.id === draft.id);
      if (duplicate) return { ok: true, order: duplicate };
      if (!draft.invoiceNumber.trim() || !/^\+?\d{9,15}$/.test(draft.phone)) return { ok: false, error: "أدخل رقم الفاتورة ورقم جوال صحيح" };
      if (orders.some(o => o.invoiceNumber === draft.invoiceNumber && ["waiting", "ready"].includes(o.status))) return { ok: false, error: "رقم الفاتورة موجود في الطلبات الحالية" };
      const order: PagerOrder = { ...orders[0], ...draft, cafeId: "preview", status: "waiting", createdAt: new Date().toISOString(), readyAt: null, receivedAt: null, calledBy: null, calledStation: null, rating: null, notes: "", ratedAt: null, messageStatus: null, lastMessageAt: null, messageCount: 0 };
      orders = [order, ...orders];
      return { ok: true, order };
    },
    async updateOrder(id, status) {
      await pause();
      const current = orders.find(o => o.id === id);
      if (!current) return { ok: false, error: "تعذر العثور على الطلب" };
      const now = new Date().toISOString();
      const order: PagerOrder = { ...current, status,
        ...(status === "ready" ? { readyAt: now, calledBy: "أحمد", calledStation: "التسليم", messageStatus: "provider_queued", messageCount: 1, lastMessageAt: now } : {}),
        ...(status === "received" ? { receivedAt: now } : {}),
      };
      orders = orders.map(item => item.id === id ? order : item);
      return { ok: true, order };
    },
  };
  return { initial: page({ status: "active" }), actions };
}

export function PagerPreview() {
  const { t } = useCashierLanguage();
  const [store] = useState(previewStore);
  return <><aside className={styles.previewNotice} dir="rtl">{t("معاينة محلية ببيانات تجريبية لا ترسل رسائل واتساب")}</aside><PagerConsole context={{ cafeId: "preview", cafeName: "فرع التجربة", actorName: "أحمد", station: "الكاشير", kind: "staff", colors: { background: "#264335", foreground: "#ffffff", accent: "#dbb96a" } }} initialPage={store.initial} actions={store.actions} /></>;
}
