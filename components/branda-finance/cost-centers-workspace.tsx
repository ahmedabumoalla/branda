"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { financeAmount } from "@/lib/branda-finance/calculations";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";

type CostCenterDraft = {
  id: string;
  code: string;
  name: string;
  parent: string;
  branchProject: string;
  budget: number;
  actual: number;
  status: string;
};

const data = getBrandaFinanceDemoData();
const initialCenters: CostCenterDraft[] = data.costCenters.map((center, index) => ({
  id: center.id,
  code: `CC-${String(index + 1).padStart(3, "0")}`,
  name: center.name,
  parent: index === 0 ? "رئيسي" : data.costCenters[0]?.name ?? "رئيسي",
  branchProject: data.projects[index]?.name ?? data.branches[index]?.displayName ?? "كل الفروع",
  budget: center.budget,
  actual: center.actual,
  status: center.actual > center.budget ? "تجاوز" : "ضمن الميزانية",
}));

const inputClass = "h-9 w-full rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold outline-none";

export function CostCentersWorkspace() {
  const [centers, setCenters] = useState(initialCenters);
  const [modalOpen, setModalOpen] = useState(false);
  const totalBudget = centers.reduce((sum, center) => sum + center.budget, 0);
  const totalActual = centers.reduce((sum, center) => sum + center.actual, 0);

  function addCenter(center: CostCenterDraft) {
    setCenters((current) => [center, ...current]);
    setModalOpen(false);
  }

  return (
    <FinancePageShell
      title="مراكز التكلفة"
      description="مراكز تكلفة محلية مرتبطة بالفروع والمشاريع والفواتير والمشتريات والرواتب والأصول."
      status="محلي فقط"
      actions={[{ label: "شجرة الحسابات", href: "/dashboard/branda-finance/accountant/chart-of-accounts" }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="عدد المراكز" value={String(centers.length)} />
        <FinanceStatCard label="الموازنة" value={financeAmount(totalBudget)} tone="gold" />
        <FinanceStatCard label="الفعلي" value={financeAmount(totalActual)} tone="brown" />
        <FinanceStatCard label="الانحراف" value={financeAmount(totalBudget - totalActual)} tone={totalBudget >= totalActual ? "green" : "red"} />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
        <p className="text-[12px] font-bold text-[#806A58]">معاينة قواعد التوزيع: 60% تشغيل، 25% تسويق، 15% توصيل. تستخدم لاحقًا في المصروفات والأصول.</p>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white">
          <Plus className="h-4 w-4" />
          إضافة مركز تكلفة
        </button>
      </section>

      <FinanceTable
        minWidth="980px"
        headers={["الكود", "الاسم", "الأب", "الفرع/المشروع", "الموازنة", "الفعلي", "الانحراف", "الحالة"]}
        rows={centers.map((center) => [center.code, center.name, center.parent, center.branchProject, financeAmount(center.budget), financeAmount(center.actual), financeAmount(center.budget - center.actual), center.status])}
      />

      {modalOpen ? <CostCenterModal onClose={() => setModalOpen(false)} onSave={addCenter} /> : null}
    </FinancePageShell>
  );
}

function CostCenterModal({ onClose, onSave }: { onClose: () => void; onSave: (center: CostCenterDraft) => void }) {
  const [draft, setDraft] = useState<CostCenterDraft>({
    id: `cc-${Date.now()}`,
    code: "CC-NEW",
    name: "مركز تكلفة جديد",
    parent: "رئيسي",
    branchProject: "الفرع الرئيسي",
    budget: 10000,
    actual: 0,
    status: "نشط",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2F241D]/45 p-3" onClick={onClose}>
      <div className="w-full max-w-xl rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-4" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black">إضافة مركز تكلفة محلي</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["code", "name", "parent", "branchProject"] as const).map((key) => (
            <label key={key}><span className="mb-1 block text-[11px] font-black">{key}</span><input className={inputClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>
          ))}
          <label><span className="mb-1 block text-[11px] font-black">budget</span><input type="number" className={inputClass} value={draft.budget} onChange={(event) => setDraft({ ...draft, budget: Number(event.target.value) || 0 })} /></label>
          <label><span className="mb-1 block text-[11px] font-black">actual</span><input type="number" className={inputClass} value={draft.actual} onChange={(event) => setDraft({ ...draft, actual: Number(event.target.value) || 0 })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-[8px] border px-4 text-[12px] font-black">إلغاء</button><button onClick={() => onSave(draft)} className="h-9 rounded-[8px] bg-[#2F5D50] px-4 text-[12px] font-black text-white">حفظ محلي</button></div>
      </div>
    </div>
  );
}
