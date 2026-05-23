"use client";

import { ClipboardList, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminFilterBar,
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  AdminInput,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  PLATFORM_OPERATIONS_KEY,
  mockPlatformOperations,
  type PlatformOperation,
} from "@/lib/platform/admin-data";
import { formatSar } from "@/lib/format";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

function operationTone(status: string): "success" | "warning" | "danger" | "neutral" | "gold" {
  if (status.includes("مكتمل") || status.includes("نجح")) return "success";
  if (status.includes("قيد") || status.includes("انتظار")) return "warning";
  if (status.includes("ملغ") || status.includes("فشل")) return "danger";
  return "neutral";
}

export function AdminOperationsPage() {
  const [operations, setOperations] = useState<PlatformOperation[]>(mockPlatformOperations);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(PLATFORM_OPERATIONS_KEY);
    if (saved) setOperations(JSON.parse(saved));
  }, []);

  const filtered = useMemo(() => {
    return operations.filter(
      (op) =>
        op.title.includes(query) ||
        op.cafeName.includes(query) ||
        op.type.includes(query) ||
        op.customerName?.includes(query)
    );
  }, [operations, query]);

  return (
    <AdminPageShell
      title="كل العمليات"
      subtitle="سجل كامل لكل طلب وحجز ودفع وتقييم وتغيير يتم داخل المنصة."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[200px]">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في العمليات..."
            className="pr-12"
          />
        </div>
        <div className={`min-w-[180px] ${softPanel}`}>
          <AdminStatPill label="النتائج" value={filtered.length} hint={`من ${operations.length} عملية`} />
        </div>
      </AdminFilterBar>

      <BentoGrid className="xl:grid-cols-1">
        {filtered.map((op) => (
          <BentoCard key={op.id} variant="dark" span="4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_16px_rgba(246,195,91,0.15)]">
                  <ClipboardList className="h-7 w-7" />
                </div>
                <div>
                  <StatusBadge tone="gold">{op.type}</StatusBadge>
                  <h2 className="mt-2 text-2xl font-black text-[#F8F4EF]">{op.title}</h2>
                  <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                    {op.cafeName} {op.customerName ? `• ${op.customerName}` : ""} • {op.createdAt}
                  </p>
                </div>
              </div>

              <div className={`flex flex-col items-start gap-2 md:items-end ${softPanel}`}>
                {op.amount ? (
                  <p className="text-2xl font-black text-[#F6C35B]">{formatSar(op.amount)}</p>
                ) : null}
                <StatusBadge tone={operationTone(op.status)}>{op.status}</StatusBadge>
              </div>
            </div>
          </BentoCard>
        ))}
      </BentoGrid>
    </AdminPageShell>
  );
}
