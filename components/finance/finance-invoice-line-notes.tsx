"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Search, Trash2, X } from "lucide-react";
import { getFinanceInvoiceLineNotes, saveFinanceInvoiceLineNotes } from "@/app/actions/finance-invoice-line-notes";
import { invoiceLineNoteSettingsSchema, type InvoiceLineNoteSettings, type InvoiceLineNoteState } from "@/lib/finance/invoice-line-notes";
import styles from "./finance.module.css";
import local from "./finance-invoice-line-notes.module.css";

type Props = { slug: string; canEdit: boolean; disabled: boolean; onBack: () => void };
export function FinanceInvoiceLineNotes(props: Props) {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState<{ slug: string; attempt: number; data?: InvoiceLineNoteState; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    getFinanceInvoiceLineNotes(props.slug).then(response => { if (active) setResult({ slug: props.slug, attempt, ...(response.ok ? { data: response.data } : { error: response.message }) }); }).catch(() => { if (active) setResult({ slug: props.slug, attempt, error: "تعذر تحميل ملاحظات البنود أعد المحاولة" }); });
    return () => { active = false; };
  }, [props.slug, attempt]);
  const loaded = result?.slug === props.slug && result.attempt === attempt ? result : null;
  if (!loaded?.data) return <section className={local.page} dir="rtl"><header className={local.top}><h2>ملاحظات البنود</h2><button type="button" className={styles.secondary} onClick={props.onBack}>إلغاء</button></header>{loaded?.error ? <div className={styles.error} role="alert"><p>{loaded.error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p role="status">جار تحميل ملاحظات البنود</p>}</section>;
  return <NotesForm key={`${props.slug}:${attempt}`} {...props} initial={loaded.data} onReload={() => setAttempt(value => value + 1)} />;
}

function NotesForm({ slug, canEdit, disabled, onBack, initial, onReload }: Props & { initial: InvoiceLineNoteState; onReload: () => void }) {
  const [saved, setSaved] = useState(initial), [settings, setSettings] = useState(initial.settings);
  const [query, setQuery] = useState(""), [dragged, setDragged] = useState<string | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [tried, setTried] = useState(false);
  const lock = useRef(false), mounted = useRef(true), pendingUrl = useRef("");
  const blocked = disabled || !canEdit || pending, sortingBlocked = blocked || Boolean(query.trim());
  const dirty = JSON.stringify(saved.settings) !== JSON.stringify(settings);
  const validation = invoiceLineNoteSettingsSchema.safeParse(settings);
  const notes = settings.notes.filter(note => note.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => { if (lock.current) event.preventDefault(); };
    const pop = (event: PopStateEvent) => { if (lock.current && pendingUrl.current) { event.stopImmediatePropagation(); window.history.pushState(null, "", pendingUrl.current); } };
    window.addEventListener("beforeunload", unload); window.addEventListener("popstate", pop, true);
    return () => { mounted.current = false; window.removeEventListener("beforeunload", unload); window.removeEventListener("popstate", pop, true); };
  }, []);
  function change(value: InvoiceLineNoteSettings) { if (blocked || lock.current) return; setSettings(value); setError(""); setMessage(""); }
  function move(id: string, target: number) {
    if (sortingBlocked) return;
    const from = settings.notes.findIndex(note => note.id === id);
    if (from < 0 || target < 0 || target >= settings.notes.length || from === target) return;
    const items = [...settings.notes], [note] = items.splice(from, 1); items.splice(target, 0, note); change({ ...settings, notes: items });
  }
  async function save() {
    if (blocked || lock.current) return;
    setTried(true); setMessage("");
    if (!validation.success) { setError(validation.error.issues[0]?.message ?? "راجع ملاحظات البنود"); return; }
    lock.current = true; pendingUrl.current = window.location.href; setPending(true); setError("");
    try {
      const result = await saveFinanceInvoiceLineNotes(slug, validation.data, saved.revision);
      if (!mounted.current) return;
      if (!result.ok) { setError(result.message); return; }
      setSaved(result.data); setSettings(result.data.settings); setTried(false); setMessage("تم حفظ ملاحظات البنود");
    } catch { if (mounted.current) setError("تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  return <section className={local.page} dir="rtl" aria-busy={pending}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header className={local.top}><div><h2>ملاحظات البنود</h2><p>ملاحظات جاهزة لبنود فواتير الإدارة فقط</p></div><div className={local.actions}><button type="submit" className={styles.primary} disabled={blocked || !dirty}><Save size={16} aria-hidden="true" />{pending ? "جار الحفظ" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={() => { if (!lock.current && (!dirty || window.confirm("توجد تعديلات غير محفوظة هل تريد إلغاءها؟"))) onBack(); }}><X size={16} aria-hidden="true" />إلغاء</button></div></header>
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" className={styles.secondary} disabled={pending} onClick={() => { if (!dirty || window.confirm("سيتم استبدال التعديلات غير المحفوظة بالبيانات الحالية هل تريد المتابعة؟")) onReload(); }}>إعادة تحميل البيانات</button></div>}
    {message && <p className={styles.success} role="status">{message}</p>}
    {!canEdit && <p role="status">تعديل ملاحظات البنود يتطلب صلاحية إدارة الإعدادات</p>}
    <div className={local.panel}>
      <label className={local.enable}><input type="checkbox" role="switch" checked={settings.enabled} disabled={blocked} onChange={event => change({ ...settings, enabled: event.target.checked })} /><span>تفعيل ملاحظات البنود</span><small>{settings.enabled ? "مفعّل" : "غير مفعّل"}</small></label>
      {settings.enabled && <div className={local.content}>
        <label className={local.search}><Search size={17} aria-hidden="true" /><input type="search" aria-label="البحث في ملاحظات البنود" placeholder="البحث" maxLength={50} value={query} disabled={pending} onChange={event => setQuery(event.target.value)} /></label>
        <p className={local.hint}>الحد الأقصى لنص الملاحظة ٥٠ حرفًا مع المسافات</p>
        {query.trim() && <p className={local.hint}>امسح البحث لتغيير ترتيب الملاحظات</p>}
        <div className={local.table}>
          <div className={local.head}><span /><span>نص الملاحظة</span><span>الحالة</span><span /></div>
          {notes.map(note => {
            const index = settings.notes.findIndex(item => item.id === note.id);
            const invalid = tried && !validation.success ? validation.error.issues.find(issue => issue.path[0] === "notes" && issue.path[1] === index)?.message : undefined;
            return <div key={note.id} className={`${local.row} ${dragged === note.id ? local.dragging : ""}`} onDragOver={event => { if (!sortingBlocked && dragged) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!sortingBlocked && dragged) move(dragged, index); setDragged(null); }}>
              <div className={local.reorder}><button type="button" className={local.grip} disabled={sortingBlocked} draggable={!sortingBlocked} aria-label={`اسحب لترتيب الملاحظة ${index + 1}`} onDragStart={event => { setDragged(note.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", note.id); }} onDragEnd={() => setDragged(null)}><GripVertical size={20} aria-hidden="true" /></button><div><button type="button" disabled={sortingBlocked || index === 0} aria-label={`نقل الملاحظة ${index + 1} لأعلى`} onClick={() => move(note.id, index - 1)}><ArrowUp size={13} aria-hidden="true" /></button><button type="button" disabled={sortingBlocked || index === settings.notes.length - 1} aria-label={`نقل الملاحظة ${index + 1} لأسفل`} onClick={() => move(note.id, index + 1)}><ArrowDown size={13} aria-hidden="true" /></button></div></div>
              <div className={local.text}><input aria-label={`نص الملاحظة ${index + 1}`} required maxLength={50} value={note.text} disabled={blocked} aria-invalid={Boolean(invalid)} aria-describedby={invalid ? `note-error-${note.id}` : undefined} onChange={event => change({ ...settings, notes: settings.notes.map(item => item.id === note.id ? { ...item, text: event.target.value } : item) })} />{invalid && <small id={`note-error-${note.id}`} role="alert">{invalid}</small>}</div>
              <label className={local.active}><input type="checkbox" checked={note.active} disabled={blocked} aria-label={`تفعيل الملاحظة ${index + 1}`} onChange={event => change({ ...settings, notes: settings.notes.map(item => item.id === note.id ? { ...item, active: event.target.checked } : item) })} />فعال</label>
              <button type="button" className={local.remove} disabled={blocked} aria-label={`حذف الملاحظة ${index + 1}`} title="حذف" onClick={() => change({ ...settings, notes: settings.notes.filter(item => item.id !== note.id) })}><Trash2 size={16} aria-hidden="true" /></button>
            </div>;
          })}
          {notes.length === 0 && <p className={local.empty}>{query.trim() ? "لا توجد ملاحظات تطابق البحث" : "لا توجد ملاحظات أضف ملاحظة للبدء"}</p>}
        </div>
        <button type="button" className={styles.secondary} disabled={blocked || settings.notes.length >= 100} onClick={() => { setQuery(""); change({ ...settings, notes: [...settings.notes, { id: crypto.randomUUID(), text: "", active: true }] }); }}><Plus size={16} aria-hidden="true" />إضافة</button>
        {settings.notes.length >= 100 && <p className={local.hint} role="status">وصلت إلى الحد الأقصى وهو ١٠٠ ملاحظة</p>}
      </div>}
    </div>
  </form></section>;
}
