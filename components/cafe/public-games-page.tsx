"use client";

import Link from "next/link";
import { Coffee, Sparkles, Swords, Trophy } from "lucide-react";
import { BrandPwaInstallSection } from "@/components/cafe/brand-pwa-install-section";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { PublicBrowserNav } from "@/components/cafe/public-browser-nav";
import {
  CustomerBottomDock,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";

type Props = {
  slug: string;
  battleArenaEntryHref?: string | null;
  tableWarsEntryHref?: string | null;
};

export function PublicGamesPage({ slug, battleArenaEntryHref, tableWarsEntryHref }: Props) {
  const { theme, settings, experience, previewThemeId, features } = useCafePageContext(slug);
  const hasPlayableGames = Boolean(battleArenaEntryHref || tableWarsEntryHref);

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <div className="barndaksa-cinematic-stage space-y-5">
        <PublicBrowserNav slug={slug} previewThemeId={previewThemeId} features={features} active="games" />
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={`inline-flex items-center gap-2 text-sm font-black ${theme.accent}`}>
              <Sparkles className="h-4 w-4" />
              مساحة اللعب داخل الفرع
            </p>
            <h1 className={`mt-1 text-3xl font-black leading-tight sm:text-4xl ${experience.headingTracking}`}>
              الألعاب
            </h1>
            <p className={`mt-2 max-w-2xl text-sm font-bold leading-7 ${theme.muted}`}>
              تحديات خفيفة أثناء الانتظار داخل {settings.cafeName || slug}.
            </p>
          </div>
          <BrandPwaInstallSection slug={slug} cafeName={settings.cafeName || slug} variant="icon" />
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {tableWarsEntryHref ? (
            <article className="overflow-hidden rounded-[28px] border border-[#D9A33F]/35 bg-[#FFF7E3] p-5 text-[#311912] shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#6B3A25]">
                  <Swords className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#9A6A20]">متاحة الآن</p>
                  <h2 className="mt-1 text-xl font-black text-[#311912]">حرب الطاولات</h2>
                  <p className="mt-1 text-sm font-bold leading-7 text-[#6B3A25]">
                    ادخل حرب الطاولات ونافس الطاولات داخل الفرع.
                  </p>
                </div>
              </div>
              <Link
                href={tableWarsEntryHref}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#311912] px-5 text-sm font-black text-white transition active:scale-[0.98]"
              >
                دخول حرب الطاولات
              </Link>
            </article>
          ) : null}

          {battleArenaEntryHref ? (
          <article className="overflow-hidden rounded-[28px] border border-[#205B54]/25 bg-[#F1FAF7] p-5 text-[#173D39] shadow-[0_18px_45px_rgba(23,61,57,0.08)]">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#205B54]">
                <Trophy className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 text-xs font-black text-[#2F7A6F]">
                  <Coffee className="h-3.5 w-3.5" />
                  متاحة الآن
                </p>
                <h2 className="mt-1 text-xl font-black text-[#173D39]">حلبة الأبطال</h2>
                <p className="mt-1 text-sm font-bold leading-7 text-[#365F58]">
                  معركة قهوة خفيفة ضد بوت محلي، بدون تسجيل دخول أو حفظ نتائج.
                </p>
              </div>
            </div>
            <Link
              href={battleArenaEntryHref}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#205B54] px-5 text-sm font-black text-white transition active:scale-[0.98]"
            >
              دخول حلبة الأبطال
            </Link>
          </article>
          ) : null}
        </section>
        {!hasPlayableGames ? (
          <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-6 text-center text-sm font-black leading-7 text-[#311912] shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
            لا توجد ألعاب متاحة لهذه العلامة حاليًا
          </div>
        ) : null}
      </div>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "games",
          hasProducts: true,
          hasOrders: false,
          hasGames: hasPlayableGames,
          hasRewards: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );
}
