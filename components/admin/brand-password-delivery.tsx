"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Send } from "lucide-react";
import {
  fetchAdminBrandPasswordDeliveryAction,
  requestAdminBrandPasswordDeliveryAction,
} from "@/app/actions/admin-brand-password-delivery";
import type { BrandPasswordDeliveryStatus } from "@/lib/data/brand-password-delivery";
import s from "./brand-onboarding.module.css";

const laneNames = {
  notifications: "رقم برندة للتواصل والإشعارات",
  primary: "الرقم الأساسي",
  standby: "الرقم الاحتياطي",
};

function describe(status: BrandPasswordDeliveryStatus) {
  const sender = laneNames[status.lane];
  const attempt = `المحاولة ${status.attempt} من 3`;
  switch (status.state) {
    case "queued": return `بانتظار الإرسال من ${sender} · ${attempt}`;
    case "sending": return `جارٍ الإرسال من ${sender} · ${attempt}`;
    case "sent": return `قَبِل مزود واتساب الرسالة من ${sender} وفُعّلت كلمة المرور الجديدة`;
    case "failed": return "تعذر إكمال الطلب وتبقى كلمة المرور الحالية سارية";
    case "uncertain": return "لم يتأكد قبول الرسالة فتوقفت المحاولات وتبقى كلمة المرور الحالية سارية";
    case "cancelled": return "أُلغي الطلب وتبقى كلمة المرور الحالية سارية";
  }
}

export function BrandPasswordDelivery({ cafeId, disabled }: { cafeId: string; disabled: boolean }) {
  const [status, setStatus] = useState<BrandPasswordDeliveryStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [readError, setReadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef<string | null>(null);
  const posting = useRef(false);
  const active = status?.state === "queued" || status?.state === "sending";

  useEffect(() => {
    if (submitting) return;
    let cancelled = false;
    let timer: number | undefined;
    async function read() {
      try {
        const result = await fetchAdminBrandPasswordDeliveryAction(cafeId);
        if (cancelled || posting.current) return;
        if (!result.ok) { setReadError(result.message); return; }
        setStatus(result.data);
        setReady(true);
        setReadError("");
        const inProgress = result.data?.state === "queued" || result.data?.state === "sending";
        if (requestId.current && (result.data?.id === requestId.current || inProgress)) {
          requestId.current = null;
          setConfirming(false);
          setSubmitError("");
        }
        if (inProgress) {
          timer = window.setTimeout(read, 15_000);
        }
      } catch {
        if (!cancelled && !posting.current) setReadError("تعذر الاتصال لتحديث حالة الإرسال");
      }
    }
    void read();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [cafeId, submitting, refresh]);

  async function send() {
    if (posting.current || !ready || !confirming || disabled || active || readError) return;
    posting.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      // Reuse this key if the action committed but its response was lost.
      requestId.current ??= crypto.randomUUID();
      const result = await requestAdminBrandPasswordDeliveryAction(cafeId, requestId.current);
      if (!result.ok) { setSubmitError(result.message); return; }
      setStatus(result.data);
      setConfirming(false);
      requestId.current = null;
    } catch {
      setSubmitError("انقطع الاتصال أثناء تسجيل الطلب تحقّق من حالة الإرسال");
    } finally {
      posting.current = false;
      setSubmitting(false);
    }
  }

  return <section className={s.welcome} aria-label="كلمة مرور المالك">
    <h3><KeyRound size={19} aria-hidden="true" />كلمة مرور المالك</h3>
    <p>تُرسل كلمة المرور الجديدة إلى واتساب جوال الدخول الموثّق للمالك</p>
    {status && <p className={s.note} role="status">{describe(status)}</p>}
    {readError && <p className={s.error} role="alert">{readError}</p>}
    {submitError && <p className={s.error} role="alert">{submitError}</p>}
    {confirming && !active && <p>هل تريد استبدال كلمة مرور المالك وإرسال الجديدة عبر واتساب؟</p>}
    <div className={s.actions}>
      {!active && <button type="button" className={s.primary} disabled={disabled || !ready || submitting || !!readError}
        onClick={() => { if (confirming) void send(); else { setConfirming(true); setSubmitError(""); } }}>
        <Send size={16} aria-hidden="true" />
        {submitting ? "جارٍ تسجيل الطلب" : confirming ? "تأكيد وإرسال" : "إنشاء كلمة مرور جديدة وإرسالها"}
      </button>}
      {confirming && !active && <button type="button" className={s.secondary} disabled={submitting} onClick={() => setConfirming(false)}>إلغاء</button>}
      {(status || readError || submitError) && <button type="button" className={s.secondary} disabled={submitting} onClick={() => setRefresh(n => n + 1)}>تحديث حالة الإرسال</button>}
    </div>
  </section>;
}
