"use client";
import { useEffect, useState } from "react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { activeOfflineSession, lockOfflineSession } from "@/lib/finance/pos-offline-storage";
import { posScope } from "@/lib/finance/pos-offline";
import { FinancePOS } from "./finance-pos";

export function FinanceOfflineEntry() {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void activeOfflineSession().then(async session => {
      if (!active) return;
      const requestedSlug = location.pathname.match(/^\/finance\/([^/]+)\/pos\/?$/)?.[1];
      if (!session || (requestedSlug && requestedSlug !== session.snapshot.cafe.slug)) { setError("افتح الكاشير وسجل الدخول أثناء الاتصال أولًا لتجهيز هذا الجهاز"); return; }
      if (navigator.onLine) {
        try {
          const response = await fetch(`/api/finance/${encodeURIComponent(session.snapshot.cafe.slug)}/pos-sync`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (response.status === 401 || response.status === 403) { await lockOfflineSession(); setError("سجل الدخول مجددًا للوصول إلى الكاشير"); return; }
          if (response.ok) { const body = await response.json(); if (posScope(body.snapshot) !== session.scope) { await lockOfflineSession(); setError("سجل الدخول بنفس حساب الموظف للوصول إلى بياناته"); return; } }
        } catch { /* A validated local session remains available during transport outages. */ }
      }
      if (active) setSnapshot(session.snapshot);
    }).catch(() => { if (active) setError("تعذر قراءة بيانات الجهاز تحقق من مساحة التخزين وإعدادات المتصفح"); });
    return () => { active = false; };
  }, []);
  if (!snapshot) return <main dir="rtl" className="p-8 text-center"><h1>كاشير برندة</h1><p role="status">{error || "جار استعادة المنتجات والفواتير المحفوظة على الجهاز"}</p></main>;
  return <FinancePOS initialSnapshot={snapshot} slug={snapshot.cafe.slug} offlineEntry />;
}
