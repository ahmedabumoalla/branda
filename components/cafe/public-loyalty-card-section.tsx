"use client";

import { CreditCard, Download, UserRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { issueLoyaltyCardAction } from "@/app/actions/loyalty-cards";
import { getCustomerSession } from "@/lib/customer/session";
import { getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";

type Program = { enabled: boolean; cardTitle: string; cardSubtitle: string; purchasesRequired: number; rewardName: string; cardBackground: string; cardForeground: string; cardAccent: string };
type Props = { slug: string; cafeName: string; program?: Program | null; logoUrl?: string | null };

export function PublicLoyaltyCardSection({ slug, cafeName, program, logoUrl }: Props) {
  const [cardCode, setCardCode] = useState("");
  const [hasCustomerSession, setHasCustomerSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setCheckingSession(true);
    void getCustomerSession(slug)
      .then((session) => {
        if (cancelled) return;
        setHasCustomerSession(Boolean(session));
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  if (!program?.enabled) return null;
  async function showCard() { setIssuing(true); setMessage(""); try { const code = await issueLoyaltyCardAction(slug); setCardCode(code); setMessage("هذه بطاقتك الحالية في هذه العلامة"); } catch { setMessage("سجل دخولك أولًا لعرض البطاقة"); } finally { setIssuing(false); } }
  return <section id="loyalty-card" dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-10"><div className="grid gap-6 rounded-[36px] border border-[#eadfcf] bg-white p-6 shadow-[0_18px_55px_rgba(49,25,18,0.08)] lg:grid-cols-[1.1fr_0.9fr]"><div><p className="font-black text-[#6B3A25]">بطاقة الولاء</p><h2 className="mt-2 text-3xl font-black text-[#311912]">بطاقة واحدة خاصة بـ {cafeName}</h2><p className="mt-3 max-w-xl font-bold leading-8 text-[#806A5E]">لا تحتاج إصدار بطاقة كل مرة، سجّل دخولك وستظهر بطاقتك نفسها داخل حسابك وفي هذه الصفحة</p><div className="mt-6 flex flex-wrap gap-3">{checkingSession ? <button type="button" disabled className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-6 py-4 font-black text-[#FCF8F3] opacity-60"><UserRound className="h-5 w-5" />جاري التحقق من الدخول</button> : hasCustomerSession ? <button type="button" onClick={showCard} disabled={issuing} className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-6 py-4 font-black text-[#FCF8F3] disabled:opacity-60"><Download className="h-5 w-5" />{issuing ? "جاري عرض البطاقة" : cardCode ? "تحديث بيانات البطاقة" : "عرض بطاقة الولاء"}</button> : <a href={getCustomerLoginHref(slug, `/c/${slug}`)} className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-6 py-4 font-black text-[#FCF8F3]"><UserRound className="h-5 w-5" />تسجيل الدخول لعرض البطاقة</a>}{cardCode ? <a href={`/loyalty-card/${encodeURIComponent(cardCode)}`} className="inline-flex items-center gap-2 rounded-2xl border border-[#6B3A25] px-6 py-4 font-black text-[#6B3A25]"><WalletCards className="h-5 w-5" />فتح QR البطاقة</a> : null}</div>{message ? <p className="mt-3 font-bold text-[#6B3A25]">{message}</p> : null}</div><div className="rounded-[32px] p-6 shadow-[0_28px_80px_rgba(49,25,18,0.16)]" style={{ background: program.cardBackground, color: program.cardForeground }}><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3">{logoUrl ? <img src={logoUrl} alt={cafeName} className="h-16 w-16 rounded-2xl bg-white/90 object-contain p-2 shadow-xl" /> : null}<div><p className="text-sm font-black opacity-75">{cafeName}</p><h3 className="mt-2 text-3xl font-black">{program.cardTitle}</h3><p className="mt-2 text-sm font-bold opacity-75">{program.cardSubtitle}</p></div></div><div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: program.cardAccent, color: program.cardBackground }}><WalletCards className="h-8 w-8" /></div></div><div className="mt-8 rounded-2xl bg-white p-4 text-center text-[#17100d]"><p className="font-mono text-lg font-black tracking-[0.2em]">{cardCode || "BARNDAKSA LOYALTY"}</p>{cardCode ? <SecureQrCode kind="loyalty-card" value={cardCode} title={`QR بطاقة الولاء ${cardCode}`} size={170} className="mt-3" /> : <div className="mt-3 flex h-40 items-center justify-center rounded-2xl bg-[#FCF8F3] text-xs font-black text-[#806A5E]">سجّل دخولك لعرض QR البطاقة</div>}</div><div className="mt-5 flex items-center justify-between gap-3"><span className="rounded-full px-4 py-2 text-sm font-black" style={{ background: program.cardAccent, color: program.cardBackground }}>{program.purchasesRequired} أختام</span><div className="rounded-xl bg-white/80 px-2 py-1"><BarndaksaLogo variant="brown" width={58} height={24} /></div></div></div></div></section>;
}
