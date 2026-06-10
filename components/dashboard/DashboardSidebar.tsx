"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CreditCard,
  Gift,
  Home,
  LogOut,
  MapPin,
  Megaphone,
  MessageSquareText,
  Package,
  Palette,
  Settings,
  Share2,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { fetchOwnerPlanIdAction, fetchPlatformPlansAction } from "@/app/actions/admin";
import { fetchOwnerSettingsAction } from "@/app/actions/settings";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import { logoutBrandaAuth } from "@/lib/platform/auth";
import type { PlatformFeature, PlatformPlan } from "@/lib/platform/admin-data";
import { cafeHasFeature } from "@/lib/platform/permissions";

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
  {
    title: "الحجوزات",
    href: "/dashboard/reservations",
    icon: CalendarDays,
    feature: "reservations",
  },
  { title: "العملاء", href: "/dashboard/customers", icon: Users, feature: "customers" },
  { title: "بطاقات الولاء", href: "/dashboard/loyalty", icon: Star, feature: "loyalty" },
  { title: "الفروع", href: "/dashboard/branches", icon: MapPin, feature: "branches" },
  { title: "التقارير", href: "/dashboard/reports", icon: BarChart3, feature: "reports" },
  {
    title: "الأسئلة والتقييمات",
    href: "/dashboard/reviews",
    icon: MessageSquareText,
    feature: "reviews",
  },
  {
    title: "الأدوات التسويقية",
    href: "/dashboard/marketing",
    icon: Megaphone,
    feature: "marketing",
  },
  {
    title: "مراجعة توثيق التجارب",
    href: "/dashboard/experience-reviews",
    icon: BadgeCheck,
    feature: "menu",
    badge: "جديد",
  },
  {
    title: "طلبات الكوفي",
    href: "/dashboard/orders",
    icon: ShoppingBag,
    feature: "orders",
    badge: "جديد",
  },
  {
    title: "إعدادات الكوفي",
    href: "/dashboard/settings",
    icon: Settings,
    feature: "settings",
  },
  { title: "ثيم الكوفي", href: "/dashboard/theme", icon: Palette, feature: "theme" },
  {
    title: "الاشتراك والباقات",
    href: "/dashboard/subscription",
    icon: CreditCard,
    feature: "settings",
  },
];

type SidebarProps = {
  onNavigate?: () => void;
};

const initialCafeSettings: CafeSettings = {
  cafeSlug: "",
  cafeName: "الكوفي",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  description: "",
  domainStatus: "غير مربوط",
};

export function DashboardSidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  const [activePlanId, setActivePlanId] = useState("starter");
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [planName, setPlanName] = useState("Starter");
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(initialCafeSettings);
  const [shareMessage, setShareMessage] = useState("");

  const cafeLogoUrl = useResolvedCafeLogoUrl(cafeSettings);
  const cafeName = cafeSettings.cafeName || "الكوفي";
  const cafeSlug = cafeSettings.cafeSlug;

  useEffect(() => {
    void (async () => {
      try {
        const [planId, platformPlans, settings] = await Promise.all([
          fetchOwnerPlanIdAction(),
          fetchPlatformPlansAction(),
          fetchOwnerSettingsAction(),
        ]);

        setActivePlanId(planId);
        setPlans(platformPlans);
        setCafeSettings(settings);

        const plan = platformPlans.find((item) => item.id === planId);
        setPlanName(plan?.name ?? planId);
      } catch (error) {
        console.error("[DashboardSidebar]", error);
      }
    })();
  }, []);


  async function handleShare() {
    if (!cafeSlug) return;
    const url = getCafePublicUrl(cafeSlug);
    try {
      if (navigator.share) {
        await navigator.share({ title: cafeName, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("تم نسخ رابط الفرع الالكتروني");
        window.setTimeout(() => setShareMessage(""), 2200);
      }
    } catch {
      setShareMessage("تعذر مشاركة الرابط");
      window.setTimeout(() => setShareMessage(""), 2200);
    }
  }

  function handleLogout() {
    logoutBrandaAuth();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const visibleLinks = links.filter((link) =>
    cafeHasFeature(link.feature, { planId: activePlanId, plans })
  );

  return (
    <aside
      dir="rtl"
      className="sidebar-scroll flex h-full w-full flex-col overflow-y-auto border-l border-[#E7D7C6]/60 bg-gradient-to-b from-[#4A281D] via-[#311912] to-[#311912] text-[#FCF8F3] shadow-[-12px_0_40px_rgba(49,25,18,0.35)]"
    >
      <div className="border-b border-white/10 px-6 py-7">
        <BrandaLogo
          variant="dark"
          width={160}
          height={64}
          priority
          className="mx-auto"
        />
        <p className="mt-3 text-center text-xs font-bold text-[#F2E7D9]">
          لوحة التحكم
        </p>
      </div>

      <div className="mx-5 mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FCF8F3] shadow-lg">
            <CafeLogo
              name={cafeName}
              logoUrl={cafeLogoUrl}
              size="md"
              className="!shadow-none"
            />
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs font-bold text-[#F2E7D9]">الكوفي الحالي</p>
            <h2 className="mt-1 truncate text-xl font-black">{cafeName}</h2>

            {cafeSettings.ownerName ? (
              <p className="mt-1 truncate text-xs font-bold text-[#D8C3AF]">
                {cafeSettings.ownerName}
              </p>
            ) : null}

            <Link
              href="/dashboard/subscription"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#D9A33F]/20 px-3 py-1 text-xs font-black text-[#F0C568] transition hover:bg-[#D9A33F]/30"
            >
              {planName}
            </Link>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <NotificationsPanel />

          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={!cafeSlug}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#F0C568] transition hover:bg-white/10 disabled:opacity-50"
            aria-label="مشاركة رابط الفرع الالكتروني"
          >
            <Share2 className="h-4 w-4" />
          </button>

          {cafeSlug ? (
            <Link
              href={getCafePublicUrl(cafeSlug)}
              target="_blank"
              className="flex h-10 flex-1 items-center justify-center rounded-xl border border-[#D9A33F]/30 bg-[#D9A33F]/15 text-sm font-black text-[#F0C568] transition hover:bg-[#D9A33F]/25"
            >
              زيارة الفرع الالكتروني
            </Link>
          ) : (
            <span className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-black text-[#D8C3AF]">
              جاري التحميل
            </span>
          )}
        </div>

        {shareMessage ? (
          <p className="mt-3 text-center text-xs font-black text-[#F0C568]">{shareMessage}</p>
        ) : null}

        {cafeSlug ? (
          <p className="mt-3 text-center text-[10px] font-bold text-[#806A5E]">
            {getCafeDisplayDomain(cafeSlug, cafeSettings)}
          </p>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {visibleLinks.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 text-[15px] font-black transition ${
                active
                  ? "bg-gradient-to-l from-[#D9A33F]/25 to-white/10 text-[#F0C568] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "text-[#F2E7D9] hover:bg-white/5 hover:text-[#FCF8F3]"
              }`}
            >
              <span className="flex items-center gap-2">
                {item.badge ? (
                  <span className="rounded-full bg-[#D9A33F] px-2 py-0.5 text-[10px] font-black text-[#311912]">
                    {item.badge}
                  </span>
                ) : (
                  <span className="w-8" />
                )}
              </span>

              <span className="flex items-center gap-3">
                <span>{item.title}</span>
                <Icon
                  className={`h-5 w-5 ${
                    active
                      ? "text-[#F0C568]"
                      : "text-[#F2E7D9] group-hover:text-[#FCF8F3]"
                  }`}
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
          className="flex w-full items-center justify-between rounded-2xl border border-[#D9A33F]/20 bg-white/5 px-4 py-3.5 text-sm font-black text-[#FCF8F3] transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
        >
          <span>تسجيل الخروج</span>
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}