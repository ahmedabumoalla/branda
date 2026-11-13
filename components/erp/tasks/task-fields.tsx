"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { readErpTaskTargetsAction } from "@/app/actions/erp-tasks";
import { taskPriorities, taskTargets, type TaskInput, type TaskSnapshot } from "@/lib/erp/tasks";
import styles from "../erp.module.css";

export function TaskTargetFields({ kind, id, onChange, enabled, slug, initialLabel }: { kind: TaskInput["targetKind"]; id: string | null; onChange: (kind: TaskInput["targetKind"], id: string | null) => void; enabled: TaskSnapshot["settings"]["enabledTargets"]; slug: string; initialLabel?: string | null }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (!kind) return;
    const timeout = setTimeout(() => {
      setLoading(true); setError("");
      readErpTaskTargetsAction(kind, query, slug).then(response => {
        if (!active) return;
        if (response.ok) setResult(response.data); else setError(response.message);
      }).catch(() => { if (active) setError("تعذر تحميل السجلات حاول مجددًا"); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timeout); };
  }, [kind, query, slug]);
  return <div className={styles.split}>
    <label className={styles.field}><span>القسم المستهدف</span><select value={kind ?? ""} onChange={event => { setQuery(""); setResult([]); setError(""); setLoading(false); onChange(event.target.value as TaskInput["targetKind"] || null, null); }}><option value="">لا يوجد قسم مرتبط</option>{enabled.map(key => <option key={key} value={key}>{taskTargets[key]}</option>)}</select></label>
    <div className={styles.field}><label>السجل<input aria-label="البحث عن السجل بالاسم أو الكود" placeholder="البحث بالاسم أو الكود" disabled={!kind} value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="السجل المستهدف" disabled={!kind || loading} required={!!kind} value={id ?? ""} onChange={event => onChange(kind, event.target.value || null)}><option value="">{loading ? "جاري تحميل السجلات" : "اختر السجل"}</option>{id && !result.some(row => row.id === id) && <option value={id}>{initialLabel || "السجل الحالي"}</option>}{result.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select>{error && <span role="alert">{error}</span>}</div>
  </div>;
}

export function TaskFields({ value, setValue, snapshot, slug, onAddType, targetLabel }: { value: TaskInput; setValue: (value: TaskInput) => void; snapshot: TaskSnapshot; slug: string; onAddType: () => void; targetLabel?: string | null }) {
  const set = <K extends keyof TaskInput>(key: K, next: TaskInput[K]) => setValue({ ...value, [key]: next });
  return <div className={styles.form}>
    <div className={styles.split}>
      <label className={styles.field}><span>العنوان *</span><input required maxLength={200} placeholder="أدخل ملخص المهمة" value={value.title} onChange={e => set("title", e.target.value)} /></label>
      <label className={styles.field}><span>الكود</span><input maxLength={50} placeholder="تلقائي" value={value.code} onChange={e => set("code", e.target.value)} /></label>
    </div>
    <label className={styles.field}><span>درجة الأولوية *</span><select value={value.priority} onChange={e => set("priority", e.target.value as TaskInput["priority"])}>{Object.entries(taskPriorities).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <div className={styles.field}><span>النوع *</span><div className={styles.inline}><select aria-label="نوع المهمة" required value={value.typeId} onChange={e => set("typeId",e.target.value)} style={{flex:1}}><option value="">اختر النوع</option>{snapshot.types.filter(row => row.active || row.id === value.typeId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{snapshot.canConfigure && <button type="button" className={styles.button} aria-label="إضافة نوع مهمة" onClick={onAddType}><Plus size={16} aria-hidden="true" /></button>}</div></div>
    <label className={styles.field}><span>المسؤول *</span><select required value={value.assigneeId} onChange={e => set("assigneeId",e.target.value)}><option value="">اختر المسؤول</option>{snapshot.staff.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label className={styles.field}><span>تاريخ الاستحقاق</span><input type="date" value={value.dueDate ?? ""} onChange={e => set("dueDate",e.target.value || null)} /></label>
    <TaskTargetFields kind={value.targetKind} id={value.targetId} enabled={snapshot.settings.enabledTargets} initialLabel={targetLabel} slug={slug} onChange={(kind,id) => setValue({...value,targetKind:kind,targetId:id})} />
    <label className={styles.field}><span>الوصف</span><textarea maxLength={20000} placeholder="أضف مزيدًا من السياق أو خطوات التنفيذ أو التفاصيل ذات الصلة" value={value.description} onChange={e => set("description",e.target.value)} /></label>
  </div>;
}
