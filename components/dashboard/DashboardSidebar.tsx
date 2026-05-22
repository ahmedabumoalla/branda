"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Gift,
  Home,
  Megaphone,
  MessageSquareText,
  Newspaper,
  Package,
  Share2,
  MapPin,
  ShoppingBag,
  Star,
  Users,
  Palette, Settings,
} from "lucide-react";

const cafeSlug = "qatrah";

const links = [
  ["الرئيسية", "/dashboard", Home],
  ["المنيو", "/dashboard/menu", Package],
  ["العروض", "/dashboard/offers", Gift],
  ["الحجوزات", "/dashboard/reservations", CalendarDays],
  ["العملاء", "/dashboard/customers", Users],
  ["الولاء", "/dashboard/loyalty", Star],
  ["التقارير", "/dashboard/reports", BarChart3],
  ["الأسئلة والتقييمات", "/dashboard/reviews", MessageSquareText],
  ["الصفحات التعريفية", "/dashboard/pages", Newspaper],
  ["الأدوات التسويقية", "/dashboard/marketing", Megaphone],
  ["طلبات الكوفي", "/dashboard/orders", ShoppingBag],
  ["إعدادات الكوفي", "/dashboard/settings", Settings],
  ["ثيم الكوفي", "/dashboard/theme", Palette],
  ["الفروع", "/dashboard/branches", MapPin],
] as const;

export function DashboardSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll fixed right-0 top-0 z-40 h-screen w-72 overflow-y-auto bg-[#3A2117] text-[#F8E8D2] shadow-2xl"
    >
      <div className="min-h-full px-6 py-6">
        <div className="mb-10 text-right">
          <h1 className="text-3xl font-black leading-none">برندة</h1>
          <p className="mt-2 text-sm font-bold text-[#CBB29C]">
            لوحة تحكم الكوفي
          </p>
        </div>

        <div className="mb-10 rounded-[28px] bg-white/10 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-[#CBB29C]">الكوفي الحالي</p>
              <h2 className="mt-2 text-3xl font-black text-[#F8E8D2]">
                قطرة
              </h2>
            </div>

            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#F8E8D2] shadow-lg">
                <span className="text-3xl font-black text-[#3A2117]">ق</span>
              </div>

              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-xl bg-[#CBB29C] px-3 py-1 text-xs font-black text-[#3A2117]">
                كوفي
              </span>
            </div>
          </div>

          <div className="mt-7 flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#CBB29C] text-[#3A2117]"
            >
              <Share2 className="h-5 w-5" />
            </button>

            <Link
              href={`/c/${cafeSlug}`}
              target="_blank"
              className="flex h-10 flex-1 items-center justify-center rounded-full border border-[#CBB29C] bg-[#3A2117] px-4 text-sm font-black text-[#F8E8D2] transition hover:bg-[#2B1710]"
            >
              زيارة الكوفي
            </Link>
          </div>

          <p className="mt-4 text-center text-xs font-bold text-[#CBB29C]">
            qatrah.branda.com
          </p>
        </div>

        <nav className="space-y-3 pb-10">
          {links.map(([title, href, Icon]) => {
            const active = isActive(href);

            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-between rounded-2xl px-4 py-4 text-[16px] font-black transition ${
                  active
                    ? "bg-white/10 text-[#F8E8D2] shadow-inner"
                    : "text-[#F8E8D2] hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-3">
                  {title === "طلبات الكوفي" ? (
                    <span className="rounded-full bg-[#CBB29C] px-3 py-1 text-xs font-black text-[#3A2117]">
                      جديد
                    </span>
                  ) : (
                    <span />
                  )}
                </span>

                <span className="flex items-center gap-4">
                  <span>{title}</span>
                  <Icon
                    className={`h-6 w-6 ${
                      active ? "text-[#CBB29C]" : "text-[#F8E8D2]"
                    }`}
                  />
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}