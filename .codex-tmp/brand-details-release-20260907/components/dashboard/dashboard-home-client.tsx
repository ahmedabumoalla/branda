"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Gift, PackagePlus, Settings, ShoppingBag, Sparkles, Tags } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
  ownerName: string;
  summary: ReactNode;
  recentOrders: ReactNode;
  trend: ReactNode;
  configError?: string;
};

export function DashboardHomeClient({
  cafeSlug,
  cafeName,
  ownerName,
  summary,
  recentOrders,
  trend,
  configError,
}: Props) {
  const today = new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(new Date());
  const quickActions = [
    { href: "/dashboard/menu?new=1", label: "إضافة منتج", icon: PackagePlus },
    { href: "/dashboard/menu", label: "إدارة المنتجات", icon: ShoppingBag },
    { href: "/dashboard/orders", label: "متابعة الطلبات", icon: ArrowLeft },
    { href: "/dashboard/offers", label: "إنشاء عرض", icon: Tags },
    { href: "/dashboard/loyalty", label: "إدارة المكافآت", icon: Gift },
    { href: "/dashboard/settings", label: "إعدادات العلامة", icon: Settings },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-8">
      <header className="relative overflow-hidden rounded-[32px] bg-[#311912] p-6 text-white shadow-[0_24px_70px_rgba(49,25,18,0.18)] sm:p-8">
        <div className="absolute -left-12 -top-16 h-52 w-52 rounded-full bg-[#D5A557]/20 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-[#F7D991]">
              <Sparkles className="h-4 w-4" />
              الفرع الإلكتروني نشط
            </div>
            <p className="text-sm font-bold text-white/65">{today}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{cafeName}</h1>
            <p className="mt-3 max-w-2xl font-bold text-white/72">
              {ownerName ? `أهلًا ${ownerName}، إليك ما يحتاج انتباهك اليوم.` : "ملخص واضح لما يحدث في علامتك اليوم."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/c/${encodeURIComponent(cafeSlug)}/products/popular`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black transition hover:bg-white/15"
            >
              فتح الفرع
              <ExternalLink className="h-4 w-4" />
            </Link>
            <Link href="/dashboard/menu?new=1" className="rounded-2xl bg-[#F5C85A] px-5 py-3 text-sm font-black text-[#311912]">
              إضافة منتج
            </Link>
          </div>
        </div>
      </header>

      {configError ? (
        <p className="mt-6 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{configError}</p>
      ) : null}

      <div className="mt-6">{summary}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
        {recentOrders}
        {trend}
      </div>
      <section className="mt-6">
        <div className="mb-4">
          <p className="text-xs font-black text-[#A66A42]">اختصارات مفيدة</p>
          <h2 className="mt-1 text-xl font-black text-[#311912]">إجراءات سريعة</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-[22px] border border-[#E7D7C6] bg-white p-4 font-black text-[#311912] transition hover:-translate-y-0.5 hover:border-[#D5A557] hover:shadow-[0_14px_35px_rgba(49,25,18,0.08)]"
            >
              <span className="rounded-2xl bg-[#FCF4E2] p-3 text-[#6B3A25]">
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
