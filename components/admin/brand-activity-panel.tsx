"use client";

import { useEffect, useState } from "react";
import { fetchAdminBrandActivityAction } from "@/app/actions/admin-brand-activity";
import { BentoCard } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";

type Activity = Awaited<ReturnType<typeof fetchAdminBrandActivityAction>>;
type Entry = { promise: Promise<Activity>; data?: Activity; expiresAt: number };
// Owned by this directory instance, cleared by a new server snapshot or navigation.
export type BrandActivityCache = Map<string, Entry>;

export function BrandActivityPanel({ cafeId, cache, preview }: {
  cafeId: string; cache: BrandActivityCache; preview?: Activity;
}) {
  const [data, setData] = useState<Activity | undefined>(() => preview ?? cache.get(cafeId)?.data);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (preview) return;
    let active = true;
    let entry = cache.get(cafeId);
    if (!entry || entry.expiresAt <= Date.now()) {
      const next: Entry = { promise: fetchAdminBrandActivityAction(cafeId), data: entry?.data, expiresAt: Infinity };
      cache.set(cafeId, next);
      next.promise = next.promise.then(result => {
        next.data = result;
        next.expiresAt = Date.now() + 60_000;
        return result;
      }, cause => {
        if (cache.get(cafeId) === next) cache.delete(cafeId);
        throw cause;
      });
      entry = next;
    }
    entry.promise.then(result => {
      if (active) { setData(result); setError(""); }
    }, () => {
      if (active) setError("تعذر تحميل نشاط العلامة حاول مجددًا");
    });
    return () => { active = false; };
  }, [cafeId, cache, preview, attempt]);

  return <div className="space-y-5">
    {error && <div role="alert" className="rounded-2xl border border-red-400/30 p-4 text-sm text-red-200">
      {error}
      <button type="button" className="ms-3 rounded-lg border border-white/20 px-3 py-2" onClick={() => { setError(""); setAttempt(value => value + 1); }}>إعادة المحاولة</button>
    </div>}
    {!data && !error && <p role="status" className="py-4 text-sm text-[#B7AEA2]">جار تحميل نشاط العلامة</p>}
    {data && <>
      <BentoCard variant="dark" span="2">
        <h3 className="mb-4 text-xl font-semibold text-[#F8F4EF]">آخر العمليات المرتبطة</h3>
        <div className="space-y-2">
          {data.operations.map(operation => <div key={operation.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F8F4EF]">{operation.title}</p>
              <span className="text-xs font-medium text-[#CBB29C]">{operation.createdAt}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-[#B7AEA2]">{operation.type} {operation.amount ? `• ${formatSar(operation.amount)}` : ""}</p>
          </div>)}
          {!data.operations.length && <p className="py-6 text-center font-medium text-[#B7AEA2]">لا توجد عمليات حديثة</p>}
        </div>
      </BentoCard>
      <BentoCard variant="dark" span="2">
        <h3 className="mb-4 text-xl font-semibold text-[#F8F4EF]">عملاء العلامة</h3>
        <div className="space-y-2">
          {data.customers.map(customer => <div key={customer.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-[#F8F4EF]">{customer.fullName}</p>
            <p className="text-xs font-medium text-[#B7AEA2]">{customer.phone} {customer.email ? `• ${customer.email}` : ""}</p>
          </div>)}
          {!data.customers.length && <p className="py-6 text-center font-medium text-[#B7AEA2]">لا يوجد عملاء مسجلون</p>}
        </div>
      </BentoCard>
    </>}
  </div>;
}
