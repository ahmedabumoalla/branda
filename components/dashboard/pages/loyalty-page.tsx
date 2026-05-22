"use client";

import {
  Gift,
  Medal,
  Plus,
  Power,
  Save,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  LoyaltyReward,
  LoyaltySettings,
} from "@/lib/mock/loyalty";

const SETTINGS_KEY = "branda_qatrah_loyalty_settings";
const REWARDS_KEY = "branda_qatrah_loyalty_rewards";

type Props = {
  initialSettings: LoyaltySettings;
  initialRewards: LoyaltyReward[];
};

export function LoyaltyPageClient({
  initialSettings,
  initialRewards,
}: Props) {
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
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
          <h1 className="mt-2 text-4xl font-black text-[#3A2117]">
            نقاط الولاء
          </h1>
          <p className="mt-2 text-[#7A6255]">
            تحكم في احتساب النقاط والمكافآت التي تظهر للعملاء في صفحة الكوفي.
          </p>
        </div>

        <button
          onClick={() =>
            alert("تم حفظ إعدادات الولاء وتحديث صفحة الكوفي")
          }
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3A2117] px-6 py-4 font-black text-[#F8E8D2] shadow-lg"
        >
          <Save className="h-5 w-5" />
          حفظ الإعدادات
        </button>
      </header>

      <section className="mb-8 grid gap-5 md:grid-cols-4">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">كل 1 ريال</p>
          <h2 className="mt-3 text-4xl font-black text-[#3A2117]">
            {settings.pointsPerSar} نقطة
          </h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">نقاط الترحيب</p>
          <h2 className="mt-3 text-4xl font-black text-[#3A2117]">
            {settings.welcomePoints}
          </h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">مكافآت نشطة</p>
          <h2 className="mt-3 text-4xl font-black text-[#3A2117]">
            {activeRewards}
          </h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">أقل استبدال</p>
          <h2 className="mt-3 text-4xl font-black text-[#3A2117]">
            {minReward}
          </h2>
        </div>
      </section>

      <section className="mb-8 grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white/80 p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
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

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                النقاط لكل 1 ريال
              </span>
              <input
                value={settings.pointsPerSar}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pointsPerSar: Number(e.target.value) || 1,
                  }))
                }
                className="mt-2 h-14 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                نقاط ترحيبية للعميل
              </span>
              <input
                value={settings.welcomePoints}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    welcomePoints: Number(e.target.value) || 0,
                  }))
                }
                className="mt-2 h-14 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
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
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
            <Plus className="h-5 w-5" />
            إضافة مكافأة
          </h2>

          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اسم المكافأة"
              className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
            />

            <input
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="عدد النقاط المطلوبة"
              className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف المكافأة"
              className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right font-bold outline-none"
            />

            <button
              onClick={addReward}
              className="h-12 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]"
            >
              إضافة المكافأة
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5">
        {rewards.map((reward) => (
          <article
            key={reward.id}
            className="rounded-3xl border border-white bg-white/85 p-6 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8F4EF] text-[#8B5E3C]">
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

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="text-xs font-black text-[#7A6255]">
                  النقاط المطلوبة
                </p>
                <h3 className="mt-1 text-2xl font-black text-[#3A2117]">
                  {reward.points}
                </h3>
              </div>

              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="text-xs font-black text-[#7A6255]">
                  نوع المكافأة
                </p>
                <h3 className="mt-1 font-black text-[#3A2117]">
                  استبدال نقاط
                </h3>
              </div>

              <div className="rounded-2xl bg-[#F8F4EF] p-4">
                <p className="text-xs font-black text-[#7A6255]">
                  الظهور للعميل
                </p>
                <h3 className="mt-1 font-black text-[#3A2117]">
                  {reward.active ? "ظاهر" : "مخفي"}
                </h3>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-3xl bg-[#3A2117] p-8 text-[#F8E8D2]">
        <div className="flex items-start gap-4">
          <Sparkles className="mt-1 h-7 w-7 text-[#CBB29C]" />
          <div>
            <h2 className="text-2xl font-black">
              تظهر المكافآت مباشرة في صفحة الكوفي
            </h2>
            <p className="mt-2 text-[#CBB29C]">
              أي تعديل في النقاط أو المكافآت يتم حفظه محليًا وينعكس في صفحة العميل.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}