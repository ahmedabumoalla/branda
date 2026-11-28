"use client";

import { useEffect, useState } from "react";
import { signupActivationAction } from "@/app/actions/admin-signup-activation";
import s from "./brand-details.module.css";

export function BrandSignupActivation({ cafeId, disabled }: { cafeId: string; disabled: boolean }) {
  const [status, setStatus] = useState<"existing" | "pending" | "active" | "error" | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    signupActivationAction(cafeId, false).then(value => { if (mounted) setStatus(value); })
      .catch(() => { if (mounted) setStatus("error"); });
    return () => { mounted = false; };
  }, [cafeId]);
  if (status === "existing" || status === "loading") return null;
  if (status === "active") return <p role="status">حساب المالك مفعّل</p>;
  async function submit() {
    setBusy(true); setFailed(false);
    try { setStatus(await signupActivationAction(cafeId, status === "pending")); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <div>
    <p role="status">{status === "error" ? "تعذر تحميل حالة الحساب" : "الحساب بانتظار التفعيل ليتمكن المالك من الدخول"}</p>
    <button className={s.primaryButton} type="button" onClick={submit} disabled={disabled || busy}>
      {busy ? "جارٍ التحقق" : status === "error" ? "إعادة تحميل الحالة" : "تفعيل الحساب"}
    </button>
    {failed && <p role="alert">تعذر إكمال الطلب حاول مجددًا</p>}
  </div>;
}
