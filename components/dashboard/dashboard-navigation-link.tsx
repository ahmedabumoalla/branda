"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";

// Fetch the complete dynamic page on intent, not every page in the sidebar on mount.
// Next owns the session-aware router cache and invalidation after server mutations.
export function DashboardNavigationLink({ href, prefetch, onPointerEnter, onPointerLeave, onFocus, onBlur, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [preparedHref, setPreparedHref] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = typeof href === "string" ? href : JSON.stringify(href);
  const prepare = () => { if (prefetch !== false) setPreparedHref(key); };
  const cancel = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, [key]);
  return <Link {...props} href={href} prefetch={prefetch !== false && preparedHref === key ? true : false}
    onPointerEnter={event => { cancel(); if (prefetch !== false) timer.current = setTimeout(prepare, 80); onPointerEnter?.(event); }}
    onPointerLeave={event => { cancel(); onPointerLeave?.(event); }}
    onFocus={event => { cancel(); prepare(); onFocus?.(event); }}
    onBlur={event => { cancel(); onBlur?.(event); }}
    onTouchStart={event => { cancel(); prepare(); onTouchStart?.(event); }} />;
}
