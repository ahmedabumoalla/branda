"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Camera, Send, Sparkles } from "lucide-react";
import { useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import { ThemedSelect } from "@/components/cafe/themes/themed-reservation-panel";
import {
  platformLabels,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";
import {
  fetchPublicExperienceCampaignsAction,
  submitExperienceCampaignAction,
} from "@/app/actions/customer";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";

type Props = {
  slug?: string;
  compact?: boolean;
};

function ExperienceCampaignSectionInner({ slug: slugProp, compact }: Props) {
  const params = useParams<{ slug: string }>();
  const slug = slugProp || params.slug;
  const { experience, theme, path } = useCafePageContext(slug);

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [campaigns, setCampaigns] = useState<ExperienceCampaign[]>([]);
  const [submissions, setSubmissions] = useState<ExperienceSubmission[]>([]);
  const [platform, setPlatform] = useState<ExperiencePlatform>("tiktok");
  const [videoUrl, setVideoUrl] = useState("");
  const [platformUsername, setPlatformUsername] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
    void fetchPublicExperienceCampaignsAction(slug).then(setCampaigns);
  }, [slug]);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.cafeSlug === slug && c.status === "active"),
    [campaigns, slug]
  );

  const mySubmissions = useMemo(
    () =>
      submissions.filter(
        (s) => s.customerId === customer?.id && s.campaignId === activeCampaign?.id
      ),
    [submissions, customer, activeCampaign]
  );

  if (!activeCampaign) return null;

  async function handleSubmit() {
    if (!customer) {
      alert("سجّل دخولك أولاً");
      return;
    }
    if (!videoUrl.trim()) {
      alert("أدخل رابط الفيديو");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitExperienceCampaignAction({
        slug,
        customer,
        campaignId: activeCampaign!.id,
        platform,
        videoUrl,
        platformUsername,
        note,
      });

      if (result.ok) {
        setSubmissions((prev) => [result.submission, ...prev]);
        setVideoUrl("");
        setPlatformUsername("");
        setNote("");
        alert("تم إرسال مشاركتك — بانتظار مراجعة الكوفي");
      }
    } catch {
      alert("تعذر إرسال المشاركة");
    } finally {
      setSubmitting(false);
    }
  }

  const wrapClass = compact
    ? `rounded-2xl border p-5 ${theme.card}`
    : `rounded-[28px] border p-6 md:p-8 ${theme.card}`;

  return (
    <section className={`mt-8 ${wrapClass}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.hero}`}>
          <Camera className={`h-6 w-6 ${theme.accent}`} />
        </div>
        <div>
          <p className={`text-sm font-black ${theme.accent}`}>حملة نشطة</p>
          <h2 className={`text-2xl font-black ${experience.headingTracking}`}>
            {activeCampaign.title}
          </h2>
          <p className={`mt-2 font-bold ${theme.muted}`}>{activeCampaign.description}</p>
        </div>
      </div>

      <div className={`mt-4 rounded-2xl p-4 text-sm font-bold ${theme.hero}`}>
        <Sparkles className={`mb-2 inline h-4 w-4 ${theme.accent}`} />{" "}
        شارك تجربتك المصورة مع العلامة التجارية
      </div>

      {!customer ? (
        <div className="mt-4">
          <p className="font-black">سجّل دخولك للمشاركة في الحملة.</p>
          <Link
            href={path("login")}
            className={`mt-3 inline-flex rounded-2xl px-6 py-3 font-black ${theme.button}`}
          >
            تسجيل الدخول
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <ThemedSelect
            experience={experience}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as ExperiencePlatform)}
          >
            {activeCampaign.platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabels[p]}
              </option>
            ))}
          </ThemedSelect>
          <ThemedInput
            experience={experience}
            value={platformUsername}
            onChange={(e) => setPlatformUsername(e.target.value)}
            placeholder="اسم الحساب (@username)"
          />
          <ThemedInput
            experience={experience}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="رابط الفيديو"
            className="md:col-span-2"
          />
          <ThemedInput
            experience={experience}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            className="md:col-span-2"
          />
          <button
            type="button"
            onClick={handleSubmit}
            className={`inline-flex items-center justify-center gap-2 md:col-span-2 ${experience.reserve === "kiosk" ? "h-14 rounded-lg" : "h-12 rounded-2xl"} font-black ${theme.button}`}
          >
            <Send className="h-4 w-4" />
            إرسال المشاركة
          </button>
        </div>
      )}

      {mySubmissions.length > 0 ? (
        <div className="mt-6 space-y-2">
          <p className="font-black">مشاركاتك</p>
          {mySubmissions.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl px-4 py-3 text-sm font-bold ${theme.hero}`}
            >
              {platformLabels[s.platform]} —{" "}
              {s.status === "pending"
                ? "بانتظار المراجعة"
                : s.status === "approved"
                  ? "مقبولة"
                  : "مرفوضة"}
            </div>
          ))}
        </div>
      ) : null}

      <p className={`mt-4 text-xs font-bold ${theme.muted}`}>{activeCampaign.terms}</p>
    </section>
  );
}

export function ExperienceCampaignSection(props: Props) {
  return (
    <Suspense fallback={null}>
      <ExperienceCampaignSectionInner {...props} />
    </Suspense>
  );
}
