"use client";

import { Check, Layers3, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  AdminPageShell,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  GoldButton,
  AdminInput,
  AdminTextarea,
  StatusBadge,
} from "@/components/ui/design-system";
import {
  PLATFORM_PLANS_KEY,
  allPlatformFeatures,
  mockPlatformPlans,
  type PlatformFeature,
  type PlatformPlan,
} from "@/lib/platform/admin-data";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),4px_6px_20px_rgba(0,0,0,0.35)]";

const planVariants: Array<"cyber" | "dark" | "gold"> = ["gold", "cyber", "dark"];

export function AdminPlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>(mockPlatformPlans);

  const [name, setName] = useState("");
  const [priceMonthly, setPriceMonthly] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState<PlatformFeature[]>(["menu", "settings"]);

  useEffect(() => {
    const saved = localStorage.getItem(PLATFORM_PLANS_KEY);
    if (saved) setPlans(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(PLATFORM_PLANS_KEY, JSON.stringify(plans));
  }, [plans]);

  const activeCount = useMemo(() => plans.filter((p) => p.active).length, [plans]);

  function toggleFeature(planId: string, feature: PlatformFeature) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;

        const exists = plan.features.includes(feature);

        return {
          ...plan,
          features: exists
            ? plan.features.filter((item) => item !== feature)
            : [...plan.features, feature],
        };
      })
    );
  }

  function toggleNewFeature(feature: PlatformFeature) {
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((item) => item !== feature)
        : [...prev, feature]
    );
  }

  function addPlan() {
    if (!name.trim()) {
      alert("اكتب اسم الباقة");
      return;
    }

    const id = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const plan: PlatformPlan = {
      id: id || crypto.randomUUID(),
      name: name.trim(),
      priceMonthly: Number(priceMonthly) || 0,
      description: description.trim() || "باقة مخصصة من إدارة منصة برندة.",
      active: true,
      features,
    };

    setPlans((prev) => [plan, ...prev]);

    setName("");
    setPriceMonthly("");
    setDescription("");
    setFeatures(["menu", "settings"]);
  }

  function updatePlanField(
    planId: string,
    field: "name" | "description" | "priceMonthly",
    value: string
  ) {
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              [field]: field === "priceMonthly" ? Number(value) || 0 : value,
            }
          : plan
      )
    );
  }

  function togglePlanActive(planId: string) {
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId ? { ...plan, active: !plan.active } : plan
      )
    );
  }

  function deletePlan(planId: string) {
    if (["starter", "growth", "pro"].includes(planId)) {
      alert("لا تحذف الباقات الأساسية، تقدر توقفها بدل الحذف");
      return;
    }

    setPlans((prev) => prev.filter((plan) => plan.id !== planId));
  }

  return (
    <AdminPageShell
      title="الباقات وخيارات الكوفيهات"
      subtitle="أنشئ باقات جديدة وحدد الخدمات المتاحة داخل كل باقة. أي خيار تلغيه من الباقة يختفي مباشرة من لوحة الكوفي."
      action={<BrandaLogo variant="dark" width={140} height={56} />}
    >
      <BentoGrid className="mb-6">
        <BentoCard variant="cyber" span="2">
          <AdminStatPill label="إجمالي الباقات" value={plans.length} />
        </BentoCard>
        <BentoCard variant="gold">
          <AdminStatPill label="الباقات المفعلة" value={activeCount} />
        </BentoCard>
        <BentoCard variant="dark">
          <AdminStatPill
            label="المميزات المتاحة"
            value={allPlatformFeatures.length}
            hint="خيارات قابلة للتخصيص"
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6 xl:grid-cols-1">
        <BentoCard variant="cyber" span="4">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_20px_rgba(246,195,91,0.2)]">
              <Plus className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F8F4EF]">إنشاء باقة جديدة</h2>
              <p className="text-sm font-bold text-[#CBB29C]">
                سمّ الباقة وحدد السعر والمميزات المتاحة فيها.
              </p>
            </div>
          </div>

          <div className={`grid gap-4 p-4 md:grid-cols-3 ${softPanel}`}>
            <AdminInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الباقة"
            />
            <AdminInput
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(e.target.value)}
              placeholder="السعر الشهري"
            />
            <AdminInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف الباقة"
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {allPlatformFeatures.map((feature) => {
              const active = features.includes(feature.id);

              return (
                <button
                  key={feature.id}
                  onClick={() => toggleNewFeature(feature.id)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    active
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
                      : `${softPanel} text-[#CBB29C] hover:border-[#F6C35B]/30`
                  }`}
                >
                  {feature.title}
                </button>
              );
            })}
          </div>

          <GoldButton onClick={addPlan} className="mt-5 inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            حفظ الباقة
          </GoldButton>
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="xl:grid-cols-3">
        {plans.map((plan, index) => (
          <BentoCard
            key={plan.id}
            variant={planVariants[index % planVariants.length]}
            className="shadow-[inset_0_1px_0_rgba(255,255,255,0.06),8px_10px_28px_rgba(0,0,0,0.4)]"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Layers3 className="h-7 w-7" />
              </div>
              <StatusBadge tone={plan.active ? "success" : "danger"}>
                {plan.active ? "مفعلة" : "متوقفة"}
              </StatusBadge>
            </div>

            <div className={`space-y-4 p-4 ${softPanel}`}>
              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">اسم الباقة</span>
                <AdminInput
                  value={plan.name}
                  onChange={(e) => updatePlanField(plan.id, "name", e.target.value)}
                  className="mt-2 text-2xl font-black"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">الوصف</span>
                <AdminTextarea
                  value={plan.description}
                  onChange={(e) => updatePlanField(plan.id, "description", e.target.value)}
                  className="mt-2 h-24 text-sm leading-7"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#CBB29C]">السعر الشهري</span>
                <AdminInput
                  value={plan.priceMonthly}
                  onChange={(e) => updatePlanField(plan.id, "priceMonthly", e.target.value)}
                  className="mt-2 text-2xl font-black text-[#F6C35B]"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-2">
              {allPlatformFeatures.map((feature) => {
                const active = plan.features.includes(feature.id);

                return (
                  <button
                    key={feature.id}
                    onClick={() => toggleFeature(plan.id, feature.id)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 font-black transition ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : `${softPanel} text-[#CBB29C] hover:border-[#F6C35B]/25`
                    }`}
                  >
                    <span>{feature.title}</span>
                    {active ? <Check className="h-5 w-5" /> : <span>—</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => togglePlanActive(plan.id)}
                className={`flex-1 rounded-2xl border px-4 py-3 font-black transition ${
                  plan.active
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-red-500/40 bg-red-500/15 text-red-300"
                }`}
              >
                {plan.active ? "الباقة مفعلة" : "الباقة متوقفة"}
              </button>

              <button
                onClick={() => deletePlan(plan.id)}
                className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 font-black text-red-300"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </BentoCard>
        ))}
      </BentoGrid>
    </AdminPageShell>
  );
}
