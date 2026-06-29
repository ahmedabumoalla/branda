"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { financeAmount } from "@/lib/branda-finance/calculations";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";

const data = getBrandaFinanceDemoData();
const inputClass = "h-9 w-full rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none";

export function LoyaltyPointsWorkspace() {
  const [enabled, setEnabled] = useState(true);
  const [pointsPerSar, setPointsPerSar] = useState(1);
  const [pointValue, setPointValue] = useState(0.25);
  const [expiryDays, setExpiryDays] = useState(365);
  const [minimumOrder, setMinimumOrder] = useState(30);
  const [minimumRedeem, setMinimumRedeem] = useState(50);
  const [maxRedemptionPercent, setMaxRedemptionPercent] = useState(35);
  const [terms, setTerms] = useState("النقاط صالحة حسب سياسة العلامة، ولا تشمل الضرائب أو المنتجات المخفضة في المعاينة المحلية.");

  const previewInvoiceAmount = 186;
  const earnedPoints = useMemo(() => (previewInvoiceAmount >= minimumOrder ? Math.floor(previewInvoiceAmount * pointsPerSar) : 0), [minimumOrder, pointsPerSar]);
  const redeemableSar = useMemo(() => Math.min(earnedPoints * pointValue, previewInvoiceAmount * (maxRedemptionPercent / 100)), [earnedPoints, maxRedemptionPercent, pointValue]);

  return (
    <FinancePageShell title="نقاط الولاء المتقدمة" description="إعداد نقاط الولاء للمنتجات والفواتير مع معاينة الكسب والاستبدال وربط محاسبي محلي." status="محلي فقط" actions={[{ label: "الكاشير", href: "/dashboard/branda-finance/sales", primary: true }, { label: "بطاقات الولاء", href: "/dashboard/loyalty" }]}>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="حالة البرنامج" value={enabled ? "مفعل" : "موقوف"} tone={enabled ? "green" : "red"} />
        <FinanceStatCard label="كل 1 ريال" value={`${pointsPerSar} نقطة`} tone="gold" />
        <FinanceStatCard label="قيمة النقطة" value={financeAmount(pointValue)} tone="brown" />
        <FinanceStatCard label="تنتهي بعد" value={`${expiryDays} يوم`} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-3 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center gap-2 text-[12px] font-black"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> تفعيل نقاط الولاء</label>
            <Field label="each 1 SAR = X points"><input type="number" className={inputClass} value={pointsPerSar} onChange={(event) => setPointsPerSar(Number(event.target.value) || 1)} /></Field>
            <Field label="each 1 point = X SAR"><input type="number" step="0.05" className={inputClass} value={pointValue} onChange={(event) => setPointValue(Number(event.target.value) || 0)} /></Field>
            <Field label="expiry days"><input type="number" className={inputClass} value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value) || 0)} /></Field>
            <Field label="minimum order for earning"><input type="number" className={inputClass} value={minimumOrder} onChange={(event) => setMinimumOrder(Number(event.target.value) || 0)} /></Field>
            <Field label="minimum points for redemption"><input type="number" className={inputClass} value={minimumRedeem} onChange={(event) => setMinimumRedeem(Number(event.target.value) || 0)} /></Field>
            <Field label="max redemption percentage"><input type="number" className={inputClass} value={maxRedemptionPercent} onChange={(event) => setMaxRedemptionPercent(Number(event.target.value) || 0)} /></Field>
            <label className="flex items-center gap-2 text-[12px] font-black"><input type="checkbox" defaultChecked /> استبعاد المنتجات المخفضة</label>
            <label className="flex items-center gap-2 text-[12px] font-black"><input type="checkbox" defaultChecked /> استبعاد الضريبة والشحن</label>
            <label className="min-w-0 sm:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[11px] font-black">Terms / policies</span>
              <textarea className="min-h-24 w-full rounded-[8px] border border-[#E1D1BD] bg-white p-2 text-[12px] font-bold outline-none" value={terms} onChange={(event) => setTerms(event.target.value)} />
            </label>
          </div>

          <FinanceTable
            minWidth="980px"
            headers={["المنتج", "نقاط الكسب", "نقاط الاستبدال", "مؤهل للكسب", "مؤهل للاستبدال", "ملاحظة"]}
            rows={data.products.map((product) => [
              product.name,
              product.loyaltyPointsEarned ?? Math.max(1, Math.round(product.price / 10)),
              product.loyaltyPointsRequired ?? Math.max(50, Math.round(product.price * 4)),
              product.loyaltyEarnEligible ?? true ? "نعم" : "لا",
              product.loyaltyRedeemEligible ?? true ? "نعم" : "لا",
              "إعداد محلي قابل للربط لاحقًا",
            ])}
          />
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-[#D9A33F]" />
              <h2 className="text-[14px] font-black text-[#2F241D]">معاينة فاتورة</h2>
            </div>
            <div className="mt-3 space-y-2 text-[12px] font-bold">
              <Line label="قيمة الفاتورة" value={financeAmount(previewInvoiceAmount)} />
              <Line label="النقاط المكتسبة" value={`${earnedPoints} نقطة`} />
              <Line label="خصم الاستبدال" value={financeAmount(redeemableSar)} />
              <Line label="قيد الولاء" value="Dr marketing / Cr receivable" />
            </div>
          </div>
          <p className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
            سيتم ربطها لاحقًا بمحفظة الولاء وقاعدة البيانات. لا يوجد خصم دائم أو تعديل رصيد حقيقي هنا.
          </p>
        </aside>
      </section>
    </FinancePageShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-1 block text-[11px] font-black">{label}</span>{children}</label>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 rounded-[8px] bg-[#FAF3E8] px-3 py-2"><span>{label}</span><span className="font-black">{value}</span></div>;
}
