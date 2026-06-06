"use client";

import { CreditCard, Download, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { issueLoyaltyCardAction } from "@/app/actions/loyalty-cards";
import { getCustomerSession } from "@/lib/customer/session";

type Program = {
  enabled: boolean;
  cardTitle: string;
  cardSubtitle: string;
  purchasesRequired: number;
  rewardName: string;
  cardBackground: string;
  cardForeground: string;
  cardAccent: string;
};

type Props = {
  slug: string;
  cafeName: string;
  program?: Program | null;
};

export function PublicLoyaltyCardSection({ slug, cafeName, program }: Props) {
  const [cardCode, setCardCode] = useState("");
  const [checking, setChecking] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCustomerSession(slug).then(() => setChecking(false));
  }, [slug]);

  if (!program?.enabled) return null;

  async function issueCard() {
    setIssuing(true);
    setMessage("");
    try {
      const code = await issueLoyaltyCardAction(slug);
      setCardCode(code);
      setMessage("تم إنشاء بطاقة الولاء الخاصة بك");
    } catch {
      setMessage("سجّل دخولك أولًا للحصول على بطاقة الولاء");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="font-black text-[#6B3A25]">بطاقة الولاء</p>
          <h2 className="mt-2 text-3xl font-black text-[#311912]">بطاقة خاصة بـ {cafeName}</h2>
          <p className="mt-3 max-w-xl font-bold leading-8 text-[#806A5E]">
            اجمع {program.purchasesRequired} عمليات شراء واحصل على {program.rewardName}
          </p>
          <button
            type="button"
            onClick={issueCard}
            disabled={issuing || checking}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-6 py-4 font-black text-[#FCF8F3] disabled:opacity-60"
          >
            <Download className="h-5 w-5" />
            {issuing ? "جاري إنشاء البطاقة" : cardCode ? "تحديث البطاقة" : "تحميل بطاقة الولاء"}
          </button>
          {message ? <p className="mt-3 font-bold text-[#6B3A25]">{message}</p> : null}
          {cardCode ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={`/api/wallet/apple/${encodeURIComponent(cardCode)}`} className="rounded-xl bg-black px-5 py-3 text-sm font-black text-white">إضافة إلى Apple Wallet</a>
              <a href={`/api/wallet/google/${encodeURIComponent(cardCode)}`} className="rounded-xl bg-[#174EA6] px-5 py-3 text-sm font-black text-white">إضافة إلى Google Wallet</a>
              <a href={`/loyalty-card/${encodeURIComponent(cardCode)}`} className="rounded-xl border border-[#6B3A25] px-5 py-3 text-sm font-black text-[#6B3A25]">عرض البطاقة</a>
            </div>
          ) : null}
        </div>

        <div className="rounded-[32px] p-6 shadow-[0_28px_80px_rgba(49,25,18,0.22)]" style={{ background: program.cardBackground, color: program.cardForeground }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black opacity-75">{cafeName}</p>
              <h3 className="mt-2 text-3xl font-black">{program.cardTitle}</h3>
              <p className="mt-2 text-sm font-bold opacity-75">{program.cardSubtitle}</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: program.cardAccent, color: program.cardBackground }}>
              <WalletCards className="h-8 w-8" />
            </div>
          </div>
          <div className="mt-8 rounded-2xl bg-white p-4 text-center text-[#17100d]">
            <p className="font-mono text-lg font-black tracking-[0.2em]">{cardCode || "BRANDA LOYALTY"}</p>
            <div className="mt-3 grid grid-cols-12 gap-1">
              {Array.from({ length: 36 }).map((_, index) => <span key={index} className="h-9 rounded-sm bg-[#17100d]" style={{ opacity: index % 3 === 0 ? 1 : 0.55 }} />)}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="rounded-full px-4 py-2 text-sm font-black" style={{ background: program.cardAccent, color: program.cardBackground }}>
              {program.purchasesRequired} عمليات
            </span>
            <CreditCard className="h-5 w-5 opacity-80" />
          </div>
        </div>
      </div>
    </section>
  );
}
