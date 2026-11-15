"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Save, Settings2 } from "lucide-react";
import { readFinancePosSettings, saveFinancePosSettings } from "@/app/actions/finance-pos-settings";
import styles from "./finance-pos-settings.module.css";

export function FinancePosSettings({ slug }: { slug: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loaded: boolean; enabled: boolean; saved: boolean }>({ loaded: false, enabled: false, saved: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    readFinancePosSettings(slug).then(result => {
      if (!active) return;
      if (!result.ok) { setError(result.message); return; }
      setError(""); setState({ loaded: true, enabled: result.data.whatsappInvoiceEnabled, saved: result.data.whatsappInvoiceEnabled });
    }).catch(() => { if (active) setError("تعذر تحميل إعدادات نقاط البيع أعد المحاولة"); });
    return () => { active = false; };
  }, [slug, attempt]);
  async function save() {
    if (busy || !state.loaded) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveFinancePosSettings(slug, { whatsappInvoiceEnabled: state.enabled });
      if (!result.ok) { setError(result.message); return; }
      setState({ loaded: true, enabled: result.data.whatsappInvoiceEnabled, saved: result.data.whatsappInvoiceEnabled });
      setNotice("تم حفظ إعدادات نقاط البيع");
    } catch { setError("تعذر تأكيد الحفظ أعد المحاولة"); }
    finally { setBusy(false); }
  }
  return <section className={styles.page} dir="rtl" aria-labelledby="pos-settings-title">
    <header className={styles.header}><Settings2 size={24} aria-hidden="true" /><div><h2 id="pos-settings-title">إعدادات نقاط البيع</h2><p>تحكم في نسخة الفاتورة التي تصل لعميل طلبات المستشفى</p></div></header>
    {error && <p className={styles.error} role="alert">{error}{!state.loaded && <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>إعادة المحاولة</button>}</p>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {!state.loaded && !error ? <p role="status">جار تحميل الإعدادات</p> : state.loaded && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={styles.card}><MessageCircle size={24} aria-hidden="true" /><div><label className={styles.toggle}><span>إرسال نسخة الفاتورة على واتساب</span><input type="checkbox" role="switch" checked={state.enabled} disabled={busy} aria-describedby="pos-whatsapp-hint" onChange={event => { setNotice(""); setState(current => ({ ...current, enabled: event.target.checked })); }} /></label><p id="pos-whatsapp-hint">عند التفعيل تُرسل رسالة شكر مع الفاتورة بعد إصدارها لطلبات المستشفى المدفوعة والآجلة</p><p>رابط الحساب يُرسل مرة واحدة عند إنشائه وبطاقة الولاء لا تُعاد لمن سبق تحميلها</p><p>إيقاف إرسال الفاتورة لا يغيّر الطباعة أو تسجيل المديونية أو ختم الولاء</p></div></div>
      <button className={styles.save} type="submit" disabled={busy || state.enabled === state.saved}><Save size={18} aria-hidden="true" />{busy ? "جار الحفظ" : "حفظ الإعدادات"}</button>
    </form>}
  </section>;
}
