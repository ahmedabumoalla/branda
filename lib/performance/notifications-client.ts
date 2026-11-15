"use client";

import { fetchOwnerNotificationsAction } from "@/app/actions/notifications";
import type { AppNotification } from "@/lib/mock/notifications";
import type { Session } from "@supabase/supabase-js";

const FRESHNESS_MS = 30_000;
type Entry = {
  scope: string;
  cafeSlug: string;
  at: number;
  items: AppNotification[] | null;
  pending: Promise<AppNotification[]> | null;
};
// Keep at most one current account/brand in tab memory, never browser storage.
let current: Entry | null = null;

export function notificationSessionIdentity(session: Session | null): string | null {
  if (!session) return null;
  try {
    const claims = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: string };
    if (claims.session_id) return `${session.user.id}:${claims.session_id}`;
  } catch { /* A malformed identity must not share another session's cache. */ }
  // A missing session id uses the exact credential only as an in-memory key.
  return `${session.user.id}:${session.access_token}`;
}

export function clearOwnerNotificationSnapshot(scope?: string) {
  if (!scope || current?.scope === scope) current = null;
}

export function retainOwnerNotificationBrand(cafeSlug: string) {
  if (current && current.cafeSlug !== cafeSlug) clearOwnerNotificationSnapshot();
}

export function peekOwnerNotifications(scope: string) {
  return current?.scope === scope ? current.items : null;
}

export function getCachedOwnerNotifications(scope: string, cafeSlug: string, force = false): Promise<AppNotification[]> {
  if (!current || current.scope !== scope) current = { scope, cafeSlug, at: 0, items: null, pending: null };
  const entry = current;
  if (entry.pending) return entry.pending;
  if (!force && entry.items && Date.now() - entry.at < FRESHNESS_MS) return Promise.resolve(entry.items);

  const request = fetchOwnerNotificationsAction().then(items => {
    if (current !== entry || items.some(item => item.cafeSlug !== cafeSlug)) throw new Error("Notification context changed");
    entry.items = items;
    entry.at = Date.now();
    return items;
  }).finally(() => {
    if (entry.pending === request) entry.pending = null;
  });
  entry.pending = request;
  return request;
}
