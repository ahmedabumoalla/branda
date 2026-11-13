// One in-flight check per tab; a network outage never logs the employee out.
export function watchCashierSession(target: Window, document: Document, workspaceKey?: string) {
  let pending = false;
  let stopped = false;
  let navigating = false;
  const controller = new AbortController();
  const check = async () => {
    if (pending || stopped || navigating) return;
    pending = true;
    try {
      const response = await target.fetch(workspaceKey ? `/api/cashier/session?workspace=${encodeURIComponent(workspaceKey)}` : "/api/cashier/session", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (response.status === 409 && !stopped) {
        navigating = true;
        target.location.replace(target.location.pathname === "/pager" ? "/pager" : "/cashier");
      } else if (response.status === 401 && !stopped) {
        navigating = true;
        target.location.replace("/cashier/session/clear?reason=session");
      }
    } catch { /* Keep the current operation and request ID when offline */ }
    finally { pending = false; }
  };
  const events = ["click", "submit", "change"] as const;
  for (const event of events) document.addEventListener(event, check, true);
  target.addEventListener("focus", check);
  target.addEventListener("pageshow", check);
  const heartbeat = target.setInterval(check, 6 * 60 * 60 * 1000);
  void check();
  return () => {
    stopped = true;
    target.clearInterval(heartbeat);
    controller.abort();
    for (const event of events) document.removeEventListener(event, check, true);
    target.removeEventListener("focus", check);
    target.removeEventListener("pageshow", check);
  };
}
