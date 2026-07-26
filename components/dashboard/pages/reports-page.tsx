"use client";

import { useMemo } from "react";
import { Activity, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { BentoCard, BentoGrid, DashboardPageShell, StatPill } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import type { CafeOrder } from "@/lib/mock/orders";
import type { CustomerProfile } from "@/lib/mock/customer-activity";
import type { VisitAnalytics } from "@/lib/data/platform-upgrade";

type Props = {
  initialOrders: CafeOrder[];
  initialCustomers: CustomerProfile[];
  visitAnalytics?: VisitAnalytics | null;
  configError?: string;
};

export function ReportsPageClient({ initialOrders, initialCustomers, visitAnalytics, configError }: Props) {
  const completedOrders = useMemo(
    () => initialOrders.filter((order) => order.status === "مقبول"),
    [initialOrders],
  );
  const totalSales = completedOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <DashboardPageShell title="التقارير" subtitle="ملخص الطلبات والعملاء وزيارات الفرع الإلكتروني.">
      {configError ? <BentoCard variant="white" className="mb-6">{configError}</BentoCard> : null}
      <BentoGrid>
        <BentoCard variant="white"><ShoppingBag className="mb-3 h-7 w-7 text-[#6B3A25]" /><StatPill label="الطلبات" value={initialOrders.length} /></BentoCard>
        <BentoCard variant="white"><TrendingUp className="mb-3 h-7 w-7 text-[#6B3A25]" /><StatPill label="إجمالي المبيعات" value={formatSar(totalSales)} /></BentoCard>
        <BentoCard variant="white"><Users className="mb-3 h-7 w-7 text-[#6B3A25]" /><StatPill label="العملاء" value={initialCustomers.length} /></BentoCard>
        <BentoCard variant="white"><Activity className="mb-3 h-7 w-7 text-[#6B3A25]" /><StatPill label="زيارات الفرع" value={visitAnalytics?.totalVisits ?? 0} /></BentoCard>
      </BentoGrid>
    </DashboardPageShell>
  );
}
