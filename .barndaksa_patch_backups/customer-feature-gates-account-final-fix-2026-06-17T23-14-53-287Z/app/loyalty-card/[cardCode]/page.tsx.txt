import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Coffee, Gift, Home, WalletCards } from "lucide-react";
import { getLoyaltyCardViewByCode } from "@/lib/data/loyalty-cards";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";

type Props = {
  params: Promise<{ cardCode: string }>;
  searchParams?: Promise<{ back?: string }>;
};

export default async function LoyaltyCardPage({ params, searchParams }: Props) {
  const { cardCode } = await params;
  const query = searchParams ? await searchParams : {};
  const view = await getLoyaltyCardViewByCode(cardCode);

  if (!view) notFound();

  const { card, program, cafeSlug, cafeName } = view;
  const required = Math.max(1, Number(program.purchasesRequired || 7));
  const lit = Math.min(required, Number(card.stampsInCycle || 0));
  const backHref = query?.back || (cafeSlug ? `/c/${cafeSlug}/account` : "/");

  return (
    <main dir="rtl" className="min-h-screen bg-[#F1D7C6] px-4 py-8 text-[#311912]">
      <section className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#6B3A25] shadow-sm"
          >
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Link>
          <Link
            href={cafeSlug ? `/c/${cafeSlug}` : "/"}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#6B3A25] px-5 py-3 font-black text-[#6B3A25]"
          >
            <Home className="h-4 w-4" />
            الصفحة الرئيسية
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <section className="rounded-[34px] bg-[#4A281D] p-6 text-[#FCF8F3] shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-serif text-3xl font-black uppercase tracking-[0.18em]">
                  Loyalty Card
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#E7D7C6]">
                  Buy {required} coffees and get the next one free
                </p>
              </div>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D9A33F] text-[#311912]">
                <WalletCards className="h-7 w-7" />
              </span>
            </div>

            <div className="mt-8 grid grid-cols-4 gap-4 sm:grid-cols-7">
              {Array.from({ length: required }).map((_, index) => {
                const active = index < lit;
                return (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <div
                      className={`relative flex h-16 w-14 items-center justify-center rounded-b-2xl rounded-t-md border-2 transition-all ${
                        active
                          ? "border-[#FFD36B] bg-[#FFD36B] text-[#4A281D] shadow-[0_0_26px_rgba(255,211,107,0.78)]"
                          : "border-[#8A6B5E] bg-[#6B4A3B] text-[#D8BDAF]"
                      }`}
                    >
                      <Coffee className="h-7 w-7" />
                      <span
                        className={`absolute -top-2 h-2 w-10 rounded-t-xl ${
                          active ? "bg-[#FFF3C4]" : "bg-[#8A6B5E]"
                        }`}
                      />
                    </div>
                    <p className="text-[10px] font-black">{active ? "مضيء" : index + 1}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl bg-white p-5 text-center text-[#17100d]">
              <p className="font-mono text-lg font-black tracking-[0.25em]">{card.cardCode}</p>
              <SecureQrCode
                kind="loyalty-card"
                value={card.cardCode}
                title={`QR بطاقة الولاء ${card.cardCode}`}
                size={190}
                className="mt-4"
              />
              <p className="mt-3 text-[11px] font-black text-[#806A5E]">
                QR آمن لا يؤكد العملية إلا من صفحة الكاشير أو لوحة العلامة
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs font-bold text-[#E7D7C6]">{cafeName}</span>
              <span className="rounded-full bg-[#D9A33F] px-4 py-2 text-sm font-black text-[#311912]">
                {required} أكواب
              </span>
            </div>
          </section>

          <section className="rounded-[34px] bg-white p-6 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
            <p className="text-sm font-black text-[#D9A33F]">{cafeName}</p>
            <h1 className="mt-2 text-4xl font-black">{program.cardTitle}</h1>
            <p className="mt-3 text-base font-bold leading-8 text-[#806A5E]">
              اعرض هذه البطاقة للكاشير عند كل عملية شراء. بعد قراءة QR البطاقة وQR الفاتورة من الكاشير أو لوحة العلامة يضيء كوب جديد في البطاقة.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#FCF8F3] p-5 text-center">
                <p className="text-3xl font-black">{lit}</p>
                <p className="mt-1 text-xs font-bold text-[#806A5E]">أكواب مضيئة</p>
              </div>
              <div className="rounded-2xl bg-[#FCF8F3] p-5 text-center">
                <p className="text-3xl font-black">{required}</p>
                <p className="mt-1 text-xs font-bold text-[#806A5E]">مطلوب للمكافأة</p>
              </div>
              <div className="rounded-2xl bg-[#FCF8F3] p-5 text-center">
                <p className="text-3xl font-black">{card.availableRewards}</p>
                <p className="mt-1 text-xs font-bold text-[#806A5E]">مكافآت جاهزة</p>
              </div>
            </div>

            {card.availableRewards > 0 ? (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#D9A33F] p-5 font-black text-[#311912]">
                <Gift className="h-6 w-6" />
                اكتملت البطاقة، لديك {program.rewardName}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-[#E7D7C6] p-5 font-bold leading-7 text-[#806A5E]">
                المتبقي {Math.max(0, required - lit)} عملية شراء للحصول على {program.rewardName}
              </div>
            )}

            <p className="mt-5 text-xs font-bold leading-6 text-[#806A5E]">
              {program.terms}
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
