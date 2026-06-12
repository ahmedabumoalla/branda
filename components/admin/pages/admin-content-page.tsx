"use client";

import {
  BarChart3,
  CalendarClock,
  ContactRound,
  ImagePlus,
  Megaphone,
  PlayCircle,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  createPlatformSocialPostAction,
  disablePlatformMediaAction,
  removePlatformSocialPostAction,
  savePlatformContactSettingsAction,
  savePlatformHomeSettingsAction,
  uploadPlatformMediaAction,
} from "@/app/actions/platform-content";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminInput,
  AdminPageShell,
  AdminTextarea,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import type {
  PlatformContactSettings,
  PlatformHomeSettings,
  PlatformMediaPlacement,
} from "@/lib/data/platform-content";

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
  loyalty_cards: "صور بطاقات الولاء",
  social_post: "محتوى التواصل الاجتماعي",
};

const socialChannels = [
  ["instagram", "انستقرام"],
  ["facebook", "فيس بوك"],
  ["tiktok", "تيك توك"],
  ["x", "منصة إكس"],
  ["whatsapp", "واتساب"],
] as const;

export function AdminContentPage({ initialData, configError }: Props) {
  const [settings, setSettings] = useState<PlatformHomeSettings>(
    initialData?.settings ?? {
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
    }
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
  const [postText, setPostText] = useState("");
  const [postDate, setPostDate] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["instagram"]);

  const media = initialData?.allMedia ?? [];
  const posts = initialData?.posts ?? [];
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
      setMessage("تم حفظ نصوص الصفحة الرئيسية");
    } catch {
      setMessage("تعذر حفظ نصوص الصفحة الرئيسية");
    } finally {
      setSaving(false);
    }
  }

  async function saveContacts() {
    setSaving(true);
    setMessage("");
    try {
      await savePlatformContactSettingsAction(contacts);
      setMessage("تم حفظ وسائل التواصل");
    } catch {
      setMessage("تعذر حفظ وسائل التواصل");
    } finally {
      setSaving(false);
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await uploadPlatformMediaAction(formData);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر رفع الملف");
    } finally {
      setSaving(false);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postText.trim() || !postDate || !selectedChannels.length) return;
    const formData = new FormData(event.currentTarget);
    selectedChannels.forEach((channel) => formData.append("channels", channel));
    setSaving(true);
    try {
      await createPlatformSocialPostAction(formData);
      window.location.reload();
    } catch {
      setMessage("تعذر حفظ المنشور المجدول");
    } finally {
      setSaving(false);
    }
  }

  function toggleChannel(channel: string) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    );
  }

  return (
    <AdminPageShell
      title="إدارة محتوى المنصة"
      subtitle="تحكم في الصفحة الرئيسية والفيديو التعريفي ووسائل التواصل ومحتوى النشر"
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
          <Megaphone className="mb-3 h-7 w-7 text-[#F6C35B]" />
          <p className="text-sm font-black text-[#CBB29C]">منشورات مجدولة</p>
          <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{posts.length}</p>
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
          <h2 className="mb-5 text-xl font-black text-[#F8F4EF]">الصور والفيديو المعروض</h2>
          <form onSubmit={uploadMedia} className="mb-5 space-y-3 rounded-2xl border border-white/10 p-4">
            <select name="placement" required className="h-14 w-full rounded-2xl border border-[#D9A33F]/25 bg-[#211711] px-4 font-bold text-white">
              <option value="hero">الصورة الرئيسية مقاس مقترح 1200 × 900</option>
              <option value="intro_video">فيديو شاهد كيف يعمل بصيغة MP4 أو WEBM</option>
              <option value="loyalty_cards">صور بطاقات الولاء مقاس مقترح 1080 × 620</option>
            </select>
            <AdminInput name="altText" placeholder="وصف الملف" />
            <AdminInput name="file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" required />
            <GoldButton type="submit" disabled={saving} className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> رفع الملف
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
      </BentoGrid>

      <BentoGrid className="mb-6">
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
          <p className="mt-4 text-xs font-bold text-[#CBB29C]">التنبيهات البريدية جاهزة للربط مع Resend أو Hostinger في المرحلة التالية</p>
        </BentoCard>

        <BentoCard variant="dark" span="2">
          <div className="mb-5 flex items-center gap-3">
            <CalendarClock className="h-7 w-7 text-[#F6C35B]" />
            <h2 className="text-xl font-black text-[#F8F4EF]">جدولة محتوى التواصل</h2>
          </div>
          <form onSubmit={createPost}>
            <AdminTextarea name="description" value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="وصف المنشور" />
            <div className="mt-3 flex flex-wrap gap-2">
              {socialChannels.map(([channel, label]) => (
                <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-xl border px-3 py-2 text-xs font-black ${selectedChannels.includes(channel) ? "border-[#D9A33F] bg-[#D9A33F]/20 text-[#F6C35B]" : "border-white/10 text-[#CBB29C]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <AdminInput name="scheduledAt" className="mt-3" type="datetime-local" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
            <label className="mt-3 block">
              <span className="mb-2 block text-xs font-black text-[#CBB29C]">صور أو فيديوهات المنشور</span>
              <AdminInput name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple />
            </label>
            <GoldButton type="submit" disabled={saving} className="mt-3">حفظ وجدولة المنشور</GoldButton>
          </form>
          <p className="mt-4 text-xs font-bold text-[#CBB29C]">النشر التلقائي يتفعل بعد ربط الواجهات الرسمية لكل منصة</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(initialData?.accounts ?? []).map((account) => (
              <StatusBadge key={String(account.id)} tone="gold">
                {String(account.provider)} • جاهز للربط
              </StatusBadge>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {posts.slice(0, 5).map((post) => (
              <div key={post.id} className="rounded-xl border border-white/10 p-3 text-sm font-bold text-[#CBB29C]">
                <div className="flex justify-between gap-3">
                  <p className="text-white">{post.description}</p>
                  <button type="button" onClick={async () => { await removePlatformSocialPostAction(post.id); window.location.reload(); }} className="text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2">{post.channels.join(" - ")} • {new Date(post.scheduledAt).toLocaleString("ar-SA")}</p>
                <StatusBadge tone="gold">{post.status === "scheduled" ? "مجدول وجاهز للربط" : post.status}</StatusBadge>
              </div>
            ))}
          </div>
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
