"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Gift, Plus, Save } from "lucide-react";
import { saveCoffeePointsProgram } from "@/app/actions/coffee-points-program";
import type { PointsMilestone, PointsProgram } from "@/lib/loyalty/points-program";
import s from "@/components/rast-loyalty/rast-loyalty.module.css";
import styles from "./points-program-editor.module.css";

type Props = { saved: PointsProgram; draft: PointsProgram; onChange: (value: PointsProgram) => void; onSaved: (value: PointsProgram) => void };

export function PointsProgramEditor({ saved, draft, onChange, onSaved }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function change(patch: Partial<PointsProgram>) {
    setError(""); setNotice("");
    onChange({ ...draft, ...patch });
  }
  function changeMilestone(index: number, patch: Partial<PointsMilestone>) {
    change({ milestones: draft.milestones.map((tier, i) => i === index ? { ...tier, ...patch } : tier) });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveCoffeePointsProgram(draft.mode === "stamps" ? { ...saved, mode: "stamps" } : draft, saved);
      if (!result.ok) { setError(result.message); return; }
      onSaved(result.program);
      setNotice(result.program.mode === "points" ? "تم حفظ تسعيرة النقاط ومسار المكافآت" : "تم حفظ نظام الأختام");
      router.refresh();
    } catch { setError("تعذر تأكيد الحفظ حدّث الصفحة للتحقق من نظام البطاقة"); }
    finally { setBusy(false); }
  }

  return <form className={s.settingsForm} onSubmit={save} aria-busy={busy}>
    <fieldset disabled={busy} className={s.settingsFieldset}>
      <legend>نظام بطاقة الولاء</legend>
      <div className={s.settingsHeading}><div><Gift aria-hidden="true" /><h2>نظام بطاقة الولاء</h2></div></div>
      <div className={styles.choices} role="radiogroup" aria-label="طريقة كسب المكافآت">
        {(["stamps", "points"] as const).map(mode => <label key={mode} className={styles.choice}>
          <input type="radio" name="loyalty-mode" checked={draft.mode === mode} onChange={() => change({
            mode, milestones: mode === "points" && !draft.milestones.length
              ? [{ points: 200, reward: "قهوة" }, { points: 500, reward: "قهوة وحلا" }] : draft.milestones,
          })} />
          <span><strong>{mode === "stamps" ? "أختام" : "نقاط"}</strong><small>{mode === "stamps" ? "ختم لكل زيارة مؤهلة" : "نقاط حسب قيمة الفاتورة"}</small></span>
        </label>)}
      </div>

      {draft.mode === "points" && <>
        <h3 className={styles.title}>تسعيرة النقاط</h3>
        <div className={s.settingsGrid}>
          <label className={s.field}><span>المبلغ بالريال</span><input dir="ltr" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={draft.rateSar || ""} onChange={e => change({ rateSar: Number(e.target.value) })} /></label>
          <label className={s.field}><span>النقاط المقابلة</span><input dir="ltr" type="number" inputMode="numeric" min="1" max="1000000" step="1" required value={draft.rateQuantity || ""} onChange={e => change({ rateQuantity: Number(e.target.value) })} /></label>
        </div>
        <p className={s.hint}>تُضاف النقاط الكاملة لكل فاتورة بعد تقريب الكسر للأسفل</p>
        <h3 className={styles.title}>مراحل المكافآت</h3>
        <p className={s.sectionDescription}>حدّد تكلفة كل مكافأة بالنقاط من الأقل إلى الأعلى ويُخصم هذا العدد من رصيد العميل عند تأكيد الصرف</p>
        <ol className={styles.tiers}>{draft.milestones.map((tier, i) => <li key={i}>
          <label className={s.field}><span>تكلفة المكافأة بالنقاط</span><input aria-label={`تكلفة المرحلة ${i + 1}`} dir="ltr" type="number" inputMode="numeric" min={i ? draft.milestones[i - 1].points + 1 : 1} max="1000000000" step="1" required value={tier.points || ""} onChange={e => changeMilestone(i, { points: Number(e.target.value) })} /></label>
          <label className={s.field}><span>المكافأة</span><input aria-label={`مكافأة المرحلة ${i + 1}`} required maxLength={100} value={tier.reward} placeholder="اسم المكافأة" onChange={e => changeMilestone(i, { reward: e.target.value })} /></label>
          <button type="button" className={s.secondary} aria-label={`حذف المرحلة ${i + 1}`} onClick={() => change({ milestones: draft.milestones.filter((_, j) => j !== i) })}>حذف</button>
        </li>)}</ol>
        {draft.milestones.length < 20 && <button type="button" className={s.secondary} onClick={() => change({ milestones: [...draft.milestones, { points: 0, reward: "" }] })}><Plus aria-hidden="true" />إضافة مرحلة</button>}
      </>}

      <div className={styles.save}><button className={s.primary} type="submit" disabled={busy}><Save aria-hidden="true" />{busy ? "جارٍ الحفظ" : "حفظ نظام البطاقة"}</button></div>
      {error && <p className={s.error} role="alert">{error}</p>}
      {notice && <p className={s.success} role="status">{notice}</p>}
    </fieldset>
  </form>;
}
