"use client";

import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOwnerNotificationsAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import type { AppNotification } from "@/lib/mock/notifications";

type Props = {
  live?: boolean;
  className?: string;
  initialNotifications?: AppNotification[];
};

export function NotificationsPanel({ className = "", initialNotifications = [], live = false }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ source: AppNotification[]; items: AppNotification[] } | null>(null);
  const notifications = loaded?.source === initialNotifications ? loaded.items : initialNotifications;

  const refresh = useCallback(async () => {
    try {
      const list = await fetchOwnerNotificationsAction();
      setLoaded({ source: initialNotifications, items: list });
    } catch {
      // Retain the last known notifications when the connection is unavailable.
    }
  }, [initialNotifications]);

  useEffect(() => { if (!live) return; const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000); return () => clearInterval(timer); }, [refresh, live]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  async function handleMarkRead(id: string) {
    await markNotificationReadAction(id);
    await refresh();
  }

  async function markAllRead() {
    const unread = notifications.filter((notification) => !notification.read);
    await Promise.all(unread.map((notification) => markNotificationReadAction(notification.id)));
    await refresh();
  }

  const panel = open ? createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] bg-black/20"
        aria-label="إغلاق"
        onClick={() => setOpen(false)}
      />
      <section
        dir="rtl"
        className="fixed left-4 right-4 top-20 z-[100] overflow-hidden rounded-[24px] border border-[#E5D8CD] bg-[#FDFBF8] shadow-2xl sm:left-8 sm:right-auto sm:w-[380px]"
      >
        <div className="flex items-center justify-between border-b border-[#E5D8CD] px-4 py-3">
          <h3 className="font-black text-[#3A2117]">الإشعارات</h3>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs font-black text-[#6B3A25]"
            >
              قراءة الكل
            </button>
          ) : null}
        </div>

        <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
          {notifications.length === 0 ? (
            <li className="p-6 text-center text-sm font-bold text-[#7A6255]">
              لا توجد إشعارات
            </li>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <li
                key={notification.id}
                className={`border-b border-[#E5D8CD]/60 px-4 py-3 ${notification.read ? "opacity-60" : "bg-[#FFF8EF]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-[#3A2117]">{notification.title}</p>
                    <p className="mt-1 text-xs font-bold text-[#7A6255]">{notification.body}</p>
                    {notification.type === "salon_booking" && /^[0-9a-f-]{36}$/i.test(notification.meta?.bookingId ?? "") && <Link className="mt-2 inline-block py-2 text-sm font-bold underline" href={`/dashboard/bookings?booking=${notification.meta!.bookingId}`} onClick={() => { setOpen(false); void handleMarkRead(notification.id); }}>فتح الحجز</Link>}
                    <p className="mt-1 text-[10px] text-[#7A6255]">
                      {new Date(notification.createdAt).toLocaleString("ar-SA")}
                    </p>
                  </div>
                  {!notification.read ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notification.id)}
                      className="shrink-0 rounded-lg bg-green-50 p-1.5 text-green-700"
                      aria-label="قراءة"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center justify-center gap-1 border-t border-[#E5D8CD] py-3 text-xs font-black text-[#7A6255]"
        >
          <X className="h-3 w-3" />
          إغلاق
        </button>
      </section>
    </>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { if (!open && (live || notifications.length === 0)) void refresh(); setOpen(value => !value); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F6C35B] transition hover:bg-white/10"
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  );
}
