"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Star, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { finalizeInvoiceFileAction, invoiceFileDownloadAction, prepareInvoiceFileAction } from "@/app/actions/finance-invoice-files";
import { verifyInvoiceCustomFieldFileAction } from "@/app/actions/finance-invoice-custom-field-media";
import { COMPANY_FILE_BUCKET, COMPANY_FILE_LIMIT } from "@/lib/finance/company-invoice-options";
import { invoiceCustomFieldCapabilities, invoiceCustomFieldValueError, safeInvoiceCustomFieldContent, type InvoiceCustomField, type InvoiceCustomFieldSettings, type InvoiceCustomFieldValues } from "@/lib/finance/invoice-custom-fields";
import styles from "./invoice-custom-field-values.module.css";

type Props = { slug: string; settings: InvoiceCustomFieldSettings; settingsRevision: number; values: InvoiceCustomFieldValues; disabled: boolean; onChange: (id: string, value: InvoiceCustomFieldValues[string]) => void; onBusyChange: (busy: boolean) => void };
export function InvoiceCustomFieldValues(props: Props) {
  const uploads = useRef(new Set<string>());
  const busyCallback = useRef(props.onBusyChange); busyCallback.current = props.onBusyChange;
  useEffect(() => () => { busyCallback.current(false); }, []);
  if (!props.settings.fields.length) return null;
  return <section className={styles.section} aria-label={props.settings.title} dir="rtl"><h3>{props.settings.title}</h3><div className={styles.fields}>{props.settings.fields.filter(field => !field.hidden && !(field.type === 'free_static_content' && field.placement === 'view')).map(field => <Fragment key={field.id}>{field.newLine && <div className={styles.break} aria-hidden="true" />}<ValueField {...props} field={field} value={props.values[field.id]} onBusy={busy => { if (busy) uploads.current.add(field.id); else uploads.current.delete(field.id); busyCallback.current(uploads.current.size > 0); }} /></Fragment>)}</div></section>;
}

function ValueField({ field, value, onChange, disabled, slug, settingsRevision, onBusy }: Props & { field: InvoiceCustomField; value: InvoiceCustomFieldValues[string] | undefined; onBusy: (busy: boolean) => void }) {
  const id = useId(), [touched, setTouched] = useState(false), [query, setQuery] = useState('');
  const capabilities = invoiceCustomFieldCapabilities[field.type];
  const error = touched ? invoiceCustomFieldValueError(field, value, true) : null;
  const scalar = typeof value === 'string' ? value : '';
  const selected = Array.isArray(value) ? value : [];
  const change = (next: InvoiceCustomFieldValues[string]) => { if (!disabled) onChange(field.id, next); };
  if (field.type === 'separator') return <div className={styles.separator}><span>{field.label}</span><hr /></div>;
  if (field.type === 'free_static_content') return <div className={styles.staticContent} dangerouslySetInnerHTML={{ __html: safeInvoiceCustomFieldContent(field.content) }} />;
  const common = { id, disabled, 'aria-describedby': `${id}-help${error ? ` ${id}-error` : ''}`, 'aria-invalid': !!error, onBlur: () => setTouched(true), required: field.required, autoComplete: field.autocomplete ? 'on' : 'off', placeholder: field.placeholder };
  const filteredOptions = field.options.filter(option => !query || option.includes(query));
  return <div className={styles.field} data-size={field.size}>
    <label htmlFor={id}>{field.label}{field.required && <span className={styles.required} aria-hidden="true"> *</span>}</label>
    {field.type === 'multiline' ? <textarea {...common} maxLength={capabilities.rangeKind === 'length' && field.maximum ? Math.min(10000, Number(field.maximum)) : 10000} value={scalar} onChange={event => change(event.target.value)} />
      : field.type === 'dropdown' || field.type === 'multiple_dropdown' ? <>{field.quickSearch && <input aria-label={`بحث في ${field.label}`} type="search" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} />}<select {...common} multiple={field.type === 'multiple_dropdown'} value={field.type === 'multiple_dropdown' ? selected : scalar} onChange={event => change(field.type === 'multiple_dropdown' ? Array.from(event.currentTarget.selectedOptions, option => option.value) : event.target.value)}>{field.type === 'dropdown' && <option value="">اختر</option>}{field.options.filter(option => filteredOptions.includes(option) || selected.includes(option) || scalar === option).map(option => <option key={option} value={option}>{option}</option>)}</select></>
      : field.type === 'radio' || field.type === 'multiple_checkbox' ? <div id={id} className={styles.choices} role="group" aria-label={field.label}>{field.options.map(option => <label key={option}><input disabled={disabled} type={field.type === 'radio' ? 'radio' : 'checkbox'} name={id} value={option} checked={field.type === 'radio' ? scalar === option : selected.includes(option)} onChange={event => change(field.type === 'radio' ? option : event.target.checked ? [...selected, option] : selected.filter(item => item !== option))} onBlur={() => setTouched(true)} />{option}</label>)}</div>
      : field.type === 'checkbox' ? <input {...common} type="checkbox" checked={value === true} onChange={event => change(event.target.checked)} />
      : field.type === 'rating_input' ? <div id={id} className={styles.rating} role="radiogroup" aria-label={field.label}>{[1, 2, 3, 4, 5].map(star => <label key={star}><input type="radio" name={id} disabled={disabled} aria-label={`${star} من 5`} checked={scalar === String(star)} onChange={() => change(String(star))} /><Star size={24} aria-hidden="true" fill={Number(scalar) >= star ? 'currentColor' : 'none'} /></label>)}<button type="button" disabled={disabled || !scalar} onClick={() => change(null)} aria-label={`مسح ${field.label}`}>×</button></div>
      : field.type === 'file_upload' || field.type === 'image_upload' ? <CustomFile slug={slug} field={field} settingsRevision={settingsRevision} value={scalar} disabled={disabled} onChange={next => onChange(field.id, next)} onBusy={onBusy} id={id} />
      : <div className={styles.inputGroup}>{field.type === 'currency' && <span>{field.currency}</span>}<input {...common} type={field.type === 'email' ? 'email' : field.type === 'website' ? 'url' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'datetime' ? 'datetime-local' : 'text'} inputMode={['number', 'decimal', 'currency'].includes(field.type) ? 'decimal' : undefined} maxLength={10000} min={capabilities.rangeKind === 'date' || capabilities.rangeKind === 'datetime' ? field.minimum ?? undefined : undefined} max={capabilities.rangeKind === 'date' || capabilities.rangeKind === 'datetime' ? field.maximum ?? undefined : undefined} value={scalar} onChange={event => change(event.target.value)} /></div>}
    <small id={`${id}-help`}>{field.instructions}</small>{error && <small id={`${id}-error`} className={styles.error} role="alert">{error}</small>}
  </div>;
}

function CustomFile({ slug, field, settingsRevision, value, disabled, onChange, onBusy, id }: { slug: string; field: InvoiceCustomField; settingsRevision: number; value: string; disabled: boolean; onChange: (value: string | null) => void; onBusy: (busy: boolean) => void; id: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [file, setFile] = useState<{ id: string; name: string; size: number } | null>(null);
  const pending = useRef<{ id: string; finalized: boolean } | null>(null), lock = useRef(false), active = useRef(true);
  const callbacks = useRef({ onChange, onBusy }); callbacks.current = { onChange, onBusy };
  useEffect(() => { active.current = true; return () => { active.current = false; callbacks.current.onBusy(false); }; }, []);
  async function run(task: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); callbacks.current.onBusy(true); setError('');
    try { await task(); } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : 'تعذر تأكيد الملف أعد المحاولة'); }
    finally { lock.current = false; if (active.current) { setBusy(false); callbacks.current.onBusy(false); } }
  }
  async function confirmFile() {
    const item = pending.current; if (!item) return;
    if (!item.finalized) { const finalized = await finalizeInvoiceFileAction(item.id, slug); if (!finalized.ok) throw new Error(finalized.message); item.finalized = true; }
    const verified = await verifyInvoiceCustomFieldFileAction(slug, { fieldId: field.id, settingsRevision, fileId: item.id });
    if (!verified.ok) throw new Error(verified.message);
    pending.current = null;
    if (active.current) { setFile(verified.data.file); callbacks.current.onChange(verified.data.fileId); }
  }
  const upload = (selected?: File) => {
    if (!selected || disabled || pending.current) return;
    void run(async () => {
      if (!selected.size || selected.size > COMPANY_FILE_LIMIT) throw new Error('اختر ملفًا بحجم لا يتجاوز ٨ ميجابايت');
      const prepared = await prepareInvoiceFileAction({ id: crypto.randomUUID(), name: selected.name, size: selected.size }, slug); if (!prepared.ok) throw new Error(prepared.message);
      const result = await createClient().storage.from(COMPANY_FILE_BUCKET).uploadToSignedUrl(prepared.data.path, prepared.data.token, selected, { contentType: 'application/octet-stream', upsert: false });
      if (result.error) throw new Error('تعذر رفع الملف أعد المحاولة');
      pending.current = { id: prepared.data.file.id, finalized: false }; await confirmFile();
    });
  };
  return <div className={styles.file} aria-busy={busy}><label className={styles.upload}><Upload size={16} aria-hidden="true" />اختر ملفًا<input id={id} type="file" disabled={disabled || busy || !!pending.current} accept={field.type === 'image_upload' ? 'image/*' : undefined} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>{value && <div><button type="button" disabled={busy} onClick={() => void run(async () => { const result = await invoiceFileDownloadAction(value, slug); if (!result.ok) throw new Error(result.message); const link = document.createElement('a'); link.href = result.data; link.rel = 'noreferrer'; link.click(); })}>{file?.id === value ? file.name : 'تنزيل الملف المرفق'}</button><button type="button" aria-label={`إزالة ملف ${field.label}`} disabled={disabled || busy} onClick={() => onChange(null)}><Trash2 size={16} /></button></div>}{pending.current && !busy && <button type="button" disabled={disabled} onClick={() => void run(confirmFile)}>إعادة تأكيد الملف المرفوع</button>}{busy && <small role="status">جار تأكيد الملف</small>}{error && <small className={styles.error} role="alert">{error}</small>}</div>;
}
