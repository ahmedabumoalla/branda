"use client";

import { useState } from "react";
import { BadgeCheck, ReceiptText, Save, Settings2 } from "lucide-react";
import { readFinanceLoyaltySettings, saveFinanceLoyaltySettings } from "@/app/actions/finance-loyalty-settings";
import styles from "./finance-loyalty-settings.module.css";

type Settings = { creditEarnsStamp: boolean; minimumInvoiceAmount: number };
type Result = Awaited<ReturnType<typeof readFinanceLoyaltySettings>>;

export function FinanceLoyaltySettings({ initialResult, slug }: { initialResult: Result; slug?: string }) {
  const [saved, setSaved] = useState<Settings | null>(initialResult.ok ? initialResult.data : null);
  const [credit, setCredit] = useState(initialResult.ok ? initialResult.data.creditEarnsStamp : true);
  const [minimum, setMinimum] = useState(initialResult.ok ? String(initialResult.data.minimumInvoiceAmount) : "0");
  const [busy, setBusy] = useState(false), [error, setError] = useState(initialResult.ok ? "" : initialResult.message), [notice, setNotice] = useState("");
  const amount = Number(minimum);
  const valid = minimum.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= 100000000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
  const changed = saved && (credit !== saved.creditEarnsStamp || amount !== saved.minimumInvoiceAmount);
  function apply(data: Settings) { setSaved(data); setCredit(data.creditEarnsStamp); setMinimum(String(data.minimumInvoiceAmount)); }
  async function retry() {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await readFinanceLoyaltySettings(slug); if (result.ok) apply(result.data); else setError(result.message); }
    catch { setError("تعذر تحميل إعدادات الولاء أعد المحاولة"); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || !saved || !valid || !changed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveFinanceLoyaltySettings({ creditEarnsStamp: credit, minimumInvoiceAmount: amount }, slug);
      if (!result.ok) { setError(result.message); return; }
      apply(result.data); setNotice("تم حفظ إعدادات الولاء");
    } catch { setError("تعذر تأكيد الحفظ أعد المحاولة"); }
    finally { setBusy(false); }
  }
  return <section className={styles.page} dir="rtl" aria-labelledby="loyalty-settings-title">
    <header className={styles.header}><Settings2 size={26} aria-hidden="true" /><div><h1 id="loyalty-settings-title">إعدادات الولاء</h1><p>حدد الفواتير التي تمنح العميل ختمًا في برنامج الولاء</p></div></header>
    {error && <p className={styles.error} role="alert">{error}{!saved && <button type="button" disabled={busy} onClick={() => void retry()}>إعادة المحاولة</button>}</p>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {!saved && busy && <p role="status">جار تحميل الإعدادات</p>}
    {saved && <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={styles.card}><BadgeCheck size={24} aria-hidden="true" /><div><label className={styles.toggle}><span>احتساب ختم للفواتير الآجلة</span><input type="checkbox" role="switch" checked={credit} disabled={busy} aria-describedby="credit-stamp-hint" onChange={event => { setCredit(event.target.checked); setNotice(""); }} /></label><p id="credit-stamp-hint">عند التفعيل تستحق الفاتورة ختمًا حتى لو بقي عليها مبلغ غير مدفوع وقت الإصدار</p><p>عند الإيقاف لا تمنح الفاتورة الآجلة ختمًا عند إصدارها</p></div></div>
      <div className={styles.card}><ReceiptText size={24} aria-hidden="true" /><div><label className={styles.field} htmlFor="stamp-minimum">الحد الأدنى لقيمة الفاتورة لاحتساب الختم<span className={styles.amount}><input id="stamp-minimum" type="number" inputMode="decimal" min="0" max="100000000" step="0.01" required value={minimum} disabled={busy} aria-invalid={!valid} aria-describedby="stamp-minimum-hint" onChange={event => { setMinimum(event.target.value); setNotice(""); }} /><span>ر س</span></span></label><p id="stamp-minimum-hint">يُحسب من الإجمالي النهائي بعد الخصم وشامل الضريبة وقيمة صفر تعني عدم اشتراط حد أدنى</p>{!valid && <p className={styles.validation} role="alert">أدخل مبلغًا صحيحًا من صفر إلى مئة مليون ريال بمنزلتين عشريتين كحد أقصى</p>}</div></div>
      <p className={styles.hint}>تطبق هذه الخيارات على الفواتير الجديدة مع شروط برنامج الولاء ولا تغيّر الأختام السابقة أو المديونيات</p>
      <button className={styles.save} type="submit" disabled={busy || !valid || !changed}><Save size={18} aria-hidden="true" />{busy ? "جار الحفظ" : "حفظ الإعدادات"}</button>
    </form>}
  </section>;
}
