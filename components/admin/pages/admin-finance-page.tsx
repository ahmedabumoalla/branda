"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, Building2, Calculator, CircleDollarSign, Crown, Download, Filter, Receipt, Search, UserRoundCog, X } from "lucide-react";
import type { BarndaksaFinanceDashboard, FinanceCafeSummary, FinanceRepresentativeSummary, FinanceTransaction } from "@/lib/data/finance";
import { AdminInput, AdminPageShell, AdminStatPill, BentoCard, BentoGrid, StatusBadge } from "@/components/ui/design-system";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export/admin-report-export";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

function date(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-SA");
}

type LedgerTarget =
  | { type: "cafe"; id: string; title: string }
  | { type: "representative"; id: string; title: string }
  | null;

type Props = { data: BarndaksaFinanceDashboard | null; configError?: string };

const transactionColumns = [
  { key: "cafeName", title: "العلامة" },
  { key: "planName", title: "الباقة" },
  { key: "grossAmount", title: "الإجمالي" },
  { key: "couponCode", title: "الكوبون" },
  { key: "representativeName", title: "المندوب" },
  { key: "representativeAmount", title: "مستحق المندوب" },
  { key: "platformCapitalReserveAmount", title: "رأس المال" },
  { key: "ownerAmountEach", title: "نصيب كل مالك" },
  { key: "createdAt", title: "تاريخ العملية" },
] as const;

export function AdminFinancePage({ data, configError }: Props) {
  const [query, setQuery] = useState("");
  const [onlyWithoutRep, setOnlyWithoutRep] = useState(false);
  const [ledger, setLedger] = useState<LedgerTarget>(null);

  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return data.transactions.filter((transaction) => {
      const matchesTerm = !term || [transaction.cafeName, transaction.planName, transaction.couponCode, transaction.representativeName].some((value) => String(value ?? "").toLowerCase().includes(term));
      const matchesRep = !onlyWithoutRep || !transaction.couponCode;
      return matchesTerm && matchesRep;
    });
  }, [data, onlyWithoutRep, query]);

  const ledgerRows = useMemo(() => {
    if (!data || !ledger) return [];
    if (ledger.type === "cafe") return data.transactions.filter((item) => item.cafeId === ledger.id);
    const rep = data.representatives.find((item) => item.representativeId === ledger.id);
    return data.transactions.filter((item) => item.representativeName === rep?.representativeName || item.couponCode === rep?.couponCode);
  }, [data, ledger]);

  return (
    <AdminPageShell
      title="المالية"
      subtitle="جدول مالي كامل للعلامات التجارية والمناديب مع كشف حساب لكل علامة ولكل مندوب."
      action={<BarndaksaLogo variant="dark" width={140} height={56} />}
    >
      {configError ? <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center font-black text-amber-200">{configError}</div> : null}
      {!data ? <BentoCard variant="dark"><p className="font-black text-[#CBB29C]">لا توجد بيانات مالية للعرض حاليًا.</p></BentoCard> : <>
        <BentoGrid className="mb-6">
          <BentoCard variant="gold"><AdminStatPill label="القيمة السوقية الحالية لبرندة" value={money(data.currentMarketValue)} /></BentoCard>
          <BentoCard variant="cyber"><AdminStatPill label="إجمالي الاشتراكات شامل الضريبة" value={money(data.summary.totalGrossSubscriptions)} /></BentoCard>
          <BentoCard variant="dark"><AdminStatPill label="صافي الاشتراكات بدون الضريبة" value={money(data.summary.totalNetSubscriptions)} /></BentoCard>
          <BentoCard variant="cyber"><AdminStatPill label="ضريبة القيمة المضافة المضمنة" value={money(data.summary.totalVatAmount)} /></BentoCard>
          <BentoCard variant="cyber"><AdminStatPill label="مستحقات المناديب" value={money(data.summary.totalRepresentativeCommissions)} /></BentoCard>
          <BentoCard variant="gold"><AdminStatPill label="الصب في رأس المال" value={money(data.summary.totalPlatformCapitalReserve)} /></BentoCard>
          <BentoCard variant="dark"><AdminStatPill label="توزيعات الملاك" value={money(data.summary.totalOwnersDistributions)} /></BentoCard>
          <BentoCard variant="cyber"><AdminStatPill label="كوفيهات بدون كوبون مندوب" value={data.summary.cafesWithoutRepresentativeCoupon} /></BentoCard>
        </BentoGrid>

        <div className="mb-6 flex flex-wrap gap-3">
          <Link href="/admin/finance/valuation" className="inline-flex items-center gap-2 rounded-2xl bg-[#F6C35B] px-5 py-3 font-black text-[#241610]"><Calculator className="h-5 w-5" /> تفصيل آلية التقييم</Link>
          <button type="button" onClick={() => exportRowsToPdf("المعاملات المالية", filteredTransactions as unknown as Record<string, unknown>[], transactionColumns as any)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-[#F8F4EF]"><Download className="h-5 w-5" /> PDF</button>
          <button type="button" onClick={() => exportRowsToExcel("barndaksa-finance-transactions", filteredTransactions as unknown as Record<string, unknown>[], transactionColumns as any)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-[#F8F4EF]"><Download className="h-5 w-5" /> Excel</button>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-[#CBB29C]">آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-SA")}</div>
        </div>

        <BentoGrid className="mb-6 xl:grid-cols-4">
          {data.owners.map((owner) => <BentoCard key={owner.name} variant="dark"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#CBB29C]">الملاك</p><h3 className="mt-1 text-xl font-black text-[#F8F4EF]">{owner.name}</h3></div><Crown className="h-7 w-7 text-[#F6C35B]" /></div><p className="mt-4 text-3xl font-black text-[#F6C35B]">{owner.ownershipPercent}%</p></BentoCard>)}
        </BentoGrid>

        <BentoCard variant="dark" className="mb-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><Filter className="h-7 w-7 text-[#F6C35B]" /><div><h2 className="text-2xl font-black text-[#F8F4EF]">فلترة العمليات المالية</h2><p className="text-sm font-bold text-[#CBB29C]">اضغط على اسم العلامة أو المندوب لفتح كشف حساب مفصل.</p></div></div>
            <label className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 font-black text-[#F8F4EF]"><input type="checkbox" checked={onlyWithoutRep} onChange={(event) => setOnlyWithoutRep(event.target.checked)} /> بدون كوبون مندوب فقط</label>
          </div>
          <div className="relative"><Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" /><AdminInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم العلامة أو المندوب أو الكوبون أو الباقة" className="pr-12" /></div>
        </BentoCard>

        <BentoCard variant="dark" className="mb-6">
          <div className="mb-5 flex items-center gap-3"><Receipt className="h-7 w-7 text-[#F6C35B]" /><div><h2 className="text-2xl font-black text-[#F8F4EF]">كافة المعاملات المالية الخاصة بالعلامات التجارية</h2><p className="text-sm font-bold text-[#CBB29C]">السعر شامل الضريبة، والصافي يستخدم للتوزيع الداخلي.</p></div></div>
          <div className="overflow-x-auto rounded-3xl border border-white/10">
            <table className="w-full min-w-[1250px] text-right text-sm">
              <thead className="bg-white/5 text-[#F6C35B]"><tr className="border-b border-white/10"><th className="p-4">العلامة</th><th>دخلت المنصة</th><th>عمرها</th><th>الباقة</th><th>تاريخ الدفع</th><th>باقي</th><th>عدد التجديد</th><th>الإجمالي</th><th>الكوبون</th><th>المندوب</th><th>مستحق المندوب</th><th>رأس المال</th><th>نصيب كل مالك</th></tr></thead>
              <tbody className="text-[#F8F4EF]">
                {filteredTransactions.map((transaction) => <tr key={transaction.id} className="border-b border-white/5 align-top hover:bg-white/5"><td className="p-4"><button className="font-black text-[#F6C35B] underline-offset-4 hover:underline" onClick={() => setLedger({ type: "cafe", id: transaction.cafeId, title: transaction.cafeName })}>{transaction.cafeName}</button></td><td>{date(transaction.cafeCreatedAt)}</td><td>{transaction.platformAgeDays} يوم</td><td>{transaction.planName}</td><td>{date(transaction.startedAt ?? transaction.createdAt)}</td><td>{transaction.remainingDays == null ? "—" : `${transaction.remainingDays} يوم`}</td><td>{transaction.renewalsCount}</td><td className="font-black text-[#F6C35B]">{money(transaction.grossAmount)}</td><td>{transaction.couponCode ? <StatusBadge tone="success">{transaction.couponCode}</StatusBadge> : <StatusBadge tone="gold">بدون كوبون مندوب</StatusBadge>}</td><td>{transaction.representativeName ? <button className="font-black text-[#F8F4EF] underline-offset-4 hover:underline" onClick={() => { const rep = data.representatives.find((item) => item.representativeName === transaction.representativeName); if (rep) setLedger({ type: "representative", id: rep.representativeId, title: rep.representativeName }); }}>{transaction.representativeName}</button> : "—"}</td><td>{money(transaction.representativeAmount)}</td><td>{money(transaction.platformCapitalReserveAmount)}</td><td>{money(transaction.ownerAmountEach)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </BentoCard>

        <BentoGrid className="mb-6 xl:grid-cols-2">
          <FinanceTable title="الكوفيهات والاشتراكات" icon="cafe" rows={data.cafes} onSelect={(cafe) => setLedger({ type: "cafe", id: cafe.cafeId, title: cafe.cafeName })} />
          <RepresentativeTable rows={data.representatives} onSelect={(rep) => setLedger({ type: "representative", id: rep.representativeId, title: rep.representativeName })} />
        </BentoGrid>

        <BentoCard variant="gold"><div className="mb-4 flex items-center gap-3"><BarChart3 className="h-7 w-7 text-[#241610]" /><h2 className="text-xl font-black text-[#241610]">ملخص آلية توزيع الأرباح</h2></div><div className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-black/10 p-4 font-black text-[#241610]">أول 6 شهور مع كوبون مندوب: المندوب 40%، الصب في رأس المال 40%، وكل مالك 5%.</div><div className="rounded-2xl bg-black/10 p-4 font-black text-[#241610]">ثاني 6 شهور: المندوب 20%، برندة 60%، وكل مالك 5%.</div><div className="rounded-2xl bg-black/10 p-4 font-black text-[#241610]">بعد 12 شهر: المندوب 0%، برندة 60%، وكل مالك 10%.</div></div></BentoCard>

        {ledger ? <LedgerModal target={ledger} rows={ledgerRows} onClose={() => setLedger(null)} /> : null}
      </>}
    </AdminPageShell>
  );
}

function FinanceTable({ rows, onSelect }: { title: string; icon: "cafe"; rows: FinanceCafeSummary[]; onSelect: (row: FinanceCafeSummary) => void }) {
  return <BentoCard variant="cyber"><div className="mb-5 flex items-center gap-3"><Building2 className="h-7 w-7 text-[#F6C35B]" /><h2 className="text-xl font-black">الكوفيهات والاشتراكات</h2></div><div className="overflow-x-auto rounded-3xl border border-white/10"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-black/20 text-[#F6C35B]"><tr><th className="p-3">العلامة</th><th>العمر</th><th>الباقة</th><th>التجديد</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>{rows.map((cafe) => <tr key={cafe.cafeId} className="border-t border-white/5 text-[#F8F4EF]"><td className="p-3"><button className="font-black text-[#F6C35B] hover:underline" onClick={() => onSelect(cafe)}>{cafe.cafeName}</button></td><td>{cafe.platformAgeDays} يوم</td><td>{cafe.activePlanName}</td><td>{cafe.renewalsCount}</td><td>{money(cafe.totalGrossAmount)}</td><td>{cafe.registeredWithoutRepresentativeCoupon ? <StatusBadge tone="gold">بدون مندوب</StatusBadge> : <StatusBadge tone="success">بمندوب</StatusBadge>}</td></tr>)}</tbody></table></div></BentoCard>;
}

function RepresentativeTable({ rows, onSelect }: { rows: FinanceRepresentativeSummary[]; onSelect: (row: FinanceRepresentativeSummary) => void }) {
  return <BentoCard variant="cyber"><div className="mb-5 flex items-center gap-3"><UserRoundCog className="h-7 w-7 text-[#F6C35B]" /><h2 className="text-xl font-black">نسب المناديب من الاشتراكات</h2></div><div className="overflow-x-auto rounded-3xl border border-white/10"><table className="w-full min-w-[680px] text-right text-sm"><thead className="bg-black/20 text-[#F6C35B]"><tr><th className="p-3">المندوب</th><th>الكوبون</th><th>علامات مدفوعة</th><th>أساس الاشتراك</th><th>المستحق</th></tr></thead><tbody>{rows.map((rep) => <tr key={rep.representativeId} className="border-t border-white/5 text-[#F8F4EF]"><td className="p-3"><button className="font-black text-[#F6C35B] hover:underline" onClick={() => onSelect(rep)}>{rep.representativeName}</button></td><td><StatusBadge tone="gold">{rep.couponCode || "بدون كوبون"}</StatusBadge></td><td>{rep.paidBrandsCount}</td><td>{money(rep.totalSubscriptionBase)}</td><td>{money(rep.totalCommission)}</td></tr>)}</tbody></table></div></BentoCard>;
}

function LedgerModal({ target, rows, onClose }: { target: Exclude<LedgerTarget, null>; rows: FinanceTransaction[]; onClose: () => void }) {
  const total = rows.reduce((sum, row) => sum + row.grossAmount, 0);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-[#F6C35B]/25 bg-[#140f0c] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-sm font-black text-[#CBB29C]">كشف حساب {target.type === "cafe" ? "العلامة" : "المندوب"}</p><h2 className="text-3xl font-black text-[#F8F4EF]">{target.title}</h2><p className="mt-2 text-sm font-bold text-[#CBB29C]">عدد العمليات {rows.length} • الإجمالي {money(total)}</p></div><button onClick={onClose} className="rounded-2xl bg-white/10 p-3 text-[#F8F4EF]"><X className="h-6 w-6" /></button></div><div className="mb-4 flex gap-2"><button className="rounded-2xl bg-white/5 px-4 py-3 font-black" onClick={() => exportRowsToPdf(`كشف حساب ${target.title}`, rows as unknown as Record<string, unknown>[], transactionColumns as any)}>PDF</button><button className="rounded-2xl bg-white/5 px-4 py-3 font-black" onClick={() => exportRowsToExcel(`ledger-${target.id}`, rows as unknown as Record<string, unknown>[], transactionColumns as any)}>Excel</button></div><div className="overflow-x-auto rounded-3xl border border-white/10"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-white/5 text-[#F6C35B]"><tr><th className="p-3">التاريخ</th><th>العلامة</th><th>الباقة</th><th>الإجمالي</th><th>الكوبون</th><th>المندوب</th><th>مستحق المندوب</th><th>رأس المال</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/5 text-[#F8F4EF]"><td className="p-3">{date(row.startedAt ?? row.createdAt)}</td><td>{row.cafeName}</td><td>{row.planName}</td><td>{money(row.grossAmount)}</td><td>{row.couponCode ?? "—"}</td><td>{row.representativeName ?? "—"}</td><td>{money(row.representativeAmount)}</td><td>{money(row.platformCapitalReserveAmount)}</td></tr>)}</tbody></table></div></div></div>;
}
