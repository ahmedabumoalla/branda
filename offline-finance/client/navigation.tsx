import React, { useSyncExternalStore } from "react";
const eventName = "branda:local-route";
for (const method of ["pushState", "replaceState"] as const) {
  const original = history[method].bind(history);
  history[method] = (data: any, unused: string, url?: string | URL | null) => { original(data, unused, url); window.dispatchEvent(new Event(eventName)); };
}
const subscribe = (listener: () => void) => { window.addEventListener("popstate", listener); window.addEventListener(eventName, listener); return () => { window.removeEventListener("popstate", listener); window.removeEventListener(eventName, listener); }; };
export function useLocation() { return useSyncExternalStore(subscribe, () => location.pathname + location.search, () => "/dashboard/finance"); }
export function useSearchParams() { useLocation(); return new URLSearchParams(location.search); }
export function usePathname() { useLocation(); return location.pathname; }
const router = { push: (url: string) => history.pushState(null, "", url), replace: (url: string) => history.replaceState(null, "", url), refresh: () => window.dispatchEvent(new Event("branda:session-refresh")), back: () => history.back(), forward: () => history.forward(), prefetch: async () => {} };
export function useRouter() { return router; }
export function redirect(url: string): never { location.assign(url); throw new Error("Redirecting"); }
export function notFound(): never { throw new Error("الصفحة غير موجودة"); }
export default function Link({ href, children, onClick, prefetch: _prefetch, scroll: _scroll, replace, ...props }: any) {
  const target = typeof href === "string" ? href : href.pathname + (href.query ? "?" + new URLSearchParams(href.query).toString() : "");
  return <a {...props} href={target} onClick={event => { onClick?.(event); if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0 && props.target !== "_blank" && new URL(target, location.href).origin === location.origin) { event.preventDefault(); history[replace ? "replaceState" : "pushState"](null, "", target); } }}>{children}</a>;
}
