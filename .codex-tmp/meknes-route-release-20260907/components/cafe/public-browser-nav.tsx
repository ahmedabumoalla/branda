"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Gift, Home, ShoppingBag, Swords, UserRound, WalletCards } from "lucide-react";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  publicFeatureAllows,
  type PublicFeatureKey,
} from "@/lib/platform/public-feature-access";

type NavKey = "home" | "products" | "product" | "offers" | "games" | "rewards" | "account";

type Props = {
  slug: string;
  previewThemeId?: string | null;
  features: string[];
  active?: NavKey;
  className?: string;
};

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: typeof Home;
  feature?: PublicFeatureKey;
  anyFeature?: PublicFeatureKey[];
};

export function PublicBrowserNav({
  slug,
  previewThemeId,
  features,
  active,
  className = "",
}: Props) {
  const router = useRouter();
  const items: NavItem[] = [
    { key: "home", href: getCafePath(slug, "", previewThemeId), label: "الرئيسية", icon: Home },
    {
      key: "products",
      href: getCafePath(slug, "products/popular", previewThemeId),
      label: "المنتجات",
      icon: ShoppingBag,
      feature: "menu",
    },
    {
      key: "offers",
      href: getCafePath(slug, "offers", previewThemeId),
      label: "العروض",
      icon: Gift,
      feature: "offers",
    },
    {
      key: "games",
      href: getCafePath(slug, "games", previewThemeId),
      label: "الألعاب",
      icon: Swords,
      feature: "in_store_table_wars",
    },
    {
      key: "rewards",
      href: getCafePath(slug, "rewards", previewThemeId),
      label: "المكافآت",
      icon: WalletCards,
      anyFeature: ["loyalty"],
    },
    {
      key: "account",
      href: getCafePath(slug, "account", previewThemeId),
      label: "الحساب",
      icon: UserRound,
    },
  ];

  const visibleItems = items.filter((item) => {
    if (item.anyFeature) return item.anyFeature.some((feature) => publicFeatureAllows(features, feature));
    return !item.feature || publicFeatureAllows(features, item.feature);
  });

  return (
    <nav
      aria-label="تنقل المتصفح"
      className={`mb-4 hidden items-center justify-between gap-3 rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)]/92 p-2 shadow-[0_14px_35px_rgba(49,25,18,0.07)] backdrop-blur md:flex ${className}`}
    >
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[var(--ci-border,#E7D7C6)] px-3 text-xs font-black text-[var(--ci-primary-bg,#6B3A25)] transition active:scale-95"
      >
        <ArrowRight className="h-4 w-4" />
        رجوع
      </button>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key || (active === "product" && item.key === "products");
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex h-10 items-center gap-2 rounded-2xl px-3 text-xs font-black transition active:scale-95 ${
                selected
                  ? "bg-[var(--ci-button-bg,#6B3A25)] text-[var(--ci-button-fg,#fff)]"
                  : "text-[var(--ci-primary-bg,#6B3A25)] hover:bg-[var(--ci-page-bg,#FCF8F3)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
