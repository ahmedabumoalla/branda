"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { financeAmount } from "@/lib/branda-finance/calculations";

type AssetDraft = {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  usefulLife: number;
  method: string;
  accumulated: number;
  branch: string;
  costCenter: string;
  assetAccount: string;
  depreciationAccount: string;
};

const initialAssets: AssetDraft[] = [
  { id: "asset-1", name: "آلة قهوة رئيسية", category: "معدات", purchaseDate: "2025-01-12", purchaseCost: 42000, usefulLife: 36, method: "قسط ثابت", accumulated: 17500, branch: "الفرع الرئيسي", costCenter: "تشغيل الفرع", assetAccount: "1308 معدات", depreciationAccount: "6108 إهلاك" },
  { id: "asset-2", name: "ثلاجة عرض", category: "تجهيزات", purchaseDate: "2025-08-05", purchaseCost: 18000, usefulLife: 48, method: "قسط ثابت", accumulated: 4960, branch: "فرع الشمال", costCenter: "تشغيل الفرع", assetAccount: "1309 تجهيزات", depreciationAccount: "6108 إهلاك" },
];

const inputClass = "h-9 w-full rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none";

export function AssetsWorkspace() {
  const [assets, setAssets] = useState(initialAssets);
  const [modalOpen, setModalOpen] = useState(false);
  const totalCost = assets.reduce((sum, asset) => sum + asset.purchaseCost, 0);
  const totalAccumulated = assets.reduce((sum, asset) => sum + asset.accumulated, 0);

  return (
    <FinancePageShell title="الأصول الثابتة" description="سجل أصول محلي مع إهلاك وجدول ومعاينة قيد واستبعاد/صيانة بدون كتابة قاعدة بيانات." status="محلي فقط" actions={[{ label: "شجرة الحسابات", href: "/dashboard/branda-finance/accountant/chart-of-accounts" }]}>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="تكلفة الأصول" value={financeAmount(totalCost)} tone="brown" />
        <FinanceStatCard label="مجمع الإهلاك" value={financeAmount(totalAccumulated)} tone="gold" />
        <FinanceStatCard label="صافي القيمة الدفترية" value={financeAmount(totalCost - totalAccumulated)} tone="green" />
        <FinanceStatCard label="عدد الأصول" value={String(assets.length)} />
      </section>
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
        <p className="text-[12px] font-bold text-[#806A58]">معاينة القيد: Dr الأصل / Cr البنك أو المورد، ثم Dr مصروف الإهلاك / Cr مجمع الإهلاك.</p>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white"><Plus className="h-4 w-4" />إضافة أصل</button>
      </section>
      <FinanceTable
        minWidth="1180px"
        headers={["الأصل", "التصنيف", "تاريخ الشراء", "التكلفة", "العمر", "الطريقة", "مجمع الإهلاك", "صافي القيمة", "الفرع", "مركز التكلفة", "حساب الأصل", "حساب الإهلاك"]}
        rows={assets.map((asset) => [asset.name, asset.category, asset.purchaseDate, financeAmount(asset.purchaseCost), `${asset.usefulLife} شهر`, asset.method, financeAmount(asset.accumulated), financeAmount(asset.purchaseCost - asset.accumulated), asset.branch, asset.costCenter, asset.assetAccount, asset.depreciationAccount])}
      />
      {modalOpen ? <AssetModal onClose={() => setModalOpen(false)} onSave={(asset) => { setAssets((current) => [asset, ...current]); setModalOpen(false); }} /> : null}
    </FinancePageShell>
  );
}

function AssetModal({ onClose, onSave }: { onClose: () => void; onSave: (asset: AssetDraft) => void }) {
  const [draft, setDraft] = useState<AssetDraft>({ id: `asset-${Date.now()}`, name: "أصل جديد", category: "معدات", purchaseDate: "2026-06-28", purchaseCost: 12000, usefulLife: 36, method: "قسط ثابت", accumulated: 0, branch: "الفرع الرئيسي", costCenter: "تشغيل الفرع", assetAccount: "1308 معدات", depreciationAccount: "6108 إهلاك" });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2F241D]/45 p-3" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black">إضافة أصل محلي</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label><span className="mb-1 block text-[11px] font-black">asset name</span><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">category</span><input className={inputClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">purchase date</span><input type="date" className={inputClass} value={draft.purchaseDate} onChange={(event) => setDraft({ ...draft, purchaseDate: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">purchase cost</span><input type="number" className={inputClass} value={draft.purchaseCost} onChange={(event) => setDraft({ ...draft, purchaseCost: Number(event.target.value) || 0 })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">useful life</span><input type="number" className={inputClass} value={draft.usefulLife} onChange={(event) => setDraft({ ...draft, usefulLife: Number(event.target.value) || 1 })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">depreciation method</span><input className={inputClass} value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">branch</span><input className={inputClass} value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">cost center</span><input className={inputClass} value={draft.costCenter} onChange={(event) => setDraft({ ...draft, costCenter: event.target.value })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">asset account</span><input className={inputClass} value={draft.assetAccount} onChange={(event) => setDraft({ ...draft, assetAccount: event.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-[8px] border px-4 text-[12px] font-black">إلغاء</button><button onClick={() => onSave(draft)} className="h-9 rounded-[8px] bg-[#2F5D50] px-4 text-[12px] font-black text-white">حفظ محلي</button></div>
      </div>
    </div>
  );
}
