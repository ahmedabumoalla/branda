"use client";

import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markNotificationReadAction } from "@/app/actions/notifications";
import type { AppNotification } from "@/lib/mock/notifications";
import { createClient } from "@/lib/supabase/client";
import { clearOwnerNotificationSnapshot, getCachedOwnerNotifications, notificationSessionIdentity, peekOwnerNotifications } from "@/lib/performance/notifications-client";
import type { Session } from "@supabase/supabase-js";

type Props = {
  live?: boolean;
  className?: string;
  cafeSlug: string;
};

export function NotificationsPanel({ className = "", cafeSlug, live = false }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const identity = useRef<string | null | undefined>(undefined);
  const generation = useRef(0);
  const request = useRef(0);
  const mutation = useRef(false);

  const observeSession = useCallback((session: Session | null) => {
    const next = notificationSessionIdentity(session);
    if (identity.current !== undefined && identity.current !== next) {
      generation.current++;
      clearOwnerNotificationSnapshot();
      setNotifications(null);
      setError("تغيرت الجلسة أعد تحديث الإشعارات");
      setLoading(false);
    }
    identity.current = next;
    if (!next) clearOwnerNotificationSnapshot();
    return next;
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!mounted.current || !cafeSlug) return;
    const run = ++request.current;
    const before = generation.current;
    setLoading(true);
    try {
      const client = createClient();
      const { data, error: sessionError } = await client.auth.getSession();
      if (!mounted.current || run !== request.current || before !== generation.current) return;
      if (sessionError) throw sessionError;
      const sessionIdentity = observeSession(data.session);
      if (!sessionIdentity) throw new Error("Notification session unavailable");
      const scope = `${sessionIdentity}:${cafeSlug}`;
      const cached = peekOwnerNotifications(scope);
      if (cached) setNotifications(cached);
      const currentGeneration = generation.current;
      const list = await getCachedOwnerNotifications(scope, cafeSlug, force);
      // Cookie-only account changes may not emit a browser Auth event.
      const latest = await client.auth.getSession();
      if (!mounted.current || run !== request.current || currentGeneration !== generation.current) return;
      if (latest.error) throw latest.error;
      if (notificationSessionIdentity(latest.data.session) !== sessionIdentity) {
        observeSession(latest.data.session);
        throw new Error("Notification session changed");
      }
      setNotifications(list);
      setError("");
    } catch {
      if (mounted.current && run === request.current) setError("تعذر تحديث الإشعارات حاول مجددًا");
    } finally {
      if (mounted.current && run === request.current) setLoading(false);
    }
  }, [cafeSlug, observeSession]);

  useEffect(() => {
    mounted.current = true;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (mounted.current) observeSession(session);
    });
    void refresh();
    return () => { mounted.current = false; request.current++; data.subscription.unsubscribe(); };
  }, [observeSession, refresh]);

  useEffect(() => {
    const foreground = () => { if (!document.hidden && navigator.onLine) void refresh(); };
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    const timer = live ? window.setInterval(foreground, 30000) : null;
    return () => { window.removeEventListener("focus", foreground); window.removeEventListener("online", foreground); if (timer !== null) window.clearInterval(timer); };
  }, [refresh, live]);

  const unreadCount = useMemo(
    () => notifications?.filter((notification) => !notification.read).length ?? 0,
    [notifications]
  );

  async function markRead(ids: string[]) {
    if (mutation.current || !ids.length) return;
    mutation.current = true;
    setSaving(true);
    const originalIdentity = identity.current;
    const originalScope = `${originalIdentity}:${cafeSlug}`;
    try {
      await Promise.all(ids.map(id => markNotificationReadAction(id)));
      clearOwnerNotificationSnapshot(originalScope);
      if (mounted.current && identity.current === originalIdentity) await refresh(true);
    } catch {
      clearOwnerNotificationSnapshot(originalScope);
      if (mounted.current && identity.current === originalIdentity) setError("تعذر تأكيد قراءة الإشعارات حاول مجددًا");
    } finally {
      mutation.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const handleMarkRead = (id: string) => markRead([id]);
  const markAllRead = () => markRead(notifications?.filter(notification => !notification.read).map(notification => notification.id) ?? []);

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
              disabled={saving}
              className="text-xs font-black text-[#6B3A25]"
            >
              قراءة الكل
            </button>
          ) : null}
        </div>

        {error && <div role="alert" className="border-b border-[#E5D8CD] bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>{error}{notifications && " المعروض آخر تحديث ناجح"}</p><button type="button" disabled={loading || saving} className="mt-2 min-h-9 font-bold underline" onClick={() => void refresh(true)}>إعادة المحاولة</button></div>}
        {loading && <p role="status" aria-live="polite" className="px-4 py-3 text-sm text-[#7A6255]">جارٍ تحديث الإشعارات</p>}
        <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
          {notifications?.length === 0 ? (
            <li className="p-6 text-center text-sm font-bold text-[#7A6255]">
              لا توجد إشعارات
            </li>
          ) : (
            notifications?.slice(0, 20).map((notification) => (
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
                      disabled={saving}
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
        onClick={() => { if (!open) void refresh(); setOpen(value => !value); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F6C35B] transition hover:bg-white/10"
        aria-label="الإشعارات"
        aria-expanded={open}
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
