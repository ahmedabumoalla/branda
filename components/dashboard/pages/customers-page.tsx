"use client";

import { ShoppingBag, Users } from "lucide-react";
import { BentoCard, BentoGrid, DashboardPageShell, StatPill } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import type { CustomerProfile } from "@/lib/mock/customer-activity";
import type { CustomerOrder } from "@/lib/mock/customer-activity";

type Props = {
  initialCustomers: CustomerProfile[];
  initialOrders: CustomerOrder[];
  configError?: string;
};

export function CustomersPageClient({ initialCustomers, initialOrders, configError }: Props) {
  return (
    <DashboardPageShell title="العملاء" subtitle="سجل العملاء وملخص طلباتهم.">
      {configError ? <BentoCard variant="white" className="mb-6">{configError}</BentoCard> : null}
      <BentoGrid className="mb-6">
        <BentoCard variant="white"><Users className="mb-3 h-7 w-7" /><StatPill label="العملاء" value={initialCustomers.length} /></BentoCard>
        <BentoCard variant="white"><ShoppingBag className="mb-3 h-7 w-7" /><StatPill label="الطلبات" value={initialOrders.length} /></BentoCard>
      </BentoGrid>
      <div className="grid gap-3">
        {initialCustomers.map((customer) => {
          const orders = initialOrders.filter((order) => order.customerId === customer.id);
          const spent = orders.reduce((sum, order) => sum + order.total, 0);
          return (
            <BentoCard key={customer.id} variant="white">
              <h2 className="font-black">{customer.fullName}</h2>
              <p className="mt-1 text-sm">{customer.phone}</p>
              <p className="mt-3 font-bold">الطلبات: {orders.length} — الإنفاق: {formatSar(spent)}</p>
            </BentoCard>
          );
        })}
      </div>
    </DashboardPageShell>
  );
}
