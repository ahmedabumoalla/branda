"use client";
import { useRef, useState } from "react";
import { BarcodeCameraScanner } from "./barcode-camera-scanner";
import { scanLoyaltyExperienceAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import s from "./brand-loyalty.module.css";

export function LoyaltyScanner({ identity, employee }: { identity: LoyaltyIdentity; employee: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<{ value: string; requestId: string; kind: "stamp" | "redeem" } | null>(null);
  const lock = useRef(false);
  async function scan(value: string, kind: "stamp" | "redeem", requestId = crypto.randomUUID()) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("جاري التحقق من البطاقة..."); setRetry(null);
    try {
      const result = await scanLoyaltyExperienceAction({ value, kind, requestId });
      const status = String(result.status);
      setMessage(status === "stamped" ? `انضاف ختم ${result.customerName ?? "العميل"}. ${result.stampsInCycle} من ${result.purchasesRequired} أختام.`
        : status === "reward_issued" ? `اكتملت أختام ${result.customerName ?? "العميل"}! صدرت مكافأة ${result.rewardName ?? "الولاء"}، وباركودها ظاهر في عضويته.`
        : status === "redeemed" ? `تم صرف ${result.rewardName ?? "المكافأة"} بنجاح.`
        : status === "cooldown" ? `انحسب الختم قبل لحظات. انتظر ${result.retryAfterSeconds ?? 15} ثانية قبل قراءة أخرى.`
        : status === "expired" ? "انتهت صلاحية هذه المكافأة."
        : status === "already_redeemed" ? "هذه المكافأة صُرفت مسبقًا."
        : "تعذر قبول البطاقة. تحقق أنها تخص هذه العلامة وأنها فعّالة.");
    } catch {
      setRetry({ value, kind, requestId });
      setMessage("لم نتمكن من تأكيد النتيجة. أعد المحاولة من الزر أدناه؛ لن يُحسب الختم مرتين.");
    } finally { lock.current = false; setBusy(false); }
  }
  return <main className={s.page} dir="rtl"><div className={s.scanner}>
    <header className={s.masthead}>{identity.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={identity.logoUrl} alt={identity.name} /> : <span>{identity.name}</span>}<span>{employee}</span></header>
    <p className={s.eyebrow} style={{ marginTop: 36 }}>زيارة تستاهل ختم</p><h1>قراءة بطاقات الولاء</h1><p>ختم واحد لكل قراءة. المكافأة تُصرف بباركودها الخاص.</p>
    <div className={s.scannerActions} aria-busy={busy}>
      <section><h2>إضافة ختم</h2>{!busy && <BarcodeCameraScanner label="اقرأ بطاقة العميل" expectedKind="loyalty-card" onDetected={(value) => void scan(value, "stamp")} />}</section>
      <section><h2>صرف مكافأة</h2>{!busy && <BarcodeCameraScanner label="اقرأ باركود المكافأة" expectedKind="customer-reward" onDetected={(value) => void scan(value, "redeem")} />}</section>
    </div>
    {message && <p className={s.status} role="status">{message}</p>}
    {retry && <button className={s.button} type="button" disabled={busy} onClick={() => void scan(retry.value, retry.kind, retry.requestId)}>إعادة تأكيد العملية</button>}
    <form action="/loyalty/scan/logout" method="post"><button className={s.textButton}>تسجيل الخروج</button></form>
  </div></main>;
}
