"use client";

import { Eye, EyeOff, ImagePlus, KeyRound, Save, ShieldCheck } from "lucide-react";
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
  NeumoInput,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { type CafeSettings } from "@/lib/mock/cafe-settings";
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
  }, [initialSettings]);

  useEffect(() => {
    return () => revokeObjectUrl(logoPreviewUrl);
  }, [logoPreviewUrl]);

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

      await saveSettingsAction(next);
      setSettings(next);
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

  return (
    <div dir="rtl">
      <DashboardPageShell
        title={`إعدادات ${copy.casualNoun}`}
        subtitle="الشعار، بيانات الحساب، والوثائق الحكومية الاختيارية."
        action={
          <div className="flex flex-wrap gap-3">
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
