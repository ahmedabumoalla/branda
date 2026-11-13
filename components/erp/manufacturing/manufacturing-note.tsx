'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadErpFile, listErpFiles, uploadErpFile } from '@/app/actions/erp-files';
import { safeErpRichText } from '@/lib/erp/custom-fields';
import { ERP_FILE_MAX, type ErpFile, type ErpFileEntity } from '@/lib/erp/files';
import { RichText } from '../fields/field-values';
import s from '../erp.module.css';

export type ManufacturingNoteDraft = { note: string; tags: string; occurredAt: string; attachmentIds: string[] };
type Target = { slug: string; recordId: string; entityType: ErpFileEntity };

export function ManufacturingNoteEditor({ value, onChange, target, disabled, onBusyChange }: {
  value: ManufacturingNoteDraft; onChange: (value: ManufacturingNoteDraft) => void;
  target: Target; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [files, setFiles] = useState<ErpFile[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const uploadLock = useRef(false), retry = useRef<{ key: string; id: string } | null>(null);
  const { slug, recordId, entityType } = target;
  const refresh = useCallback(async () => {
    const result = await listErpFiles(slug, { recordId, entityType });
    if (!result.ok) throw new Error(result.message);
    setFiles(result.data.filter(file => file.uploaded));
  }, [slug, recordId, entityType]);
  useEffect(() => {
    let active = true;
    listErpFiles(slug, { recordId, entityType }).then(result => {
      if (!active) return;
      if (result.ok) setFiles(result.data.filter(file => file.uploaded)); else setError(result.message);
    }).catch(() => { if (active) setError('تعذر تحميل المرفقات'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, recordId, entityType]);
  async function upload(file: File) {
    if (uploadLock.current || disabled) return;
    if (value.attachmentIds.length >= 20) { setError('اختر عشرين مرفقًا كحد أقصى'); return; }
    if (!file.size || file.size > ERP_FILE_MAX) { setError('اختر ملفًا لا يتجاوز خمسة ميجابايت'); return; }
    uploadLock.current = true; onBusyChange(true); setError('');
    const key = [file.name, file.size, file.lastModified, recordId].join(':');
    if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    try {
      const data = new FormData(); data.set('file', file);
      const id = retry.current.id;
      const result = await uploadErpFile(slug, { recordId, entityType, id }, data);
      if (!result.ok) throw new Error(result.message);
      await refresh();
      onChange({ ...value, attachmentIds: [...new Set([...value.attachmentIds, id])] });
      retry.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر رفع المرفق أعد المحاولة بالملف نفسه'); }
    finally { uploadLock.current = false; onBusyChange(false); }
  }
  return <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0 }}>
    <label className={s.field}><span>التاريخ والوقت بتوقيت الرياض</span><input type="datetime-local" required value={value.occurredAt} onChange={event => onChange({ ...value, occurredAt: event.target.value })} /></label>
    <div className={s.field}><span>الملاحظة</span><RichText value={value.note} onChange={note => onChange({ ...value, note })} label="نص الملاحظة" readOnly={disabled} /></div>
    <label className={s.field}><span>الوسوم</span><input value={value.tags} maxLength={1700} placeholder="افصل الوسوم بفاصلة" onChange={event => onChange({ ...value, tags: event.target.value })} /></label>
    <label className={s.field}><span>إرفاق ملف بالملاحظة</span><input type="file" accept=".png,.jpg,.jpeg,.pdf,.docx" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label>
    {loading && <p role="status">جار تحميل المرفقات</p>}
    {error && <p role="alert" className={s.error}>{error}<button type="button" className={s.button} onClick={() => { setError(''); void refresh().catch(() => setError('تعذر تحميل المرفقات')); }}>إعادة تحميل المرفقات</button></p>}
    {!!files.length && <div aria-label="مرفقات الملاحظة">{files.map(file => <label className={s.checkbox} key={file.id}><input type="checkbox" checked={value.attachmentIds.includes(file.id)} disabled={!value.attachmentIds.includes(file.id) && value.attachmentIds.length >= 20} onChange={event => onChange({ ...value, attachmentIds: event.target.checked ? [...value.attachmentIds, file.id] : value.attachmentIds.filter(id => id !== file.id) })} />{file.name}</label>)}</div>}
  </fieldset>;
}

export function ManufacturingNoteContent({ note, payload, target }: { note: string; payload: Record<string, unknown>; target: Target }) {
  const [error, setError] = useState('');
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const files = Array.isArray(payload.attachmentIds) ? payload.attachmentIds.filter((id): id is string => typeof id === 'string') : [];
  return <div>
    {payload.format === 'rich' ? <div style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: safeErpRichText(note) }} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{note}</p>}
    {!!tags.length && <div className={s.inline} aria-label="وسوم الملاحظة">{tags.map(tag => <span key={tag} className={s.badge}>{tag}</span>)}</div>}
    {!!files.length && <div className={s.inline} aria-label="مرفقات الملاحظة">{files.map((id, index) => <button type="button" className={s.button} key={id} onClick={async () => {
      setError('');
      try {
        const result = await downloadErpFile(target.slug, { recordId: target.recordId, entityType: target.entityType, id });
        if (!result.ok) throw new Error(result.message);
        const link = document.createElement('a'); link.href = result.data.url; link.rel = 'noopener'; link.click();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تنزيل المرفق'); }
    }}>تنزيل المرفق {index + 1}</button>)}</div>}
    {error && <p role="alert" className={s.error}>{error}</p>}
  </div>;
}
