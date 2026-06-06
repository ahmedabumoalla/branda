import { notFound } from "next/navigation";
import { getCardByCode } from "@/lib/data/loyalty-cards";

type Props = {
  params: Promise<{ cardCode: string }>;
};

export default async function LoyaltyCardPage({ params }: Props) {
  const { cardCode } = await params;
  const card = await getCardByCode(cardCode);

  if (!card) notFound();

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] px-4 py-10">
      <section className="mx-auto max-w-xl rounded-[36px] bg-[#4A281D] p-8 text-[#FCF8F3] shadow-2xl">
        <p className="text-sm font-black text-[#D9A33F]">بطاقة الولاء</p>
        <h1 className="mt-2 text-3xl font-black">{card.customerName}</h1>
        <p className="mt-2 font-bold text-[#E7D7C6]">اعرض هذا الباركود للكاشير عند كل عملية شراء</p>

        <div className="mt-8 rounded-2xl bg-white p-5 text-center text-[#17100d]">
          <p className="font-mono text-xl font-black tracking-[0.25em]">{card.cardCode}</p>
          <div className="mt-4 grid grid-cols-12 gap-1">
            {Array.from({ length: 48 }).map((_, index) => (
              <span
                key={index}
                className="h-12 rounded-sm bg-[#17100d]"
                style={{ opacity: index % 4 === 0 ? 1 : index % 2 === 0 ? 0.75 : 0.45 }}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-2xl font-black">{card.stampsInCycle}</p>
            <p className="text-xs font-bold text-[#E7D7C6]">أختام حالية</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-2xl font-black">{card.availableRewards}</p>
            <p className="text-xs font-bold text-[#E7D7C6]">مكافآت</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-2xl font-black">{card.totalPurchases}</p>
            <p className="text-xs font-bold text-[#E7D7C6]">عمليات</p>
          </div>
        </div>
      </section>
    </main>
  );
}
