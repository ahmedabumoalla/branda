"use client";
import type { EngagementKind } from "./brand-analytics";
import { activeInterval } from "./customer-usage";
export function reportCustomerUsage(slug: string, kind: EngagementKind, sessionId: string, seconds: number) {
    try {
        const body = JSON.stringify({ slug, kind, sessionId, seconds });
        if (navigator.sendBeacon?.("/api/analytics/customer-activity", new Blob([body], { type: "application/json" })))
            return;
        void fetch("/api/analytics/customer-activity", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body }).catch(() => { });
    }
    catch { /* Measurement never interrupts the customer */ }
}
/** Focused visible recently interacted time only with no persistent identity */
export function startCustomerUsageTracking(slug: string, kind: EngagementKind) {
    const sessionId = crypto.randomUUID();
    let lastTick = performance.now(), lastInteraction = lastTick, milliseconds = 0, sent = -1;
    let engaged = document.visibilityState === "visible" && document.hasFocus();
    const tick = () => { const now = performance.now(); milliseconds += activeInterval(lastTick, now, lastInteraction, engaged); lastTick = now; };
    const report = () => { tick(); const seconds = Math.min(21600, Math.floor(milliseconds / 1000)); if (seconds === sent || (!engaged && sent < 0))
        return; sent = seconds; reportCustomerUsage(slug, kind, sessionId, seconds); };
    const interact = () => { tick(); lastInteraction = performance.now(); };
    const state = () => { report(); engaged = document.visibilityState === "visible" && document.hasFocus(); if (engaged) {
        lastInteraction = performance.now();
        report();
    } };
    report();
    const timer = window.setInterval(report, 20000);
    const interactions = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const event of interactions)
        window.addEventListener(event, interact, { passive: true });
    document.addEventListener("visibilitychange", state);
    window.addEventListener("focus", state);
    window.addEventListener("blur", state);
    window.addEventListener("pagehide", report);
    return () => { report(); window.clearInterval(timer); for (const event of interactions)
        window.removeEventListener(event, interact); document.removeEventListener("visibilitychange", state); window.removeEventListener("focus", state); window.removeEventListener("blur", state); window.removeEventListener("pagehide", report); };
}
