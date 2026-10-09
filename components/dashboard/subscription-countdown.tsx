"use client";

import { useEffect, useState } from "react";
import { subscriptionTimeRemaining, type SubscriptionSummary } from "@/lib/platform/subscription-clock";

export function SubscriptionCountdown({ subscription }: { subscription: SubscriptionSummary }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(interval);
  }, []);
  const remaining = now === null ? null : subscriptionTimeRemaining(subscription.expiresAt, now);
  const trial = subscription.status === "trialing";
  const label = trial ? "الفترة التجريبية" : subscription.planName;
  return <div className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-6 text-[#F0C568]">
    <p>{remaining?.expired ? `انتهت ${label}` : remaining ? `متبقي على ${label} ${remaining.days.toLocaleString("ar-SA")} أيام` : label}</p>
    {remaining && !remaining.expired && <p dir="ltr" className="font-mono tabular-nums text-[#D8CEC5]" aria-label="الوقت المتبقي">
      {remaining.fullDays.toLocaleString("ar-SA")} يوم · {[remaining.hours, remaining.minutes, remaining.seconds].map(value => String(value).padStart(2, "0")).join(":")}
    </p>}
  </div>;
}
