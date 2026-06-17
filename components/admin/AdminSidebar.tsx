"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  BadgePercent,
  Building2,
  CircleDollarSign,
  ClipboardList,
  CalendarDays,
  Home,
  Layers3,
  LogOut,
  Megaphone,
  UserRoundCog,
  Settings2,
  Users,
} from "lucide-react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";

const links = [
  ["الرئيسية", "/admin", Home],
  ["العلامات التجارية", "/admin/cafes", Building2],
  ["العملاء", "/admin/customers", Users],
  ["المالية", "/admin/finance", CircleDollarSign],
  ["الإيرادات", "/admin/revenue", CircleDollarSign],
  ["العمليات", "/admin/operations", ClipboardList],
  ["مراقبة الحجوزات", "/admin/reservations", CalendarDays],
  ["الباقات", "/admin/plans", Layers3],
  ["كوبونات خصم المنصة", "/admin/platform-coupons", BadgePercent],
  ["المحتوى ورسائل التواصل", "/admin/content", Megaphone],
  ["طلبات التوظيف", "/admin/jobs", BriefcaseBusiness],
  ["إدارة المناديب", "/admin/representatives", UserRoundCog],
  ["خيارات المنصة", "/admin/options", Settings2],
  ["الدعم", "/admin/support", ClipboardList],
] as const;

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export function AdminSidebar({ onNavigate }: AdminSidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logoutBarndaksaAuth();
    router.push("/login");
  }

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-gradient-to-b from-[#0f0c0a] via-[#1a1210] to-[#241610] text-[#F8F4EF] shadow-[-16px_0_48px_rgba(0,0,0,0.5)]"
    >
      <div className="border-b border-white/10 px-6 py-7">
        <BarndaksaLogo variant="dark" width={168} height={68} priority className="mx-auto" />
        <p className="mt-3 text-center text-xs font-bold text-[#CBB29C]">
          لوحة تحكم المنصة
        </p>
      </div>

      <div className="mx-5 mt-6 rounded-[28px] border border-[#F6C35B]/20 bg-[#F6C35B]/5 p-5 shadow-[0_0_32px_rgba(246,195,91,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <p className="text-sm font-bold text-[#CBB29C]">صلاحية الدخول</p>
        <h2 className="mt-1 text-2xl font-black text-[#F8F4EF]">مدير المنصة</h2>
        <p className="mt-2 text-xs font-bold text-[#7A6255]">
          Cyber-Eco • Bento Dashboard
        </p>
        <Link
          href="/dashboard"
          className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-[#F6C35B] to-[#d4a84a] font-black text-[#241610] shadow-[0_0_20px_rgba(246,195,91,0.3)] transition hover:brightness-105"
        >
          لوحة العلامة
        </Link>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {links.map(([title, href, Icon]) => {
          const active =
            href === "/admin" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 font-black transition ${
                active
                  ? "bg-[#F6C35B]/15 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(246,195,91,0.12)]"
                  : "text-[#CBB29C] hover:bg-white/5 hover:text-[#F8F4EF]"
              }`}
            >
              <span>{title}</span>
              <Icon
                className={`h-5 w-5 ${active ? "text-[#F6C35B]" : "text-[#7A6255] group-hover:text-[#F6C35B]"}`}
              />
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/10 px-4 py-5">
        <Link
          href="/admin/revenue"
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-[#CBB29C] transition hover:border-[#F6C35B]/30"
        >
          <BarChart3 className="h-4 w-4 text-[#F6C35B]" />
          <span>تقارير الإيرادات</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-between rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-black text-red-300 transition hover:bg-red-500/20"
        >
          <span>تسجيل الخروج</span>
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
