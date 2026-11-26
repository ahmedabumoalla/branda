"use client";

import { useState } from "react";
import { getStampInactivitySettings } from "@/app/actions/stamp-inactivity";
import s from "@/components/rast-loyalty/rast-loyalty.module.css";

export function StampInactivityEditor({ initial }: { initial: Awaited<ReturnType<typeof getStampInactivitySettings>> }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial.ok && initial.days !== null ? String(initial.days) : "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  if (!saved.ok) return <p role="alert">{saved.message}</p>;
  return <form className={s.settingsForm} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const digits = value.trim().replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 1776));
    const days = digits ? Number(digits) : null;
    if (days !== null && (!/^\d+$/.test(digits) || days < 1 || days > 3650)) {
      setError("أدخل عدد أيام صحيحًا من ١ إلى ٣٦٥٠"); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await getStampInactivitySettings(days, saved.revision);
      if (!next.ok) { setError(next.message); return; }
      setSaved(next); setValue(next.days === null ? "" : String(next.days));
      setNotice(next.days === null ? "تم إيقاف التصفير التلقائي" : "تم حفظ مدة الانقطاع");
    } catch { setError("تعذر حفظ مدة الانقطاع حاول مجددًا"); }
    finally { setBusy(false); }
  }}>
    <fieldset className={s.settingsFieldset} disabled={busy}>
      <legend>تصفير الأختام بعد الانقطاع</legend>
      <h2 className="text-lg font-bold">تصفير الأختام بعد الانقطاع</h2>
      <p id="inactivity-help" className={s.sectionDescription}>تُحسب المدة من آخر ختم للعميل وتشمل البطاقات الحالية عند الحفظ وتبقى المكافآت المكتسبة محفوظة</p>
      <label className="my-3 grid max-w-sm gap-1">مدة الانقطاع بالأيام
        <input className="rounded-lg border px-3 py-2" inputMode="numeric" value={value} maxLength={5} aria-describedby="inactivity-help inactivity-off"
          placeholder="غير مفعّل" onChange={event => { setValue(event.target.value); setNotice(""); setError(""); }} />
      </label>
      <p id="inactivity-off" className={s.hint}>اترك المدة فارغة لإيقاف التصفير</p>
      <button className={s.secondary} type="submit">{busy ? "جار الحفظ" : "حفظ مدة الانقطاع"}</button>
      {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    </fieldset>
  </form>;
}
