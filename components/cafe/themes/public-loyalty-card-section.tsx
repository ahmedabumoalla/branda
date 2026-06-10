"use client";

import { Coffee, Download, PartyPopper, UserRound, WalletCards } from "lucide-react";
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
  const [hasCustomerSession, setHasCustomerSession] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCustomerSession(slug).then((session) => setHasCustomerSession(Boolean(session)));
  }, [slug]);

  if (!program?.enabled) return null;

  async function showCard() {
    setIssuing(true);
    setMessage("");

    try {
      const code = await issueLoyaltyCardAction(slug);
      setCardCode(code);
      setMessage("تم حفظ البطاقة داخل حسابك لهذه العلامة");
    } catch {
      setMessage("سجل دخولك أولًا لعرض البطاقة");
    } finally {
      setIssuing(false);
    }
  }

  const cups = Array.from({ length: program.purchasesRequired }).map((_, index) => {
    const lit = cardCode ? index < Math.min(3, program.purchasesRequired) : false;
    return { index, lit };
  });

  return (
    <section id="loyalty-card" dir="rtl" className="mt-6 scroll-mt-28">
      <div className="rounded-[36px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6B3A25] text-white">
            <WalletCards className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-black text-[#D9A33F]">بطاقة الولاء</p>
            <h2 className="text-2xl font-black text-[#311912]">{program.cardTitle}</h2>
          </div>
        </div>

        <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
          بطاقة خاصة بـ {cafeName} محفوظة في حساب العميل وتظهر من زر بطاقة الولاء في الصفحة الرئيسية
        </p>

        <div
          className="mt-5 rounded-[32px] p-5 shadow-[0_24px_70px_rgba(49,25,18,0.18)]"
          style={{ background: program.cardBackground, color: program.cardForeground }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black opacity-75">{cafeName}</p>
              <h3 className="mt-2 text-2xl font-black">{program.cardTitle}</h3>
              <p className="mt-1 text-xs font-bold opacity-75">{program.cardSubtitle}</p>
            </div>
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: program.cardAccent, color: program.cardBackground }}
            >
              <WalletCards className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-4 text-center text-[#17100d]">
            <p className="font-mono text-sm font-black tracking-[0.18em]">
              {cardCode || "BRANDA LOYALTY"}
            </p>
            <div className="mt-3 grid grid-cols-12 gap-1">
              {Array.from({ length: 36 }).map((_, index) => (
                <span
                  key={index}
                  className="h-7 rounded-sm bg-[#17100d]"
                  style={{ opacity: index % 3 === 0 ? 1 : 0.55 }}
                />
              ))}
            </div>
          </div>

          <div className="relative mt-7 rounded-[28px] bg-white/10 p-4">
            <div className="absolute inset-x-8 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
            <div className="relative grid grid-cols-4 gap-3">
              {cups.map(({ index, lit }) => (
                <div
                  key={index}
                  className={`flex aspect-square items-center justify-center rounded-2xl border text-center transition ${
                    lit ? "border-[#D9A33F] bg-[#D9A33F] text-[#311912] shadow-lg" : "border-white/25 bg-white/10"
                  }`}
                >
                  <Coffee className="h-5 w-5" />
                </div>
              ))}
            </div>

            {cardCode ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white/10 p-3 text-sm font-black">
                <PartyPopper className="h-5 w-5 text-[#D9A33F]" />
                استمر حتى تحصل على {program.rewardName}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {hasCustomerSession ? (
            <button
              type="button"
              onClick={showCard}
              disabled={issuing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-4 font-black text-[#FCF8F3] disabled:opacity-60"
            >
              <Download className="h-5 w-5" />
              {issuing ? "جاري عرض البطاقة" : cardCode ? "تحديث البطاقة" : "عرض بطاقة الولاء"}
            </button>
          ) : (
            <a
              href={`/c/${encodeURIComponent(slug)}/login`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-4 font-black text-[#FCF8F3]"
            >
              <UserRound className="h-5 w-5" />
              تسجيل الدخول لعرض البطاقة
            </a>
          )}

          {cardCode ? (
            <a
              href={`/loyalty-card/${encodeURIComponent(cardCode)}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#6B3A25] px-5 py-4 font-black text-[#6B3A25]"
            >
              <WalletCards className="h-5 w-5" />
              فتح الباركود
            </a>
          ) : null}
        </div>

        {message ? <p className="mt-3 text-center font-bold text-[#6B3A25]">{message}</p> : null}
      </div>
    </section>
  );
}
