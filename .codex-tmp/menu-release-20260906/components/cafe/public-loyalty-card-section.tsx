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
  logoUrl?: string | null;
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
    <section id="loyalty-card" dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid gap-5 rounded-[18px] border border-[#E7D7C6] bg-white p-4 shadow-[0_16px_42px_rgba(49,25,18,0.08)] lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.75fr)] lg:p-5">
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--ci-accent-bg,#2F7D69)]">بطاقة الولاء</p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-[var(--ci-page-fg,#17212B)] sm:text-3xl">
            بطاقة رقمية خاصة بـ {cafeName}
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
            تظهر البطاقة والرمز الحقيقيان بعد تسجيل العميل وإصدار بطاقة ولاء فعلية من قاعدة البيانات.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {checkingSession ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--ci-button-bg,#6B3A25)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg,#FCF8F3)] opacity-60"
              >
                <UserRound className="h-4 w-4" />
                جاري التحقق من الدخول
              </button>
            ) : hasCustomerSession ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--ci-button-bg,#6B3A25)] px-5 py-3 text-sm font-black text-[var(--ci-button-bg,#6B3A25)]">
                <WalletCards className="h-4 w-4" />
                ستظهر البطاقة عند توفرها في حسابك
              </div>
            ) : (
              <a
                href={getCustomerLoginHref(slug, `/c/${slug}`)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--ci-button-bg,#6B3A25)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg,#FCF8F3)]"
              >
                <UserRound className="h-4 w-4" />
                تسجيل الدخول لعرض البطاقة
              </a>
            )}
          </div>
        </div>

        <div className="flex min-h-[220px] items-center justify-center rounded-[16px] border border-dashed border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-page-bg,#FCF8F3)] p-5 text-center">
          <div>
            <WalletCards className="mx-auto h-10 w-10 text-[var(--ci-button-bg,#6B3A25)]" />
            <p className="mt-3 text-sm font-black leading-6 text-[var(--ci-page-fg,#17212B)]">
              لا يتم عرض بطاقة أو QR غير موثق هنا.
            </p>
            <p className="mt-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#806A5E)]">
              الربط الحقيقي يأتي من بطاقة العميل عند توفرها.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
