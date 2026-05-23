"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Gift,
  Home,
  MapPin,
  Megaphone,
  MessageSquareText,
  Newspaper,
  Package,
  Palette,
  Settings,
  LogOut,
  Share2,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { logoutBrandaAuth } from "@/lib/platform/auth";
import { CAFE_SETTINGS_KEY, mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import {
  cafeHasFeature,
  getActiveCafePlanId,
  getPlatformPlans,
} from "@/lib/platform/permissions";
import type { PlatformFeature } from "@/lib/platform/admin-data";
const cafeSlug = "qatrah";

const links: {
  title: string;
  href: string;
  icon: React.ElementType;
  feature: PlatformFeature;
  badge?: string;
}[] = [
  { title: "الرئيسية", href: "/dashboard", icon: Home, feature: "menu" },
  { title: "المنيو", href: "/dashboard/menu", icon: Package, feature: "menu" },
  { title: "العروض", href: "/dashboard/offers", icon: Gift, feature: "offers" },
  { title: "الحجوزات", href: "/dashboard/reservations", icon: CalendarDays, feature: "reservations" },
  { title: "العملاء", href: "/dashboard/customers", icon: Users, feature: "customers" },
  { title: "الولاء", href: "/dashboard/loyalty", icon: Star, feature: "loyalty" },
  { title: "الفروع", href: "/dashboard/branches", icon: MapPin, feature: "branches" },
  { title: "التقارير", href: "/dashboard/reports", icon: BarChart3, feature: "reports" },
  { title: "الأسئلة والتقييمات", href: "/dashboard/reviews", icon: MessageSquareText, feature: "reviews" },
  { title: "الصفحات التعريفية", href: "/dashboard/pages", icon: Newspaper, feature: "pages" },
  { title: "الأدوات التسويقية", href: "/dashboard/marketing", icon: Megaphone, feature: "marketing" },
  { title: "طلبات الكوفي", href: "/dashboard/orders", icon: ShoppingBag, feature: "orders", badge: "جديد" },
  { title: "إعدادات الكوفي", href: "/dashboard/settings", icon: Settings, feature: "settings" },
  { title: "ثيم الكوفي", href: "/dashboard/theme", icon: Palette, feature: "theme" },
  { title: "الاشتراك والباقات", href: "/dashboard/subscription", icon: CreditCard, feature: "settings" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    logoutBrandaAuth();
    router.push("/login");
  }
  const [activePlanId, setActivePlanId] = useState("pro");
  const [planName, setPlanName] = useState("Pro");
  const [cafeName, setCafeName] = useState(mockCafeSettings.cafeName);
  const [cafeLogo, setCafeLogo] = useState<string | undefined>();
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(mockCafeSettings);

  useEffect(() => {
    setActivePlanId(getActiveCafePlanId());
    const plans = getPlatformPlans();
    const plan = plans.find((p) => p.id === getActiveCafePlanId());
    if (plan) setPlanName(plan.name);

    const saved = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved) as CafeSettings;
      setCafeSettings(settings);
      setCafeName(settings.cafeName || mockCafeSettings.cafeName);
      setCafeLogo(settings.logoDataUrl);
    }
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleLinks = links.filter((link) => cafeHasFeature(link.feature));

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll fixed right-0 top-0 z-40 flex h-screen w-[280px] flex-col overflow-y-auto border-l border-[#E5D8CD]/60 bg-gradient-to-b from-[#3A2117] via-[#2f1b13] to-[#241610] text-[#F8E8D2] shadow-[-12px_0_40px_rgba(36,22,16,0.35)]"
    >
      <div className="border-b border-white/10 px-6 py-7">
        <BrandaLogo variant="dark" width={160} height={64} priority className="mx-auto" />
        <p className="mt-3 text-center text-xs font-bold text-[#CBB29C]">
          لوحة تحكم الكوفي
        </p>
      </div>

      <div className="mx-5 mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F8F4EF] shadow-lg">
            <CafeLogo name={cafeName} logoUrl={cafeLogo} size="md" className="!shadow-none" />
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs font-bold text-[#CBB29C]">الكوفي الحالي</p>
            <h2 className="mt-1 truncate text-xl font-black">{cafeName}</h2>
            <span className="mt-2 inline-flex rounded-xl bg-[#F6C35B]/20 px-3 py-1 text-xs font-black text-[#F6C35B]">
              {planName}
            </span>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F6C35B] transition hover:bg-white/10"
            aria-label="مشاركة"
          >
            <Share2 className="h-4 w-4" />
          </button>

          <Link
            href={getCafePublicUrl(cafeSettings.cafeSlug || cafeSlug)}
            target="_blank"
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-[#F6C35B]/30 bg-[#F6C35B]/15 text-sm font-black text-[#F6C35B] transition hover:bg-[#F6C35B]/25"
          >
            زيارة الكوفي
          </Link>
        </div>

        <p className="mt-3 text-center text-[10px] font-bold text-[#7A6255]">
          {getCafeDisplayDomain(cafeSettings.cafeSlug || cafeSlug, cafeSettings)}
        </p>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {visibleLinks.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-black transition ${
                active
                  ? "bg-gradient-to-l from-[#F6C35B]/25 to-white/10 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "text-[#E5D8CD] hover:bg-white/5 hover:text-[#F8F4EF]"
              }`}
            >
              <span className="flex items-center gap-2">
                {item.badge ? (
                  <span className="rounded-full bg-[#F6C35B] px-2 py-0.5 text-[10px] font-black text-[#241610]">
                    {item.badge}
                  </span>
                ) : (
                  <span className="w-8" />
                )}
              </span>

              <span className="flex items-center gap-3">
                <span>{item.title}</span>
                <Icon
                  className={`h-5 w-5 ${active ? "text-[#F6C35B]" : "text-[#CBB29C] group-hover:text-[#F8F4EF]"}`}
                />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-5">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-between rounded-2xl border border-[#F6C35B]/20 bg-white/5 px-4 py-3.5 text-sm font-black text-[#F8E8D2] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
        >
          <span>تسجيل الخروج</span>
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
