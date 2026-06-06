"use client";

import {
  Gift,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { saveLoyaltySettingsAction } from "@/app/actions/loyalty";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import {
  type LoyaltyEarnRule,
  type LoyaltyRedemptionRule,
  type LoyaltyReward,
  type LoyaltySettings,
} from "@/lib/mock/loyalty";

type Props = {
  initialSettings: LoyaltySettings;
  initialRewards: LoyaltyReward[];
  configError?: string;
};

const EXAMPLE_BALANCE = 150;

function redemptionRulesToRewards(rules: LoyaltyRedemptionRule[]): LoyaltyReward[] {
  return rules
    .filter((r) => r.enabled)
    .map((r) => ({
      id: r.id,
      title: r.title,
      points: r.pointsCost,
      description: r.description || r.title,
      active: true,
    }));
}

export function LoyaltyPageClient({ initialSettings, initialRewards, configError }: Props) {
  const [settings, setSettings] = useState<LoyaltySettings>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  void initialRewards;

  const activeEarnRules = useMemo(
    () => settings.earnRules.filter((r) => r.enabled).length,
    [settings.earnRules]
  );

  const activeRedemptionRules = useMemo(
    () => settings.redemptionRules.filter((r) => r.enabled),
    [settings.redemptionRules]
  );

  const affordableRedemptions = useMemo(
    () => activeRedemptionRules.filter((r) => r.pointsCost <= EXAMPLE_BALANCE),
    [activeRedemptionRules]
  );

  function toggleEarnRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  }

  function updateEarnRule(id: string, patch: Partial<LoyaltyEarnRule>) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function addEarnRule() {
    const rule: LoyaltyEarnRule = {
      id: crypto.randomUUID(),
      type: "product_bonus",
      title: "مكافأة منتج",
      enabled: true,
      bonusPoints: 10,
    };
    setSettings((prev) => ({
      ...prev,
      earnRules: [...prev.earnRules, rule],
    }));
  }

  function removeEarnRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      earnRules: prev.earnRules.filter((r) => r.id !== id),
    }));
  }

  function toggleRedemptionRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  }

  function updateRedemptionRule(id: string, patch: Partial<LoyaltyRedemptionRule>) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
  }

  function addRedemptionRule() {
    const rule: LoyaltyRedemptionRule = {
      id: crypto.randomUUID(),
      type: "percent_discount",
      title: "خصم جديد",
      enabled: true,
      pointsCost: 75,
      discountPercent: 5,
      description: "يستبدل العميل 75 نقطة ويحصل على خصم 5%.",
    };
    setSettings((prev) => ({
      ...prev,
      redemptionRules: [...prev.redemptionRules, rule],
    }));
  }

  function removeRedemptionRule(id: string) {
    setSettings((prev) => ({
      ...prev,
      redemptionRules: prev.redemptionRules.filter((r) => r.id !== id),
    }));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await saveLoyaltySettingsAction(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("تعذر حفظ إعدادات الولاء");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="نقاط الولاء"
        subtitle="بناء قواعد الكسب والاستبدال — مع معاينة لما يراه العميل."
        action={
          <PrimaryButton onClick={saveAll} className="inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            {saved ? "تم الحفظ" : "حفظ الإعدادات"}
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
            <StatPill label="قواعد كسب" value={activeEarnRules} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="قواعد استبدال" value={activeRedemptionRules.length} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="2">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#3A2117]">إعدادات عامة</h2>
                <p className="text-sm font-bold text-[#7A6255]">
                  النقاط الأساسية ونقاط الترحيب وحالة البرنامج.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">النقاط لكل 1 ر.س</span>
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
                <span className="text-xs font-black text-[#7A6255]">نقاط ترحيبية</span>
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
              <button
                onClick={() =>
                  setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`mt-6 rounded-2xl px-4 py-3 font-black ${
                  settings.enabled ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {settings.enabled ? "البرنامج مفعل" : "البرنامج متوقف"}
              </button>
            </div>
          </BentoCard>

          <BentoCard variant="gold" span="2">
            <div className="flex items-start gap-4">
              <UserRound className="mt-1 h-7 w-7 text-[#F6C35B]" />
              <div className="flex-1">
                <h2 className="text-2xl font-black">معاينة العميل</h2>
                <p className="mt-2 text-[#E5D8CD]">
                  رصيد تجريبي:{" "}
                  <span className="text-[#F6C35B]">{EXAMPLE_BALANCE} نقطة</span>
                </p>
                <div className="mt-4 space-y-2">
                  {affordableRedemptions.length > 0 ? (
                    affordableRedemptions.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold"
                      >
                        <span className="text-[#F6C35B]">{r.pointsCost} نقطة</span>
                        {" — "}
                        {r.description || r.title}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-bold text-[#CBB29C]">
                      لا توجد مكافآت متاحة بهذا الرصيد — أضف قواعد استبدال أقل.
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs font-bold text-[#CBB29C]">
                  قواعد الكسب النشطة:{" "}
                  {settings.earnRules
                    .filter((r) => r.enabled)
                    .map((r) => r.title)
                    .join(" • ") || "لا يوجد"}
                </p>
              </div>
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <BentoCard variant="white" span="2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قواعد كسب النقاط</h2>
              <button
                onClick={addEarnRule}
                className="inline-flex items-center gap-1 rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
            <div className="space-y-3">
              {settings.earnRules.map((rule) => (
                <SoftCard key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <NeumoInput
                        value={rule.title}
                        onChange={(e) => updateEarnRule(rule.id, { title: e.target.value })}
                      />
                      <NeumoSelect
                        value={rule.type}
                        onChange={(e) =>
                          updateEarnRule(rule.id, {
                            type: e.target.value as LoyaltyEarnRule["type"],
                          })
                        }
                      >
                        <option value="purchase_per_sar">لكل ريال</option>
                        <option value="product_bonus">مكافأة منتج</option>
                        <option value="first_order_bonus">أول طلب</option>
                        <option value="experience_bonus">وثّق تجربتك</option>
                      </NeumoSelect>
                      {rule.type === "purchase_per_sar" ? (
                        <NeumoInput
                          value={rule.pointsPerSar ?? 1}
                          onChange={(e) =>
                            updateEarnRule(rule.id, {
                              pointsPerSar: Number(e.target.value) || 1,
                            })
                          }
                          placeholder="نقاط لكل ريال"
                        />
                      ) : (
                        <NeumoInput
                          value={rule.bonusPoints ?? 0}
                          onChange={(e) =>
                            updateEarnRule(rule.id, {
                              bonusPoints: Number(e.target.value) || 0,
                            })
                          }
                          placeholder="نقاط المكافأة"
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleEarnRule(rule.id)} aria-label="تفعيل">
                        {rule.enabled ? (
                          <ToggleRight className="h-8 w-8 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-8 w-8 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => removeEarnRule(rule.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">قواعد الاستبدال</h2>
              <button
                onClick={addRedemptionRule}
                className="inline-flex items-center gap-1 rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
            <div className="space-y-3">
              {settings.redemptionRules.map((rule) => (
                <SoftCard key={rule.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <NeumoInput
                        value={rule.title}
                        onChange={(e) =>
                          updateRedemptionRule(rule.id, { title: e.target.value })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <NeumoInput
                          value={rule.pointsCost}
                          onChange={(e) =>
                            updateRedemptionRule(rule.id, {
                              pointsCost: Number(e.target.value) || 0,
                            })
                          }
                          placeholder="تكلفة النقاط"
                        />
                        {rule.type === "percent_discount" ? (
                          <NeumoInput
                            value={rule.discountPercent ?? 0}
                            onChange={(e) =>
                              updateRedemptionRule(rule.id, {
                                discountPercent: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="نسبة الخصم %"
                          />
                        ) : null}
                      </div>
                      <NeumoTextarea
                        value={rule.description ?? ""}
                        onChange={(e) =>
                          updateRedemptionRule(rule.id, { description: e.target.value })
                        }
                        placeholder="نص يظهر للعميل عند الاستبدال"
                        className="h-20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleRedemptionRule(rule.id)}>
                        {rule.enabled ? (
                          <ToggleRight className="h-8 w-8 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-8 w-8 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => removeRedemptionRule(rule.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="gold" span="4">
          <div className="flex items-start gap-4">
            <Sparkles className="mt-1 h-7 w-7 text-[#F6C35B]" />
            <div>
              <h2 className="text-2xl font-black">تظهر المكافآت في صفحة الكوفي</h2>
              <p className="mt-2 text-[#E5D8CD]">
                عند الحفظ تُخزَّن الإعدادات في Supabase وتُحدَّث المكافآت في جدول loyalty_rewards.
              </p>
            </div>
            <Gift className="ml-auto h-10 w-10 text-[#F6C35B]/50" />
          </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
