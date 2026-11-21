"use client";

import { useId, useRef, useState } from "react";
import { inspectPointsCardAction, redeemCashierPointsAction } from "@/app/actions/cashier-invoice-points";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import { pointsAttemptKey } from "@/lib/loyalty/points-attempt-key";
import type { PointsMilestone } from "@/lib/loyalty/points-program";
import { RastCameraScanner } from "./rast-camera-scanner";
import s from "./rast-cashier.module.css";

type Scope = { cafeId: string; cashierId: string };
type Card = Awaited<ReturnType<typeof inspectPointsCardAction>> & { storageKey: string };
type Selection = PointsMilestone & { expectedBalance: number; requestId: string };

export function CashierPointsRedemption({ scope, displayName }: { scope: Scope; displayName: (name: string) => string }) {
  const { t, locale } = useCashierLanguage();
  const inputId = useId();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [choice, setChoice] = useState<Selection | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);

  async function showCard(identifier: string) {
    const found = await inspectPointsCardAction(scope, identifier);
    const storageKey = await pointsAttemptKey(scope, found.code);
    const pending = sessionStorage.getItem(storageKey);
    setCard({ ...found, storageKey }); setUnconfirmed(!!pending);
    setChoice(pending ? JSON.parse(pending) as Selection : null);
  }

  async function lookup(identifier: string) {
    if (lock.current || !identifier.trim()) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await showCard(identifier); }
    catch { setError(t("تعذر عرض رصيد العميل تحقق من البطاقة أو رقم الجوال")); }
    finally { lock.current = false; setBusy(false); }
  }

  async function confirm() {
    if (!card || !choice || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      sessionStorage.setItem(card.storageKey, JSON.stringify(choice));
      setUnconfirmed(true);
      const result = await redeemCashierPointsAction({ scope, cardCode: card.code, requestId: choice.requestId,
        expectedBalance: choice.expectedBalance, cost: choice.points, reward: choice.reward });
      if (!result.ok && result.reason === "approval_pending") {
        setNotice(t("العملية بانتظار موافقة المسؤول أعد التأكيد بعد الموافقة")); return;
      }
      sessionStorage.removeItem(card.storageKey); setChoice(null); setUnconfirmed(false); setCard(null);
      if (!result.ok) {
        const reasons: Record<string, string> = {
          points_balance_changed: "تغير رصيد العميل راجع الرصيد قبل التأكيد مجددًا",
          insufficient_points: "الرصيد غير كافٍ لاستبدال هذه المكافأة",
          points_reward_changed: "تغيرت المكافأة أو تكلفتها راجع الخيارات المتاحة",
          points_mode_changed: "تغير نوع برنامج الولاء حدّث الصفحة",
          approval_rejected: "رفض المسؤول عملية استبدال النقاط",
        };
        setError(t(reasons[result.reason] ?? "تعذر استبدال النقاط تحقق من حالة البطاقة"));
        if (["points_balance_changed", "insufficient_points", "points_reward_changed"].includes(result.reason)) {
          try { await showCard(card.code); } catch { /* The cashier can search again. */ }
        }
        return;
      }
      setValue("");
      setNotice(t({
        text: result.replayed ? "الاستبدال مسجل مسبقًا تم صرف {reward} مقابل {cost} نقطة والرصيد بعد العملية {balance}"
          : "تم صرف {reward} مقابل {cost} نقطة والرصيد بعد العملية {balance}",
        values: { reward: result.reward, cost: number(result.pointsSpent), balance: number(result.pointsBalance) },
      }));
    } catch {
      setError(t("تعذر تأكيد الصرف أعد التأكيد للتحقق من نفس العملية"));
    } finally { lock.current = false; setBusy(false); }
  }

  return <>
    <h2 id="scan-heading" className={s.scanTitle}>{t("استبدال النقاط")}</h2>
    {!card ? <>
      <form className={s.scanForm} onSubmit={e => { e.preventDefault(); return lookup(value); }} aria-busy={busy}>
        <label htmlFor={inputId}>{t("رقم البطاقة أو رقم الجوال")}</label>
        <input id={inputId} className={s.pointsCardInput} dir="ltr" autoComplete="off" spellCheck={false}
          maxLength={500} value={value} onChange={e => { setValue(e.target.value); setNotice(""); setError(""); }} required disabled={busy} />
        <button type="submit" className={s.confirmButton} disabled={busy || !value.trim()}>{t("عرض الرصيد والمكافآت")}</button>
      </form>
      <RastCameraScanner disabled={busy} onDetected={code => { setValue(code); void lookup(code); }} />
    </> : <>
      <div className={s.previewTop}><h3>{displayName(card.customerName)}</h3><button type="button" disabled={busy} onClick={() => {
        setValue(""); setCard(null); setChoice(null); setUnconfirmed(false); setNotice(""); setError("");
      }}>{t("بحث جديد")}</button></div>
      <dl className={s.previewStats}><div><dt>{t("رصيد النقاط المتاح")}</dt><dd>{number(card.pointsBalance)}</dd></div></dl>
      {unconfirmed && choice ? <p role="status">{t({ text: "تحقق من نتيجة صرف {reward} مقابل {cost} نقطة قبل تسليم المكافأة", values: { reward: choice.reward, cost: number(choice.points) } })}</p>
        : card.affordableRewards.length ? <fieldset className={s.pointsChoices} disabled={busy}>
          <legend>{t("اختر المكافأة")}</legend>
          {card.affordableRewards.map(option => <label key={option.points}>
            <input type="radio" name={inputId + "-reward"} checked={choice?.points === option.points}
              onChange={() => { setChoice({ ...option, expectedBalance: card.pointsBalance, requestId: crypto.randomUUID() }); setError(""); }} />
            <span>{option.reward}</span><strong>{t({ text: "{cost} نقطة", values: { cost: number(option.points) } })}</strong>
          </label>)}
        </fieldset> : <p role="status">{t("الرصيد الحالي لا يكفي لأي مكافأة")}</p>}
      {choice && <>
        {!unconfirmed && <p className={s.scanHelp} aria-live="polite">{t({ text: "سيُخصم {cost} نقطة ويتبقى {balance} نقطة", values: {
          cost: number(choice.points), balance: number(choice.expectedBalance - choice.points),
        } })}</p>}
        <button type="button" className={s.confirmButton} disabled={busy} onClick={confirm}>{t(unconfirmed ? "إعادة تأكيد العملية" : "تأكيد خصم النقاط وصرف المكافأة")}</button>
      </>}
    </>}
    {notice && <p className={s.readFeedback} role="status">{notice}</p>}
    {error && <p className={s.readAlert} role="alert">{error}</p>}
  </>;
}
