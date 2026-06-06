"use client";

import { Bell, Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCustomerNotificationsAction,
  markCustomerNotificationReadAction,
} from "@/app/actions/customer";
import type { AppNotification } from "@/lib/mock/notifications";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  slug: string;
  customerId: string;
  experience: ThemeExperience;
};

export function CustomerNotifications({ slug, customerId, experience }: Props) {
  const { theme } = experience;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    const list = await fetchCustomerNotificationsAction(slug);
    setNotifications(list);
  }, [slug, customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  async function handleMarkRead(id: string) {
    await markCustomerNotificationReadAction(slug, id);
    await refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-2xl ${theme.card}`}
        aria-label="الإشعارات"
      >
        <Bell className={`h-4 w-4 ${theme.accent}`} />
        {unreadCount > 0 ? (
          <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black text-white">
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
          <div
            className={`absolute left-0 top-12 z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-xl ${theme.card}`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-3 ${theme.muted}`}>
              <h3 className="font-black">إشعاراتي</h3>
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className={`p-5 text-center text-sm font-bold ${theme.muted}`}>
                  لا توجد إشعارات
                </li>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <li
                    key={n.id}
                    className={`border-b px-4 py-3 ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black">{n.title}</p>
                        <p className={`mt-1 text-xs font-bold ${theme.muted}`}>{n.body}</p>
                      </div>
                      {!n.read ? (
                        <button
                          onClick={() => void handleMarkRead(n.id)}
                          className="shrink-0 rounded-lg p-1.5 opacity-80"
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
              className={`flex w-full items-center justify-center gap-1 py-2 text-xs font-black ${theme.muted}`}
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
