"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  BadgePercent,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
  Home,
  Layers3,
  LogOut,
  Megaphone,
  UserRoundCog,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { logoutBarndaksaAuth } from "@/lib/platform/auth";

const links = [
  ["إدارة علامات العملاء", "/admin/client-brands", Megaphone],
  ["الرئيسية", "/admin", Home],
  ["العلامات التجارية", "/admin/cafes", Building2],
  ["العملاء", "/admin/customers", Users],
  ["المالية", "/admin/finance", CircleDollarSign],
  ["الإيرادات", "/admin/revenue", CircleDollarSign],
  ["العمليات", "/admin/operations", ClipboardList],
  ["مركز العمليات", "/admin/operations-center", ClipboardCheck],
  ["مراقبة الحجوزات", "/admin/reservations", CalendarDays],
  ["الباقات", "/admin/plans", Layers3],
  ["كوبونات خصم المنصة", "/admin/platform-coupons", BadgePercent],
  ["المحتوى ورسائل التواصل", "/admin/content", Megaphone],
  ["طلبات التوظيف", "/admin/jobs", BriefcaseBusiness],
  ["إدارة المناديب", "/admin/representatives", UserRoundCog],
  ["خيارات المنصة", "/admin/options", Settings2],
  ["الصيانة", "/admin/maintenance", Wrench],
  ["الدعم", "/admin/support", ClipboardList],
] as const;

type AdminSidebarProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
};

export function AdminSidebar({
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: AdminSidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const ToggleIcon = collapsed ? ChevronsLeft : ChevronsRight;
  const toggleLabel = collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية";

  function handleLogout() {
    logoutBarndaksaAuth();
    router.push("/login");
  }

  function handleToggleCollapsed() {
    onCollapsedChange?.(!collapsed);
  }

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-gradient-to-b from-[#0f0c0a] via-[#1a1210] to-[#241610] text-[#F8F4EF] shadow-[-16px_0_48px_rgba(0,0,0,0.5)]"
    >
      <div className={`border-b border-white/10 ${collapsed ? "px-2 py-3" : "px-4 py-5"}`}>
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between gap-3"}`}>
          <div className={collapsed ? "flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/[0.08] ring-1 ring-white/10" : "min-w-0 flex-1"}>
            <BarndaksaLogo
              variant="dark"
              width={collapsed ? 36 : 132}
              height={collapsed ? 20 : 52}
              priority
              className={collapsed ? "scale-90" : "mx-auto"}
            />
          </div>
          <button
            type="button"
            onClick={handleToggleCollapsed}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#F6C35B]/30 bg-[#F6C35B]/10 text-[#F6C35B] transition hover:border-[#F6C35B]/60 hover:bg-[#F6C35B]/20"
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>
        {!collapsed ? (
          <p className="mt-2 text-center text-[11px] font-bold text-[#CBB29C]">
            لوحة تحكم المنصة
          </p>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mx-3 mt-4 rounded-[16px] border border-[#F6C35B]/20 bg-[#F6C35B]/5 p-4 shadow-[0_0_26px_rgba(246,195,91,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <p className="text-xs font-bold text-[#CBB29C]">صلاحية الدخول</p>
          <h2 className="mt-1 text-xl font-black text-[#F8F4EF]">مدير المنصة</h2>
          <p className="mt-2 text-xs font-bold text-[#7A6255]">
            Cyber-Eco • Bento Dashboard
          </p>
          <Link
            href="/dashboard"
            className="mt-3 flex h-10 items-center justify-center rounded-xl bg-gradient-to-l from-[#F6C35B] to-[#d4a84a] text-sm font-black text-[#241610] shadow-[0_0_18px_rgba(246,195,91,0.25)] transition hover:brightness-105"
          >
            لوحة العلامة
          </Link>
        </div>
      ) : null}

      <nav className={`flex-1 space-y-1 ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}>
        {links.map(([title, href, Icon]) => {
          const active =
            href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? title : undefined}
              aria-label={collapsed ? title : undefined}
              className={`group flex h-10 items-center rounded-xl text-[13px] font-black transition ${
                collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
              } ${
                active
                  ? "bg-[#F6C35B]/15 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(246,195,91,0.12)]"
                  : "text-[#CBB29C] hover:bg-white/5 hover:text-[#F8F4EF]"
              }`}
            >
              {!collapsed ? <span className="min-w-0 truncate">{title}</span> : null}
              <Icon
                className={`h-4 w-4 ${active ? "text-[#F6C35B]" : "text-[#7A6255] group-hover:text-[#F6C35B]"}`}
              />
            </Link>
          );
        })}
      </nav>

      <div className={`space-y-2 border-t border-white/10 ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}>
        <Link
          href="/admin/revenue"
          onClick={onNavigate}
          title={collapsed ? "تقارير الإيرادات" : undefined}
          aria-label={collapsed ? "تقارير الإيرادات" : undefined}
          className={`flex h-10 items-center rounded-xl border border-white/10 bg-white/5 text-xs font-black text-[#CBB29C] transition hover:border-[#F6C35B]/30 ${
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
          }`}
        >
          <BarChart3 className="h-4 w-4 text-[#F6C35B]" />
          {!collapsed ? <span>تقارير الإيرادات</span> : null}
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "تسجيل الخروج" : undefined}
          aria-label={collapsed ? "تسجيل الخروج" : undefined}
          className={`flex h-10 w-full items-center rounded-xl border border-red-500/25 bg-red-500/10 text-xs font-black text-red-300 transition hover:bg-red-500/20 ${
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-3"
          }`}
        >
          {!collapsed ? <span>تسجيل الخروج</span> : null}
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
