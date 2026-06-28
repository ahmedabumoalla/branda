"use client";

import { Copy, ExternalLink, Eye, EyeOff, Globe, ImagePlus, KeyRound, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { changeOwnerPasswordAction } from "@/app/actions/auth";
import { saveSettingsAction } from "@/app/actions/settings";
import { uploadImageAction } from "@/app/actions/upload";
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
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CafeDomainLinkStatus } from "@/lib/platform/cafe-domain";
import {
  getCafeDisplayDomain,
  getCafePublicUrl,
  getCafeSubdomainHost,
  getDomainSetupInstructions,
  normalizeCafeDomainInput,
  resolveCafeDomainSource,
  VERCEL_CNAME_TARGET,
} from "@/lib/platform/cafe-domain";
import {
  normalizeDomain,
  type CafePurchasedDomain,
  type DomainAvailabilityResult,
  type DomainPriceResult,
} from "@/lib/platform/domain-purchase";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialSettings: CafeSettings;
  configError?: string;
};

export function SettingsPageClient({ initialSettings, configError }: Props) {
  const copy = getBusinessCopy(initialSettings.businessCategory);
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CafeSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const { toast, showToast, setToast } = useAppToast();
  const [domainQuery, setDomainQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [domainYears, setDomainYears] = useState(1);
  const [autoRenew, setAutoRenew] = useState(true);
  const [availability, setAvailability] = useState<DomainAvailabilityResult | null>(null);
  const [pricing, setPricing] = useState<DomainPriceResult | null>(null);
  const [purchase, setPurchase] = useState<CafePurchasedDomain | null>(null);
  const [domainMessage, setDomainMessage] = useState<string>("");
  const [browserOrigin, setBrowserOrigin] = useState<string | undefined>();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordVisibility, setPasswordVisibility] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [pendingLogo, setPendingLogo] = useState<OptimizedImageResult | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>();
  const resolvedLogoUrl = useResolvedCafeLogoUrl(settings, logoPreviewUrl);
  const displayLogoUrl = logoPreviewUrl ?? resolvedLogoUrl;

  useEffect(() => {
    setSettings(initialSettings);
    if (initialSettings.purchasedDomain) {
      setPurchase({
        id: initialSettings.purchasedDomain,
        cafeSlug: initialSettings.cafeSlug,
        domain: initialSettings.purchasedDomain,
        tld: initialSettings.purchasedDomain.split(".").pop() ?? "sa",
        status:
          initialSettings.purchasedDomainStatus === "مربوط" ? "connected" : "purchased",
        price: 0,
        currency: "SAR",
        years: 1,
        autoRenew: true,
        createdAt: initialSettings.purchasedDomainCreatedAt ?? new Date().toISOString(),
      });
    }
  }, [initialSettings]);

  useEffect(() => {
    return () => revokeObjectUrl(logoPreviewUrl);
  }, [logoPreviewUrl]);

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  async function save() {
    try {
      setSaving(true);
      setToast({ type: "loading", message: "جاري الحفظ..." });
      const next: CafeSettings = { ...settings };
      delete next.logoDataUrl;

      if (pendingLogo) {
        const formData = new FormData();
        formData.append("file", pendingLogo.blob, "logo.webp");
        const uploaded = await uploadImageAction(
          "cafe-logos",
          formData,
          "logo",
          "logo"
        );
        next.logoAssetId = uploaded.storagePath;
        setPendingLogo(null);
        revokeObjectUrl(logoPreviewUrl);
        setLogoPreviewUrl(undefined);
      }

      const saved = await saveSettingsAction(next);
      if (saved.cafeName.trim() !== next.cafeName.trim()) {
        throw new Error("تعذر تأكيد حفظ اسم العلامة الجديد.");
      }
      setSettings(saved);
      showToast({ type: "success", message: `تم حفظ إعدادات ${copy.casualNoun} بنجاح` });
    } catch (err) {
      showToast({
        type: "error",
        message:
          err instanceof Error ? err.message : "تعذر حفظ الإعدادات، حاول مرة أخرى",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (!passwordForm.currentPassword) {
      setPasswordMessage({ type: "error", text: "كلمة المرور الحالية مطلوبة." });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.",
      });
      return;
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordMessage({
        type: "error",
        text: "كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية.",
      });
      return;
    }

    setPasswordSaving(true);
    const result = await changeOwnerPasswordAction(passwordForm);
    setPasswordSaving(false);
    setPasswordMessage({
      type: result.ok ? "success" : "error",
      text: result.message,
    });

    if (result.ok) {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordVisibility({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
    }
  }

  const slug = settings.cafeSlug || "test-cafe";
  const displayDomain = getCafeDisplayDomain(slug, settings);
  const domainSource = resolveCafeDomainSource(settings);
  const publicUrl = getCafePublicUrl(slug, { origin: browserOrigin, settings });
  const subdomainPreview = getCafeSubdomainHost(slug);

  function copyPublicUrl() {
    void navigator.clipboard.writeText(publicUrl);
    showToast({ type: "success", message: `تم نسخ رابط ${copy.casualNoun}` });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setLogoUploading(true);
    showToast({ type: "loading", message: "جاري تحسين الصورة..." });
    try {
      const optimized = await optimizeImageForStorage(file, "cafe-logo");
      revokeObjectUrl(logoPreviewUrl);
      setLogoPreviewUrl(URL.createObjectURL(optimized.blob));
      setPendingLogo(optimized);
      showToast({
        type: "success",
        message: "تم تجهيز الصورة بنجاح — اضغط حفظ الإعدادات لتثبيتها",
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
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    await deleteLocalAsset(FIXED_ASSET_IDS["cafe-logo"]!);
    revokeObjectUrl(logoPreviewUrl);
    setLogoPreviewUrl(undefined);
    setPendingLogo(null);
    setSettings((prev) => {
      const next = { ...prev };
      delete next.logoDataUrl;
      delete next.logoAssetId;
      return next;
    });
    showToast({
      type: "success",
      message: "تم حذف اللوجو، اضغط حفظ الإعدادات لتثبيت الحذف",
    });
  }

  async function checkDomainAvailability() {
    const candidate = normalizeDomain(domainQuery);
    if (!candidate) {
      setDomainMessage("اكتب دومين صحيح مثل barndaksa.com");
      return;
    }
    setSearching(true);
    setDomainMessage("");
    try {
      const [availabilityRes, priceRes] = await Promise.all([
        fetch("/api/domains/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: candidate }),
        }),
        fetch("/api/domains/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: candidate, years: domainYears }),
        }),
      ]);

      const availabilityData = (await availabilityRes.json()) as DomainAvailabilityResult & {
        error?: string;
      };
      const priceData = (await priceRes.json()) as DomainPriceResult & { error?: string };
      if (!availabilityRes.ok) throw new Error(availabilityData.error || "تعذر فحص التوفر");
      if (!priceRes.ok) throw new Error(priceData.error || "تعذر قراءة السعر");

      setAvailability(availabilityData);
      setPricing(priceData);

      if (availabilityData.message) {
        setDomainMessage(availabilityData.message);
      } else if (availabilityData.available) {
        setDomainMessage("الدومين متاح. يمكنك المتابعة للدفع والشراء.");
      } else {
        setDomainMessage("الدومين غير متاح حاليًا.");
      }
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "حدث خطأ أثناء الفحص");
    } finally {
      setSearching(false);
    }
  }

  async function persistDomainSettings(next: CafeSettings) {
    const saved = await saveSettingsAction(next);
    setSettings(saved);
  }

  async function payAndBuyDomain() {
    if (!availability?.available || !pricing) return;
    setBuying(true);
    setDomainMessage("");
    try {
      const res = await fetch("/api/domains/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cafeSlug: slug,
          domain: availability.domain,
          years: domainYears,
          autoRenew,
          price: pricing.price,
          currency: pricing.currency,
        }),
      });
      const data = (await res.json()) as CafePurchasedDomain & { error?: string };
      if (!res.ok) throw new Error(data.error || "فشل شراء الدومين");
      setPurchase(data);

      const nextSettings: CafeSettings = {
        ...settings,
        purchasedDomain: data.domain,
        purchasedDomainStatus: "بانتظار التحقق",
        purchasedDomainCreatedAt: data.createdAt,
      };
      await persistDomainSettings(nextSettings);
      setDomainMessage(
        data.status === "purchase_pending"
          ? "تم تسجيل طلب النطاق — قيد المراجعة من الإدارة. لن يُفعَّل الشراء تلقائيًا حتى اكتمال التكامل."
          : "تم تنفيذ شراء الدومين. انتقل الآن إلى خطوة الربط بالمشروع."
      );
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "فشل شراء الدومين");
    } finally {
      setBuying(false);
    }
  }

  async function connectPurchasedDomain() {
    if (!purchase) return;
    setConnecting(true);
    setDomainMessage("");
    try {
      const res = await fetch("/api/domains/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: purchase.domain, cafeSlug: slug }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "فشل ربط الدومين");
      const connectedAt = new Date().toISOString();
      const nextPurchase: CafePurchasedDomain = {
        ...purchase,
        status: "connected",
        purchasedAt: purchase.purchasedAt || connectedAt,
      };
      setPurchase(nextPurchase);
      const nextSettings: CafeSettings = {
        ...settings,
        purchasedDomain: purchase.domain,
        purchasedDomainStatus: "مربوط",
        domainStatus: settings.domainStatus === "مربوط" ? "بانتظار التحقق" : settings.domainStatus,
        purchasedDomainConnectedAt: connectedAt,
      };
      await persistDomainSettings(nextSettings);
      setDomainMessage(`تم ربط الدومين بصفحة ${copy.casualNoun} بنجاح.`);
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : "فشل ربط الدومين");
    } finally {
      setConnecting(false);
    }
  }

  function copyDisplayDomain() {
    const source =
      domainSource === "purchased_domain"
        ? settings.purchasedDomain
        : domainSource === "external_custom_domain"
          ? settings.customDomain
          : subdomainPreview;
    if (!source) return;
    void navigator.clipboard.writeText(`https://${source}`);
    showToast({ type: "success", message: "تم نسخ الرابط" });
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title={`إعدادات ${copy.casualNoun}`}
        subtitle="الشعار، بيانات الحساب، والوثائق الحكومية الاختيارية."
        action={
          <div className="flex flex-wrap gap-3">
            <LinkButton
              href={publicUrl}
              variant="outline"
              target="_blank"
            >
              معاينة {copy.casualNoun}
            </LinkButton>
            <PrimaryButton
              onClick={save}
              disabled={saving || logoUploading}
              className="inline-flex items-center gap-2"
            >
              <Save className="h-5 w-5" />
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </PrimaryButton>
          </div>
        }
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label={`اسم ${copy.casualNoun}`} value={settings.cafeName} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="المسؤول" value={settings.ownerName} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill
              label="التواصل"
              value={settings.ownerPhone}
              hint={settings.ownerEmail || "بدون بريد"}
            />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">هوية {copy.casualNoun}</h2>

            <SoftCard className="mt-6 text-center">
              <div className="mx-auto flex h-32 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-3xl bg-[#F8F4EF]">
                {displayLogoUrl ? (
                  <img
                    src={displayLogoUrl}
                    alt=""
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <CafeLogo name={settings.cafeName} size="lg" className="!shadow-none" />
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickLogo}
              />

              <PrimaryButton
                onClick={() => fileRef.current?.click()}
                disabled={logoUploading}
                className="mt-5 inline-flex items-center gap-2"
              >
                <ImagePlus className="h-5 w-5" />
                {logoUploading ? "جاري رفع اللوجو..." : `رفع لوجو ${copy.casualNoun}`}
              </PrimaryButton>
              {displayLogoUrl ? (
                <button
                  type="button"
                  onClick={() => void removeLogo()}
                  className="mt-3 inline-flex rounded-2xl border border-[#E5D8CD] px-5 py-3 text-sm font-black text-[#7A6255] hover:bg-[#F8F4EF]"
                >
                  حذف اللوجو
                </button>
              ) : null}
            </SoftCard>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">بيانات الحساب</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label={`اسم ${copy.casualNoun}`}
                value={settings.cafeName}
                onChange={(v) => setSettings((p) => ({ ...p, cafeName: v }))}
              />
              <Field
                label="اسم المسؤول"
                value={settings.ownerName}
                onChange={(v) => setSettings((p) => ({ ...p, ownerName: v }))}
              />
              <Field
                label="بريد المسؤول"
                value={settings.ownerEmail}
                onChange={(v) => setSettings((p) => ({ ...p, ownerEmail: v }))}
              />
              <Field
                label="رقم المسؤول"
                value={settings.ownerPhone}
                onChange={(v) => setSettings((p) => ({ ...p, ownerPhone: v }))}
              />
              <Field
                label="واتساب"
                value={settings.whatsapp || ""}
                onChange={(v) => setSettings((p) => ({ ...p, whatsapp: v }))}
              />
              <Field
                label="انستقرام"
                value={settings.instagram || ""}
                onChange={(v) => setSettings((p) => ({ ...p, instagram: v }))}
              />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">وصف {copy.casualNoun}</span>
              <NeumoTextarea
                value={settings.description || ""}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, description: e.target.value }))
                }
                placeholder={`وصف ${copy.casualNoun}`}
                className="mt-2 h-28"
              />
            </label>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <KeyRound className="h-6 w-6" />
              تغيير كلمة المرور
            </h2>

            <form onSubmit={changePassword} className="mt-5 grid gap-4">
              <PasswordField
                label="كلمة المرور الحالية"
                value={passwordForm.currentPassword}
                visible={passwordVisibility.currentPassword}
                autoComplete="current-password"
                onChange={(value) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: value }))
                }
                onToggle={() =>
                  setPasswordVisibility((prev) => ({
                    ...prev,
                    currentPassword: !prev.currentPassword,
                  }))
                }
              />
              <PasswordField
                label="كلمة المرور الجديدة"
                value={passwordForm.newPassword}
                visible={passwordVisibility.newPassword}
                autoComplete="new-password"
                onChange={(value) =>
                  setPasswordForm((prev) => ({ ...prev, newPassword: value }))
                }
                onToggle={() =>
                  setPasswordVisibility((prev) => ({
                    ...prev,
                    newPassword: !prev.newPassword,
                  }))
                }
              />
              <PasswordField
                label="تأكيد كلمة المرور الجديدة"
                value={passwordForm.confirmPassword}
                visible={passwordVisibility.confirmPassword}
                autoComplete="new-password"
                onChange={(value) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: value }))
                }
                onToggle={() =>
                  setPasswordVisibility((prev) => ({
                    ...prev,
                    confirmPassword: !prev.confirmPassword,
                  }))
                }
              />

              {passwordMessage ? (
                <p
                  className={
                    passwordMessage.type === "success"
                      ? "text-sm font-black text-emerald-700"
                      : "text-sm font-black text-red-600"
                  }
                >
                  {passwordMessage.text}
                </p>
              ) : null}

              <PrimaryButton type="submit" disabled={passwordSaving} className="w-full">
                {passwordSaving ? "جار تغيير كلمة المرور..." : "تغيير كلمة المرور"}
              </PrimaryButton>
            </form>
          </BentoCard>

          <BentoCard variant="white" span="4">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <Globe className="h-6 w-6" />
              رابط {copy.casualNoun}
            </h2>
            <p className="mt-2 text-sm font-bold text-[#7A6255]">
              يعرض للعميل كدومين احترافي. المسار الحالي يعمل دائمًا كـ fallback.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label={`معرّف ${copy.casualNoun} (slug)`}
                value={settings.cafeSlug}
                onChange={(v) =>
                  setSettings((p) => ({
                    ...p,
                    cafeSlug: v.trim().toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
              />
              <div className="block">
                <span className="text-xs font-black text-[#7A6255]">معاينة الساب دومين</span>
                <p className="mt-2 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]">
                  {subdomainPreview}
                </p>
              </div>
              <Field
                label="دومين خاص (اختياري)"
                value={settings.customDomain || ""}
                onChange={(v) =>
                  setSettings((p) => ({
                    ...p,
                    customDomain: normalizeCafeDomainInput(v),
                  }))
                }
              />
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">حالة الربط</span>
                <NeumoSelect
                  value={settings.domainStatus || "غير مربوط"}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      domainStatus: e.target.value as CafeDomainLinkStatus,
                    }))
                  }
                  className="mt-2"
                >
                  <option value="غير مربوط">غير مربوط</option>
                  <option value="بانتظار التحقق">بانتظار التحقق</option>
                  <option value="مربوط">مربوط</option>
                </NeumoSelect>
              </label>
            </div>

            <SoftCard className="mt-5 space-y-3 p-5 text-sm font-bold text-[#7A6255]">
              <p>
                <span className="text-[#3A2117]">مصدر الدومين:</span>{" "}
                {domainSource === "purchased_domain"
                  ? "Purchased domain"
                  : domainSource === "external_custom_domain"
                    ? "External custom domain"
                    : "Platform subdomain"}
              </p>
              <p>
                <span className="text-[#3A2117]">يعرض للعميل:</span> {displayDomain}
              </p>
              <p>
                <span className="text-[#3A2117]">رابط فعلي (fallback):</span> {publicUrl}
              </p>
              <p className="text-xs leading-7">
                {getDomainSetupInstructions(slug).note}
                <br />
                CNAME: <span className="font-black text-[#3A2117]">{VERCEL_CNAME_TARGET}</span>
              </p>
            </SoftCard>

            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton type="button" onClick={copyPublicUrl} className="inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />
                نسخ رابط {copy.casualNoun}
              </PrimaryButton>
              <PrimaryButton type="button" onClick={copyDisplayDomain} className="inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />
                نسخ الدومين المعروض
              </PrimaryButton>
              <LinkButton href={publicUrl} target="_blank" variant="outline" className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                فتح صفحة {copy.casualNoun}
              </LinkButton>
            </div>

            <div className="mt-8 grid gap-5 border-t border-[#E5D8CD] pt-6">
              <div className="rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                <p className="text-sm font-black text-[#3A2117]">1) الرابط الافتراضي</p>
                <p className="mt-1 text-sm font-bold text-[#7A6255]">{subdomainPreview}</p>
              </div>

              <div className="rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                <p className="text-sm font-black text-[#3A2117]">2) ربط دومين يملكه {copy.casualNoun}</p>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  أضف CNAME/A Records ثم غيّر الحالة إلى مربوط بعد التحقق.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5D8CD] bg-white p-4">
                <h3 className="text-xl font-black text-[#3A2117]">3) شراء دومين من برندة</h3>
                <p className="mt-1 text-sm font-bold text-[#7A6255]">
                  ابحث عن دومين، افحص توفره، ثم أكمل الدفع والشراء والربط.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <NeumoInput
                    value={domainQuery}
                    onChange={(e) => setDomainQuery(e.target.value)}
                    placeholder="barndaksa.com أو cafe.com"
                  />
                  <PrimaryButton onClick={checkDomainAvailability} disabled={searching}>
                    {searching ? "جاري الفحص..." : "فحص التوفر"}
                  </PrimaryButton>
                </div>

                {availability ? (
                  <div className="mt-4 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                    <p className="font-black text-[#3A2117]">{availability.domain}</p>
                    <p className="mt-1 text-sm font-bold text-[#7A6255]">
                      الحالة: {availability.available ? "متاح" : "غير متاح"}
                    </p>
                    {!availability.supportedTld ? (
                      <p className="mt-2 text-sm font-black text-amber-700">
                        هذا الامتداد غير مدعوم للشراء المباشر حاليًا، يمكنك ربطه يدويًا من خيار
                        الدومين الخارجي.
                      </p>
                    ) : null}

                    {availability.available && pricing ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-black text-[#7A6255]">سنوات التسجيل</span>
                          <NeumoSelect
                            value={String(domainYears)}
                            onChange={(e) => setDomainYears(Number(e.target.value))}
                            className="mt-2"
                          >
                            <option value="1">سنة</option>
                            <option value="2">سنتان</option>
                            <option value="3">3 سنوات</option>
                          </NeumoSelect>
                        </label>

                        <div className="flex items-center gap-3 pt-6">
                          <input
                            id="autoRenew"
                            type="checkbox"
                            checked={autoRenew}
                            onChange={(e) => setAutoRenew(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <label htmlFor="autoRenew" className="text-sm font-black text-[#3A2117]">
                            تجديد تلقائي
                          </label>
                        </div>

                        <div className="sm:col-span-2 rounded-xl border border-[#E5D8CD] bg-white p-3 text-sm font-bold text-[#7A6255]">
                          <p>
                            ملخص الدفع: {pricing.price} {pricing.currency} لمدة {domainYears} سنة
                          </p>
                          <p>رسوم برندة: 0 (Placeholder)</p>
                        </div>

                        <div className="sm:col-span-2 flex flex-wrap gap-3">
                          <PrimaryButton onClick={payAndBuyDomain} disabled={buying}>
                            {buying ? "جاري الشراء..." : "الدفع وشراء الدومين"}
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {purchase ? (
                  <div className="mt-4 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] p-4">
                    <p className="font-black text-[#3A2117]">
                      الدومين: {purchase.domain} ({purchase.status})
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#7A6255]">
                      رقم الطلب: {purchase.vercelOrderId || "—"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <PrimaryButton
                        onClick={connectPurchasedDomain}
                        disabled={connecting || purchase.status === "connected"}
                      >
                        {purchase.status === "connected"
                          ? "تم الربط"
                          : connecting
                            ? "جاري الربط..."
                            : `ربط الدومين بصفحة ${copy.casualNoun}`}
                      </PrimaryButton>
                      <LinkButton
                        href={`https://${purchase.domain}`}
                        target="_blank"
                        variant="outline"
                        className="inline-flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        فتح الدومين
                      </LinkButton>
                    </div>
                  </div>
                ) : null}

                {domainMessage ? (
                  <p className="mt-3 text-sm font-black text-[#6B3A25]">{domainMessage}</p>
                ) : null}
              </div>
            </div>
          </BentoCard>

          <BentoCard variant="white" span="4">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <ShieldCheck className="h-6 w-6" />
              مستندات حكومية اختيارية
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="الرقم الضريبي"
                value={settings.taxNumber || ""}
                onChange={(v) => setSettings((p) => ({ ...p, taxNumber: v }))}
              />
              <Field
                label="السجل التجاري"
                value={settings.commercialRegister || ""}
                onChange={(v) => setSettings((p) => ({ ...p, commercialRegister: v }))}
              />
              <Field
                label="شهادة معروف"
                value={settings.maroofCertificate || ""}
                onChange={(v) => setSettings((p) => ({ ...p, maroofCertificate: v }))}
              />
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}

function PasswordField({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <div className="relative mt-2">
        <NeumoInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          placeholder="••••••••"
          autoComplete={autoComplete}
          className="pl-12"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <NeumoInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </label>
  );
}
