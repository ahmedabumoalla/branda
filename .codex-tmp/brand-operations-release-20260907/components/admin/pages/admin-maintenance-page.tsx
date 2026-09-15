"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Wrench } from "lucide-react";
import { enterMaintenanceModeAction } from "@/app/actions/maintenance";
import { AdminInput, AdminPageShell, BentoCard } from "@/components/ui/design-system";
import { clearDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";

type Props = {
  configError?: string;
};

export function AdminMaintenancePage({ configError }: Props) {
  const router = useRouter();
  const [maintenanceCode, setMaintenanceCode] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(() => {
      void (async () => {
        try {
          const result = await enterMaintenanceModeAction(maintenanceCode);
          setMessage(result.message);
          if (result.ok && result.redirectTo) {
            clearDashboardShellSnapshot();
            router.push(result.redirectTo);
          }
        } catch {
          setMessage("تعذر تفعيل دخول الصيانة");
        }
      })();
    });
  }

  return (
    <AdminPageShell
      title="الصيانة"
      subtitle="دخول مؤقت وآمن إلى لوحة علامة تجارية باستخدام رقم الصيانة، بدون استخدام أو تخزين كلمات مرور المالك."
      action={<Wrench className="h-10 w-10 text-[#F6C35B]" />}
    >
      {configError ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center font-black text-amber-200">
          {configError}
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-2xl border border-[#F6C35B]/30 bg-[#F6C35B]/10 px-4 py-3 text-center font-black text-[#F6C35B]">
          {message}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <BentoCard variant="dark">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-black text-[#CBB29C]">
                رقم الصيانة الخاص بالعلامة التجارية
              </label>
              <AdminInput
                value={maintenanceCode}
                onChange={(event) => setMaintenanceCode(event.target.value.toUpperCase())}
                placeholder="BR-XXXX-XXXXXXXX"
                dir="ltr"
                className="text-left font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isPending || Boolean(configError)}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#F6C35B] px-5 font-black text-[#241610] transition hover:brightness-105 disabled:opacity-60"
            >
              {isPending ? "جاري التحقق" : "فتح لوحة العلامة بوضع الصيانة"}
            </button>
          </form>
        </BentoCard>

        <BentoCard variant="dark">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[#F6C35B]" />
            <div>
              <h2 className="text-xl font-black text-[#F8F4EF]">ضوابط الأمان</h2>
              <div className="mt-4 space-y-3 text-sm font-bold leading-7 text-[#CBB29C]">
                <p>الدخول متاح فقط لحساب مدير المنصة الحالي.</p>
                <p>الجلسة مؤقتة وتظهر داخل لوحة العلامة كبانر دخول صيانة.</p>
                <p>لا يتم استخدام حساب المالك ولا كلمة مروره ولا جلساته.</p>
                <p>لا يتم حفظ كلمة مرور أو رابط إعادة تعيين.</p>
              </div>
            </div>
          </div>
        </BentoCard>
      </div>
    </AdminPageShell>
  );
}
