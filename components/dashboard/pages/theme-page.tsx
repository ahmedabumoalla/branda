"use client";

import { Suspense, useState } from "react";
import {
  BentoCard,
  DashboardPageShell,
  LinkButton,
  StatPill,
} from "@/components/ui/design-system";
import { CustomIdentityBuilder } from "@/components/dashboard/theme/custom-identity-builder";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";

const CAFE_SLUG = "qatrah";

type Props = {
  initialThemeId: CafeThemeId;
  initialSettings: CafeSettings;
  initialProducts: MenuProduct[];
  initialCategories: MenuCategoryRecord[];
  initialOffers: CafeOffer[];
  initialLoyaltySettings: LoyaltySettings;
  initialLoyaltyRewards: LoyaltyReward[];
  initialCustomIdentity: CustomIdentityTheme;
  configError?: string;
};

function ThemePageInner({
  initialSettings,
  initialProducts,
  initialCategories,
  initialOffers,
  initialLoyaltySettings,
  initialLoyaltyRewards,
  initialCustomIdentity,
  configError,
}: Props) {
  const [saved, setSaved] = useState(false);
  const cafeSettings = initialSettings;
  const products = initialProducts;
  const offers = initialOffers;
  const availableProducts = products.filter((p) => p.available);
  const popularProducts = [...availableProducts].slice(0, 4);
  const latestProducts = [...availableProducts].slice(-4).reverse();
  const bannerOffers = offers.filter(
    (o) =>
      o.status === "نشط" &&
      o.visibleInCafe &&
      ((o.placement ?? "كلاهما") === "بانر الكوفي" ||
        (o.placement ?? "كلاهما") === "كلاهما")
  );
  const activeRewards = initialLoyaltyRewards.filter((r) => r.active);

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="ثيم هوية علامتك"
        subtitle="تم حذف كل الثيمات الجاهزة واعتماد ثيم واحد فقط يتم بناؤه من هوية علامتك"
        action={
          <LinkButton
            href={getCafePublicUrl(CAFE_SLUG, {
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
            })}
            variant="outline"
          >
            معاينة صفحة العلامة
          </LinkButton>
        }
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}

        {saved ? (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center font-black text-green-800">
            تم حفظ واعتماد ثيم هوية العلامة
          </div>
        ) : null}

        <BentoCard variant="gold" span="4" className="mb-6">
          <StatPill
            label="الثيم المعتمد"
            value="ثيم هوية علامتك فقط"
            hint="تم إلغاء كل الثيمات الجاهزة"
          />
        </BentoCard>

        <CustomIdentityBuilder
          preview={{
            slug: CAFE_SLUG,
            cafeSettings,
            products,
            offers,
            availableProducts,
            popularProducts,
            latestProducts,
            bannerOffers,
            activeRewards,
            loyaltySettings: initialLoyaltySettings,
          }}
          initialIdentity={initialCustomIdentity}
          initialCategories={initialCategories}
          initialIsActiveTheme={true}
          onAdopted={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
      </DashboardPageShell>
    </div>
  );
}

export function ThemePageClient(props: Props) {
  return (
    <Suspense fallback={<div />}>
      <ThemePageInner {...props} initialThemeId="brand-identity-custom" />
    </Suspense>
  );
}
