"use client";

import {
  BarChart3,
  Copy,
  Megaphone,
  Plus,
  QrCode,
  Share2,
  Trash2,
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

const channels: MarketingCampaign["channel"][] = [
  "واتساب",
  "انستقرام",
  "سناب",
  "رابط مباشر",
  "QR",
];

export function MarketingPageClient() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(
    mockMarketingCampaigns
  );

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

  useEffect(() => {
    const saved = localStorage.getItem(MARKETING_KEY);
    if (saved) setCampaigns(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(MARKETING_KEY, JSON.stringify(campaigns));
  }, [campaigns]);

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
        "عرض خاص من الكوفي، اكتشف المنيو واحجز طاولتك عبر برندة.",
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
    const base = getCafePublicUrl("qatrah", {
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

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الأدوات التسويقية"
        subtitle="أنشئ حملات، روابط مشاركة، أكواد خصم، وتتبع الزيارات والتحويلات."
        action={
          <LinkButton href={getCafePublicUrl("qatrah")} variant="outline" target="_blank">
            صفحة الكوفي
          </LinkButton>
        }
      >
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

                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      <Info label="الجمهور" value={campaign.audience} />
                      <Info label="الكود" value={campaign.code || "بدون"} />
                      <Info
                        label="الخصم"
                        value={
                          campaign.discountPercent
                            ? `${campaign.discountPercent}%`
                            : "غير محدد"
                        }
                      />
                      <Info
                        label="النتائج"
                        value={`${campaign.visits} زيارة / ${campaign.conversions} تحويل`}
                      />
                    </div>

                    {campaign.influencerName ? (
                      <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                        <p className="font-black text-[#3A2117]">بيانات المسوق</p>
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">
                          {campaign.influencerName} •{" "}
                          {campaign.influencerPhone || "بدون رقم"} • نسبة{" "}
                          {campaign.commissionPercent || 0}%
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <PrimaryButton
                        onClick={() => copy(url)}
                        className="inline-flex items-center gap-2 px-5 py-3"
                      >
                        <Copy className="h-4 w-4" />
                        نسخ رابط الحملة
                      </PrimaryButton>

                      <button
                        onClick={() => copy(campaign.message)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
                      >
                        <Share2 className="h-4 w-4" />
                        نسخ الرسالة
                      </button>

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
              <NeumoInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="اسم الحملة"
              />

              <NeumoSelect
                value={channel}
                onChange={(e) =>
                  setChannel(e.target.value as MarketingCampaign["channel"])
                }
              >
                {channels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </NeumoSelect>

              <NeumoInput
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="الجمهور المستهدف"
              />

              <NeumoTextarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="رسالة الحملة"
                className="h-24"
              />

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="كود الخصم"
                />
                <NeumoInput
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="نسبة الخصم"
                />
              </div>

              <SoftCard className="p-4">
                <p className="mb-3 font-black text-[#3A2117]">بيانات المسوق اختيارية</p>

                <div className="space-y-2">
                  <NeumoInput
                    value={influencerName}
                    onChange={(e) => setInfluencerName(e.target.value)}
                    placeholder="اسم المسوق"
                  />
                  <NeumoInput
                    value={influencerPhone}
                    onChange={(e) => setInfluencerPhone(e.target.value)}
                    placeholder="رقم المسوق"
                  />
                  <NeumoInput
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                    placeholder="نسبة المسوق %"
                  />
                </div>
              </SoftCard>

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <NeumoInput
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <PrimaryButton onClick={addCampaign} className="w-full">
                إنشاء الحملة
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
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
