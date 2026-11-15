"use client";
import { useRef, useState } from "react";
import { saveEmployeeAssetType } from "@/app/actions/erp-employee-assets";
import s from "./workspace.module.css";

// Ready-made asset types for a first setup. Choosing one creates it through the original asset type save,
// so it then lives in the brand's own type list and can be renamed or archived from the types page.
const NEW = "new:", OTHER = "other";
const SUGGESTED_TYPES = [
  "أصول تشغيلية",
  "أصول شخصية",
  "أجهزة إلكترونية",
  "أجهزة نقاط البيع والكاشير",
  "معدات وأدوات عمل",
  "أثاث ومفروشات",
  "مركبات",
  "أجهزة اتصال وشبكات",
  "زي موحد وملابس عمل",
  "مفاتيح وبطاقات دخول",
  "أصول مكتبية",
  "أصول تقنية وبرمجيات",
];

export function AssetTypePicker({ slug, canWrite, value, change, options }: {
  slug: string; canWrite: boolean; value: string; change: (id: string) => void; options: { id: string; name: string }[];
}) {
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false), request = useRef({ name: "", id: "" });
  const all = [...options, ...added.filter(type => !options.some(option => option.id === type.id))];
  const known = new Set(all.map(type => type.name.trim()));
  const suggestions = SUGGESTED_TYPES.filter(name => !known.has(name));

  async function create(raw: string) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name || lock.current) return;
    const existing = all.find(type => type.name.trim() === name);
    if (existing) { change(existing.id); setCustom(""); return; }
    if (request.current.name !== name) request.current = { name, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await saveEmployeeAssetType({ revision: 0, requestId: request.current.id, remove: false, name, description: "", active: true }, slug);
      if (!result.ok) { setError(result.message); return; }
      setAdded(list => [...list, { id: result.data.id, name }]);
      change(result.data.id);
      setCustom(""); setCustomOpen(false);
    } catch { setError("تعذر تأكيد إضافة النوع أعد المحاولة بنفس الاسم"); }
    finally { lock.current = false; setBusy(false); }
  }

  // Suggested types sit inside the same dropdown: picking one creates it and selects it. The last choice opens a field for a type that is not listed.
  function pick(next: string) {
    if (next === OTHER) { setCustomOpen(true); return; }
    setCustomOpen(false);
    if (next.startsWith(NEW)) { void create(next.slice(NEW.length)); return; }
    change(next);
  }

  return <div className={s.field}>
    <label className={s.field}>نوع الأصل
      <select value={customOpen ? OTHER : value} disabled={busy} onChange={event => pick(event.target.value)}>
        <option value="">اختر</option>
        {all.length > 0 && <optgroup label="أنواع العلامة">{all.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</optgroup>}
        {canWrite && suggestions.length > 0 && <optgroup label="أنواع مقترحة">{suggestions.map(name => <option key={name} value={NEW + name}>{name}</option>)}</optgroup>}
        {canWrite && <option value={OTHER}>نوع آخر غير موجود</option>}
      </select>
    </label>
    {canWrite && customOpen && <div className={s.group}>
      <input autoFocus aria-label="نوع أصل جديد" maxLength={150} placeholder="اكتب اسم النوع" value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void create(custom); } }} />
      <button type="button" className={s.button} disabled={busy || !custom.trim()} onClick={() => void create(custom)}>{busy ? "جار الإضافة" : "إضافة النوع"}</button>
    </div>}
    {busy && !customOpen && <span className={s.muted} role="status">جار إضافة النوع</span>}
    {error && <span role="alert" className={s.error}>{error}</span>}
  </div>;
}
