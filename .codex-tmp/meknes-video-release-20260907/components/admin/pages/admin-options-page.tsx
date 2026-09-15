"use client";

import { Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminPageShell,
  BentoCard,
  BentoGrid,
  GoldButton,
  AdminInput,
  AdminSelect,
  StatusBadge,
} from "@/components/ui/design-system";
import { mockPlatformOptions, type PlatformPlan } from "@/lib/platform/admin-data";
import { savePlatformSettingsAction } from "@/app/actions/admin";

const softPanel =
  "rounded-2xl border border-white/10 bg-[#0f0c0a]/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Props = {
  initialOptions: typeof mockPlatformOptions;
  initialPlans: PlatformPlan[];
  configError?: string;
};

export function AdminOptionsPage({ initialOptions, initialPlans, configError }: Props) {
  const [options, setOptions] = useState(initialOptions);
  const [plans] = useState<PlatformPlan[]>(initialPlans);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  async function save() {
    if (configError) {
      alert(configError);
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      await savePlatformSettingsAction(options);
      setSaveMessage("تم حفظ الخيارات في قاعدة البيانات");
    } catch {
      alert("تعذر حفظ الخيارات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="خيارات المنصة العامة"
      subtitle="تحكم في التسجيل، الموافقات، العمولة، والباقات الافتراضية."
      action={
        <div className="flex flex-col items-end gap-4 sm:flex-row sm:items-center">
          <BarndaksaLogo variant="dark" width={120} height={48} />
          <GoldButton onClick={save} disabled={saving} className="inline-flex items-center gap-2">
            <Save className="h-5 w-5" />
            {saving ? "جاري الحفظ..." : "حفظ الخيارات"}
          </GoldButton>
        </div>
      }
    >
      {saveMessage ? (
        <p className="mb-4 text-sm font-bold text-emerald-400">{saveMessage}</p>
      ) : null}
      {configError ? (
        <p className="mb-4 text-sm font-bold text-red-400">{configError}</p>
      ) : null}
      <BentoGrid className="xl:grid-cols-2">
        <BentoCard variant="cyber" span="2">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/20 text-[#F6C35B] shadow-[0_0_20px_rgba(246,195,91,0.15)]">
              <Settings2 className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F8F4EF]">إعدادات التسجيل والموافقة</h2>
              <p className="text-sm font-bold text-[#CBB29C]">تحكم في سياسات انضمام العلامات الجديدة.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Toggle
              title="السماح بتسجيل علامات جديدة"
              active={options.allowCafeSignup}
              onClick={() => setOptions((p) => ({ ...p, allowCafeSignup: !p.allowCafeSignup }))}
            />

            <Toggle
              title="مراجعة العلامة قبل التفعيل"
              active={options.requireCafeApproval}
              onClick={() => setOptions((p) => ({ ...p, requireCafeApproval: !p.requireCafeApproval }))}
            />
          </div>
        </BentoCard>

        <BentoCard variant="dark">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">عمولة المنصة</h3>
          <label>
            <span className="text-xs font-black text-[#CBB29C]">عمولة المنصة %</span>
            <AdminInput
              value={options.platformCommissionPercent}
              onChange={(e) =>
                setOptions((p) => ({
                  ...p,
                  platformCommissionPercent: Number(e.target.value) || 0,
                }))
              }
              className="mt-2"
            />
          </label>
        </BentoCard>

        <BentoCard variant="gold">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">الدعم والتواصل</h3>
          <label>
            <span className="text-xs font-black text-[#CBB29C]/90">إيميل الدعم</span>
            <AdminInput
              value={options.supportEmail}
              onChange={(e) => setOptions((p) => ({ ...p, supportEmail: e.target.value }))}
              className="mt-2"
            />
          </label>
        </BentoCard>

        <BentoCard variant="cyber" span="2">
          <h3 className="mb-4 text-lg font-black text-[#F8F4EF]">الباقة الافتراضية</h3>
          <p className="mb-4 text-sm font-bold text-[#CBB29C]">
            تُعيَّن تلقائياً لأي علامة جديدة تسجّل في المنصة.
          </p>
          <AdminSelect
            value={options.defaultPlanId}
            onChange={(e) => setOptions((p) => ({ ...p, defaultPlanId: e.target.value }))}
            className="mt-2"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} {plan.active ? "" : "(متوقفة)"}
              </option>
            ))}
          </AdminSelect>
        </BentoCard>
      </BentoGrid>
    </AdminPageShell>
  );
}

function Toggle({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-3 text-right transition hover:border-[#F6C35B]/30 ${softPanel}`}
    >
      <span className="font-black text-[#F8F4EF]">{title}</span>
      <StatusBadge tone={active ? "success" : "danger"}>
        {active ? "مفعل" : "متوقف"}
      </StatusBadge>
    </button>
  );
}
