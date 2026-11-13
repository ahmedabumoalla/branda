"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2, X } from "lucide-react";
import { getFinanceOrderSources, saveFinanceOrderSources } from "@/app/actions/finance-order-sources";
import { orderSourceSettingsSchema, type OrderSourceSettings, type OrderSourceState } from "@/lib/finance/order-sources";
import styles from "./finance.module.css";
import local from "./finance-order-sources.module.css";

type Props = { slug: string; canEdit: boolean; disabled: boolean; onBack: () => void };

export function FinanceOrderSources(props: Props) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ slug: string; attempt: number; data?: OrderSourceState; error?: string } | null>(null);
  useEffect(() => {
    let current = true;
    getFinanceOrderSources(props.slug).then(result => {
      if (current) setLoaded({ slug: props.slug, attempt, ...(result.ok ? { data: result.data } : { error: result.message }) });
    }).catch(() => { if (current) setLoaded({ slug: props.slug, attempt, error: "تعذر تحميل مصادر الطلب أعد المحاولة" }); });
    return () => { current = false; };
  }, [props.slug, attempt]);
  const result = loaded?.slug === props.slug && loaded.attempt === attempt ? loaded : null;
  if (!result?.data) return <section className={local.page} dir="rtl"><div className={local.top}><h2>مصادر الطلب</h2><button type="button" className={styles.secondary} onClick={props.onBack}>إلغاء</button></div>{result?.error ? <div className={styles.error} role="alert"><p>{result.error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p role="status">جار تحميل مصادر الطلب</p>}</section>;
  return <OrderSourcesForm key={`${props.slug}:${attempt}`} {...props} initial={result.data} onReload={() => setAttempt(value => value + 1)} />;
}

function OrderSourcesForm({ slug, canEdit, disabled, onBack, initial, onReload }: Props & { initial: OrderSourceState; onReload: () => void }) {
  const [saved, setSaved] = useState(initial), [settings, setSettings] = useState(initial.settings);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [tried, setTried] = useState(false), [dragged, setDragged] = useState<string | null>(null);
  const lock = useRef(false), mounted = useRef(true), pendingUrl = useRef("");
  const blocked = disabled || !canEdit || pending;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved.settings);
  const validation = orderSourceSettingsSchema.safeParse(settings);
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (lock.current) event.preventDefault(); };
    const pendingNavigation = (event: PopStateEvent) => {
      if (!lock.current || !pendingUrl.current) return;
      event.stopImmediatePropagation();
      window.history.pushState(null, "", pendingUrl.current);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pendingNavigation, true);
    return () => { mounted.current = false; window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", pendingNavigation, true); };
  }, []);

  function change(next: OrderSourceSettings) {
    if (blocked || lock.current) return;
    setSettings(next); setError(""); setMessage("");
  }
  function reorder(id: string, destination: number) {
    const from = settings.sources.findIndex(source => source.id === id);
    if (from < 0 || destination < 0 || destination >= settings.sources.length || from === destination) return;
    const sources = [...settings.sources], [source] = sources.splice(from, 1);
    sources.splice(destination, 0, source);
    change({ ...settings, sources });
  }
  function cancel() {
    if (lock.current) return;
    if (dirty && !window.confirm("توجد تعديلات غير محفوظة هل تريد إلغاءها؟")) return;
    onBack();
  }
  async function submit() {
    if (blocked || lock.current) return;
    setTried(true); setMessage("");
    if (!validation.success) { setError(validation.error.issues[0]?.message ?? "راجع بيانات مصادر الطلب"); return; }
    lock.current = true; pendingUrl.current = window.location.href; setPending(true); setError("");
    try {
      const result = await saveFinanceOrderSources(slug, validation.data, saved.revision);
      if (!mounted.current) return;
      if (!result.ok) { setError(result.message); return; }
      setSaved(result.data); setSettings(result.data.settings); setTried(false); setMessage("تم حفظ مصادر الطلب");
    } catch { if (mounted.current) setError("تعذر تأكيد حفظ مصادر الطلب أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }

  return <section className={local.page} dir="rtl" aria-busy={pending}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
      <div className={local.top}><h2>مصادر الطلب</h2><div className={local.actions}><button type="submit" className={styles.primary} disabled={blocked || !dirty}><Save size={16} aria-hidden="true" />{pending ? "جار الحفظ" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={cancel}><X size={16} aria-hidden="true" />إلغاء</button></div></div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" className={styles.secondary} disabled={pending} onClick={() => { if (!dirty || window.confirm("سيتم استبدال التعديلات غير المحفوظة بالبيانات الحالية هل تريد المتابعة؟")) onReload(); }}>إعادة تحميل البيانات</button></div>}
      {message && <p className={styles.success} role="status">{message}</p>}
      {!canEdit && <p role="status">يمكنك عرض مصادر الطلب ويتطلب تعديلها صلاحية إدارة الإعدادات</p>}
      <div className={local.panel}>
        <div className={local.sources}>
          {settings.sources.map((source, index) => {
            const nameError = tried && !validation.success ? validation.error.issues.find(issue => issue.path[0] === "sources" && issue.path[1] === index && issue.path[2] === "name")?.message : undefined;
            return <div key={source.id} className={`${local.row} ${dragged === source.id ? local.dragging : ""}`} onDragOver={event => { if (!blocked && dragged) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!blocked && dragged) reorder(dragged, index); setDragged(null); }}>
              <div className={local.reorder}>
                <button type="button" className={local.grip} disabled={blocked} draggable={!blocked} onDragStart={event => { setDragged(source.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", source.id); }} onDragEnd={() => setDragged(null)} aria-label={`اسحب لترتيب مصدر الطلب ${source.name || index + 1}`} title="اسحب لتغيير الترتيب"><GripVertical size={20} aria-hidden="true" /></button>
                <div className={local.moveButtons}><button type="button" disabled={blocked || index === 0} onClick={() => reorder(source.id, index - 1)} aria-label={`نقل ${source.name || "مصدر الطلب"} لأعلى`}><ArrowUp size={13} aria-hidden="true" /></button><button type="button" disabled={blocked || index === settings.sources.length - 1} onClick={() => reorder(source.id, index + 1)} aria-label={`نقل ${source.name || "مصدر الطلب"} لأسفل`}><ArrowDown size={13} aria-hidden="true" /></button></div>
              </div>
              <label className={local.name}>الاسم <span aria-hidden="true">*</span><input value={source.name} maxLength={80} required disabled={blocked} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `source-error-${source.id}` : undefined} onChange={event => change({ ...settings, sources: settings.sources.map(item => item.id === source.id ? { ...item, name: event.target.value } : item) })} />{nameError && <small id={`source-error-${source.id}`} role="alert">{nameError}</small>}</label>
              <fieldset className={local.status} disabled={blocked}><legend className={local.srOnly}>حالة مصدر الطلب {source.name || index + 1}</legend><label><input type="radio" name={`status-${source.id}`} checked={source.active} onChange={() => change({ ...settings, sources: settings.sources.map(item => item.id === source.id ? { ...item, active: true } : item) })} />نشط</label><label><input type="radio" name={`status-${source.id}`} checked={!source.active} onChange={() => change({ ...settings, sources: settings.sources.map(item => item.id === source.id ? { ...item, active: false } : item) })} />غير نشط</label></fieldset>
              <button type="button" className={local.remove} disabled={blocked} aria-label={`حذف مصدر الطلب ${source.name || index + 1}`} title="حذف" onClick={() => change({ ...settings, sources: settings.sources.filter(item => item.id !== source.id), ...(settings.defaultSourceId === source.id ? { defaultMode: "none", defaultSourceId: null } : {}) })}><Trash2 size={17} aria-hidden="true" /></button>
            </div>;
          })}
          {settings.sources.length === 0 && <p className={local.empty}>لا توجد مصادر طلب أضف مصدرًا للبدء</p>}
          <button type="button" className={`${styles.secondary} ${local.add}`} disabled={blocked || settings.sources.length >= 100} onClick={() => change({ ...settings, sources: [...settings.sources, { id: crypto.randomUUID(), name: "", active: true }] })}><Plus size={16} aria-hidden="true" />إضافة</button>
          {settings.sources.length >= 100 && <small role="status">وصلت إلى الحد الأقصى وهو ١٠٠ مصدر طلب</small>}
        </div>
        <div className={local.options}>
          <label className={local.default}>المصدر الافتراضي<select value={settings.defaultMode === "specific" ? settings.defaultSourceId ?? "specific" : settings.defaultMode} disabled={blocked} onChange={event => change({ ...settings, defaultMode: event.target.value === "none" || event.target.value === "last" ? event.target.value : "specific", defaultSourceId: event.target.value === "none" || event.target.value === "last" ? null : event.target.value })}><option value="none">بدون افتراضي</option><option value="last">آخر مصدر تم اختياره</option>{settings.sources.filter(source => source.active && source.name.trim()).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}{settings.defaultMode === "specific" && !settings.sources.some(source => source.id === settings.defaultSourceId && source.active && source.name.trim()) && <option value={settings.defaultSourceId ?? "specific"} disabled>اختر مصدرًا نشطًا</option>}</select></label>
          <label className={local.required}><input type="checkbox" checked={settings.required} disabled={blocked} onChange={event => change({ ...settings, required: event.target.checked })} />مطلوب</label>
        </div>
      </div>
    </form>
  </section>;
}
