"use client";

import { Copy, ExternalLink, Globe, ImagePlus, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
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
import { CAFE_SETTINGS_KEY, mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CafeDomainLinkStatus } from "@/lib/platform/cafe-domain";
import {
  getCafeDisplayDomain,
  getCafePublicUrl,
  getCafeSubdomainHost,
  getDomainSetupInstructions,
  normalizeCafeDomainInput,
  VERCEL_CNAME_TARGET,
} from "@/lib/platform/cafe-domain";

export function SettingsPageClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CafeSettings>(mockCafeSettings);

  useEffect(() => {
    const saved = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (saved) setSettings(JSON.parse(saved));
  }, []);

  function save() {
    localStorage.setItem(CAFE_SETTINGS_KEY, JSON.stringify(settings));
    alert("تم حفظ إعدادات الكوفي");
  }

  const slug = settings.cafeSlug || "qatrah";
  const displayDomain = getCafeDisplayDomain(slug, settings);
  const publicUrl =
    typeof window !== "undefined"
      ? getCafePublicUrl(slug, { origin: window.location.origin })
      : getCafePublicUrl(slug);
  const subdomainPreview = getCafeSubdomainHost(slug);

  function copyPublicUrl() {
    void navigator.clipboard.writeText(publicUrl);
    alert("تم نسخ رابط الكوفي");
  }

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSettings((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="إعدادات الكوفي"
        subtitle="الشعار، بيانات الحساب، والوثائق الحكومية الاختيارية."
        action={
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/c/qatrah" variant="outline">
              معاينة الكوفي
            </LinkButton>
            <PrimaryButton onClick={save} className="inline-flex items-center gap-2">
              <Save className="h-5 w-5" />
              حفظ الإعدادات
            </PrimaryButton>
          </div>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="اسم الكوفي" value={settings.cafeName} />
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
            <h2 className="text-2xl font-black text-[#3A2117]">هوية الكوفي</h2>

            <SoftCard className="mt-6 text-center">
              <div className="mx-auto flex h-32 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-3xl bg-[#F8F4EF]">
                {settings.logoDataUrl ? (
                  <img
                    src={settings.logoDataUrl}
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
                className="mt-5 inline-flex items-center gap-2"
              >
                <ImagePlus className="h-5 w-5" />
                رفع لوجو الكوفي
              </PrimaryButton>
            </SoftCard>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">بيانات الحساب</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label="اسم الكوفي"
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
              <span className="text-xs font-black text-[#7A6255]">وصف الكوفي</span>
              <NeumoTextarea
                value={settings.description || ""}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="وصف الكوفي"
                className="mt-2 h-28"
              />
            </label>
          </BentoCard>

          <BentoCard variant="white" span="4">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <Globe className="h-6 w-6" />
              رابط الكوفي
            </h2>
            <p className="mt-2 text-sm font-bold text-[#7A6255]">
              يعرض للعميل كدومين احترافي. المسار الحالي يعمل دائمًا كـ fallback.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field
                label="معرّف الكوفي (slug)"
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
                نسخ رابط الكوفي
              </PrimaryButton>
              <LinkButton href={publicUrl} target="_blank" variant="outline" className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                فتح صفحة الكوفي
              </LinkButton>
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
    </div>
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
