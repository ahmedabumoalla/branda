"use client";

import { useId, useRef, useState } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { saveNearbyScheduleAction } from "@/app/actions/nearby-schedule";
import { emptyNearbySchedule, MAX_NEARBY_PERIODS, nearbyScheduleSchema, type NearbyPeriod, type NearbySchedule } from "@/lib/loyalty/nearby-schedule";
import s from "./nearby-schedule-editor.module.css";

export type NearbyScheduleEditorState = { schedule: NearbySchedule | null; error?: string };

export function NearbyScheduleEditor({ initial }: { initial: NearbyScheduleEditorState }) {
  const id = useId();
  const [schedule, setSchedule] = useState(initial.schedule ?? emptyNearbySchedule);
  const [saved, setSaved] = useState(initial.schedule ?? emptyNearbySchedule);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  const lock = useRef(false);
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved);
  const unavailable = Boolean(initial.error);

  function change(next: NearbySchedule) { setSchedule(next); setMessage(""); setError(""); setFieldErrors({}); }
  function update(periodId: string, values: Partial<NearbyPeriod>) {
    change({ ...schedule, periods: schedule.periods.map(period => period.id === periodId ? { ...period, ...values } : period) });
  }
  function add() {
    const start = schedule.periods.at(-1)?.end ?? "07:00";
    const end = `${String((Number(start.slice(0, 2)) + 1) % 24).padStart(2, "0")}:${start.slice(3)}`;
    change({ ...schedule, periods: [...schedule.periods, { id: crypto.randomUUID(), start, end, message: "" }] });
    requestAnimationFrame(() => { const inputs = regionRef.current?.querySelectorAll<HTMLInputElement>("[data-period] input[type=time]"); if (inputs) inputs[inputs.length - 2]?.focus(); });
  }
  async function save() {
    if (lock.current) return;
    setMessage(""); setError("");
    const parsed = nearbyScheduleSchema.safeParse(schedule);
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
      setError(parsed.error.issues[0].message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    lock.current = true; setBusy(true);
    try {
      const result = await saveNearbyScheduleAction(parsed.data);
      if (!result.ok) { setError(result.message); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      setSchedule(result.schedule); setSaved(result.schedule); setFieldErrors({});
      setMessage(result.schedule.enabled ? "تم حفظ الفترات تتبدل الرسالة يوميًا حسب الوقت المحدد" : "تم حفظ الفترات وإيقاف تحديد الأوقات تُستخدم رسالة القرب الافتراضية");
    } catch { setError("تعذر حفظ الفترات حاول مرة أخرى"); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section ref={regionRef} className={s.editor} aria-labelledby={`${id}-title`} aria-busy={busy} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (!busy && !unavailable && dirty) void save(); } }}>
    <div className={s.heading}><h3 id={`${id}-title`}><Clock3 aria-hidden="true" />تحديد فترات</h3><span>بتوقيت السعودية</span></div>
    <p className={s.hint}>خصص رسالة لكل فترة تتكرر يوميًا وتُستخدم رسالة القرب الافتراضية خارج الفترات المحددة</p>
    {initial.error && <p role="alert" className={s.error}>{initial.error}</p>}
    <fieldset disabled={busy || unavailable} className={s.fields}>
      <legend className={s.srOnly}>فترات رسائل القرب</legend>
      <label className={s.toggle}><input type="checkbox" checked={schedule.enabled} onChange={event => change({ ...schedule, enabled: event.target.checked })} /><span>تفعيل تحديد الفترات</span></label>
      {!schedule.periods.length && <p className={s.empty}>أضف أول فترة وحدد وقتها ورسالتها</p>}
      {schedule.periods.map((period, index) => <div key={period.id} data-period className={s.period}>
        <div className={s.periodHeading}><strong>الفترة {index + 1}</strong><button type="button" className={s.remove} aria-label={`حذف الفترة ${index + 1}`} onClick={() => change({ ...schedule, periods: schedule.periods.filter(item => item.id !== period.id) })}><Trash2 aria-hidden="true" /><span>حذف</span></button></div>
        <div className={s.times}>{(["start", "end"] as const).map(key => {
          const fieldError = fieldErrors[`periods.${index}.${key}`];
          const fieldId = `${id}-${period.id}-${key}`;
          return <label key={key} className={s.field}><span>{key === "start" ? "من الساعة" : "إلى الساعة"}</span><input id={fieldId} type="time" step={60} dir="ltr" value={period[key]} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? `${fieldId}-error` : undefined} onChange={event => update(period.id, { [key]: event.target.value })} />{fieldError && <small id={`${fieldId}-error`} className={s.error}>{fieldError}</small>}</label>;
        })}</div>
        {period.end < period.start && <p className={s.hint}>تنتهي هذه الفترة في اليوم التالي</p>}
        <label className={s.field}><span>رسالة الفترة</span><textarea rows={2} maxLength={240} value={period.message} aria-invalid={Boolean(fieldErrors[`periods.${index}.message`])} aria-describedby={fieldErrors[`periods.${index}.message`] ? `${id}-${period.id}-message-error` : undefined} onChange={event => update(period.id, { message: event.target.value })} placeholder="اكتب رسالة القرب لهذه الفترة" /><small>{period.message.length} / ٢٤٠</small>{fieldErrors[`periods.${index}.message`] && <small id={`${id}-${period.id}-message-error`} className={s.error}>{fieldErrors[`periods.${index}.message`]}</small>}</label>
      </div>)}
      <button type="button" className={s.add} onClick={add} disabled={schedule.periods.length >= MAX_NEARBY_PERIODS}><Plus aria-hidden="true" />إضافة فترة</button>
      <p className={s.hint}>حتى ٤٨ فترة دون تداخل ويمكن أن تمتد الفترة بعد منتصف الليل</p>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className={s.error}>{error}</p>}
      {message && <p role="status" className={s.success}>{message}</p>}
      <div className={s.footer}><button type="button" className={s.save} disabled={!dirty} onClick={() => void save()}>{busy ? "جاري حفظ الفترات" : "حفظ الفترات"}</button><span>{dirty ? "توجد تغييرات لم تُحفظ في الفترات" : "تُحفظ الفترات بشكل مستقل عن إعدادات المكافأة"}</span></div>
    </fieldset>
    <p className={s.hint}>تبديل الرسالة قد يتأخر إلى أن تتحدث البطاقة على جهاز العميل أبل يدعم نص القرب المخصص وقوقل يعرض الرسالة داخل تفاصيل البطاقة ويتحكم بنص تنبيه القرب</p>
  </section>;
}
