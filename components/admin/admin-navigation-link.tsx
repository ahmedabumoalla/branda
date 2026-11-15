"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// Admin sidebar only. Each link prefetches the shared admin loading shell while visible,
// so a click paints the destination at once instead of waiting for the server to answer.
// The complete dynamic page is still fetched on intent, matching DashboardNavigationLink,
// and Next keeps owning the session-aware router cache and its invalidation.
export function AdminNavigationLink({ href, onPointerEnter, onPointerLeave, onFocus, onBlur, onTouchStart, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [preparedHref, setPreparedHref] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = typeof href === "string" ? href : JSON.stringify(href);
  const prepare = () => setPreparedHref(key);
  const cancel = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, [key]);
  return <Link {...props} href={href} prefetch={preparedHref === key ? true : "auto"}
    onPointerEnter={event => { cancel(); timer.current = setTimeout(prepare, 80); onPointerEnter?.(event); }}
    onPointerLeave={event => { cancel(); onPointerLeave?.(event); }}
    onFocus={event => { cancel(); prepare(); onFocus?.(event); }}
    onBlur={event => { cancel(); onBlur?.(event); }}
    onTouchStart={event => { cancel(); prepare(); onTouchStart?.(event); }} />;
}
