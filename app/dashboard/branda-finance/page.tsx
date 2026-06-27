import Link from "next/link";
import { Calculator, Receipt, ShoppingCart, WalletCards } from "lucide-react";
import { loadBrandaFinanceDemoData } from "@/lib/branda-finance/load-demo-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BrandaFinancePage() {
  const dataset = await loadBrandaFinanceDemoData();

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F1E7] p-4 text-[#311912] lg:p-6">
      <section className="mb-5 rounded-[28px] border border-[#E1CFB8] bg-[#3A2117] p-6 text-white shadow-[0_22px_70px_rgba(49,25,18,0.16)]">
        <p className="text-sm font-black text-[#F0C568]">Branda Finance Demo</p>
        <h1 className="mt-2 text-3xl font-black">مركز المالية والفوترة</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-[#F8EBDD]">
          مساحة تجريبية لإصدار الفواتير ونقطة البيع وربط المنتجات والعملاء والفروع، بدون آثار محاسبية فعلية أو كتابة في قاعدة البيانات.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <FinanceCard
          href="/dashboard/branda-finance/invoicing/create"
          icon={<Receipt className="h-7 w-7" />}
          title="إنشاء فاتورة"
          description="مساحة عمل بفورم ومعاينة، حقول مخصصة، عملاء، فروع، أصناف، وإجماليات VAT."
          cta="فتح الفواتير"
        />
        <FinanceCard
          href="/dashboard/branda-finance/sales"
          icon={<ShoppingCart className="h-7 w-7" />}
          title="المبيعات"
          description="واجهة كاشير POS ببطاقات منتجات وسلة وفاتورة دفع كاش أو بطاقة وقراءة ولاء تجريبية."
          cta="فتح المبيعات"
        />
        <div className="rounded-[24px] border border-[#E1CFB8] bg-white p-5 shadow-[0_14px_40px_rgba(49,25,18,0.07)]">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FCF8F3] text-[#6B3A25]">
            <Calculator className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-black">مؤشرات الربط</h2>
          <div className="mt-4 grid gap-2 text-sm font-bold text-[#6B5548]">
            <span>العملاء: {dataset.customers.length}</span>
            <span>الفروع: {dataset.branches.length}</span>
            <span>المستودعات: {dataset.warehouses.length}</span>
            <span>المنتجات: {dataset.products.length}</span>
            <span>الموردون: {dataset.suppliers.length}</span>
          </div>
        </div>
      </div>

      <section className="mt-5 rounded-[24px] border border-[#E1CFB8] bg-white p-5">
        <div className="mb-3 flex items-center gap-3">
          <WalletCards className="h-6 w-6 text-[#B7791F]" />
          <h2 className="text-xl font-black">ملاحظات البيانات</h2>
        </div>
        <div className="space-y-2 text-sm font-bold text-[#806A5E]">
          {dataset.dataNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function FinanceCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link href={href} className="group rounded-[24px] border border-[#E1CFB8] bg-white p-5 shadow-[0_14px_40px_rgba(49,25,18,0.07)] transition hover:-translate-y-0.5 hover:border-[#D9A33F]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FCF8F3] text-[#6B3A25]">{icon}</div>
      <h2 className="text-xl font-black text-[#311912]">{title}</h2>
      <p className="mt-3 min-h-20 text-sm font-bold leading-7 text-[#806A5E]">{description}</p>
      <span className="mt-4 inline-flex rounded-2xl bg-[#3A2117] px-4 py-3 text-sm font-black text-white">{cta}</span>
    </Link>
  );
}
