"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import DashboardLoading from "@/app/dashboard/loading";

// Instant feedback for every dashboard link. The loading skeleton appears the moment an internal link is
// clicked and stays until the address actually changes, so a page that is still being prepared by the
// server never looks frozen. It does not start, cancel or speed up the navigation itself: the page content
// stays mounted underneath and the router works exactly as before.
const SHOW_AFTER_MS = 70;   // skip the flash when the next page is already cached
const GIVE_UP_MS = 15000;   // a click that never changes the address must not block the page

export function NavigationPending({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const timers = useRef<{ show?: number; poll?: number; stop?: number }>({});

  useEffect(() => {
    const clear = () => {
      const current = timers.current;
      if (current.show) window.clearTimeout(current.show);
      if (current.poll) window.clearInterval(current.poll);
      if (current.stop) window.clearTimeout(current.stop);
      timers.current = {};
      setPending(false);
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.dataset.noPending !== undefined) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/(dashboard|finance)(\/|$)/.test(url.pathname)) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      clear();
      const from = window.location.href;
      timers.current.show = window.setTimeout(() => { if (window.location.href === from) setPending(true); }, SHOW_AFTER_MS);
      timers.current.poll = window.setInterval(() => { if (window.location.href !== from) clear(); }, 60);
      timers.current.stop = window.setTimeout(clear, GIVE_UP_MS);
    };
    // Capture phase: the click is seen before any link handler runs, on every link in the shell and the page.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", clear);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", clear); clear(); };
  }, []);

  return <div style={{ position: "relative", minHeight: pending ? "100vh" : undefined }}>
    {pending && <div aria-busy="true" style={{ position: "absolute", inset: 0, zIndex: 40, overflow: "hidden", background: "#FCF8F3" }}><DashboardLoading /></div>}
    <div aria-hidden={pending || undefined} style={pending ? { visibility: "hidden" } : undefined}>{children}</div>
  </div>;
}
