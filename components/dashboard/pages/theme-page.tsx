"use client";

import { Check, ExternalLink, Eye, Palette } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  PrimaryButton,
  StatPill,
} from "@/components/ui/design-system";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import {
  CAFE_SETTINGS_KEY,
  mockCafeSettings,
  type CafeSettings,
} from "@/lib/mock/cafe-settings";
import { mockMenuProducts } from "@/lib/mock/menu";
import { mockOffers } from "@/lib/mock/offers";
import {
  mockLoyaltyRewards,
  mockLoyaltySettings,
} from "@/lib/mock/loyalty";
import {
  CAFE_THEME_KEY,
  cafeThemes,
  getThemeClasses,
  getThemeDefinition,
  normalizeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";

const CAFE_SLUG = "qatrah";
const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";

function ThemePageInner() {
  const [activeTheme, setActiveTheme] = useState<CafeThemeId>("soft-cream-3d");
  const [previewTheme, setPreviewTheme] = useState<CafeThemeId | null>(null);
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(mockCafeSettings);
  const [products, setProducts] = useState(mockMenuProducts);
  const [offers, setOffers] = useState(mockOffers);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(CAFE_THEME_KEY);
    setActiveTheme(normalizeThemeId(savedTheme));
    const s = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (s) setCafeSettings(JSON.parse(s));
    const m = localStorage.getItem(MENU_KEY);
    if (m) setProducts(JSON.parse(m));
    const o = localStorage.getItem(OFFERS_KEY);
    if (o) setOffers(JSON.parse(o));
  }, []);

  const selected = previewTheme ?? activeTheme;
  const theme = getThemeClasses(selected);
  const definition = getThemeDefinition(selected);

  const availableProducts = products.filter((p) => p.available);
  const popularProducts = useMemo(
    () => [...availableProducts].slice(0, 4),
    [availableProducts]
  );
  const latestProducts = useMemo(
    () => [...availableProducts].slice(-4).reverse(),
    [availableProducts]
  );
  const bannerOffers = offers.filter(
    (o) =>
      o.status === "نشط" &&
      o.visibleInCafe &&
      ((o.placement ?? "كلاهما") === "بانر الكوفي" ||
        (o.placement ?? "كلاهما") === "كلاهما")
  );

  function adoptTheme(id: CafeThemeId) {
    localStorage.setItem(CAFE_THEME_KEY, id);
    setActiveTheme(id);
    setPreviewTheme(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const previewProps = {
    slug: CAFE_SLUG,
    cafeSettings,
    themeId: selected,
    theme,
    customer: null,
    products,
    offers,
    availableProducts,
    popularProducts,
    latestProducts,
    bannerOffers,
    activeRewards: mockLoyaltyRewards.filter((r) => r.active),
    loyaltySettings: mockLoyaltySettings,
    isPreview: previewTheme !== null && previewTheme !== activeTheme,
  };

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="ثيم الكوفي"
        subtitle="اختر ثيمًا، عاينه داخل اللوحة، ثم اعتمده ليظهر على صفحة الكوفي العامة."
        action={
          <LinkButton
            href={getCafePublicUrl(CAFE_SLUG, { origin: typeof window !== "undefined" ? window.location.origin : undefined })}
            variant="outline"
          >
            معاينة صفحة الكوفي الحية
          </LinkButton>
        }
      >
        {saved ? (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center font-black text-green-800">
            تم اعتماد الثيم بنجاح — صفحة الكوفي ستستخدمه الآن
          </div>
        ) : null}

        <BentoGrid className="mb-6">
          <BentoCard variant="gold" span="2">
            <StatPill
              label="الثيم المعتمد"
              value={getThemeDefinition(activeTheme).name}
              hint="يُحفظ في branda_qatrah_theme"
            />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="ثيمات متاحة"
              value={cafeThemes.length}
              hint="تخطيطات مختلفة — ليس ألوانًا فقط"
            />
          </BentoCard>
        </BentoGrid>

        {previewTheme ? (
          <BentoCard variant="white" span="4" className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#3A2117]">
                  معاينة: {definition.name}
                </h2>
                <p className="text-sm font-bold text-[#7A6255]">{definition.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={() => adoptTheme(previewTheme)}>
                  <Check className="h-4 w-4" />
                  اعتماد الثيم
                </PrimaryButton>
                <LinkButton
                  href={getCafePublicUrl(CAFE_SLUG, {
                    previewTheme,
                    origin: typeof window !== "undefined" ? window.location.origin : undefined,
                  })}
                  variant="outline"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                  فتح صفحة الكوفي بهذا الثيم
                </LinkButton>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-[#E5D8CD] bg-[#F8F4EF]">
              <div className="max-h-[min(70vh,640px)] overflow-x-hidden overflow-y-auto overscroll-contain">
                <div className="pointer-events-none origin-top scale-[0.52] sm:scale-[0.62] md:scale-[0.75] lg:scale-[0.85]">
                  <CafeThemeRenderer {...previewProps} />
                </div>
              </div>
            </div>
          </BentoCard>
        ) : null}

        <BentoGrid>
          {cafeThemes.map((t) => {
            const isActive = activeTheme === t.id;
            const isPreviewing = previewTheme === t.id;

            return (
              <BentoCard key={t.id} variant="white" span="2">
                <div
                  className={`h-36 rounded-3xl bg-gradient-to-br ${t.previewGradient} border border-[#E5D8CD]`}
                />

                <div className="mt-5">
                  <p className="text-xs font-bold text-[#7A6255]">{t.recommendedFor}</p>
                  <h2 className="mt-1 text-2xl font-black text-[#3A2117]">{t.name}</h2>
                  <p className="mt-2 min-h-12 text-sm font-bold text-[#7A6255]">
                    {t.description}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-[#CBB29C]">
                    {t.layoutType} · {t.density}
                  </p>

                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTheme(t.id)}
                      className={`flex h-11 items-center justify-center gap-2 rounded-2xl font-black ${
                        isPreviewing
                          ? "bg-[#3A2117] text-[#F8E8D2]"
                          : "border border-[#E5D8CD] bg-white text-[#3A2117] hover:bg-[#F8F4EF]"
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      معاينة
                    </button>

                    {isActive ? (
                      <div className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-green-50 font-black text-green-700">
                        <Check className="h-5 w-5" />
                        معتمد حاليًا
                      </div>
                    ) : (
                      <PrimaryButton
                        onClick={() => adoptTheme(t.id)}
                        className="flex h-11 items-center justify-center gap-2"
                      >
                        <Palette className="h-4 w-4" />
                        اعتماد الثيم
                      </PrimaryButton>
                    )}

                    <LinkButton
                      href={getCafePublicUrl(CAFE_SLUG, { previewTheme: t.id })}
                      variant="outline"
                      className="h-10 text-center text-xs"
                      target="_blank"
                    >
                      فتح صفحة الكوفي بهذا الثيم
                    </LinkButton>
                  </div>
                </div>
              </BentoCard>
            );
          })}
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

export function ThemePageClient() {
  return (
    <Suspense fallback={<div className="p-8 font-black">جاري التحميل...</div>}>
      <ThemePageInner />
    </Suspense>
  );
}
