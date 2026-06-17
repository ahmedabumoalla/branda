"use client";

import {
  BarChart3,
  ContactRound,
  ImagePlus,
  PlayCircle,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  disablePlatformMediaAction,
  savePlatformContactSettingsAction,
  savePlatformHomeSettingsAction,
  uploadPlatformMediaAction,
} from "@/app/actions/platform-content";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminInput,
  AdminPageShell,
  AdminSelect,
  AdminTextarea,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import type {
  PlatformArabicFont,
  PlatformContactSettings,
  PlatformHomeSettings,
  PlatformMediaPlacement,
} from "@/lib/data/platform-content";

const defaultHomeSettings: PlatformHomeSettings = {
  heroBadge: "",
  heroTitle: "",
  heroDescription: "",
  heroSideText: "",
  featuresTitle: "",
  loyaltyDescription: "",
  ctaTitle: "",
  ctaDescription: "",
  aboutUs: "",
  vision: "",
  mission: "",
  carouselIntervalSeconds: 5,
  fontFamily: "system",
  heroBadgeFontSize: 14,
  heroTitleFontSize: 48,
  heroDescriptionFontSize: 18,
  heroSideTextFontSize: 30,
  featuresTitleFontSize: 36,
  loyaltyTitleFontSize: 36,
  loyaltyDescriptionFontSize: 18,
  ctaTitleFontSize: 36,
  ctaDescriptionFontSize: 18,
  aboutCardsFontSize: 15,
};

type AdminContentData = Awaited<
  ReturnType<typeof import("@/lib/data/platform-content").getAdminPlatformContentData>
>;

type Props = {
  initialData: AdminContentData | null;
  configError?: string;
};

const placementLabels: Record<PlatformMediaPlacement, string> = {
  hero: "الصورة الرئيسية أسفل زر ابدأ الآن",
  intro_video: "فيديو زر شاهد كيف يعمل",
  loyalty_cards: "صورة بطاقة الولاء في الصفحة الرئيسية",
  social_post: "محتوى التواصل الاجتماعي",
};

const fontOptions: Array<{ value: PlatformArabicFont; label: string }> = [
  { value: "system", label: "خط النظام" },
  { value: "cairo", label: "Cairo" },
  { value: "tajawal", label: "Tajawal" },
  { value: "ibm-plex-sans-arabic", label: "IBM Plex Sans Arabic" },
  { value: "noto-kufi-arabic", label: "Noto Kufi Arabic" },
];

const textSizeFields: Array<{
  key: keyof Pick<
    PlatformHomeSettings,
    | "heroBadgeFontSize"
    | "heroTitleFontSize"
    | "heroDescriptionFontSize"
    | "heroSideTextFontSize"
    | "featuresTitleFontSize"
    | "loyaltyTitleFontSize"
    | "loyaltyDescriptionFontSize"
    | "ctaTitleFontSize"
    | "ctaDescriptionFontSize"
    | "aboutCardsFontSize"
  >;
  label: string;
}> = [
  { key: "heroBadgeFontSize", label: "حجم العبارة العلوية" },
  { key: "heroTitleFontSize", label: "حجم عنوان الواجهة" },
  { key: "heroDescriptionFontSize", label: "حجم وصف الواجهة" },
  { key: "heroSideTextFontSize", label: "حجم النص بجانب الصورة" },
  { key: "featuresTitleFontSize", label: "حجم عنوان المزايا" },
  { key: "loyaltyTitleFontSize", label: "حجم عنوان الولاء" },
  { key: "loyaltyDescriptionFontSize", label: "حجم وصف الولاء" },
  { key: "ctaTitleFontSize", label: "حجم عنوان الدعوة" },
  { key: "ctaDescriptionFontSize", label: "حجم وصف الدعوة" },
  { key: "aboutCardsFontSize", label: "حجم نصوص من نحن والرؤية والرسالة" },
];

export function AdminContentPage({ initialData, configError }: Props) {
  const [settings, setSettings] = useState<PlatformHomeSettings>(
    initialData?.settings ?? defaultHomeSettings
  );
  const [contacts, setContacts] = useState<PlatformContactSettings>(
    initialData?.contacts ?? {
      email: "",
      whatsapp: "",
      instagram: "",
      facebook: "",
      tiktok: "",
      x: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const media = initialData?.allMedia ?? [];
  const requests = initialData?.contactRequests ?? [];

  const mediaStats = useMemo(
    () => ({
      hero: media.filter((item) => item.placement === "hero" && item.mediaType === "image").length,
      video: media.filter((item) => item.placement === "intro_video" && item.mediaType === "video").length,
      loyalty: media.filter((item) => item.placement === "loyalty_cards").length,
    }),
    [media]
  );

  async function saveHome() {
    setSaving(true);
    setMessage("");
    try {
      await savePlatformHomeSettingsAction(settings);
      setMessage("تم حفظ محتوى الصفحة الرئيسية وربطه بقاعدة البيانات");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ محتوى الصفحة الرئيسية");
    } finally {
      setSaving(false);
    }
  }

  async function saveContacts() {
    setSaving(true);
    setMessage("");
    try {
      await savePlatformContactSettingsAction(contacts);
      setMessage("تم حفظ وسائل التواصل وربطها بقاعدة البيانات");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ وسائل التواصل");
    } finally {
      setSaving(false);
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    try {
      await uploadPlatformMediaAction(formData);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر رفع الملف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="إدارة محتوى المنصة"
      subtitle="تحكم في الصفحة الرئيسية والفيديو التعريفي ووسائل التواصل"
      action={<BarndaksaLogo variant="dark" width={130} height={52} />}
    >
      {configError ? <p className="mb-5 rounded-2xl bg-red-500/10 p-4 font-black text-red-300">{configError}</p> : null}
      {message ? <p className="mb-5 rounded-2xl bg-[#D9A33F]/10 p-4 font-black text-[#F6C35B]">{message}</p> : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="cyber">
          <BarChart3 className="mb-3 h-7 w-7 text-[#F6C35B]" />
          <p className="text-sm font-black text-[#CBB29C]">ضغطات شاهد كيف يعمل</p>
          <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{initialData?.videoClicks ?? 0}</p>
        </BentoCard>
        <BentoCard variant="cyber">
          <PlayCircle className="mb-3 h-7 w-7 text-[#F6C35B]" />
          <p className="text-sm font-black text-[#CBB29C]">مشاهدات الفيديو التعريفي</p>
          <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{initialData?.videoViews ?? 0}</p>
        </BentoCard>
        <BentoCard variant="cyber">
          <ImagePlus className="mb-3 h-7 w-7 text-[#F6C35B]" />
          <p className="text-sm font-black text-[#CBB29C]">صور الواجهة</p>
          <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{mediaStats.hero}</p>
        </BentoCard>
        <BentoCard variant="cyber">
          <ImagePlus className="mb-3 h-7 w-7 text-[#F6C35B]" />
          <p className="text-sm font-black text-[#CBB29C]">صورة بطاقة الولاء</p>
          <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{mediaStats.loyalty}</p>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="dark" span="2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#F8F4EF]">محتوى الصفحة الرئيسية</h2>
            <GoldButton onClick={saveHome} disabled={saving} className="inline-flex items-center gap-2">
              <Save className="h-4 w-4" /> حفظ
            </GoldButton>
          </div>
          <div className="space-y-3">
            <AdminInput value={settings.heroBadge} onChange={(e) => setSettings({ ...settings, heroBadge: e.target.value })} placeholder="العبارة التعريفية العلوية" />
            <AdminTextarea value={settings.heroTitle} onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })} placeholder="عنوان الواجهة" />
            <AdminTextarea value={settings.heroDescription} onChange={(e) => setSettings({ ...settings, heroDescription: e.target.value })} placeholder="وصف الواجهة" />
            <AdminTextarea value={settings.heroSideText} onChange={(e) => setSettings({ ...settings, heroSideText: e.target.value })} placeholder="العبارة المجاورة للصورة الرئيسية" />
            <AdminInput value={settings.featuresTitle} onChange={(e) => setSettings({ ...settings, featuresTitle: e.target.value })} placeholder="عنوان المزايا" />
            <AdminTextarea value={settings.loyaltyDescription} onChange={(e) => setSettings({ ...settings, loyaltyDescription: e.target.value })} placeholder="وصف بطاقات الولاء" />
            <AdminInput value={settings.ctaTitle} onChange={(e) => setSettings({ ...settings, ctaTitle: e.target.value })} placeholder="عنوان الدعوة للانضمام" />
            <AdminTextarea value={settings.ctaDescription} onChange={(e) => setSettings({ ...settings, ctaDescription: e.target.value })} placeholder="وصف الدعوة للانضمام" />
            <div className="grid gap-3 md:grid-cols-3">
              <AdminTextarea value={settings.aboutUs} onChange={(e) => setSettings({ ...settings, aboutUs: e.target.value })} placeholder="من نحن" />
              <AdminTextarea value={settings.vision} onChange={(e) => setSettings({ ...settings, vision: e.target.value })} placeholder="رؤيتنا" />
              <AdminTextarea value={settings.mission} onChange={(e) => setSettings({ ...settings, mission: e.target.value })} placeholder="رسالتنا" />
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[#CBB29C]">مدة تبديل صور الواجهة بالثواني</span>
              <AdminInput type="number" min={4} max={12} value={settings.carouselIntervalSeconds} onChange={(e) => setSettings({ ...settings, carouselIntervalSeconds: Number(e.target.value) || 5 })} />
            </label>
          </div>
        </BentoCard>

        <BentoCard variant="dark" span="2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#F8F4EF]">الخطوط وحجم النصوص</h2>
            <GoldButton onClick={saveHome} disabled={saving} className="inline-flex items-center gap-2">
              <Save className="h-4 w-4" /> حفظ الخطوط
            </GoldButton>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black text-[#CBB29C]">نوع الخط العربي في الصفحة الرئيسية</span>
              <AdminSelect value={settings.fontFamily} onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value as PlatformArabicFont })}>
                {fontOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </AdminSelect>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              {textSizeFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-2 block text-xs font-black text-[#CBB29C]">{field.label}</span>
                  <AdminInput
                    type="number"
                    min={10}
                    max={72}
                    value={settings[field.key]}
                    onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) || defaultHomeSettings[field.key] })}
                  />
                </label>
              ))}
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="dark" span="2">
          <h2 className="mb-5 text-xl font-black text-[#F8F4EF]">الصور والفيديو المعروض</h2>
          <form onSubmit={uploadMedia} className="mb-5 space-y-3 rounded-2xl border border-white/10 p-4">
            <select name="placement" required className="h-14 w-full rounded-2xl border border-[#D9A33F]/25 bg-[#211711] px-4 font-bold text-white">
              <option value="hero">الصورة الرئيسية مقاس مقترح 1200 × 900</option>
              <option value="intro_video">فيديو شاهد كيف يعمل بصيغة MP4 أو WEBM</option>
            </select>
            <AdminInput name="altText" placeholder="وصف الملف" />
            <AdminInput name="file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" required />
            <GoldButton type="submit" disabled={saving} className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> رفع الملف
            </GoldButton>
          </form>
          <form onSubmit={uploadMedia} className="mb-5 space-y-3 rounded-2xl border border-[#D9A33F]/25 bg-[#D9A33F]/10 p-4">
            <input type="hidden" name="placement" value="loyalty_cards" />
            <p className="font-black text-[#F6C35B]">صورة بطاقة الولاء في الصفحة الرئيسية</p>
            <p className="text-xs font-bold text-[#CBB29C]">رفع صورة جديدة يستبدل الصورة الحالية تلقائيًا ويحفظها في التخزين وقاعدة البيانات.</p>
            <AdminInput name="altText" placeholder="وصف صورة بطاقة الولاء" />
            <AdminInput name="file" type="file" accept="image/*" required />
            <GoldButton type="submit" disabled={saving} className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> رفع صورة بطاقة الولاء
            </GoldButton>
          </form>
          <div className="space-y-3">
            {!media.some((item) => item.placement === "hero" && item.mediaType === "image") ? (
              <div className="rounded-2xl border border-[#D9A33F]/25 bg-[#D9A33F]/10 p-4">
                <p className="font-black text-[#F6C35B]">الصورة الأساسية معروضة حاليا</p>
                <p className="mt-2 text-xs font-bold text-[#CBB29C]">ترفع صورة جديدة للقسم الرئيسي لاستبدالها تلقائيا</p>
              </div>
            ) : null}
            {media.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  {item.mediaType === "image" ? (
                    <img src={item.url} alt={item.altText} className="h-14 w-20 rounded-xl object-cover" />
                  ) : (
                    <PlayCircle className="h-10 w-10 text-[#F6C35B]" />
                  )}
                  <div>
                    <p className="text-sm font-black text-white">{placementLabels[item.placement as PlatformMediaPlacement]}</p>
                    <p className="text-xs font-bold text-[#CBB29C]">{item.altText || "بدون وصف"}</p>
                  </div>
                </div>
                <button type="button" onClick={async () => { await disablePlatformMediaAction(item.id); window.location.reload(); }} className="rounded-xl bg-red-500/10 p-3 text-red-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="dark" span="2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#F8F4EF]">إدارة وسائل التواصل</h2>
            <GoldButton onClick={saveContacts} disabled={saving}>حفظ التواصل</GoldButton>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminInput value={contacts.email} onChange={(e) => setContacts({ ...contacts, email: e.target.value })} placeholder="إيميل التواصل" />
            <AdminInput value={contacts.whatsapp} onChange={(e) => setContacts({ ...contacts, whatsapp: e.target.value })} placeholder="رقم واتساب" />
            <AdminInput value={contacts.instagram} onChange={(e) => setContacts({ ...contacts, instagram: e.target.value })} placeholder="رابط انستقرام" />
            <AdminInput value={contacts.facebook} onChange={(e) => setContacts({ ...contacts, facebook: e.target.value })} placeholder="رابط فيس بوك" />
            <AdminInput value={contacts.tiktok} onChange={(e) => setContacts({ ...contacts, tiktok: e.target.value })} placeholder="رابط تيك توك" />
            <AdminInput value={contacts.x} onChange={(e) => setContacts({ ...contacts, x: e.target.value })} placeholder="رابط منصة إكس" />
          </div>
          <p className="mt-4 text-xs font-bold text-[#CBB29C]">يتم حفظ وسائل التواصل مباشرة في قاعدة البيانات وتظهر بعد تحديث الصفحة.</p>
        </BentoCard>
      </BentoGrid>

      <BentoCard variant="dark">
        <div className="mb-5 flex items-center gap-3">
          <ContactRound className="h-7 w-7 text-[#F6C35B]" />
          <h2 className="text-xl font-black text-[#F8F4EF]">طلبات التواصل الواردة</h2>
        </div>
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-white/10 p-4">
              <p className="font-black text-white">{request.fullName} • {request.email}</p>
              <p className="mt-2 text-sm font-bold text-[#CBB29C]">{request.message}</p>
              <StatusBadge tone="gold">{new Date(request.createdAt).toLocaleString("ar-SA")}</StatusBadge>
            </div>
          ))}
          {!requests.length ? <p className="font-bold text-[#CBB29C]">لا توجد رسائل جديدة</p> : null}
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
