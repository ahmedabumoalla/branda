"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { BadgeCheck, Gift, LogOut, ScanLine, Search, Phone } from "lucide-react";
import { lookupCashierLoyaltyPhoneAction } from "@/app/actions/cashier-loyalty-phone";
import { lookupRastCashierCardAction, lookupRastCashierRewardAction, scanLoyaltyExperienceAction } from "@/app/actions/loyalty-experience";
import { logoutCashierAction } from "@/app/actions/cashier";
import type { CashierConsole } from "@/lib/data/cashier";
import type { CashierRewardPreview } from "@/lib/data/customer-rewards";
import { RastCameraScanner } from "./rast-camera-scanner";
import { createRastScanSession, type RastScanPreview } from "./scan-session";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { loyaltyTheme } from "./loyalty-theme";
import { RastBrand } from "./rast-brand";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import { localizedText, type CashierMessage } from "@/lib/cashier/language";
import layout from "./rast-cashier.module.css";

export function RastCashierEmptyRewards() {
  const { t } = useCashierLanguage();
  return <p role="status" className="mt-5 rounded-xl border border-[var(--cashier-ink)]/20 bg-white/70 p-4 text-sm leading-7">{t("لا توجد مكافآت حالية للصرف")}</p>;
}

export function RastCashierRewardDetails({ reward }: { reward: CashierRewardPreview }) {
  const { t, locale } = useCashierLanguage();
  const content = (key: string, source: string) => localizedText(locale, source, reward.catalog?.fields[key]);
  const raw = reward.metadata?.termsSnapshot;
  const terms = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const discount = terms.rewardKind === "discount" && typeof terms.discountPercent === "number" ? terms.discountPercent : null;
  const product = terms.rewardKind === "product" && typeof terms.rewardProductName === "string" ? terms.rewardProductName : null;
  return <div className="mt-3 space-y-2 text-sm leading-7">
    {discount ? <p className="text-lg font-bold">{t({ text: "خصم {percent}% وفق شروط المكافأة", values: { percent: discount } })}</p> : null}
    {product ? <p className="font-bold">{t("المنتج المستحق:")} {content("product", product)}</p> : null}
    {reward.rewardDescription ? <p className="whitespace-pre-line">{content("description", reward.rewardDescription)}</p> : null}
    {typeof terms.terms === "string" && terms.terms && terms.terms !== reward.rewardDescription ? <p className="whitespace-pre-line">{content("terms", terms.terms)}</p> : null}
    {discount ? <p>{t("طبّق النسبة على الفاتورة وفق الشروط ثم أكّد صرف المكافأة")} </p> : null}
  </div>;
}

export function RastCashier({ initialData, identity: suppliedIdentity }: { initialData: CashierConsole; identity?: LoyaltyIdentity }) {
  const { t, errorText, locale, dir } = useCashierLanguage();
  const identity = suppliedIdentity ?? { name: initialData.cafe.name, slug: initialData.cafe.slug, logoUrl: null };
  const [kind, setKind] = useState<"stamp" | "redeem">("stamp");
  const [value, setValue] = useState("");
  const [lookupMethod, setLookupMethod] = useState<"code" | "phone">("code");
  const resolvedCode = useRef("");
  const processing = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [noRewards, setNoRewards] = useState(false);
  const [message, setMessage] = useState<CashierMessage>("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [preview, setPreview] = useState<RastScanPreview | null>(null);
  const [session] = useState(() => createRastScanSession({ lookupCard: lookupRastCashierCardAction, lookupReward: lookupRastCashierRewardAction, commit: scanLoyaltyExperienceAction, createRequestId: () => crypto.randomUUID() }));
  const input = useRef<HTMLInputElement>(null);
  const focusInputAfterScan = useRef(false);
  const previewElement = useRef<HTMLElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (preview) previewElement.current?.focus(); }, [preview]);
  useEffect(() => { if (error) errorElement.current?.focus(); }, [error]);
  useEffect(() => { if (!pending && focusInputAfterScan.current) { focusInputAfterScan.current = false; input.current?.focus(); } }, [pending]);
  function updateCode(code: string) { if (processing.current || session.busy) return; resolvedCode.current = ""; session.invalidate(); setValue(code); setPreview(null); setMessage(""); setError(""); setNoRewards(false); }
  function detectCode(code: string) { if (session.busy) return; updateCode(code); setMessage("تمت قراءة الرمز اضغط فحص لعرض بيانات العميل قبل التأكيد"); input.current?.focus(); }
  async function processScan(confirm = false) {
    if (processing.current || session.busy || !value.trim()) return;
    processing.current = true;
    setPending(true); setError(""); setMessage(""); setNoRewards(false);
    try {
      if (!confirm) {
        setPreview(null);
        let code = value;
        if (lookupMethod === "phone") {
          const found = await lookupCashierLoyaltyPhoneAction(value);
          if (!found.ok) throw new Error(found.message);
          code = found.cardCode;
        }
        resolvedCode.current = code;
        const next = await session.inspect(kind, code);
        setPreview(next); setNoRewards(kind === "redeem" && next === null); return;
      }
      const result = await session.confirm(kind, lookupMethod === "phone" ? resolvedCode.current : value);
      if (!result) return;
      setPreview(session.preview);
      const status = String(result.status ?? "");
      if (["stamped", "reward_issued", "redeemed"].includes(status)) {
        const reward = preview?.kind === "redeem" ? preview.reward : null;
        const customer = result.customerName ? String(result.customerName) : { ar: "العميل", en: "Customer" };
        setMessage(result.replayed ? "هذه العملية مسجلة سابقًا؛ لم تتكرر إضافة الختم أو صرف المكافأة" : status === "redeemed"
          ? { text: "تم صرف {reward} بنجاح", values: { reward: reward?.catalog?.fields.title ?? { ar: reward?.rewardTitle ?? "المكافأة", en: "Reward" } } }
          : status === "reward_issued" ? { text: "اكتملت البطاقة! استحق {name} مكافأته", values: { name: customer } }
          : { text: "تم تسجيل الختم رصيد {name}: {stamps} من {required}", values: { name: customer, stamps: Number(result.stampsInCycle), required: Number(result.purchasesRequired) } });
        focusInputAfterScan.current = true; setValue(""); setPreview(null);
      } else {
        const errors: Record<string, string> = { recent_scan: "تم تسجيل ختم قريبًا لهذه البطاقة انتظر قبل عملية جديدة", cooldown: "تم تسجيل ختم قريبًا لهذه البطاقة انتظر قبل عملية جديدة", already_redeemed: "هذه المكافأة مصروفة سابقًا", expired: "انتهت صلاحية المكافأة", inactive: "البطاقة غير نشطة", invalid: "الرمز غير صالح أو لا يتبع هذه العلامة", duplicate: "هذه العملية مسجلة بالفعل", reward_unavailable: "المكافأة المحددة صُرفت أو لم تعد متاحة أعد فحص البطاقة؛ لم تُصرف مكافأة أخرى", card_unavailable: "البطاقة أو حساب العميل غير نشط", session_invalid: "انتهت جلسة الكاشير سجّل الدخول من جديد", program_disabled: "برنامج الولاء موقوف حاليًا", request_conflict: "بيانات العملية لا تطابق الطلب السابق أعد فحص الرمز", invalid_code: "الرمز غير صالح أعد فحص البطاقة", operation_failed: "لم تُسجل العملية أعد فحص الرمز وحاول مرة أخرى" };
        setError(errors[status] ?? "لم تسجل العملية تحقق من البطاقة وصلاحية البرنامج");
      }
    } catch (cause) { if (confirm) setPreview(session.preview); setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : "تعذر إتمام العملية يمكنك إعادة المحاولة بأمان"); }
    finally { processing.current = false; setCheckedAt(Date.now()); setPending(false); }
  }
  const reward = preview?.kind === "redeem" ? preview.reward : null;
  const expiry = reward?.expiresAt ? new Date(reward.expiresAt) : null;
  const validExpiry = expiry && Number.isFinite(expiry.getTime()) ? expiry : null;
  const remainingText = !validExpiry ? t("بدون تاريخ انتهاء") : validExpiry.getTime() <= checkedAt ? t("انتهت") : t({ text: "باقي {days} يوم", values: { days: Math.ceil((validExpiry.getTime() - checkedAt) / 86_400_000) } });
  const catalog = preview?.kind === "stamp" ? preview.card.catalog : preview?.reward.catalog;
  const canRedeem = preview?.retryPending || (reward?.canRedeem && (!validExpiry || validExpiry.getTime() > checkedAt));
  return <main dir={dir} lang={locale} style={{ "--cashier-ink": "#561C2B", "--cashier-paper": "#F5F0E7", "--cashier-button-text": "#FFF6E7", ...loyaltyTheme(identity) } as CSSProperties} className={layout.page}>
    <div className={layout.frame}>
      <header className={layout.header}>
        <div className={layout.identity}>{identity.slug === "rast" ? <p className="text-xs tracking-widest" dir="ltr">KAWAKIB · LOYALTY</p> : <RastBrand identity={identity} locale={locale} />}<h1 className="sr-only">{t("كل زيارة تستاهل")}</h1></div>
        <div className={layout.tools}>
        <CashierLanguageSwitch />
        {initialData.cashier.canUsePager ? <Link href="/pager" className="inline-flex min-h-11 items-center rounded-xl border border-current px-4 text-sm font-bold">{t("نظام البيجر")} </Link> : null}
            <form action={logoutCashierAction}><button disabled={pending} aria-label={t("تسجيل الخروج")} title={t("تسجيل الخروج")} className={layout.logout}><LogOut size={18} aria-hidden="true" /><span className={layout.logoutLabel}>{t("تسجيل الخروج")}</span></button></form>
        </div>
      <p className={layout.greeting}>{t({ text: "أهلًا {name} هنا تسجّل الأختام وتصرف المكافآت", values: { name: initialData.cashier.fullName } })}</p>
      </header>
      <div className={layout.body}>
        <section aria-labelledby="scan-heading" className={layout.scanPanel}>
          <div className={layout.tabs} role="group" aria-label={t("نوع العملية")}>
            {([{ id: "stamp", title: t("تسجيل ختم"), icon: BadgeCheck }, { id: "redeem", title: t("صرف مكافأة"), icon: Gift }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={kind === tab.id} disabled={pending} onClick={() => { if (processing.current || session.busy) return; setKind(tab.id); updateCode(""); }} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 ${kind === tab.id ? "bg-[var(--cashier-ink)] text-[var(--cashier-button-text)]" : "border border-[var(--cashier-ink)]/20"}`}><tab.icon size={19} aria-hidden="true" />{tab.title}</button>)}
          </div>
          <h2 id="scan-heading" className={layout.scanTitle}>{kind === "stamp" ? t("اقرأ بطاقة العميل") : t("افحص مكافأة العميل")}</h2>
          <p id="rast-scan-help" className={layout.scanHelp}>{lookupMethod === "phone" ? t("ابحث برقم الجوال المسجل في بطاقة الولاء ثم راجع بيانات العميل قبل التأكيد") : kind === "stamp" ? t("افحص البطاقة وراجع اسم العميل ورصيده بعد التأكد من الشراء أكّد تسجيل ختم واحد") : t("اقرأ بطاقة العميل أو رمز المكافأة ستظهر المكافأة الأقرب لانتهاء الصلاحية؛ راجع اسم العميل وشروطها قبل تأكيد صرف مكافأة واحدة")}</p>
          <div className={layout.lookupMethods} role="group" aria-label={t("طريقة البحث عن العميل")}>
            {([{ id: "code", label: t("البطاقة أو الباركود"), icon: ScanLine }, { id: "phone", label: t("رقم الجوال"), icon: Phone }] as const).map(method => <button key={method.id} type="button" disabled={pending} aria-pressed={lookupMethod === method.id} onClick={() => { if (processing.current || session.busy) return; updateCode(""); setLookupMethod(method.id); }}><method.icon size={16} aria-hidden="true" />{method.label}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void processScan(); }} className={layout.scanForm} aria-busy={pending}>
            <label htmlFor="rast-scan-code" className="block text-sm font-bold">{lookupMethod === "phone" ? t("رقم جوال العميل") : kind === "stamp" ? t("رمز بطاقة الولاء") : t("رمز البطاقة أو المكافأة")}</label>
            <input id="rast-scan-code" ref={input} dir="ltr" type={lookupMethod === "phone" ? "tel" : "text"} inputMode={lookupMethod === "phone" ? "tel" : "text"} value={value} disabled={pending} onChange={(event) => updateCode(event.target.value)} aria-describedby="rast-scan-help" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={lookupMethod === "phone" ? 30 : 500} placeholder={lookupMethod === "phone" ? "05xxxxxxxx" : t("امسح بالقارئ أو أدخل الرمز")} className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--cashier-ink)]/30 bg-white px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cashier-ink)]" />
            <button type="submit" disabled={pending || !value.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cashier-ink)] px-4 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">{lookupMethod === "phone" ? <Search size={19} aria-hidden="true" /> : <ScanLine size={19} aria-hidden="true" />}{pending ? t("جاري التحقق") : lookupMethod === "phone" ? t("البحث عن العميل") : kind === "stamp" ? t("فحص بطاقة العميل") : t("فحص المكافأة")}</button>
          </form>
          {lookupMethod === "code" && <RastCameraScanner key={kind} disabled={pending} onDetected={detectCode} />}
          {preview && <section ref={previewElement} tabIndex={-1} className="mt-6 rounded-2xl border border-[var(--cashier-ink)]/25 p-5 focus-visible:outline-2 focus-visible:outline-offset-4" aria-labelledby="rast-scan-preview">
            {catalog && <p className="mb-3 text-xs leading-6 opacity-75" role={catalog.unavailable ? "status" : undefined}>{t(catalog.unavailable ? "تعذرت ترجمة بعض التفاصيل يُعرض النص الأصلي أعد الفحص للمحاولة مجددًا" : "ترجمة تلقائية لتفاصيل المكافأة")}</p>}
            {preview.retryPending && <p role="status" className="mb-4 text-sm leading-7">{t("لم يصل تأكيد العملية السابقة أعد التأكيد للتحقق من نتيجتها بأمان؛ لن يتم اختيار مكافأة أخرى أو تكرار الصرف لا تسلّم المكافأة مرة أخرى إذا سبق تسليمها")} </p>}
            <p className="text-xs">{preview.kind === "stamp" ? t("بطاقة العميل") : t("مكافأة العميل")}</p><h3 id="rast-scan-preview" className="mt-2 break-words text-xl font-bold">{preview.kind === "stamp" ? preview.card.customerName : preview.reward.customerName}</h3><p dir="ltr" className="mt-2 break-all text-left text-xs opacity-70">{preview.value}</p>
            {preview.kind === "stamp" ? <><dl className="my-5 grid grid-cols-2 gap-4 text-sm"><div><dt>{t("رصيد الأختام")} </dt><dd className="mt-1 text-xl font-bold">{preview.card.stampsInCycle} / {preview.card.purchasesRequired}</dd></div><div><dt>{t("المكافآت المتاحة")} </dt><dd className="mt-1 text-xl font-bold">{preview.card.availableRewards}</dd></div></dl><p className="text-sm leading-7">{t("المكافأة عند الاكتمال:")} {localizedText(locale, preview.card.rewardName, preview.card.catalog?.fields.rewardName)}</p><button type="button" disabled={pending} onClick={() => void processScan(true)} className="mt-5 min-h-12 w-full rounded-xl bg-[var(--cashier-ink)] p-3 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">{t("تأكيد الشراء وتسجيل ختم واحد")} </button></> : <><h4 className="mt-5 text-lg font-bold">{localizedText(locale, preview.reward.rewardTitle, preview.reward.catalog?.fields.title)}</h4><RastCashierRewardDetails reward={preview.reward} /><p className="mt-4 font-bold">{remainingText}</p>{validExpiry && <time className="mt-1 block text-sm" dateTime={validExpiry.toISOString()}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(validExpiry)}</time>}{canRedeem ? <button type="button" disabled={pending} onClick={() => void processScan(true)} className="mt-5 min-h-12 w-full rounded-xl bg-[var(--cashier-ink)] p-3 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">{t("تأكيد تسليم المكافأة وصرفها")} </button> : <p role="alert" className="mt-4 font-bold">{preview.reward.invalidReason ? errorText(preview.reward.invalidReason) : t("انتهت صلاحية المكافأة")}</p>}</>}
          </section>}
          {noRewards && <RastCashierEmptyRewards />}
          {error && <p ref={errorElement} tabIndex={-1} role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-900 focus-visible:outline-2 focus-visible:outline-offset-4">{errorText(error)}</p>}
          {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 font-bold leading-7 text-emerald-900">{t(message)}</p>}
        </section>
        <details className={layout.guide}><summary>{t("ببساطة وبثقة")}</summary><div className={layout.guideContent}><p>{t("ثبّت المؤشر داخل الحقل ثم امسح بالقارئ زر الإدخال يفحص الرمز ويعرض بيانات العميل")} </p><p>{t("قراءة الرمز لا تسجّل ختمًا راجع بيانات العميل ثم أكّد الشراء من زر التأكيد")} </p><p>{t("المكافأة تُصرف مرة واحدة وتظهر شروطها وصلاحيتها قبل التأكيد")} </p><Link href={`/loyalty/${identity.slug}`} className="inline-flex min-h-12 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{t("صفحة عضوية")} {locale === "en" ? identity.nameEn || identity.name : identity.name}</Link></div></details>
      </div>
    </div>
  </main>;
}
