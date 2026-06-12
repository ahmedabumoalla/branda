"use client";

import { useMemo, useState } from "react";
import { Filter, Percent, Plus, Save, Trash2 } from "lucide-react";
import { deletePlatformDiscountCouponAction, savePlatformDiscountCouponAction } from "@/app/actions/admin";
import type { PlatformDiscountCoupon } from "@/lib/data/platform-coupons";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { AdminInput, AdminPageShell, BentoCard, BentoGrid, GoldButton, StatusBadge } from "@/components/ui/design-system";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export/admin-report-export";

type Props = { coupons: PlatformDiscountCoupon[]; plans: PlatformPlan[]; configError?: string };

function emptyCoupon(): Omit<PlatformDiscountCoupon, "createdAt" | "redeemedCount"> {
  return {
    id: crypto.randomUUID(),
    code: "",
    title: "كوبون منصة جديد",
    discountPercent: 10,
    eligiblePlanIds: [],
    active: true,
  };
}

export function AdminPlatformCouponsPage({ coupons: initialCoupons, plans, configError }: Props) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [editing, setEditing] = useState<Omit<PlatformDiscountCoupon, "createdAt" | "redeemedCount">>(emptyCoupon());
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredCoupons = useMemo(() => {
    const term = query.trim().toLowerCase();
    return coupons.filter((coupon) => {
      const matchesTerm = !term || coupon.code.toLowerCase().includes(term) || coupon.title.toLowerCase().includes(term);
      const matchesStatus = !onlyActive || coupon.active;
      return matchesTerm && matchesStatus;
    });
  }, [coupons, onlyActive, query]);

  function togglePlan(planId: string) {
    setEditing((current) => ({
      ...current,
      eligiblePlanIds: current.eligiblePlanIds.includes(planId)
        ? current.eligiblePlanIds.filter((id) => id !== planId)
        : [...current.eligiblePlanIds, planId],
    }));
  }

  async function saveCoupon() {
    setSaving(true);
    try {
      const saved = await savePlatformDiscountCouponAction({ ...editing, code: editing.code.trim().toUpperCase() });
      setCoupons(saved);
      setEditing(emptyCoupon());
      alert("تم حفظ كوبون خصم المنصة");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ الكوبون");
    } finally {
      setSaving(false);
    }
  }

  async function removeCoupon(couponId: string) {
    if (!confirm("حذف كوبون الخصم؟")) return;
    setCoupons(await deletePlatformDiscountCouponAction(couponId));
  }

  return (
    <AdminPageShell
      title="كوبونات خصم المنصة"
      subtitle="كوبونات مستقلة عن كوبونات المناديب، تستخدم عند الاشتراك أو التجديد أو ترقية الباقة داخل الدفع."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center font-black text-amber-200">{configError}</div> : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="gold"><p className="text-sm font-black text-[#241610]">إجمالي الكوبونات</p><p className="mt-2 text-4xl font-black text-[#241610]">{coupons.length}</p></BentoCard>
        <BentoCard variant="cyber"><p className="text-sm font-black text-[#CBB29C]">الكوبونات النشطة</p><p className="mt-2 text-4xl font-black text-[#F6C35B]">{coupons.filter((coupon) => coupon.active).length}</p></BentoCard>
        <BentoCard variant="dark"><p className="text-sm font-black text-[#CBB29C]">إجمالي الاستخدام</p><p className="mt-2 text-4xl font-black text-[#F6C35B]">{coupons.reduce((sum, coupon) => sum + coupon.redeemedCount, 0)}</p></BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6 xl:grid-cols-3">
        <BentoCard variant="dark" span="2">
          <div className="mb-5 flex items-center gap-3"><Percent className="h-7 w-7 text-[#F6C35B]" /><h2 className="text-2xl font-black text-[#F8F4EF]">إنشاء وتعديل كوبون</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminInput value={editing.title} placeholder="اسم الكوبون" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <AdminInput value={editing.code} placeholder="الكود مثل BARNDAKSA20" onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
            <AdminInput type="number" min="0" max="100" value={editing.discountPercent} onChange={(e) => setEditing({ ...editing, discountPercent: Number(e.target.value) || 0 })} placeholder="نسبة الخصم" />
            <AdminInput type="number" min="1" value={editing.maxRedemptions ?? ""} onChange={(e) => setEditing({ ...editing, maxRedemptions: e.target.value ? Number(e.target.value) : undefined })} placeholder="حد الاستخدام اختياري" />
            <AdminInput type="date" value={editing.validFrom?.slice(0, 10) ?? ""} onChange={(e) => setEditing({ ...editing, validFrom: e.target.value || undefined })} />
            <AdminInput type="date" value={editing.validUntil?.slice(0, 10) ?? ""} onChange={(e) => setEditing({ ...editing, validUntil: e.target.value || undefined })} />
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm font-black text-[#CBB29C]">الباقات التي يشملها الكوبون، وتركها فارغة يعني جميع الباقات.</p>
            <div className="flex flex-wrap gap-2">
              {plans.map((plan) => {
                const selected = editing.eligiblePlanIds.includes(plan.id);
                return <button key={plan.id} type="button" onClick={() => togglePlan(plan.id)} className={`rounded-xl border px-3 py-2 text-xs font-black ${selected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-black/20 text-[#CBB29C]"}`}>{plan.name}</button>;
              })}
            </div>
          </div>
          <label className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 p-4 font-black text-[#F8F4EF]"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> الكوبون نشط</label>
          <GoldButton type="button" disabled={saving} onClick={saveCoupon} className="mt-5 inline-flex items-center gap-2"><Save className="h-5 w-5" />{saving ? "جاري الحفظ..." : "حفظ الكوبون"}</GoldButton>
        </BentoCard>

        <BentoCard variant="cyber">
          <div className="mb-4 flex items-center gap-2"><Filter className="h-5 w-5 text-[#F6C35B]" /><h3 className="font-black">فلترة وتصدير</h3></div>
          <AdminInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالكود أو الاسم" />
          <label className="mt-3 flex items-center gap-3 rounded-2xl bg-black/20 p-4 font-black text-[#F8F4EF]"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> النشطة فقط</label>
          <div className="mt-4 grid gap-2">
            <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-black" onClick={() => exportRowsToExcel("platform-discount-coupons", filteredCoupons as unknown as Record<string, unknown>[], [{ key: "code", title: "الكود" }, { key: "title", title: "الاسم" }, { key: "discountPercent", title: "نسبة الخصم" }, { key: "redeemedCount", title: "الاستخدام" }])}>تصدير Excel</button>
            <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-black" onClick={() => exportRowsToPdf("كوبونات خصم المنصة", filteredCoupons as unknown as Record<string, unknown>[], [{ key: "code", title: "الكود" }, { key: "title", title: "الاسم" }, { key: "discountPercent", title: "نسبة الخصم" }, { key: "redeemedCount", title: "الاستخدام" }])}>تصدير PDF</button>
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoCard variant="dark">
        <div className="mb-5 flex items-center gap-3"><Plus className="h-7 w-7 text-[#F6C35B]" /><h2 className="text-2xl font-black text-[#F8F4EF]">سجل كوبونات المنصة</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-sm">
            <thead className="text-[#F6C35B]"><tr className="border-b border-white/10"><th className="py-3">الكود</th><th>الاسم</th><th>الخصم</th><th>الباقات</th><th>الاستخدام</th><th>الصلاحية</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {filteredCoupons.map((coupon) => <tr key={coupon.id} className="border-b border-white/5 text-[#F8F4EF]"><td className="py-3 font-black text-[#F6C35B]">{coupon.code}</td><td>{coupon.title}</td><td>{coupon.discountPercent}%</td><td>{coupon.eligiblePlanIds.length ? coupon.eligiblePlanIds.join("، ") : "كل الباقات"}</td><td>{coupon.redeemedCount}</td><td>{coupon.validUntil ? new Date(coupon.validUntil).toLocaleDateString("ar-SA") : "مفتوح"}</td><td><StatusBadge tone={coupon.active ? "success" : "danger"}>{coupon.active ? "نشط" : "متوقف"}</StatusBadge></td><td className="flex gap-2 py-2"><button className="rounded-xl bg-white/10 px-3 py-2 font-black" onClick={() => setEditing(coupon)}>تعديل</button><button className="rounded-xl bg-red-500/10 px-3 py-2 font-black text-red-300" onClick={() => removeCoupon(coupon.id)}><Trash2 className="h-4 w-4" /></button></td></tr>)}
            </tbody>
          </table>
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
