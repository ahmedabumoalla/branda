"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, ScanLine, RefreshCw, X } from "lucide-react";
import { issueFinanceLoyaltyCardAction, openFinanceLoyaltyReaderAction } from "@/app/actions/finance-loyalty-reader";
import { frenchReaderLabels } from "@/lib/finance/pos-french-reader";
import { CashierLanguageProvider } from "@/components/cashier/cashier-language";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";
import { useFinancePosLocale } from "./finance-pos-locale";
import styles from "./finance.module.css";
import s from "./finance-pos-loyalty-reader.module.css";

const frenchReader = { lang: "fr", labels: frenchReaderLabels };
const Reader = dynamic(() => import("@/components/rast-loyalty/rast-cashier").then(module => module.RastCashier), { loading: () => <ReaderLoading /> });
type Result = Awaited<ReturnType<typeof openFinanceLoyaltyReaderAction>>;
type Ready = Extract<Extract<Result, { ok: true }>["data"], { status: "ready" }>;

function ReaderLoading() {
  const { t } = useFinancePosLocale();
  return <p className={s.status} role="status"><Loader2 className={s.spinner} size={22} aria-hidden="true" />{t("جارٍ تجهيز قارئ الولاء", "Preparing loyalty reader")}</p>;
}

export function FinancePosLoyaltyReader({ slug }: { slug: string }) {
  const { t, language, dir, displayName } = useFinancePosLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!open || !dialog.current) return;
    const panel = dialog.current;
    const opener = trigger.current;
    panel.showModal();
    panel.querySelector<HTMLElement>("#rast-scan-code, #rast-scan-preview")?.focus({ preventScroll: true });
    const unlock = lockPageScroll();
    return () => { panel.close(); unlock(); opener?.focus({ preventScroll: true }); };
  }, [open]);

  async function load(confirmLoyaltySession = false) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true); setFailed(false); setLoginRequired(false);
    try {
      const result = await openFinanceLoyaltyReaderAction(slug, confirmLoyaltySession);
      if (!result.ok) { setReady(null); setFailed(true); }
      else if (result.data.status === "login_required") { setReady(null); setLoginRequired(true); }
      else setReady(result.data);
    } catch { setReady(null); setFailed(true); }
    finally { loadingRef.current = false; setLoading(false); }
  }

  return <>
    <button ref={trigger} type="button" className={styles.secondary} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(true); void load(); }}>
      <ScanLine size={18} aria-hidden="true" />{t("قراءة بطاقة ولاء", "Read loyalty card")}
    </button>
    <dialog ref={dialog} id={id} dir={dir} lang={language} className={s.dialog} aria-labelledby={`${id}-title`}
      onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); setOpen(false); }}
      onClose={event => { if (!event.currentTarget.open) setOpen(false); }}>
      <header className={s.header}>
        <h2 id={`${id}-title`}><ScanLine size={22} aria-hidden="true" />{t("قراءة بطاقة ولاء", "Read loyalty card")}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("إغلاق", "Close")}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className={s.content}>
        {loading && <ReaderLoading />}
        {!loading && failed && <div className={s.status} role="alert"><p>{t("تعذر فتح قارئ الولاء تحقق من اتصالك وصلاحية حسابك ثم أعد المحاولة", "Unable to open the loyalty reader Check your connection and account access, then retry")}</p><button type="button" className={styles.secondary} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />{t("إعادة المحاولة", "Retry")}</button></div>}
        {!loading && loginRequired && <div className={s.status}><p>{t("سجّل الدخول بحساب كاشير الولاء لهذه العلامة ثم عد إلى هذه النافذة", "Sign in with this brand’s loyalty cashier account, then return to this window")}</p><a className={styles.primary} href="/cashier/login" target="_blank" rel="noopener noreferrer">{t("دخول كاشير الولاء", "Loyalty cashier sign-in")}</a><button type="button" className={styles.secondary} onClick={() => void load(true)}><RefreshCw size={16} aria-hidden="true" />{t("متابعة بحساب كاشير الولاء", "Continue with the loyalty cashier account")}</button></div>}
        {ready && open && !loading && <p className={s.operator}>{t("موظف الولاء", "Loyalty cashier")}: {displayName(ready.console.cashier.fullName)}</p>}
        {ready?.canIssue && open && !loading && <FinanceLoyaltyIssue slug={slug} />}
        {ready && <CashierLanguageProvider initialLocale={language === "fr" ? "en" : language} fixedLocale={language === "fr" ? "en" : language} translation={language === "fr" ? frenchReader : undefined}>
          <Reader key={`${ready.console.cafe.id}:${ready.console.cashier.id}`} initialData={ready.console} identity={ready.identity} displayName={displayName} embedded active={open && !loading} />
        </CashierLanguageProvider>}
      </div>
    </dialog>
  </>;
}

function FinanceLoyaltyIssue({ slug }: { slug: string }) {
  const { t } = useFinancePosLocale();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cardCode, setCardCode] = useState("");
  const request = useRef<string | null>(null);
  const locked = useRef(false);
  return <details className={s.issue}><summary>{t("إصدار بطاقة ولاء للعميل", "Issue a customer loyalty card")}</summary>
    <form className={styles.form} onChange={() => { if (!locked.current) { request.current = null; setFeedback(""); setCardCode(""); } }} onSubmit={async event => {
      event.preventDefault(); if (locked.current) return;
      const fields = new FormData(event.currentTarget);
      locked.current = true; setBusy(true); setFeedback(""); setCardCode("");
      request.current ??= crypto.randomUUID();
      try {
        const result = await issueFinanceLoyaltyCardAction({ slug, requestId: request.current, name: String(fields.get("name") ?? ""), phone: String(fields.get("phone") ?? "") });
        if (!result.ok) setFeedback(result.message);
        else if (result.data.status === "pending") setFeedback(t("أرسل طلب إصدار البطاقة لمسؤول الموافقة بعد اعتماد الطلب اضغط إصدار مجددًا بنفس البيانات", "Card issuance is awaiting approval After approval submit again with the same details"));
        else { setCardCode(result.data.cardCode); setFeedback(result.data.returningCustomer ? t("بطاقة العميل موجودة وجاهزة للاستخدام", "The customer's card is already available") : t("أصدرت بطاقة العميل بنجاح", "Customer card issued successfully")); }
      } catch { setFeedback(t("تعذر إصدار البطاقة أعد المحاولة بنفس البيانات", "Unable to issue the card Retry with the same details")); }
      finally { locked.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} className={s.issueFields}>
        <label>{t("اسم العميل", "Customer name")}<input name="name" required minLength={2} maxLength={120} autoComplete="off" /></label>
        <label>{t("رقم جوال العميل", "Customer phone")}<input name="phone" required type="tel" inputMode="tel" maxLength={30} dir="ltr" autoComplete="off" /></label>
        <button className={styles.primary} type="submit">{busy ? t("جار تنفيذ الطلب", "Processing request") : t("إصدار بطاقة", "Issue card")}</button>
      </fieldset>
      {feedback && <p role="status" className={s.operator}>{feedback}{cardCode && <> <bdi dir="ltr">{cardCode}</bdi></>}</p>}
    </form>
  </details>;
}
