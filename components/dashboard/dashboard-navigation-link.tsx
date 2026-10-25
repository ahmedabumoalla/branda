"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// Fetch the complete dynamic page on intent, not every page in the sidebar on mount.
// Next owns the session-aware router cache and invalidation after server mutations.
export function DashboardNavigationLink({ href, prefetch, onPointerEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [preparedHref, setPreparedHref] = useState<string | null>(null);
  const key = typeof href === "string" ? href : JSON.stringify(href);
  const prepare = () => { if (prefetch !== false) setPreparedHref(key); };
  return <Link {...props} href={href} prefetch={prefetch !== false && preparedHref === key ? true : false}
    onPointerEnter={event => { prepare(); onPointerEnter?.(event); }}
    onFocus={event => { prepare(); onFocus?.(event); }}
    onTouchStart={event => { prepare(); onTouchStart?.(event); }} />;
}
