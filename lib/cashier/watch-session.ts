// One in-flight check per tab; a network outage never logs the employee out.
export function watchCashierSession(target: Window, document: Document) {
  let pending = false;
  let stopped = false;
  let navigating = false;
  const controller = new AbortController();
  const check = async () => {
    if (pending || stopped || navigating) return;
    pending = true;
    try {
      const response = await target.fetch("/api/cashier/session", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (response.status === 401 && !stopped) {
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
  void check();
  return () => {
    stopped = true;
    controller.abort();
    for (const event of events) document.removeEventListener(event, check, true);
    target.removeEventListener("focus", check);
    target.removeEventListener("pageshow", check);
  };
}
