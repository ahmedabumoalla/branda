"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { finalizeInvoiceFileAction, invoiceFileDownloadAction, listInvoiceFilesAction, prepareInvoiceFileAction } from "@/app/actions/finance-invoice-files";
import { COMPANY_FILE_BUCKET, COMPANY_FILE_LIMIT, type InvoiceFile } from "@/lib/finance/company-invoice-options";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
import editor from "./finance-sale-form.module.css";

export function CompanyInvoiceFiles({ slug, files, onChange, disabled, onBusyChange, documentLabel = "الفاتورة" }: { slug: string; files: InvoiceFile[]; onChange: (files: InvoiceFile[]) => void; disabled: boolean; onBusyChange: (busy: boolean) => void; documentLabel?: "الفاتورة" | "الدفعة" }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [library, setLibrary] = useState<InvoiceFile[]>([]);
  const [choice, setChoice] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تنفيذ الطلب أعد المحاولة"); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  const upload = (file?: File) => {
    if (!file || disabled || pendingFile) return;
    void run(async () => {
      if (!file.size || file.size > COMPANY_FILE_LIMIT) throw new Error("اختر ملفًا بحجم لا يتجاوز ٨ ميجابايت");
      if (files.length >= 20) throw new Error("الحد الأقصى ٢٠ مستندًا لكل عملية");
      const prepared = await prepareInvoiceFileAction({ id: crypto.randomUUID(), name: file.name, size: file.size }, slug);
      if (!prepared.ok) throw new Error(prepared.message);
      const result = await createClient().storage.from(COMPANY_FILE_BUCKET).uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: "application/octet-stream", upsert: false });
      if (result.error) throw new Error("تعذر رفع الملف تحقق من الاتصال ثم أعد المحاولة");
      setPendingFile(prepared.data.file.id);
      const finalized = await finalizeInvoiceFileAction(prepared.data.file.id, slug);
      if (!finalized.ok) throw new Error(finalized.message);
      setPendingFile(null);
      onChange([...files, finalized.data]);
    });
  };
  return <div aria-busy={busy}>
    <h3 className={styles.invoiceHeading}>إرفاق المستندات</h3>
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={disabled || busy} aria-pressed={mode === "new"} onClick={() => setMode("new")}>مستند جديد</button>
      <button type="button" className={styles.secondary} disabled={disabled || busy} aria-pressed={mode === "existing"} onClick={() => { setMode("existing"); void run(async () => { const result = await listInvoiceFilesAction(slug); if (!result.ok) throw new Error(result.message); setLibrary(result.data); }); }}>الملفات التي تم رفعها مسبقًا</button>
    </div>
    {mode === "new" ? <div className={editor.upload} data-dragging={dragging} onDragOver={event => { event.preventDefault(); if (!disabled && !busy && !pendingFile) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy && !pendingFile) upload(event.dataTransfer.files[0]); }}><Upload size={24} aria-hidden="true" /><span>أفلت الملف هنا أو اختر من جهازك</span><button type="button" className={styles.secondary} disabled={disabled || busy || !!pendingFile || files.length >= 20} onClick={() => input.current?.click()}>اختيار ملف</button><input hidden disabled={disabled || busy || !!pendingFile} ref={input} type="file" onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} /><small>حتى ٨ ميجابايت للمستند و٢٠ مستندًا للعملية</small></div> : <>
      {search && <Field label="البحث باسم المستند"><input value={query} onChange={event => setQuery(event.target.value)} /></Field>}
      <div className={styles.fields}><Field label="المستند"><select disabled={disabled || busy} value={choice} onChange={event => setChoice(event.target.value)}><option value="">اختر مستندًا</option>{library.filter(file => !files.some(item => item.id === file.id) && file.name.includes(query.trim())).map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></Field><div className={styles.actions}><button type="button" className={styles.secondary} disabled={disabled || busy || !choice || files.length >= 20} onClick={() => { const file = library.find(item => item.id === choice); if (file && !files.some(item => item.id === file.id)) onChange([...files, file]); setChoice(""); }}>أرفق</button><button type="button" className={styles.secondary} aria-expanded={search} onClick={() => setSearch(!search)}>بحث متقدم</button></div></div>
      {!busy && library.length === 0 && <p className={styles.muted}>لا توجد مستندات مرفوعة مسبقًا</p>}
    </>}
    {files.length > 0 && <ul className={editor.fileList}>{files.map(file => <li key={file.id}><Paperclip size={16} aria-hidden="true" /><button type="button" className={styles.secondary} disabled={busy} onClick={() => void run(async () => { const result = await invoiceFileDownloadAction(file.id, slug); if (!result.ok) throw new Error(result.message); const link = document.createElement("a"); link.href = result.data; link.rel = "noreferrer"; link.click(); })}>{file.name}</button><small>{Math.ceil(file.size / 1024)} KB</small><button type="button" disabled={disabled || busy} aria-label={`إزالة ${file.name} من ${documentLabel}`} onClick={() => onChange(files.filter(item => item.id !== file.id))}><Trash2 size={16} aria-hidden="true" /></button></li>)}</ul>}
    <p className={styles.muted} role="status">{busy ? "جار تنفيذ طلب المستند" : files.length ? documentLabel === "الدفعة" ? "تُربط المستندات بالدفعة عند تحديث الدفع" : "تُربط المستندات بالفاتورة عند حفظ المسودة أو الإصدار" : ""}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {pendingFile && !busy && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => void run(async () => { if (files.length >= 20 && !files.some(file => file.id === pendingFile)) throw new Error("أزل مستندًا قبل إرفاق المستند المرفوع فالحد الأقصى ٢٠ مستندًا"); const result = await finalizeInvoiceFileAction(pendingFile, slug); if (!result.ok) throw new Error(result.message); if (!files.some(file => file.id === result.data.id)) onChange([...files, result.data]); setPendingFile(null); })}>إعادة تأكيد المستند المرفوع</button>}
  </div>;
}

export function InvoiceFileDownloads({ files, slug }: { files: InvoiceFile[]; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  if (!files.length) return null;
  return <section aria-label="مستندات الفاتورة"><ul className={editor.fileList}>{files.map(file => <li key={file.id}><Paperclip size={16} aria-hidden="true" /><button type="button" disabled={busy} onClick={async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await invoiceFileDownloadAction(file.id, slug); if (!result.ok) throw new Error(result.message); const link = document.createElement("a"); link.href = result.data; link.rel = "noreferrer"; link.click(); }
    catch { setError("تعذر تنزيل المستند أعد المحاولة"); } finally { lock.current = false; setBusy(false); }
  }}>{file.name}</button></li>)}</ul>{error && <p role="alert">{error}</p>}</section>;
}
