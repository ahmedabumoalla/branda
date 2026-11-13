"use client";
import {withBranchScope} from '@/components/erp/branches/context';
import Link from "@/components/erp/navigation";
import {useRouter} from "@/components/erp/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ChevronLeft, Save } from "lucide-react";
import { saveManufacturing } from "@/app/actions/erp-manufacturing";
import { manufacturingSettingsSchema, type ManufacturingField, type ManufacturingSettings, type ManufacturingSnapshot } from "@/lib/erp/manufacturing";
import { ErpFieldBuilder } from "@/components/erp/fields/field-builder";
import { manufacturingFieldSources } from "@/lib/erp/manufacturing";
import { Field } from "./manufacturing-fields";
import { ManufacturingFormSettings } from "./manufacturing-forms";
import s from "./manufacturing.module.css";
const base = "/dashboard/system/manufacturing/settings";
const links = [
  { id: "general", name: "تهيئة التصنيع", description: "قواعد إصدار أوامر التصنيع واستلام الخامات وإنهاء الإنتاج" },
  { id: "routings", name: "مسارات الإنتاج", description: "تصميم مراحل الإنتاج وتوحيد سير عمليات التصنيع", href: "/dashboard/system/manufacturing/routings" },
  { id: "order-statuses", name: "حالات الأوامر", description: "حالات متابعة أوامر التصنيع" },
  { id: "order-fields", name: "الحقول المخصصة للأوامر", description: "البيانات الإضافية لأوامر التصنيع" },
  { id: "order-forms", name: "النماذج ذات الصلة للأوامر", description: "نماذج متكررة لجمع بيانات أمر التصنيع" },
  { id: "plan-statuses", name: "حالات خطط الإنتاج", description: "حالات متابعة خطط الإنتاج" },
  { id: "plan-fields", name: "الحقول المخصصة لخطط الإنتاج", description: "البيانات الإضافية لخطط الإنتاج" },
  { id: "plan-forms", name: "النماذج ذات الصلة لخطط الإنتاج", description: "نماذج متكررة لجمع بيانات خطة الإنتاج" },
];
export function ManufacturingSettingsEditor({ snapshot, page }: { snapshot: ManufacturingSnapshot; page: string }) {
  const router = useRouter();const [value, setValue] = useState<ManufacturingSettings>(snapshot.settings);const [pending, startTransition] = useTransition();const [error, setError] = useState("");const errorRef = useRef<HTMLDivElement>(null);const busy = useRef(false);const request = useRef<{ body: string; id: string } | null>(null);
  const selected = links.find(l => l.id === page);const isPlan = page.startsWith("plan-");const key = page.endsWith("statuses") ? isPlan ? "planStatuses" : "orderStatuses" : page.endsWith("fields") ? isPlan ? "planFields" : "orderFields" : isPlan ? "planForms" : "orderForms";
  const set = (key: keyof ManufacturingSettings, next: unknown) => setValue(old => ({ ...old, [key]: next }));
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function save(e: FormEvent) { e.preventDefault();if (busy.current) return;const parsed = manufacturingSettingsSchema.safeParse(value);if (!parsed.success) { setError("راجع أسماء الحقول ومعرفاتها وخياراتها قبل الحفظ");return; }const body = JSON.stringify(parsed.data);if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };busy.current = true;setError("");startTransition(async () => { try { const result = await saveManufacturing(withBranchScope({ kind: "settings", payload: parsed.data, revision: snapshot.settingsRevision, draft: false, requestId: request.current!.id }, snapshot), snapshot.slug);if (result.ok) { router.push(base);router.refresh(); }else setError(result.message); }catch { setError("تعذر الاتصال احتفظنا بالإعدادات للمحاولة مجددًا"); }finally { busy.current = false; } }); }
  const modelsPage = ["order-fields", "order-forms", "plan-fields", "plan-forms"].includes(page);
  const hasLegacy = modelsPage && (value[key] as unknown[]).length > 0;
  const legacyEditor = <form onSubmit={save}><div className={s.toolbar}><div className={s.actions}><button className={s.primary} disabled={pending || !snapshot.canConfigure}><Save size={15} aria-hidden="true" />{pending ? "جار الحفظ" : "حفظ"}</button><Link className={s.button} href={base}>إلغاء</Link></div></div><div className={s.content}>{error && <div role="alert" tabIndex={-1} ref={errorRef} className={s.error}>{error}</div>}{!snapshot.canConfigure && <div className={s.notice}>تعديل إعدادات التصنيع متاح لمالك العلامة</div>}<fieldset className={s.panel} disabled={!snapshot.canConfigure || pending}><legend className={s.panelTitle}>{selected?.name}</legend><div className={s.body}>{page === "general" ? <div className={s.grid}><label className={s.check}><input type="checkbox" checked={value.autoStartOrders} onChange={e => set("autoStartOrders", e.target.checked)} />بدء أوامر التصنيع الصادرة من الخطة تلقائيًا</label><label className={s.check}><input type="checkbox" checked={value.allowPartialMaterials} onChange={e => set("allowPartialMaterials", e.target.checked)} />السماح بإنهاء التصنيع بعد استلام جزئي للخامات</label></div> : page.endsWith("statuses") ? <><p className={s.hint}>حالات المتابعة للتصنيف ولا تغير حالة ترحيل المخزون</p>{(value[key] as string[]).map((status, i, all) => <div className={s.row} key={i}><Field label="اسم الحالة" required><input required maxLength={150} value={status} onChange={e => set(key, all.map((v, n) => n === i ? e.target.value : v))} /></Field><button className={s.danger} type="button" onClick={() => set(key, all.filter((_, n) => n !== i))}>حذف</button></div>)}<button className={s.button} type="button" onClick={() => set(key, [...value[key] as string[], ""])}>إضافة حالة</button></> : page.endsWith("fields") ? <ErpFieldBuilder sources={manufacturingFieldSources(snapshot)} fields={value[key] as ManufacturingField[]} onChange={next => set(key, next)} /> : <>{(value[key] as ManufacturingSettings["orderForms"]).map((form, i, all) => <section className={s.fieldCard} key={form.id}><div className={s.grid}><Field label="اسم النموذج" required><input required value={form.name} onChange={e => set(key, all.map((v, n) => n === i ? { ...v, name: e.target.value } : v))} /></Field><button className={s.danger} type="button" onClick={() => set(key, all.filter((_, n) => n !== i))}>حذف النموذج</button></div><ErpFieldBuilder sources={manufacturingFieldSources(snapshot)} fields={form.fields} onChange={next => set(key, all.map((v, n) => n === i ? { ...v, fields: next } : v))} /></section>)}<button className={s.button} type="button" onClick={() => set(key, [...value[key] as ManufacturingSettings["orderForms"], { id: `form_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, name: "", fields: [] }])}>إضافة نموذج</button></>}</div></fieldset></div></form>;
  return <div className={s.workspace} dir="rtl">
    <div className={s.heading}><Link href={base}>إعدادات التصنيع</Link>{selected && <><ChevronLeft size={15} aria-hidden="true" /><h1>{selected.name}</h1></>}</div>
    {page === "home" ? <div className={s.content}><h2 className={s.panelTitle}>عام</h2><div className={s.settingsGrid}>{links.map(link => <Link className={s.settingLink} href={link.href || `${base}/${link.id}`} key={link.id}><strong>{link.name}</strong><span>{link.description}</span></Link>)}</div></div>
      : !selected ? <div className={s.content}><p>صفحة الإعدادات غير موجودة</p><Link href={base}>العودة للإعدادات</Link></div>
      : modelsPage ? <div className={s.content}>
        <ManufacturingFormSettings key={page} snapshot={snapshot} targetKind={isPlan ? "plans" : "orders"} kind={page.endsWith("fields") ? "primary" : "related"} />
        {hasLegacy && <details className={s.panel}><summary>{page.endsWith("fields") ? "الحقول المحفوظة في السجلات الحالية" : "النماذج المحفوظة في سجل النشاطات"}</summary>{legacyEditor}</details>}
      </div> : legacyEditor}
  </div>;
}
