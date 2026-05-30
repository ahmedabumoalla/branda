"use client";

import { Bell, Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppNotification } from "@/lib/mock/notifications";
import {
  getNotificationsForAudience,
  markNotificationRead,
} from "@/lib/platform/notification-flow";

const CAFE_SLUG = "qatrah";

type Props = {
  className?: string;
};

export function NotificationsPanel({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  function refresh() {
    setNotifications(getNotificationsForAudience("cafe", CAFE_SLUG));
  }

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  function handleMarkRead(id: string) {
    markNotificationRead(id);
    refresh();
  }

  function markAllRead() {
    notifications.filter((n) => !n.read).forEach((n) => markNotificationRead(n.id));
    refresh();
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-[#E5D8CD] bg-[#FDFBF8] shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E5D8CD] px-4 py-3">
              <h3 className="font-black text-[#3A2117]">إشعارات الكوفي</h3>
              {unreadCount > 0 ? (
                <button
                  onClick={markAllRead}
                  className="text-xs font-black text-[#6B3A25]"
                >
                  قراءة الكل
                </button>
              ) : null}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="p-6 text-center text-sm font-bold text-[#7A6255]">
                  لا توجد إشعارات
                </li>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-[#E5D8CD]/60 px-4 py-3 ${n.read ? "opacity-60" : "bg-[#FFF8EF]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-[#3A2117]">{n.title}</p>
                        <p className="mt-1 text-xs font-bold text-[#7A6255]">{n.body}</p>
                        <p className="mt-1 text-[10px] text-[#7A6255]">
                          {new Date(n.createdAt).toLocaleString("ar-SA")}
                        </p>
                      </div>
                      {!n.read ? (
                        <button
                          onClick={() => handleMarkRead(n.id)}
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
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-1 border-t border-[#E5D8CD] py-2 text-xs font-black text-[#7A6255]"
            >
              <X className="h-3 w-3" />
              إغلاق
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
