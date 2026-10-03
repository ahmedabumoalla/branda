"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Gift, LogOut, ScanLine } from "lucide-react";
import { lookupRastCashierCardAction, scanLoyaltyExperienceAction } from "@/app/actions/loyalty-experience";
import { cashierLookupRewardAction, logoutCashierAction } from "@/app/actions/cashier";
import type { CashierConsole } from "@/lib/data/cashier";
import type { CashierRewardPreview } from "@/lib/data/customer-rewards";
import { RastCameraScanner } from "./rast-camera-scanner";
import { createRastScanSession, type RastScanPreview } from "./scan-session";

export function RastCashierRewardDetails({ reward }: { reward: CashierRewardPreview }) {
  const raw = reward.metadata?.termsSnapshot;
  const terms = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const discount = terms.rewardKind === "discount" && typeof terms.discountPercent === "number" ? terms.discountPercent : null;
  const product = terms.rewardKind === "product" && typeof terms.rewardProductName === "string" ? terms.rewardProductName : null;
  return <div className="mt-3 space-y-2 text-sm leading-7">
    {discount ? <p className="text-lg font-bold">خصم {discount}% وفق شروط المكافأة</p> : null}
    {product ? <p className="font-bold">المنتج المستحق: {product}</p> : null}
    {reward.rewardDescription ? <p className="whitespace-pre-line">{reward.rewardDescription}</p> : null}
    {typeof terms.terms === "string" && terms.terms && terms.terms !== reward.rewardDescription ? <p className="whitespace-pre-line">{terms.terms}</p> : null}
    {discount ? <p>طبّق النسبة على الفاتورة وفق الشروط، ثم أكّد صرف المكافأة.</p> : null}
  </div>;
}

export function RastCashier({ initialData }: { initialData: CashierConsole }) {
  const [kind, setKind] = useState<"stamp" | "redeem">("stamp");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [preview, setPreview] = useState<RastScanPreview | null>(null);
  const [session] = useState(() => createRastScanSession({ lookupCard: lookupRastCashierCardAction, lookupReward: cashierLookupRewardAction, commit: scanLoyaltyExperienceAction, createRequestId: () => crypto.randomUUID() }));
  const input = useRef<HTMLInputElement>(null);
  const focusInputAfterScan = useRef(false);
  const previewElement = useRef<HTMLElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (preview) previewElement.current?.focus(); }, [preview]);
  useEffect(() => { if (error) errorElement.current?.focus(); }, [error]);
  useEffect(() => { if (!pending && focusInputAfterScan.current) { focusInputAfterScan.current = false; input.current?.focus(); } }, [pending]);
  function updateCode(code: string) { if (session.busy) return; session.invalidate(); setValue(code); setPreview(null); setMessage(""); setError(""); }
  function detectCode(code: string) { if (session.busy) return; updateCode(code); setMessage("تمت قراءة الرمز. اضغط فحص لعرض بيانات العميل قبل التأكيد."); input.current?.focus(); }
  async function processScan(confirm = false) {
    if (session.busy || !value.trim()) return;
    setPending(true); setError(""); setMessage("");
    try {
      if (!confirm) { setPreview(null); setPreview(await session.inspect(kind, value)); return; }
      const result = await session.confirm(kind, value);
      if (!result) return;
      const status = String(result.status ?? "");
      if (["stamped", "reward_issued", "redeemed"].includes(status)) {
        const reward = preview?.kind === "redeem" ? preview.reward : null;
        setMessage(result.replayed ? "هذه العملية مسجلة سابقًا؛ لم تتكرر إضافة الختم أو صرف المكافأة." : status === "redeemed" ? `تم صرف ${String(result.rewardName ?? reward?.rewardTitle ?? "المكافأة")} بنجاح.` : status === "reward_issued" ? `اكتملت البطاقة! استحق ${String(result.customerName ?? "العميل")} مكافأته.` : `تم تسجيل الختم. رصيد ${String(result.customerName ?? "العميل")}: ${Number(result.stampsInCycle)} من ${Number(result.purchasesRequired)}.`);
        focusInputAfterScan.current = true; setValue(""); setPreview(null);
      } else {
        const errors: Record<string, string> = { recent_scan: "تم تسجيل ختم قريبًا لهذه البطاقة. انتظر قبل عملية جديدة.", cooldown: "تم تسجيل ختم قريبًا لهذه البطاقة. انتظر قبل عملية جديدة.", already_redeemed: "هذه المكافأة مصروفة سابقًا.", expired: "انتهت صلاحية المكافأة.", inactive: "البطاقة غير نشطة.", invalid: "الرمز غير صالح أو لا يتبع راست.", duplicate: "هذه العملية مسجلة بالفعل." };
        setError(errors[status] ?? "لم تسجل العملية. تحقق من البطاقة وصلاحية البرنامج.");
      }
    } catch (cause) { setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : "تعذر إتمام العملية. يمكنك إعادة المحاولة بأمان."); }
    finally { setCheckedAt(Date.now()); setPending(false); }
  }
  const reward = preview?.kind === "redeem" ? preview.reward : null;
  const expiry = reward?.expiresAt ? new Date(reward.expiresAt) : null;
  const validExpiry = expiry && Number.isFinite(expiry.getTime()) ? expiry : null;
  const canRedeem = reward?.canRedeem && (!validExpiry || validExpiry.getTime() > checkedAt);
  return <main dir="rtl" className="min-h-dvh bg-[#F5F0E7] px-4 py-7 text-[#561C2B] sm:px-8">
    <div className="mx-auto max-w-4xl">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-5 border-b border-[#561C2B]/20 pb-6">
        <div><p className="text-xs tracking-widest" dir="ltr">RAST · LOYALTY</p><h1 className="mt-2 text-2xl font-bold">كل زيارة تستاهل</h1><p className="mt-2 text-sm">أهلًا {initialData.cashier.fullName}، هنا تسجّل الأختام وتصرف المكافآت.</p></div>
        <form action={logoutCashierAction}><button disabled={pending} className="flex min-h-12 items-center gap-2 rounded-xl border border-current px-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"><LogOut size={18} aria-hidden="true" />تسجيل الخروج</button></form>
      </header>
      <div className="grid gap-8 md:grid-cols-[1fr_240px]">
        <section aria-labelledby="scan-heading" className="min-w-0 rounded-3xl border border-[#561C2B]/20 bg-white/60 p-5 sm:p-8">
          <div className="mb-7 grid grid-cols-2 gap-2" role="group" aria-label="نوع العملية">
            {([{ id: "stamp", title: "تسجيل ختم", icon: BadgeCheck }, { id: "redeem", title: "صرف مكافأة", icon: Gift }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={kind === tab.id} disabled={pending} onClick={() => { if (session.busy) return; setKind(tab.id); updateCode(""); }} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-4 ${kind === tab.id ? "bg-[#561C2B] text-[#FFF6E7]" : "border border-[#561C2B]/20"}`}><tab.icon size={19} aria-hidden="true" />{tab.title}</button>)}
          </div>
          <h2 id="scan-heading" className="text-xl font-bold">{kind === "stamp" ? "اقرأ بطاقة العميل" : "افحص مكافأة العميل"}</h2>
          <p id="rast-scan-help" className="mt-3 text-sm leading-7">{kind === "stamp" ? "افحص البطاقة وراجع اسم العميل ورصيده. بعد التأكد من الشراء، أكّد تسجيل ختم واحد." : "اقرأ رمز المكافأة لعرض تفاصيلها وصلاحيتها، ثم أكد صرفها."}</p>
          <form onSubmit={(event) => { event.preventDefault(); void processScan(); }} className="my-6 space-y-3" aria-busy={pending}>
            <label htmlFor="rast-scan-code" className="block text-sm font-bold">{kind === "stamp" ? "رمز بطاقة الولاء" : "رمز المكافأة"}</label>
            <input id="rast-scan-code" ref={input} dir="ltr" value={value} disabled={pending} onChange={(event) => updateCode(event.target.value)} aria-describedby="rast-scan-help" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={500} placeholder="امسح بالقارئ أو أدخل الرمز" className="min-h-14 w-full min-w-0 rounded-xl border border-[#561C2B]/30 bg-white px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#561C2B]" />
            <button type="submit" disabled={pending || !value.trim()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#561C2B] px-4 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"><ScanLine size={19} aria-hidden="true" />{pending ? "جاري التحقق..." : kind === "stamp" ? "فحص بطاقة العميل" : "فحص المكافأة"}</button>
          </form>
          <RastCameraScanner key={kind} disabled={pending} onDetected={detectCode} />
          {preview && <section ref={previewElement} tabIndex={-1} className="mt-6 rounded-2xl border border-[#561C2B]/25 p-5 focus-visible:outline-2 focus-visible:outline-offset-4" aria-labelledby="rast-scan-preview">
            <p className="text-xs">{preview.kind === "stamp" ? "بطاقة العميل" : "مكافأة العميل"}</p><h3 id="rast-scan-preview" className="mt-2 break-words text-xl font-bold">{preview.kind === "stamp" ? preview.card.customerName : preview.reward.customerName}</h3><p dir="ltr" className="mt-2 break-all text-left text-xs opacity-70">{preview.value}</p>
            {preview.kind === "stamp" ? <><dl className="my-5 grid grid-cols-2 gap-4 text-sm"><div><dt>رصيد الأختام</dt><dd className="mt-1 text-xl font-bold">{preview.card.stampsInCycle} / {preview.card.purchasesRequired}</dd></div><div><dt>المكافآت المتاحة</dt><dd className="mt-1 text-xl font-bold">{preview.card.availableRewards}</dd></div></dl><p className="text-sm leading-7">المكافأة عند الاكتمال: {preview.card.rewardName}</p><button type="button" disabled={pending} onClick={() => void processScan(true)} className="mt-5 min-h-12 w-full rounded-xl bg-[#561C2B] p-3 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">تأكيد الشراء وتسجيل ختم واحد</button></> : <><h4 className="mt-5 text-lg font-bold">{preview.reward.rewardTitle}</h4><RastCashierRewardDetails reward={preview.reward} /><p className="mt-4 font-bold">{preview.reward.remainingText}</p>{validExpiry && <time className="mt-1 block text-sm" dateTime={validExpiry.toISOString()}>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(validExpiry)}</time>}{canRedeem ? <button type="button" disabled={pending} onClick={() => void processScan(true)} className="mt-5 min-h-12 w-full rounded-xl bg-[#561C2B] p-3 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">تأكيد تسليم المكافأة وصرفها</button> : <p role="alert" className="mt-4 font-bold">{preview.reward.invalidReason || "انتهت صلاحية المكافأة."}</p>}</>}
          </section>}
          {error && <p ref={errorElement} tabIndex={-1} role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-900 focus-visible:outline-2 focus-visible:outline-offset-4">{error}</p>}
          {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 font-bold leading-7 text-emerald-900">{message}</p>}
        </section>
        <aside className="space-y-5 pt-3 text-sm leading-8"><h2 className="text-lg font-bold">ببساطة، وبثقة.</h2><p>ثبّت المؤشر داخل الحقل ثم امسح بالقارئ. زر الإدخال يفحص الرمز ويعرض بيانات العميل.</p><p>قراءة الرمز لا تسجّل ختمًا. راجع بيانات العميل، ثم أكّد الشراء من زر التأكيد.</p><p>المكافأة تُصرف مرة واحدة، وتظهر شروطها وصلاحيتها قبل التأكيد.</p><Link href="/loyalty/rast" className="inline-flex min-h-12 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">صفحة عضوية راست</Link></aside>
      </div>
    </div>
  </main>;
}
