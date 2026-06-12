"use client";

import { Check, ImagePlus, Loader2, Palette, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CafeThemeRenderer } from "@/components/cafe/themes/cafe-theme-renderer";
import {
  BentoCard,
  NeumoInput,
  PrimaryButton,
  SoftCard,
} from "@/components/ui/design-system";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { extractPaletteFromImage } from "@/lib/cafe/color-extract";
import {
  buildCustomIdentityContrastTokens,
  paletteTextWasAutoCorrected,
  THEME_BUILDER_FIELD_CLASS,
  THEME_BUILDER_LABEL_CLASS,
} from "@/lib/cafe/color-contrast";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import {
  deleteLocalAsset,
  FIXED_ASSET_IDS,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { uploadImageAction } from "@/app/actions/upload";
import {
  adoptCafeTheme,
  persistCustomIdentityTheme,
  subscribeBarndaksaStorageEvents,
} from "@/lib/cafe/theme-storage-sync";
import {
  getThemeClasses,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  FEATURED_SECTION_LABELS,
  isValidHex,
  type BackgroundFit,
  type BackgroundScope,
  type CustomIdentityPalette,
  type CustomIdentityTheme,
  type FeaturedSectionMode,
  type OverlayStrength,
} from "@/lib/mock/custom-identity-theme";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";

const BRAND_THEME_ID: CafeThemeId = "brand-identity-custom";

const PALETTE_FIELDS: { key: keyof CustomIdentityPalette; label: string }[] = [
  { key: "primary", label: "أساسي" },
  { key: "secondary", label: "ثانوي" },
  { key: "button", label: "أزرار" },
  { key: "background", label: "خلفية" },
  { key: "text", label: "نص" },
  { key: "accent", label: "تمييز" },
];

const SCOPE_OPTIONS: { value: BackgroundScope; label: string }[] = [
  { value: "home-only", label: "الصفحة الرئيسية فقط" },
  { value: "all-customer-pages", label: "كل صفحات العميل" },
  { value: "hero-only", label: "قسم الهيرو فقط" },
  { value: "top-banner", label: "شريط علوي" },
];

const FIT_OPTIONS: { value: BackgroundFit; label: string }[] = [
  { value: "cover", label: "تغطية" },
  { value: "contain", label: "احتواء" },
];

const OVERLAY_OPTIONS: { value: OverlayStrength; label: string }[] = [
  { value: "light", label: "خفيف" },
  { value: "medium", label: "متوسط" },
  { value: "strong", label: "قوي" },
];

const FEATURED_MODES = Object.entries(FEATURED_SECTION_LABELS) as [
  FeaturedSectionMode,
  string,
][];

type PreviewBundle = {
  slug: string;
  cafeSettings: CafeSettings;
  products: MenuProduct[];
  offers: CafeOffer[];
  availableProducts: MenuProduct[];
  popularProducts: MenuProduct[];
  latestProducts: MenuProduct[];
  bannerOffers: CafeOffer[];
  activeRewards: LoyaltyReward[];
  loyaltySettings: LoyaltySettings;
};

type Props = {
  preview: PreviewBundle;
  initialIdentity: CustomIdentityTheme;
  initialCategories: MenuCategoryRecord[];
  initialIsActiveTheme?: boolean;
  onAdopted?: (themeId: CafeThemeId) => void;
};

type FlowStatus = "idle" | "savingAsset" | "saving" | "applying" | "success" | "error";

function palettesEqual(a: CustomIdentityPalette, b: CustomIdentityPalette) {
  return PALETTE_FIELDS.every(({ key }) => a[key] === b[key]);
}

function draftsEqual(
  a: CustomIdentityTheme,
  b: CustomIdentityTheme,
  pending: { logo: boolean; background: boolean }
) {
  return (
    a.logoAssetId === b.logoAssetId &&
    a.backgroundAssetId === b.backgroundAssetId &&
    !pending.logo &&
    !pending.background &&
    a.backgroundScope === b.backgroundScope &&
    a.backgroundFit === b.backgroundFit &&
    a.overlayStrength === b.overlayStrength &&
    a.featuredSectionMode === b.featuredSectionMode &&
    a.featuredCategoryId === b.featuredCategoryId &&
    palettesEqual(a.palette, b.palette)
  );
}

function isQuotaError(err: unknown) {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}

export function CustomIdentityBuilder({
  preview,
  initialIdentity,
  initialCategories,
  initialIsActiveTheme = false,
  onAdopted,
}: Props) {
  const [draft, setDraft] = useState<CustomIdentityTheme>(() => initialIdentity);
  const [savedSnapshot, setSavedSnapshot] = useState<CustomIdentityTheme>(() => initialIdentity);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(() =>
    initialCategories.filter((c) => c.visible)
  );
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [hexErrors, setHexErrors] = useState<
    Partial<Record<keyof CustomIdentityPalette, boolean>>
  >({});
  const [pendingLogo, setPendingLogo] = useState<OptimizedImageResult | null>(null);
  const [pendingBackground, setPendingBackground] = useState<OptimizedImageResult | null>(null);
  const [optimizingLogo, setOptimizingLogo] = useState(false);
  const [optimizingBackground, setOptimizingBackground] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>();
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | undefined>();
  const [showRepair, setShowRepair] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const { toast, showToast, setToast } = useAppToast();
  const [isActiveTheme, setIsActiveTheme] = useState(initialIsActiveTheme);
  const cafeLogoFallback = useResolvedCafeLogoUrl(preview.cafeSettings);
  const { logoUrl: savedIdentityLogoUrl, backgroundUrl: savedBackgroundUrl } =
    useCustomIdentityVisuals(draft);

  useEffect(() => {
    setDraft(initialIdentity);
    setSavedSnapshot(initialIdentity);
    setCategories(initialCategories.filter((c) => c.visible));
    setIsActiveTheme(initialIsActiveTheme);

    return subscribeBarndaksaStorageEvents({
      onThemeUpdated: () => {
        setIsActiveTheme(initialIsActiveTheme);
      },
    });
  }, [initialIdentity, initialCategories, initialIsActiveTheme]);

  useEffect(() => {
    return () => {
      revokeObjectUrl(logoPreviewUrl);
      revokeObjectUrl(backgroundPreviewUrl);
    };
  }, [logoPreviewUrl, backgroundPreviewUrl]);

  const theme = getThemeClasses(BRAND_THEME_ID);
  const cssVars = buildCustomIdentityCssVars(draft.palette) as CSSProperties;
  const contrastTokens = useMemo(
    () => buildCustomIdentityContrastTokens(draft.palette),
    [draft.palette]
  );
  const showContrastNotice = useMemo(
    () => paletteTextWasAutoCorrected(draft.palette),
    [draft.palette]
  );

  const hasUnsavedChanges = useMemo(
    () =>
      !draftsEqual(draft, savedSnapshot, {
        logo: Boolean(pendingLogo),
        background: Boolean(pendingBackground),
      }),
    [draft, savedSnapshot, pendingLogo, pendingBackground]
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.visible),
    [categories]
  );

  const displayLogoUrl = logoPreviewUrl ?? savedIdentityLogoUrl ?? cafeLogoFallback;

  const validatePalette = useCallback(() => {
    const hasInvalid = PALETTE_FIELDS.some(({ key }) => !isValidHex(draft.palette[key]));
    if (hasInvalid) {
      const next: Partial<Record<keyof CustomIdentityPalette, boolean>> = {};
      for (const { key } of PALETTE_FIELDS) {
        next[key] = !isValidHex(draft.palette[key]);
      }
      setHexErrors(next);
      return false;
    }
    setHexErrors({});
    return true;
  }, [draft.palette]);

  function updatePalette(key: keyof CustomIdentityPalette, value: string) {
    const valid = isValidHex(value);
    setHexErrors((prev) => ({ ...prev, [key]: value.length > 0 && !valid }));
    setDraft((prev) => ({
      ...prev,
      palette: { ...prev.palette, [key]: value },
    }));
  }

  function setLogoPreview(next?: string) {
    setLogoPreviewUrl((prev) => {
      if (prev && prev !== next) revokeObjectUrl(prev);
      return next;
    });
  }

  function setBackgroundPreview(next?: string) {
    setBackgroundPreviewUrl((prev) => {
      if (prev && prev !== next) revokeObjectUrl(prev);
      return next;
    });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingLogo(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "custom-theme-logo");
      setLogoPreview(URL.createObjectURL(optimized.blob));
      setPendingLogo(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة تلقائيًا بجودة مناسبة للعرض السريع",
      });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof ImagePipelineError
            ? err.message
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setOptimizingLogo(false);
    }
  }

  async function pickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingBackground(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "custom-theme-background");
      setBackgroundPreview(URL.createObjectURL(optimized.blob));
      setPendingBackground(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة تلقائيًا بجودة مناسبة للعرض السريع",
      });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof ImagePipelineError
            ? err.message
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setOptimizingBackground(false);
    }
  }

  function removeLogo() {
    setPendingLogo(null);
    setLogoPreview(undefined);
    setDraft((prev) => ({ ...prev, logoAssetId: undefined }));
  }

  function removeBackground() {
    setPendingBackground(null);
    setBackgroundPreview(undefined);
    setDraft((prev) => ({ ...prev, backgroundAssetId: undefined }));
  }

  async function handleExtractColors() {
    const src = logoPreviewUrl ?? cafeLogoFallback;
    if (!src) {
      setExtractError("ارفع شعارًا أولًا لاستخراج الألوان");
      return;
    }
    setExtracting(true);
    setExtractError("");
    try {
      const palette = await extractPaletteFromImage(src);
      setDraft((prev) => ({ ...prev, palette }));
      setHexErrors({});
    } catch {
      setExtractError("تعذر قراءة الشعار — جرّب صورة أخرى");
    } finally {
      setExtracting(false);
    }
  }

  async function handleRepairStorage() {
    showToast({
      type: "success",
      message: "لا حاجة لإصلاح التخزين — البيانات محفوظة في Supabase",
    });
  }

  async function persistDraft(showMessages = true): Promise<boolean> {
    if (!validatePalette()) {
      if (showMessages) {
        showToast({ type: "error", message: "صحّح ألوان الهوية قبل الحفظ" });
      }
      return false;
    }

    if (showMessages) {
      setFlowStatus(pendingLogo || pendingBackground ? "savingAsset" : "saving");
      setToast({
        type: "loading",
        message:
          pendingLogo || pendingBackground ? "جاري حفظ الصور..." : "جاري حفظ الهوية...",
      });
    }

    try {
      const next: CustomIdentityTheme = { ...draft };

      if (pendingLogo) {
        const formData = new FormData();
        formData.append("file", pendingLogo.blob, "logo.webp");
        const uploaded = await uploadImageAction(
          "cafe-logos",
          formData,
          "logo",
          "custom-identity/logo"
        );
        next.logoAssetId = uploaded.storagePath;
        delete next.legacyLogoDataUrl;
      }

      if (pendingBackground) {
        const formData = new FormData();
        formData.append("file", pendingBackground.blob, "background.webp");
        const uploaded = await uploadImageAction(
          "cafe-backgrounds",
          formData,
          "background",
          "custom-identity/background"
        );
        next.backgroundAssetId = uploaded.storagePath;
        delete next.legacyBackgroundImageDataUrl;
      }

      if (showMessages && (pendingLogo || pendingBackground)) {
        setFlowStatus("saving");
        setToast({ type: "loading", message: "جاري حفظ الهوية..." });
      }

      await persistCustomIdentityTheme(next);
      setDraft(next);
      setSavedSnapshot(next);
      setPendingLogo(null);
      setPendingBackground(null);
      setShowRepair(false);

      if (showMessages) {
        setFlowStatus("success");
        showToast({ type: "success", message: "تم حفظ هوية الكوفي بنجاح" });
      }
      return true;
    } catch (err) {
      console.error("[custom-identity] save failed", err);
      if (showMessages) {
        setFlowStatus("error");
        showToast({
          type: "error",
          message: isQuotaError(err)
            ? "تعذر الحفظ محليًا بسبب حجم الملفات. أعد رفع صورة أصغر."
            : err instanceof Error &&
                err.message.includes("IndexedDB")
              ? "تعذر حفظ الصورة محليًا. جرّب صورة أصغر."
              : "تعذر تطبيق الثيم، حاول مرة أخرى",
        });
      }
      return false;
    }
  }

  async function handleSaveIdentity() {
    await persistDraft(true);
  }

  async function handleApplyTheme() {
    setFlowStatus("applying");
    setToast({ type: "loading", message: "جاري تطبيق الثيم على صفحة الكوفي..." });

    try {
      const saved =
        hasUnsavedChanges || pendingLogo || pendingBackground
          ? await persistDraft(false)
          : true;
      if (!saved) {
        setFlowStatus("error");
        showToast({ type: "error", message: "تعذر تطبيق الثيم، حاول مرة أخرى" });
        return;
      }

      await adoptCafeTheme(BRAND_THEME_ID);
      onAdopted?.(BRAND_THEME_ID);
      setIsActiveTheme(true);
      setFlowStatus("success");
      showToast({
        type: "success",
        message: "تم تطبيق ثيم الهوية على صفحة الكوفي",
        action: { label: "عرض صفحة الكوفي", href: `/c/${encodeURIComponent(preview.slug)}` },
      });
    } catch (err) {
      console.error("[custom-identity] apply failed", err);
      setFlowStatus("error");
      showToast({ type: "error", message: "تعذر تطبيق الثيم، حاول مرة أخرى" });
    }
  }

  async function handleRemoveSavedLogo() {
    await deleteLocalAsset(FIXED_ASSET_IDS["custom-theme-logo"]!);
    removeLogo();
  }

  async function handleRemoveSavedBackground() {
    await deleteLocalAsset(FIXED_ASSET_IDS["custom-theme-background"]!);
    removeBackground();
  }

  const isBusy =
    flowStatus === "saving" ||
    flowStatus === "savingAsset" ||
    flowStatus === "applying" ||
    repairing ||
    optimizingLogo ||
    optimizingBackground;

  const rendererProps = {
    slug: preview.slug,
    cafeSettings: preview.cafeSettings,
    themeId: BRAND_THEME_ID,
    theme,
    customer: null,
    products: preview.products,
    offers: preview.offers,
    availableProducts: preview.availableProducts,
    popularProducts: preview.popularProducts,
    latestProducts: preview.latestProducts,
    bannerOffers: preview.bannerOffers,
    activeRewards: preview.activeRewards,
    loyaltySettings: preview.loyaltySettings,
    isPreview: true,
    customIdentityOverride: draft,
    customIdentityPreviewUrls: {
      logoUrl: logoPreviewUrl ?? savedIdentityLogoUrl,
      backgroundUrl: backgroundPreviewUrl ?? savedBackgroundUrl,
    },
    cafeLogoUrl: cafeLogoFallback,
  };

  return (
    <>
      <BentoCard variant="gold" span="4" className="mt-2">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#F6C35B]/80">بناء مخصص</p>
            <h2 className="mt-1 text-2xl font-black">أنشئ ثيم بهوية كوفيك</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[#E5D8CD]/90">
              الألوان والإعدادات في{" "}
              <span className="font-mono text-xs">cafe_custom_identity</span> — الصور
              في IndexedDB محليًا (mock) وليس base64.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasUnsavedChanges ? (
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-100">
                تغييرات غير محفوظة
              </span>
            ) : null}
            {isActiveTheme ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-100">
                <Check className="h-3.5 w-3.5" />
                ثيم معتمد حاليًا
              </span>
            ) : null}
            {showRepair ? (
              <button
                type="button"
                onClick={() => void handleRepairStorage()}
                disabled={repairing}
                className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-black text-red-100"
              >
                {repairing ? "جاري الإصلاح..." : "إصلاح وتحسين الصور القديمة"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]">
          <div className="theme-builder-form-fields space-y-5">
            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <ImagePlus className="h-5 w-5 text-[#6B3A25]" />
                الشعار
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                {displayLogoUrl ? (
                  <img
                    src={displayLogoUrl}
                    alt=""
                    className="h-20 w-20 rounded-2xl border border-[#E5D8CD] bg-white object-contain p-2"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[#CBB29C] bg-[#F8F4EF] text-xs font-bold text-[#7A6255]">
                    بدون شعار
                  </div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-flex h-11 items-center rounded-2xl border border-[#E5D8CD] bg-white px-4 text-sm font-black text-[#3A2117] hover:bg-[#F8F4EF]">
                    رفع شعار
                  </span>
                  <input type="file" accept="image/*" className="sr-only" onChange={pickLogo} />
                </label>
                <button
                  type="button"
                  onClick={() => void handleExtractColors()}
                  disabled={extracting || isBusy}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#3A2117] px-4 text-sm font-black text-[#F8E8D2] disabled:opacity-60"
                >
                  {extracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  استخراج الألوان
                </button>
                {logoPreviewUrl || draft.logoAssetId ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveSavedLogo()}
                    className="text-xs font-bold text-[#7A6255] underline"
                  >
                    إزالة الشعار
                  </button>
                ) : null}
              </div>
              {extractError ? (
                <p className="mt-2 text-sm font-bold text-red-600">{extractError}</p>
              ) : null}
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <Palette className="h-5 w-5 text-[#6B3A25]" />
                لوحة الألوان
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {PALETTE_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-black text-[#7A6255]">{label}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={isValidHex(draft.palette[key]) ? draft.palette[key] : "#6B3A25"}
                        onChange={(e) => updatePalette(key, e.target.value)}
                        className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border border-[#E5D8CD]"
                        aria-label={label}
                      />
                      <NeumoInput
                        value={draft.palette[key]}
                        onChange={(e) => updatePalette(key, e.target.value)}
                        placeholder="#RRGGBB"
                        className={`font-mono text-sm ${hexErrors[key] ? "border-red-400 ring-red-200" : ""}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 text-lg font-black text-[#3A2117]">خلفية الصفحة</h3>
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer">
                  <span className="inline-flex h-11 items-center rounded-2xl border border-[#E5D8CD] bg-white px-4 text-sm font-black">
                    رفع خلفية
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={pickBackground}
                  />
                </label>
                {backgroundPreviewUrl ?? savedBackgroundUrl ? (
                  <>
                    <img
                      src={backgroundPreviewUrl ?? savedBackgroundUrl}
                      alt=""
                      className="h-14 w-24 rounded-xl border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRemoveSavedBackground()}
                      className="text-xs font-bold text-[#7A6255] underline"
                    >
                      إزالة الخلفية
                    </button>
                  </>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>النطاق</label>
                  <select
                    value={draft.backgroundScope}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        backgroundScope: e.target.value as CustomIdentityTheme["backgroundScope"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>ملاءمة</label>
                  <select
                    value={draft.backgroundFit}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        backgroundFit: e.target.value as CustomIdentityTheme["backgroundFit"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {FIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>تعتيم</label>
                  <select
                    value={draft.overlayStrength}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        overlayStrength: e.target.value as CustomIdentityTheme["overlayStrength"],
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {OVERLAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SoftCard>

            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-[#3A2117]">
                <Sparkles className="h-5 w-5 text-[#6B3A25]" />
                ماذا يرى العميل أولًا؟
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={THEME_BUILDER_LABEL_CLASS}>الوضع</label>
                  <select
                    value={draft.featuredSectionMode}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        featuredSectionMode: e.target.value as FeaturedSectionMode,
                      }))
                    }
                    className={THEME_BUILDER_FIELD_CLASS}
                  >
                    {FEATURED_MODES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                {draft.featuredSectionMode === "category" ? (
                  <div>
                    <label className={THEME_BUILDER_LABEL_CLASS}>القسم</label>
                    <select
                      value={draft.featuredCategoryId ?? ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          featuredCategoryId: e.target.value || undefined,
                        }))
                      }
                      className={THEME_BUILDER_FIELD_CLASS}
                    >
                      <option value="">اختر قسمًا</option>
                      {visibleCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </SoftCard>

            <div className="flex flex-wrap gap-3">
              <PrimaryButton
                onClick={() => void handleSaveIdentity()}
                disabled={isBusy}
                className="inline-flex min-w-[200px] items-center justify-center gap-2"
              >
                {flowStatus === "savingAsset" || flowStatus === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {flowStatus === "savingAsset"
                  ? "جاري حفظ الصور..."
                  : flowStatus === "saving"
                    ? "جاري حفظ الهوية..."
                    : "حفظ إعدادات الهوية"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => void handleApplyTheme()}
                disabled={isBusy}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[#D9A33F] px-6 py-3 text-sm font-black text-[#311912] hover:bg-[#F0C568] disabled:opacity-60"
              >
                {flowStatus === "applying" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {flowStatus === "applying"
                  ? "جاري تطبيق الثيم على صفحة الكوفي..."
                  : "اعتماد الثيم وتطبيقه"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <SoftCard className="bg-[#FDFBF8]/95">
              <h3 className="mb-3 text-sm font-black text-[#3A2117]">فحص وضوح الهوية</h3>
              {showContrastNotice ? (
                <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                  تم تحسين لون النص تلقائيًا لضمان وضوح القراءة
                </p>
              ) : null}
              <div
                className="space-y-3 rounded-2xl border border-[#E5D8CD] p-4"
                style={{
                  backgroundColor: contrastTokens.pageBackground,
                  color: contrastTokens.pageForeground,
                }}
              >
                <p className="text-lg font-black">عنوان رئيسي</p>
                <p className="text-sm font-bold" style={{ color: contrastTokens.mutedForeground }}>
                  نص عادي للوصف والتفاصيل
                </p>
                <div
                  className="rounded-2xl border p-3"
                  style={{
                    backgroundColor: contrastTokens.surfaceBackground,
                    color: contrastTokens.surfaceForeground,
                    borderColor: contrastTokens.borderColor,
                  }}
                >
                  بطاقة فاتحة مع نص واضح
                </div>
                <button
                  type="button"
                  className="rounded-2xl px-4 py-2 text-sm font-black"
                  style={{
                    backgroundColor: contrastTokens.buttonBackground,
                    color: contrastTokens.buttonForeground,
                  }}
                >
                  زر رئيسي
                </button>
                <input
                  readOnly
                  placeholder="حقل إدخال"
                  className="w-full rounded-2xl border px-3 py-2 text-sm font-bold outline-none"
                  style={{
                    backgroundColor: contrastTokens.inputBackground,
                    color: contrastTokens.inputForeground,
                    borderColor: contrastTokens.inputBorder,
                  }}
                />
                <select
                  className="w-full rounded-2xl border px-3 py-2 text-sm font-bold outline-none"
                  style={{
                    backgroundColor: contrastTokens.dropdownBackground,
                    color: contrastTokens.dropdownForeground,
                    borderColor: contrastTokens.inputBorder,
                  }}
                  defaultValue="a"
                >
                  <option value="a">قائمة منسدلة — خيار ١</option>
                  <option value="b">قائمة منسدلة — خيار ٢</option>
                </select>
              </div>
            </SoftCard>

            <p className="text-xs font-black text-[#F6C35B]/90">معاينة مباشرة</p>
            <div
              className="overflow-hidden rounded-3xl border border-[#F6C35B]/20 bg-[#F8F4EF]"
              style={cssVars}
            >
              <div className="max-h-[420px] overflow-x-hidden overflow-y-auto overscroll-contain">
                <div className="pointer-events-none origin-top scale-[0.48]">
                  <CafeThemeRenderer {...rendererProps} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </BentoCard>
      <AppToast toast={toast} />
    </>
  );
}
