"use client";

import { UserRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { getCustomerLoginHref } from "@/lib/cafe/theme-links";
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
  const [hasCustomerSession, setHasCustomerSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCheckingSession(true);
    void getCustomerSession(slug)
      .then((session) => {
        if (!cancelled) setHasCustomerSession(Boolean(session));
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!program?.enabled) return null;

  return (
    <section id="loyalty-card" dir="rtl" className="mt-6 scroll-mt-28">
      <div className="rounded-[28px] border border-[#E7D7C6] bg-white p-4 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--ci-button-bg,#6B3A25)] text-[var(--ci-button-fg,#fff)]">
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-[var(--ci-accent-bg,#D9A33F)]">بطاقة الولاء</p>
            <h2 className="text-2xl font-black text-[var(--ci-page-fg,#311912)]">
              {program.cardTitle || `بطاقة ${cafeName}`}
            </h2>
          </div>
        </div>

        <p className="mt-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
          تظهر بطاقة الولاء الحقيقية فقط عند توفر كود بطاقة صادر للعميل من قاعدة البيانات.
        </p>

        <div className="mt-5 rounded-[22px] border border-dashed border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-page-bg,#FCF8F3)] p-5 text-center">
          <WalletCards className="mx-auto h-9 w-9 text-[var(--ci-button-bg,#6B3A25)]" />
          <p className="mt-3 text-sm font-black text-[var(--ci-page-fg,#311912)]">
            لا توجد بطاقة حقيقية متاحة للعرض الآن
          </p>
          <p className="mt-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#806A5E)]">
            تم إيقاف كود المعاينة والرصيد المحلي في الواجهة العامة.
          </p>
        </div>

        <div className="mt-5 grid gap-3">
          {checkingSession ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-button-bg,#6B3A25)] px-5 py-4 font-black text-[var(--ci-button-fg,#FCF8F3)] opacity-60"
            >
              <UserRound className="h-5 w-5" />
              جاري التحقق من الدخول
            </button>
          ) : hasCustomerSession ? (
            <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--ci-button-bg,#6B3A25)] px-5 py-4 font-black text-[var(--ci-button-bg,#6B3A25)]">
              <WalletCards className="h-5 w-5" />
              ستظهر البطاقة عند توفرها في حسابك
            </div>
          ) : (
            <a
              href={getCustomerLoginHref(slug, `/c/${slug}`)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-button-bg,#6B3A25)] px-5 py-4 font-black text-[var(--ci-button-fg,#FCF8F3)]"
            >
              <UserRound className="h-5 w-5" />
              تسجيل الدخول لعرض البطاقة
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
