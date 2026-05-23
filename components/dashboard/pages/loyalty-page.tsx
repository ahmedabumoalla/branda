"use client";

import {
  Gift,
  Plus,
  Power,
  Save,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

const SETTINGS_KEY = "branda_qatrah_loyalty_settings";
const REWARDS_KEY = "branda_qatrah_loyalty_rewards";

type Props = {
  initialSettings: LoyaltySettings;
  initialRewards: LoyaltyReward[];
};

export function LoyaltyPageClient({ initialSettings, initialRewards }: Props) {
  const [settings, setSettings] = useState<LoyaltySettings>(initialSettings);
  const [rewards, setRewards] = useState<LoyaltyReward[]>(initialRewards);

  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("50");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    const savedRewards = localStorage.getItem(REWARDS_KEY);

    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedRewards) setRewards(JSON.parse(savedRewards));
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(REWARDS_KEY, JSON.stringify(rewards));
  }, [rewards]);

  const activeRewards = useMemo(
    () => rewards.filter((reward) => reward.active).length,
    [rewards]
  );

  const minReward = useMemo(() => {
    if (rewards.length === 0) return 0;
    return Math.min(...rewards.map((reward) => reward.points));
  }, [rewards]);

  function addReward() {
    if (!title.trim() || !points) return;

    const reward: LoyaltyReward = {
      id: crypto.randomUUID(),
      title: title.trim(),
      points: Number(points) || 50,
      description:
        description.trim() ||
        "مكافأة ولاء يمكن للعميل استبدالها من صفحة الكوفي.",
      active: true,
    };

    setRewards((prev) => [reward, ...prev]);
    setTitle("");
    setPoints("50");
    setDescription("");
  }

  function toggleReward(id: string) {
    setRewards((prev) =>
      prev.map((reward) =>
        reward.id === id ? { ...reward, active: !reward.active } : reward
      )
    );
  }

  function deleteReward(id: string) {
    setRewards((prev) => prev.filter((reward) => reward.id !== id));
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="نقاط الولاء"
        subtitle="تحكم في احتساب النقاط والمكافآت التي تظهر للعملاء في صفحة الكوفي."
        action={
          <PrimaryButton
            onClick={() => alert("تم حفظ إعدادات الولاء وتحديث صفحة الكوفي")}
            className="inline-flex items-center gap-2"
          >
            <Save className="h-5 w-5" />
            حفظ الإعدادات
          </PrimaryButton>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="كل 1 ريال" value={`${settings.pointsPerSar} نقطة`} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="نقاط الترحيب" value={settings.welcomePoints} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="مكافآت نشطة" value={activeRewards} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="أقل استبدال" value={minReward} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="2">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#3A2117]">
                  إعدادات احتساب النقاط
                </h2>
                <p className="text-sm font-bold text-[#7A6255]">
                  هذه الإعدادات تنعكس مباشرة في صفحة الكوفي.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">
                  النقاط لكل 1 ريال
                </span>
                <NeumoInput
                  value={settings.pointsPerSar}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      pointsPerSar: Number(e.target.value) || 1,
                    }))
                  }
                  className="mt-2"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">
                  نقاط ترحيبية للعميل
                </span>
                <NeumoInput
                  value={settings.welcomePoints}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      welcomePoints: Number(e.target.value) || 0,
                    }))
                  }
                  className="mt-2"
                />
              </label>

              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="text-xs font-black text-[#7A6255]">حالة البرنامج</p>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      enabled: !prev.enabled,
                    }))
                  }
                  className={`mt-3 w-full rounded-2xl px-4 py-3 font-black ${
                    settings.enabled
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {settings.enabled ? "مفعل" : "متوقف"}
                </button>
              </div>
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              إضافة مكافأة
            </h2>

            <div className="space-y-3">
              <NeumoInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="اسم المكافأة"
              />
              <NeumoInput
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="عدد النقاط المطلوبة"
              />
              <NeumoTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف المكافأة"
                className="h-24"
              />
              <PrimaryButton onClick={addReward} className="w-full">
                إضافة المكافأة
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {rewards.map((reward) => (
                <SoftCard key={reward.id} className="transition hover:-translate-y-0.5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8F4EF] text-[#6B3A25]">
                    <Gift className="h-7 w-7" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black text-[#3A2117]">
                        {reward.title}
                      </h2>
                      <span
                        className={`rounded-full px-4 py-2 text-xs font-black ${
                          reward.active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {reward.active ? "نشطة" : "متوقفة"}
                      </span>
                    </div>
                    <p className="mt-2 max-w-xl font-bold leading-7 text-[#7A6255]">
                      {reward.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleReward(reward.id)}
                    className="flex items-center gap-2 rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]"
                  >
                    <Power className="h-4 w-4" />
                    {reward.active ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    onClick={() => deleteReward(reward.id)}
                    className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="text-xs font-black text-[#7A6255]">النقاط المطلوبة</p>
                  <h3 className="mt-1 text-2xl font-black text-[#3A2117]">
                    {reward.points}
                  </h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="text-xs font-black text-[#7A6255]">نوع المكافأة</p>
                  <h3 className="mt-1 font-black text-[#3A2117]">استبدال نقاط</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="text-xs font-black text-[#7A6255]">الظهور للعميل</p>
                  <h3 className="mt-1 font-black text-[#3A2117]">
                    {reward.active ? "ظاهر" : "مخفي"}
                  </h3>
                </div>
              </div>
                </SoftCard>
              ))}
            </section>
          </BentoCard>

          <BentoCard variant="gold" span="4">
          <div className="flex items-start gap-4">
            <Sparkles className="mt-1 h-7 w-7 text-[#F6C35B]" />
            <div>
              <h2 className="text-2xl font-black">تظهر المكافآت مباشرة في صفحة الكوفي</h2>
              <p className="mt-2 text-[#E5D8CD]">
                أي تعديل في النقاط أو المكافآت يتم حفظه محليًا وينعكس في صفحة العميل.
              </p>
            </div>
          </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
