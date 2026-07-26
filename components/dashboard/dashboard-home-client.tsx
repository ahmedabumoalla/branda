"use client";

import Link from "next/link";
import { Camera, Package, ShoppingBag, Users } from "lucide-react";
import { BentoCard, BentoGrid, DashboardPageShell, StatPill } from "@/components/ui/design-system";
import type { CafeOrder } from "@/lib/mock/orders";
import type { CustomerProfile } from "@/lib/mock/customer-activity";

type Props = {
  customers: CustomerProfile[];
  orders: CafeOrder[];
  productCount: number;
  experienceSubmissionCount: number;
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
  ownerName: string;
  configError?: string;
};

export function DashboardHomeClient({
  customers,
  orders,
  productCount,
  experienceSubmissionCount,
  cafeName,
  ownerName,
  configError,
}: Props) {
  return (
    <DashboardPageShell
      title={`لوحة ${cafeName}`}
      subtitle={ownerName ? `أهلًا ${ownerName}، تابع أداء علامتك اليوم.` : "ملخص أداء العلامة اليومي."}
    >
      {configError ? (
        <BentoCard variant="white" className="mb-6">
          <p className="font-bold text-red-700">{configError}</p>
        </BentoCard>
      ) : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="white">
          <ShoppingBag className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="الطلبات" value={orders.length} />
        </BentoCard>
        <BentoCard variant="white">
          <Users className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="العملاء" value={customers.length} />
        </BentoCard>
        <BentoCard variant="white">
          <Package className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="المنتجات" value={productCount} />
        </BentoCard>
        <BentoCard variant="white">
          <Camera className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="مشاركات توثيق التجربة" value={experienceSubmissionCount} />
        </BentoCard>
      </BentoGrid>

      <BentoCard variant="gold">
        <h2 className="text-xl font-black text-[#311912]">إجراءات سريعة</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["/dashboard/menu", "إدارة المنتجات"],
            ["/dashboard/offers", "إدارة العروض"],
            ["/dashboard/orders", "متابعة الطلبات"],
            ["/dashboard/settings", "إعدادات العلامة"],
          ].map(([href, title]) => (
            <Link key={href} href={href} className="rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#311912]">
              {title}
            </Link>
          ))}
        </div>
      </BentoCard>
    </DashboardPageShell>
  );
}
