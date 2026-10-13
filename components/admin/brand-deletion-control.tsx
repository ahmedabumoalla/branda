"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { deleteBrandPermanentlyAction, retryBrandDeletionCleanupAction } from "@/app/actions/brand-deletion";
import type { BrandDeletionResult, PendingBrandDeletion } from "@/lib/data/brand-deletion";
import s from "./brand-deletion.module.css";

export function BrandDeletionControl({ cafeId, name, slug, disabled, onBusyChange, onDeleted }: {
  cafeId: string; name: string; slug: string; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onDeleted: (result: BrandDeletionResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const fieldId = useId();
  const descriptionId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || disabled || confirmation !== slug) return;
    inFlight.current = true;
    setPending(true);
    onBusyChange(true);
    setError("");
    try {
      const result = await deleteBrandPermanentlyAction(cafeId, confirmation);
      if (result.ok) { onDeleted(result.data); return; }
      setError(result.message);
    } catch {
      setError("انقطع الاتصال تحقق من قائمة العلامات قبل إعادة المحاولة");
    } finally {
      inFlight.current = false;
      setPending(false);
      onBusyChange(false);
    }
  }

  return <section className={s.zone} aria-label="الحذف النهائي للعلامة">
    <div className={s.heading}><AlertTriangle size={21} aria-hidden="true" /><div><h3>حذف العلامة نهائيًا</h3><p>إزالة العلامة وبياناتها بشكل دائم</p></div></div>
    {!expanded ? <button type="button" className={s.danger} disabled={disabled} onClick={() => setExpanded(true)}><Trash2 size={17} aria-hidden="true" />حذف العلامة نهائيًا</button> :
      <form onSubmit={submit} aria-busy={pending}>
        <p id={descriptionId} className={s.warning}>سيتم حذف <strong>{name}</strong> ومنيوها ومنتجاتها وملفاتها واشتراكاتها وسجلات الطلبات والولاء والعملاء المرتبطة بها نهائيًا ولا يمكن التراجع عن ذلك</p>
        <p className={s.note}>حسابات الدخول الشخصية وبيانات العلامات الأخرى تبقى محفوظة</p>
        <label htmlFor={fieldId}>اكتب الرابط المختصر لتأكيد الحذف <bdi className={s.slug}>{slug}</bdi></label>
        <input id={fieldId} dir="ltr" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} autoComplete="off" spellCheck={false} aria-describedby={descriptionId} autoFocus />
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.actions}>
          <button type="submit" className={s.danger} disabled={pending || disabled || confirmation !== slug}>{pending ? <LoaderCircle className={s.spinner} size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}{pending ? "جارٍ حذف العلامة وبياناتها" : "تأكيد الحذف النهائي"}</button>
          <button type="button" className={s.cancel} disabled={pending} onClick={() => { setExpanded(false); setConfirmation(""); setError(""); }}>إلغاء</button>
        </div>
      </form>}
  </section>;
}

export function PendingBrandDeletionCleanup({ jobs, onCompleted }: { jobs: PendingBrandDeletion[]; onCompleted: (id: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  if (!jobs.length) return null;
  async function retry(cafeId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(cafeId);
    setError("");
    try {
      const result = await retryBrandDeletionCleanupAction(cafeId);
      if (result.ok && result.data) onCompleted(cafeId);
      else setError(result.ok ? "لم يكتمل تنظيف الملفات بعد حاول مجددًا" : result.message);
    } catch { setError("تعذر الاتصال لإكمال تنظيف الملفات حاول مجددًا"); }
    finally { inFlight.current = false; setPending(null); }
  }
  return <section className={s.pendingZone} aria-label="تنظيف ملفات العلامات المحذوفة">
    <h3>ملفات متبقية لعلامات محذوفة</h3><p>حُذفت بيانات هذه العلامات وتحتاج ملفاتها إلى استكمال التنظيف</p>
    {jobs.map(job => <div className={s.pendingRow} key={job.cafeId}><bdi>{job.slug}</bdi><button type="button" className={s.cancel} disabled={pending !== null} onClick={() => retry(job.cafeId)}>{pending === job.cafeId ? "جارٍ تنظيف الملفات" : "استكمال حذف الملفات"}</button></div>)}
    {error && <p className={s.error} role="alert">{error}</p>}
  </section>;
}
