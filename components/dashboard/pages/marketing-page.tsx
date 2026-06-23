"use client";

import {
  BarChart3,
  Camera,
  Check,
  Copy,
  Megaphone,
  Plus,
  QrCode,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";
import {
  MARKETING_KEY,
  mockMarketingCampaigns,
  type MarketingCampaign,
  type MarketingCampaignStatus,
} from "@/lib/mock/marketing";
import {
  EXPERIENCE_CAMPAIGNS_KEY,
  EXPERIENCE_SUBMISSIONS_KEY,
  mockExperienceCampaigns,
  mockExperienceSubmissions,
  platformLabels,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";
import {
  approveExperienceSubmissionAction,
  rejectExperienceSubmissionAction,
  saveExperienceCampaignAction,
  updateExperienceMetricsAction,
} from "@/app/actions/experience";
import {
  fetchOwnerMarketingAction,
  saveMarketingCampaignAction,
} from "@/app/actions/marketing";

const channels: MarketingCampaign["channel"][] = [
  "واتساب",
  "انستقرام",
  "سناب",
  "رابط مباشر",
  "QR",
];

const platformOptions: ExperiencePlatform[] = [
  "tiktok",
  "instagram",
  "snapchat",
  "youtube_shorts",
  "x",
];

type Tab = "marketing" | "experience";

type Props = {
  initialCampaigns?: MarketingCampaign[];
  initialExpCampaigns?: ExperienceCampaign[];
  initialSubmissions?: ExperienceSubmission[];
  configError?: string;
};

export function MarketingPageClient({
  initialCampaigns = [],
  initialExpCampaigns = [],
  initialSubmissions = [],
  configError,
}: Props = {}) {
  const [tab, setTab] = useState<Tab>("marketing");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(initialCampaigns);
  const [expCampaigns, setExpCampaigns] = useState<ExperienceCampaign[]>(initialExpCampaigns);
  const [submissions, setSubmissions] = useState<ExperienceSubmission[]>(initialSubmissions);

  const [title, setTitle] = useState("");
  const [channel, setChannel] =
    useState<MarketingCampaign["channel"]>("واتساب");
  const [audience, setAudience] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [influencerName, setInfluencerName] = useState("");
  const [influencerPhone, setInfluencerPhone] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [expTitle, setExpTitle] = useState("وثّق تجربتك");
  const [expDescription, setExpDescription] = useState(
    "شارك تجربة العميل المصورة مع علامتك التجارية"
  );
  const [expTerms, setExpTerms] = useState(
    "يجب أن يظهر اسم العلامة في الفيديو. المحتوى المسيء مرفوض."
  );
  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");
  const [expPlatforms, setExpPlatforms] = useState<ExperiencePlatform[]>([
    "tiktok",
    "instagram",
  ]);

  const [metricsDraft, setMetricsDraft] = useState<
    Record<string, { views: string; likes: string; comments: string }>
  >({});
  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    kind: "approve" | "reject";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (initialCampaigns.length || initialExpCampaigns.length || initialSubmissions.length) return;
    void (async () => {
      try {
        const [marketing, experience] = await Promise.all([
          fetchOwnerMarketingAction(),
          (await import("@/app/actions/experience")).fetchOwnerExperienceAction(),
        ]);
        setCampaigns(marketing);
        setExpCampaigns(experience.campaigns);
        setSubmissions(experience.submissions);
      } catch {
        /* empty state */
      }
    })();
  }, [initialCampaigns.length, initialExpCampaigns.length, initialSubmissions.length]);

  const activeExpCampaign = useMemo(
    () => expCampaigns.find((c) => c.cafeSlug === "test-cafe" && c.status === "active"),
    [expCampaigns]
  );

  const pendingSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) =>
          s.status === "pending" &&
          (!activeExpCampaign || s.campaignId === activeExpCampaign.id)
      ),
    [submissions, activeExpCampaign]
  );

  const totalVisits = useMemo(
    () => campaigns.reduce((sum, item) => sum + item.visits, 0),
    [campaigns]
  );

  const totalConversions = useMemo(
    () => campaigns.reduce((sum, item) => sum + item.conversions, 0),
    [campaigns]
  );

  function addCampaign() {
    if (!title.trim()) {
      alert("اكتب اسم الحملة");
      return;
    }

    const campaign: MarketingCampaign = {
      id: crypto.randomUUID(),
      title: title.trim(),
      channel,
      audience: audience.trim() || "كل العملاء",
      message:
        message.trim() ||
        "عرض خاص من العلامة، اكتشف المنيو واحجز طاولتك عبر برندة.",
      code: code.trim() || undefined,
      discountPercent: discountPercent ? Number(discountPercent) : undefined,
      influencerName: influencerName.trim() || undefined,
      influencerPhone: influencerPhone.trim() || undefined,
      commissionPercent: commissionPercent
        ? Number(commissionPercent)
        : undefined,
      status: startDate ? "مجدولة" : "نشطة",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      visits: 0,
      conversions: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setCampaigns((prev) => [campaign, ...prev]);
    setTitle("");
    setAudience("");
    setMessage("");
    setCode("");
    setDiscountPercent("");
    setInfluencerName("");
    setInfluencerPhone("");
    setCommissionPercent("");
    setStartDate("");
    setEndDate("");
  }

  function setStatus(id: string, status: MarketingCampaignStatus) {
    setCampaigns((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }

  function shareUrl(campaign: MarketingCampaign) {
    const base = getCafePublicUrl("test-cafe", {
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    const sep = base.includes("?") ? "&" : "?";
    const codeParam = campaign.code ? `${sep}code=${encodeURIComponent(campaign.code)}` : "";
    return `${base}${codeParam}`;
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    alert("تم النسخ");
  }

  function togglePlatform(p: ExperiencePlatform) {
    setExpPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function createExperienceCampaign() {
    if (!expTitle.trim() || expPlatforms.length === 0) {
      alert("أكمل عنوان الحملة واختر منصة واحدة على الأقل");
      return;
    }

    const campaign: ExperienceCampaign = {
      id: crypto.randomUUID(),
      cafeSlug: "test-cafe",
      title: expTitle.trim(),
      description: expDescription.trim(),
      startDate: expStart || new Date().toISOString().slice(0, 10),
      endDate: expEnd || "2026-12-31",
      terms: expTerms.trim(),
      platforms: expPlatforms,
      basePoints: 0,
      pointsPerView: 0,
      pointsPerLike: 0,
      pointsPerComment: 0,
      maxPointsPerSubmission: 0,
      requiresManualApproval: true,
      status: "active",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const next = expCampaigns.map((c) =>
      c.cafeSlug === "test-cafe" && c.status === "active"
        ? { ...c, status: "ended" as const }
        : c
    );
    await saveExperienceCampaignAction(campaign);
    setExpCampaigns([campaign, ...next]);
    alert("تم إنشاء حملة وثّق تجربتك");
  }

  async function saveMetrics(submissionId: string) {
    const draft = metricsDraft[submissionId];
    if (!draft) return;
    try {
      const submission = await updateExperienceMetricsAction(submissionId, {
        views: Number(draft.views) || 0,
        likes: Number(draft.likes) || 0,
        comments: Number(draft.comments) || 0,
      });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? submission : s))
      );
    } catch {
      alert("تعذر حفظ المقاييس");
    }
  }

  function openReview(id: string, kind: "approve" | "reject") {
    setReviewTarget({ id, kind });
    setReviewNote("");
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    try {
      if (reviewTarget.kind === "approve") {
        const submission = await approveExperienceSubmissionAction(reviewTarget.id);
        setSubmissions((prev) =>
          prev.map((s) => (s.id === reviewTarget.id ? submission : s))
        );
      } else {
        const submission = await rejectExperienceSubmissionAction(reviewTarget.id, reviewNote);
        setSubmissions((prev) =>
          prev.map((s) => (s.id === reviewTarget.id ? submission : s))
        );
      }
    } catch {
      alert("تعذر تحديث المشاركة");
    }
    setReviewTarget(null);
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الأدوات التسويقية"
        subtitle="حملات ترويجية، روابط مشاركة، وحملة وثّق تجربتك مع مراجعة المشاركات."
        action={
          <LinkButton href={getCafePublicUrl("test-cafe")} variant="outline" target="_blank">
            صفحة العلامة
          </LinkButton>
        }
      >
        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              ["marketing", "حملات تسويقية", Megaphone],
              ["experience", "وثّق تجربتك", Camera],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black ${
                tab === key ? "bg-[#3A2117] text-[#F8F4EF]" : "bg-[#F8F4EF] text-[#3A2117]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "marketing" ? (
          <>
            <BentoGrid className="mb-6">
              <BentoCard variant="white">
                <Megaphone className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="الحملات" value={campaigns.length} />
              </BentoCard>
              <BentoCard variant="white">
                <BarChart3 className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="الزيارات" value={totalVisits} />
              </BentoCard>
              <BentoCard variant="white" span="2">
                <QrCode className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label="التحويلات" value={totalConversions} />
              </BentoCard>
            </BentoGrid>

            <BentoGrid>
              <BentoCard variant="white" span="2">
                <div className="grid gap-5">
                  {campaigns.map((campaign) => {
                    const url = shareUrl(campaign);
                    return (
                      <SoftCard key={campaign.id}>
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                              <Megaphone className="h-7 w-7" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-[#6B3A25]">
                                {campaign.channel}
                              </p>
                              <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                                {campaign.title}
                              </h2>
                              <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[#7A6255]">
                                {campaign.message}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-4 py-2 text-xs font-black ${
                              campaign.status === "نشطة"
                                ? "bg-green-50 text-green-700"
                                : campaign.status === "مجدولة"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {campaign.status}
                          </span>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <PrimaryButton
                            onClick={() => copy(url)}
                            className="inline-flex items-center gap-2 px-5 py-3"
                          >
                            <Copy className="h-4 w-4" />
                            نسخ الرابط
                          </PrimaryButton>
                          <button
                            onClick={() =>
                              setStatus(
                                campaign.id,
                                campaign.status === "نشطة" ? "متوقفة" : "نشطة"
                              )
                            }
                            className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                          >
                            {campaign.status === "نشطة" ? "إيقاف" : "تفعيل"}
                          </button>
                          <button
                            onClick={() =>
                              setCampaigns((prev) =>
                                prev.filter((item) => item.id !== campaign.id)
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </button>
                        </div>
                      </SoftCard>
                    );
                  })}
                </div>
              </BentoCard>

              <BentoCard variant="white" span="2">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
                  <Plus className="h-5 w-5" />
                  حملة جديدة
                </h2>
                <div className="space-y-3">
                  <NeumoInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الحملة" />
                  <NeumoSelect value={channel} onChange={(e) => setChannel(e.target.value as MarketingCampaign["channel"])}>
                    {channels.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </NeumoSelect>
                  <NeumoTextarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="رسالة الحملة" className="h-24" />
                  <PrimaryButton onClick={addCampaign} className="w-full">
                    إنشاء الحملة
                  </PrimaryButton>
                </div>
              </BentoCard>
            </BentoGrid>
          </>
        ) : (
          <>
            <BentoGrid className="mb-6">
              <BentoCard variant="white">
                <StatPill label="حملة نشطة" value={activeExpCampaign?.title ?? "—"} />
              </BentoCard>
              <BentoCard variant="white">
                <StatPill label="مشاركات معلقة" value={pendingSubmissions.length} />
              </BentoCard>
              <BentoCard variant="white" span="2">
                <StatPill label="إجمالي المشاركات" value={submissions.length} />
              </BentoCard>
            </BentoGrid>

            <BentoGrid className="mb-6">
              <BentoCard variant="white" span="2">
                <h2 className="mb-4 text-xl font-black">إنشاء حملة وثّق تجربتك</h2>
                <div className="space-y-3">
                  <NeumoInput value={expTitle} onChange={(e) => setExpTitle(e.target.value)} placeholder="عنوان الحملة" />
                  <NeumoTextarea value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="الوصف" className="h-20" />
                  <NeumoTextarea value={expTerms} onChange={(e) => setExpTerms(e.target.value)} placeholder="الشروط" className="h-20" />
                  <div className="grid grid-cols-2 gap-2">
                    <NeumoInput type="date" value={expStart} onChange={(e) => setExpStart(e.target.value)} />
                    <NeumoInput type="date" value={expEnd} onChange={(e) => setExpEnd(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {platformOptions.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black ${
                          expPlatforms.includes(p)
                            ? "bg-[#3A2117] text-[#F8F4EF]"
                            : "bg-[#F8F4EF] text-[#3A2117]"
                        }`}
                      >
                        {platformLabels[p]}
                      </button>
                    ))}
                  </div>
                  <PrimaryButton onClick={createExperienceCampaign} className="w-full">
                    نشر الحملة
                  </PrimaryButton>
                </div>
              </BentoCard>

              <BentoCard variant="white" span="2">
                <h2 className="mb-4 text-xl font-black">مراجعة المشاركات</h2>
                <div className="space-y-4">
                  {pendingSubmissions.length === 0 ? (
                    <p className="font-bold text-[#7A6255]">لا توجد مشاركات بانتظار المراجعة.</p>
                  ) : (
                    pendingSubmissions.map((sub) => {
                      const draft = metricsDraft[sub.id] ?? {
                        views: String(sub.views ?? ""),
                        likes: String(sub.likes ?? ""),
                        comments: String(sub.comments ?? ""),
                      };

                      return (
                        <SoftCard key={sub.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-black">{sub.customerName}</h3>
                              <p className="text-sm font-bold text-[#7A6255]">
                                {platformLabels[sub.platform]} • {sub.videoUrl}
                              </p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                              بانتظار المراجعة
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {(["views", "likes", "comments"] as const).map((key) => (
                              <NeumoInput
                                key={key}
                                value={draft[key]}
                                onChange={(e) =>
                                  setMetricsDraft((prev) => ({
                                    ...prev,
                                    [sub.id]: {
                                      ...draft,
                                      [key]: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={
                                  key === "views"
                                    ? "مشاهدات"
                                    : key === "likes"
                                      ? "إعجابات"
                                      : "تعليقات"
                                }
                              />
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => saveMetrics(sub.id)}
                              className="rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
                            >
                              حفظ المقاييس
                            </button>
                            <button
                              onClick={() => openReview(sub.id, "approve")}
                              className="inline-flex items-center gap-1 rounded-2xl bg-green-50 px-4 py-2 text-sm font-black text-green-700"
                            >
                              <Check className="h-4 w-4" />
                              موافقة على المشاركة
                            </button>
                            <button
                              onClick={() => openReview(sub.id, "reject")}
                              className="inline-flex items-center gap-1 rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-700"
                            >
                              <X className="h-4 w-4" />
                              رفض
                            </button>
                          </div>
                        </SoftCard>
                      );
                    })
                  )}
                </div>
              </BentoCard>
            </BentoGrid>
          </>
        )}
      </DashboardPageShell>

      {reviewTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl">
            <h3 className="text-xl font-black">
              {reviewTarget.kind === "approve" ? "الموافقة على المشاركة" : "رفض المشاركة"}
            </h3>
            {reviewTarget.kind === "reject" ? (
              <NeumoTextarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="سبب الرفض"
                className="mt-4 h-24"
              />
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmReview}
                className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]"
              >
                تأكيد
              </button>
              <button
                onClick={() => setReviewTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="text-xs font-black text-[#7A6255]">{label}</p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}
