"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, ChefHat, Link2, Printer, ReceiptText, Save } from "lucide-react";
import { discoverLocalPrinters, loadPrinterSettings, savePrinterSettings, type FinancePrinterSettings as Settings, type LocalPrinter } from "@/lib/finance/printer-settings";
import styles from "./finance-printer-settings.module.css";

const subscribeHydration = () => () => {};
export function FinancePrinterSettings({ brandId }: { brandId: string }) {
  const ready = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return ready ? <PrinterSettingsForm key={brandId} brandId={brandId} /> : <p role="status">جارٍ تحميل إعدادات الطابعة لهذا الجهاز</p>;
}
function PrinterSettingsForm({ brandId }: { brandId: string }) {
  const [settings, setSettings] = useState<Settings>(() => loadPrinterSettings(brandId));
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function update(next: Settings) { setSettings(next); setMessage(""); setError(""); }
  async function connect() {
    setBusy(true); setError(""); setMessage("");
    try { const list = await discoverLocalPrinters(settings.token); setPrinters(list); setMessage(list.length ? "تم الاتصال اختر طابعة لكل نسخة ثم احفظ الإعدادات" : "الخدمة متصلة ولم تُعثر على طابعات ثبّت تعريف الطابعة على الجهاز ثم أعد الربط"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر الاتصال بخدمة الطباعة"); }
    finally { setBusy(false); }
  }
  return <section className={styles.settings} dir="rtl" aria-labelledby="printer-settings-title">
    <header className={styles.header}><div className={styles.icon}><Printer size={26} aria-hidden="true" /></div><div><h2 id="printer-settings-title">إعداد الطابعة</h2><p>اضبط إيصال العميل ونسخة المطبخ مرة واحدة لهذا الجهاز وهذه العلامة</p></div></header>
    <form onSubmit={event => { event.preventDefault(); setError(""); setMessage(""); try { savePrinterSettings(brandId, settings); setMessage("حُفظت إعدادات الطباعة على هذا الجهاز وتبقى متاحة عند انقطاع الإنترنت"); } catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر حفظ إعدادات الطابعة"); } }}>
      <fieldset className={styles.mode} disabled={busy}><legend>طريقة الطباعة</legend>
        <label className={settings.mode === "bridge" ? styles.selected : ""}><input type="radio" name="printer-mode" checked={settings.mode === "bridge"} onChange={() => update({ ...settings, mode: "bridge" })} /><span><strong>طباعة تلقائية مباشرة</strong><small>خدمة برندة المحلية ترسل كل نسخة إلى طابعتها دون نافذة الطباعة</small></span></label>
        <label className={settings.mode === "browser" ? styles.selected : ""}><input type="radio" name="printer-mode" checked={settings.mode === "browser"} onChange={() => update({ ...settings, mode: "browser" })} /><span><strong>نافذة طباعة المتصفح</strong><small>تفتح بعد البيع وتحتاج تأكيد الطباعة واختيار الطابعة من المتصفح</small></span></label>
      </fieldset>
      {settings.mode === "bridge" && <div className={styles.connection}><div><h3><Link2 size={18} aria-hidden="true" /> ربط هذا الجهاز</h3><p>شغّل خدمة طباعة برندة على جهاز الكاشير ثم أدخل رمز الربط الظاهر فيها</p></div><label>رمز الربط<input type="password" autoComplete="off" spellCheck={false} dir="ltr" value={settings.token} onChange={event => { update({ ...settings, token: event.target.value.trim() }); setPrinters([]); }} /></label><button type="button" onClick={connect} disabled={busy || !settings.token}>{busy ? "جارٍ الاتصال" : "ربط وعرض الطابعات"}</button><small>قد يطلب المتصفح السماح بالوصول للشبكة المحلية والطابعات المتاحة هي المثبتة على هذا الجهاز</small></div>}
      <div className={styles.targets}>{(["customer", "preparation"] as const).map(copy => {
        const target = settings[copy]; const Icon = copy === "customer" ? ReceiptText : ChefHat;
        return <fieldset key={copy} className={styles.target} disabled={busy}><legend><Icon size={20} aria-hidden="true" />{copy === "customer" ? "إيصال العميل" : "نسخة المطبخ أو البار"}</legend><label className={styles.toggle}><input type="checkbox" checked={target.enabled} onChange={event => update({ ...settings, [copy]: { ...target, enabled: event.target.checked } })} />طباعة النسخة تلقائيًا بعد البيع</label>
          {settings.mode === "bridge" && <label>الطابعة<select disabled={!target.enabled} value={target.deviceName} onChange={event => update({ ...settings, [copy]: { ...target, deviceName: event.target.value } })}><option value="">اختر الطابعة</option>{target.deviceName && !printers.some(printer => printer.name === target.deviceName) && <option value={target.deviceName}>{target.deviceName} — محفوظة ولم يتم التحقق منها</option>}{printers.map(printer => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}</option>)}</select></label>}
          <label>عرض الورق<select disabled={!target.enabled} value={target.paper} onChange={event => update({ ...settings, [copy]: { ...target, paper: event.target.value === "58" ? "58" : "80" } })}><option value="80">٨٠ مم</option><option value="58">٥٨ مم</option></select></label><small>{copy === "customer" ? "تفاصيل الفاتورة والمبالغ والضريبة" : "الأصناف والكميات وملاحظة الطلب دون أسعار أو بيانات العميل"}</small>
        </fieldset>;
      })}</div>
      <p className={styles.hint}>يمكن اختيار الطابعة نفسها للنسختين أو طابعة مستقلة للمطبخ وتبقى الطباعة المحلية متاحة دون إنترنت ما دام الجهاز متصلًا بالطابعة وخدمة الطباعة تعمل</p>
      {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status"><Check size={18} aria-hidden="true" />{message}</p>}
      <footer><button type="submit" className={styles.save} disabled={busy}><Save size={18} aria-hidden="true" />حفظ إعدادات الطابعة</button><small>إعدادات هذا المتصفح والجهاز فقط</small></footer>
    </form>
  </section>;
}
