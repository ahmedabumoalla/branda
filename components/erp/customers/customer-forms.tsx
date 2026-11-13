"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "@/components/erp/navigation";
import { withBranchScope } from "@/components/erp/branches/context";
import { Modal } from "@/components/dashboard/ui/modal";
import { ErpFieldBuilder } from "@/components/erp/fields/field-builder";
import { ErpFieldValues } from "@/components/erp/fields/field-values";
import { ErpFiles } from "@/components/erp/files";
import { saveCustomerForm } from "@/app/actions/erp-customer-forms";
import {
  customerFormSchema,
  customerFormInput,
  customerFormSources,
  newCustomerForm,
  type CustomerFormInput,
  type CustomerForm,
  type CustomerFormEntry,
  type CustomerFormsCommand,
  type CustomerFormsSnapshot,
} from "@/lib/erp/customer-forms";
import { type CustomerFormsContext } from "@/lib/erp/customer-forms";
import { validateErpFieldValues } from "@/lib/erp/custom-fields";
import { workflowSelectorModes, type WorkflowSelector } from "@/lib/erp/workflows";
import s from "../manufacturing/manufacturing.module.css";

type TargetKind = "customers";
const operationLabels = { create: "إضافة سجل", read: "عرض السجل", update: "تعديل السجل", delete: "حذف السجل" };

function useSave(snapshot: CustomerFormsContext) {
  const router = useRouter();
  const lock = useRef(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(command: CustomerFormsCommand) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify(command);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await saveCustomerForm(withBranchScope(command, snapshot.forms), request.current.id, snapshot.slug);
      if (!result.ok) { setError(result.message); return false; }
      request.current = null;
      snapshot.onSaved?.();
      router.refresh();
      return true;
    } catch {
      setError("تعذر تأكيد الحفظ احتفظنا بالبيانات للمحاولة مجددًا");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { save, busy, error, setError };
}

function ErrorMessage({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return message ? <p className={s.error} role="alert" tabIndex={-1} ref={ref}>{message}</p> : null;
}

function Selector({ value, onChange, label, data }: {
  value: WorkflowSelector; onChange: (value: WorkflowSelector) => void;
  label: string; data: CustomerFormsSnapshot;
}) {
  const options = data.lookups[value.mode] ?? [];
  return <label className={s.field}>{label}
    <select value={value.mode} onChange={event => onChange({ mode: event.target.value as WorkflowSelector["mode"], ids: [] })}>
      {Object.entries(workflowSelectorModes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select>
    {!["everyone", "none"].includes(value.mode) && <select multiple size={Math.max(2, Math.min(6, options.length))} aria-label={`نطاق ${label}`} value={value.ids}
      onChange={event => onChange({ ...value, ids: Array.from(event.target.selectedOptions, option => option.value) })}>
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>}
  </label>;
}

export function CustomerFormDefinition({ initial, snapshot, onClose }: {
  initial: CustomerFormInput; snapshot: CustomerFormsContext; onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState("general");
  const { save, busy, error, setError } = useSave(snapshot);
  const panelId = useId();
  const data = snapshot.forms;
  const patch = (change: Partial<CustomerFormInput>) => setValue(current => ({ ...current, ...change }));
  if (!data) return <p className={s.error} role="alert">تعذر تحميل إعدادات نماذج العملاء</p>;
  const disabled = busy || !data.canConfigure;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const result = customerFormSchema.safeParse(value);
    if (!result.success) { setError("راجع الاسم والمعرف والحقول ونطاق الصلاحيات"); return; }
    if (await save({ action: "model", payload: result.data })) onClose();
  }
  return <form onSubmit={submit} className={s.panel}>
    <div className={s.toolbar}><h2>{initial.revision ? "تعديل النموذج" : "إضافة نموذج"}</h2><div className={s.actions}>
      <button className={s.primary} disabled={disabled}>{busy ? "جار الحفظ" : "حفظ"}</button>
      <button className={s.button} type="button" disabled={busy} onClick={onClose}>إلغاء</button>
    </div></div>
    <ErrorMessage message={error} />
    <nav className={s.tabs} aria-label="إعداد النموذج">
      {[["general", "معلومات النموذج"], ["fields", "الحقول"], ["permissions", "الصلاحيات"]].map(([key, title]) =>
        <button type="button" key={key} aria-current={tab === key ? "page" : undefined} aria-controls={panelId} onClick={() => setTab(key)}>{title}</button>)}
    </nav>
    <fieldset id={panelId} className={s.body} disabled={disabled} inert={disabled || undefined} style={{ border: 0, margin: 0, minWidth: 0 }}>
      {tab === "general" && <div className={s.grid}>
        <label className={s.field}>الاسم *<input required maxLength={160} value={value.name} onChange={event => patch({ name: event.target.value })} /></label>
        <label className={s.field}>المعرف *<input required maxLength={60} dir="ltr" pattern="[a-z][a-z0-9_]{0,59}" value={value.key} onChange={event => patch({ key: event.target.value })} /></label>
        <label className={s.field}>الحالة<select value={value.active ? "active" : "inactive"} onChange={event => patch({ active: event.target.value === "active" })}><option value="active">نشط</option><option value="inactive">غير نشط</option></select></label>
        <label className={s.field}>حقل الاسم<select value={value.nameField} onChange={event => patch({ nameField: event.target.value })}>
          <option value="">بدون حقل اسم</option>{value.fields.filter(field => ["text", "number", "date", "email", "phone"].includes(field.type)).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select></label>
        <label className={`${s.field} ${s.span2}`}>الوصف<textarea maxLength={5000} value={value.description} onChange={event => patch({ description: event.target.value })} /></label>
      </div>}
      {tab === "fields" && <ErpFieldBuilder fields={value.fields} onChange={fields => patch({ fields })} sources={customerFormSources(snapshot)} />}
      {tab === "permissions" && <>
        <div className={s.grid}>{(["create", "read", "update", "delete"] as const).map(operation =>
          <Selector key={operation} label={operationLabels[operation]} value={value.permissions[operation]} data={data} onChange={next => patch({ permissions: { ...value.permissions, [operation]: next } })} />)}
        </div>
        <section className={s.sections}><h3>صلاحيات الحقول</h3>
          {value.permissions.fieldRules.map((rule, index) => {
            const update = (change: Partial<typeof rule>) => patch({ permissions: { ...value.permissions, fieldRules: value.permissions.fieldRules.map((current, i) => i === index ? { ...current, ...change } : current) } });
            return <section key={rule.id} className={s.fieldCard}>
              <Selector label="تنطبق على" value={rule.selector} data={data} onChange={selector => update({ selector })} />
              <div className={s.grid}>{(["create", "read", "update"] as const).map(operation => <label className={s.field} key={operation}>
                {operation === "create" ? "الحقول عند الإضافة" : operation === "read" ? "الحقول عند العرض" : "الحقول عند التعديل"}
                <select multiple value={rule[operation]} onChange={event => update({ [operation]: Array.from(event.target.selectedOptions, option => option.value) })}>
                  {value.fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
                </select>
              </label>)}</div>
              <button className={s.danger} type="button" onClick={() => patch({ permissions: { ...value.permissions, fieldRules: value.permissions.fieldRules.filter((_, i) => i !== index) } })}>حذف القاعدة</button>
            </section>;
          })}
          <button type="button" className={s.button} onClick={() => patch({ permissions: { ...value.permissions, fieldRules: [...value.permissions.fieldRules, { id: crypto.randomUUID(), selector: { mode: "everyone", ids: [] }, create: value.fields.map(field => field.id), read: value.fields.map(field => field.id), update: value.fields.map(field => field.id) }] } })}>إضافة قاعدة حقول</button>
        </section>
      </>}
    </fieldset>
  </form>;
}

export function CustomerFormSettings({ snapshot, targetKind, kind }: {
  snapshot: CustomerFormsContext; targetKind: TargetKind; kind: "primary" | "related";
}) {
  const [editing, setEditing] = useState<CustomerFormInput | null>(null);
  const [deleting, setDeleting] = useState<CustomerForm | null>(null);
  const { save, busy, error } = useSave(snapshot);
  const data = snapshot.forms;
  if (!data) return <p className={s.error} role="alert">تعذر تحميل نماذج العملاء</p>;
  if (editing) return <CustomerFormDefinition key={editing.id} initial={editing} snapshot={snapshot} onClose={() => setEditing(null)} />;
  const models = data.models.filter(model => model.targetKind === targetKind && model.kind === kind);
  return <section className={s.panel}>
    <h2 className={s.panelTitle}>{kind === "primary" ? "نموذج المعلومات الإضافية وصلاحياته" : "النماذج المرتبطة وصلاحياتها"}</h2>
    <div className={s.body}>
      <ErrorMessage message={deleting ? "" : error} />
      {!data.canConfigure && <p className={s.notice}>إعداد نماذج العملاء متاح لمالك العلامة</p>}
      {models.map(model => <article className={s.history} key={model.id}>
        <h3>{model.name}</h3>{model.description && <p>{model.description}</p>}
        <p className={s.hint}><bdi>{model.key}</bdi> — {model.active ? "نشط" : "غير نشط"} — {model.fields.length} حقل</p>
        {data.canConfigure && <div className={s.actions}>
          <button className={s.button} type="button" onClick={() => setEditing(customerFormInput(model))}>تعديل النموذج</button>
          <button className={s.danger} type="button" onClick={() => setDeleting(model)}>حذف</button>
        </div>}
      </article>)}
      {!models.length && <p className={s.empty}>لا توجد نماذج محفوظة</p>}
      {data.canConfigure && (kind === "related" || !models.length) && <button className={s.primary} type="button" onClick={() => setEditing(newCustomerForm(targetKind, kind))}>إضافة نموذج</button>}
    </div>
    <Modal open={!!deleting} title="تأكيد حذف النموذج" onClose={() => { if (!busy) setDeleting(null); }} footer={<div className={s.actions}>
      <button className={s.danger} disabled={busy} onClick={async () => { if (deleting && await save({ action: "delete", payload: { entity: "model", id: deleting.id, revision: deleting.revision } })) setDeleting(null); }}>{busy ? "جار الحذف" : "تأكيد الحذف"}</button>
      <button className={s.button} disabled={busy} onClick={() => setDeleting(null)}>إلغاء</button>
    </div>}><ErrorMessage message={error} /><p>حذف النموذج {deleting?.name}؟ النماذج التي تحتوي سجلات محفوظة محمية من الحذف</p></Modal>
  </section>;
}

export function CustomerFormEntryEditor({ snapshot, model, initial, recordId, targetKind, onClose }: {
  snapshot: CustomerFormsContext; model: CustomerForm; initial?: CustomerFormEntry;
  recordId: string; targetKind: TargetKind; onClose: () => void;
}) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [values, setValues] = useState<Record<string, unknown>>(initial?.values ?? {});
  const { save, busy, error, setError } = useSave(snapshot);
  const keys = model.allowedFields[initial ? "update" : "create"];
  const fields = model.fields.filter(field => keys.includes(field.id));
  const sources = customerFormSources(snapshot);
  const allowed = model.active && (initial ? initial.canUpdate : model.canCreate);
  async function submit(draft: boolean) {
    if (!allowed || busy) return;
    const changed = Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)));
    if (!draft) {
      const errors = validateErpFieldValues(fields, changed, sources);
      if (errors.length) { setError(errors.join(" — ")); return; }
    }
    if (await save({ action: "entry", payload: { id, revision: initial?.revision ?? 0, modelId: model.id, recordId, targetKind, draft, values: changed } })) onClose();
  }
  return <form className={s.panel} onSubmit={event => { event.preventDefault(); void submit(false); }}>
    <h2 className={s.panelTitle}>{model.name}</h2>
    <div className={s.body}>
      <ErrorMessage message={error} />
      <fieldset disabled={busy || !allowed} inert={busy || !allowed || undefined} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <ErpFieldValues fields={fields} values={values} update={(key, value) => setValues(current => ({ ...current, [key]: value }))} sources={sources}
          fileContext={initial ? { slug: snapshot.slug, recordId: id, entityType: "customer_form_entry" } : undefined} />
      </fieldset>
      {!initial && fields.some(field => ["file", "image"].includes(field.type)) && <p className={s.hint}>احفظ السجل كمسودة لإضافة المرفقات ثم أكمل الحقول واحفظه</p>}
      {initial?.canFiles && <ErpFiles entityType="customer_form_entry" recordId={id} slug={snapshot.slug} canWrite={!busy && allowed} />}
    </div>
    <div className={s.toolbar}>
      <button className={s.primary} disabled={busy || !allowed}>{busy ? "جار الحفظ" : "حفظ"}</button>
      <button className={s.button} type="button" disabled={busy || !allowed} onClick={() => void submit(true)}>حفظ كمسودة</button>
      <button className={s.button} type="button" disabled={busy} onClick={onClose}>إلغاء</button>
    </div>
  </form>;
}

export function CustomerRecordForms({ snapshot, recordId, targetKind }: {
  snapshot: CustomerFormsContext; recordId: string; targetKind: TargetKind;
}) {
  const [edit, setEdit] = useState<{ model: CustomerForm; entry?: CustomerFormEntry } | null>(null);
  const [deleting, setDeleting] = useState<CustomerFormEntry | null>(null);
  const { save, busy, error } = useSave(snapshot);
  const data = snapshot.forms;
  if (!data) return <p className={s.error} role="alert">تعذر تحميل نماذج العملاء</p>;
  if (edit) return <CustomerFormEntryEditor key={edit.entry?.id ?? edit.model.id} snapshot={snapshot} model={edit.model} initial={edit.entry} recordId={recordId} targetKind={targetKind} onClose={() => setEdit(null)} />;
  const models = data.models.filter(model => model.targetKind === targetKind && model.canRead);
  const events = data.events.filter(event => event.recordId === recordId);
  return <>
    <h2 className={s.panelTitle}>المعلومات الإضافية والنماذج المرتبطة</h2>
    <ErrorMessage message={deleting ? "" : error} />
    {!models.length && <p className={s.empty}>لا توجد نماذج متاحة لهذا السجل</p>}
    {models.map(model => {
      const entries = data.entries.filter(entry => entry.recordId === recordId && entry.modelId === model.id);
      return <section className={s.panel} key={model.id}>
        <h3 className={s.panelTitle}>{model.name}</h3>
        <div className={s.body}>
          {entries.map(entry => <article className={s.history} key={entry.id}>
            <h4>{String(entry.values[model.nameField] ?? model.name)} {entry.draft && <span className={s.badge}>مسودة</span>}</h4>
            <ErpFieldValues fields={model.fields.filter(field => model.allowedFields.read.includes(field.id))} values={entry.values} readOnly update={() => {}} sources={customerFormSources(snapshot)}
              fileContext={{ slug: snapshot.slug, recordId: entry.id, entityType: "customer_form_entry" }} />
            <div className={s.actions}>
              {entry.canUpdate && <button className={s.button} onClick={() => setEdit({ model, entry })}>تعديل</button>}
              {entry.canDelete && <button className={s.danger} onClick={() => setDeleting(entry)}>حذف</button>}
            </div>
            {entry.canFiles && <ErpFiles entityType="customer_form_entry" recordId={entry.id} slug={snapshot.slug} canWrite={entry.canFiles} />}
          </article>)}
          {!entries.length && <p className={s.hint}>لا توجد سجلات محفوظة لهذا النموذج</p>}
          {model.active && model.canCreate && (model.kind === "related" || !entries.length) && <button className={s.primary} onClick={() => setEdit({ model })}>إضافة سجل</button>}
        </div>
      </section>;
    })}
    {events.length > 0 && <section className={s.panel}><h3 className={s.panelTitle}>سجل النماذج</h3><div className={s.body}>
      {events.map(event => <p key={event.id}>{({ entry: "حفظ سجل النموذج", model: "تحديث النموذج", delete: "حذف سجل" } as Record<string, string>)[event.action] ?? event.action} — <time dateTime={event.at}>{event.at.slice(0, 10)}</time></p>)}
    </div></section>}
    <Modal open={!!deleting} title="تأكيد حذف سجل النموذج" onClose={() => { if (!busy) setDeleting(null); }} footer={<div className={s.actions}>
      <button className={s.danger} disabled={busy} onClick={async () => { if (deleting && await save({ action: "delete", payload: { id: deleting.id, revision: deleting.revision, entity: "entry" } })) setDeleting(null); }}>{busy ? "جار الحذف" : "تأكيد الحذف"}</button>
      <button className={s.button} disabled={busy} onClick={() => setDeleting(null)}>إلغاء</button>
    </div>}><ErrorMessage message={error} /><p>هل تريد حذف هذا السجل؟ المرفقات المرتبطة تمنع حذفه</p></Modal>
  </>;
}
