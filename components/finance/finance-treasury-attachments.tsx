"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, Download, FileText, Paperclip, RefreshCw } from "lucide-react";
import { compressTreasuryImage, type TreasuryAttachment } from "@/lib/finance/treasury-attachments";
import { uploadTreasuryFile } from "@/lib/finance/treasury-upload";
import styles from "./finance-treasury-attachments.module.css";

type PendingFile = { id: string; file: File; error?: string };
// Keep the same upload identity when a partially completed draft is reopened
const preparedDraftFiles = new WeakMap<File, Map<string, PendingFile>>();
type Prepared = { attachment: TreasuryAttachment; uploaded: boolean; path?: string; token?: string; error?: string };
const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

type Props = { slug: string; documentId: string; readOnly?: boolean; initialFiles?: File[]; onInitialFilesUploaded?: () => void };
export function FinanceTreasuryAttachments(props: Props) {
  return <TreasuryAttachments key={`${props.slug}/${props.documentId}`} {...props} />;
}
function TreasuryAttachments({ slug, documentId, readOnly = false, initialFiles, onInitialFilesUploaded }: Props) {
  const base = `/api/finance/${encodeURIComponent(slug)}/treasury-attachments`;
  const query = `?documentId=${encodeURIComponent(documentId)}`;
  const [files, setFiles] = useState<TreasuryAttachment[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const chooser = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const uploadController = useRef<AbortController | null>(null);
  const initialStarted = useRef(false);
  const initialRemaining = useRef<Set<string> | null>(null);
  async function upload(entries: PendingFile[]) {
    if (working.current || readOnly) return;
    working.current = true; setBusy(true); setError("");
    try {
      for (const [index, entry] of entries.entries()) {
        if (!mounted.current) break;
        setStatus(`جار رفع الملف ${index + 1} من ${entries.length}`);
        try {
          if (entry.file.size < 1) throw new Error("اختر ملفًا غير فارغ");
          const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, id: entry.id, name: entry.file.name, size: entry.file.size }) });
          const prepared = await response.json() as Prepared;
          if (!response.ok) throw new Error(prepared.error || "تعذر تجهيز المرفق");
          let attachment = prepared.attachment;
          if (!prepared.uploaded) {
            // A prior upload may have finished while its HTTP response was lost
            let finish = await fetch(`${base}/${entry.id}${query}`, { method: "POST" });
            if (!finish.ok) {
              if (!prepared.path || !prepared.token) throw new Error("تعذر تجهيز المرفق");
              await uploadTreasuryFile(entry.file, prepared.path, prepared.token, (uploaded, total) => {
                if (mounted.current) setStatus(`جار رفع الملف ${index + 1} من ${entries.length} — ${Math.round(uploaded / total * 100)}٪`);
              }, uploadController.current?.signal);
              finish = await fetch(`${base}/${entry.id}${query}`, { method: "POST" });
            }
            const body = await finish.json();
            if (!finish.ok) throw new Error(body.error || "تعذر إكمال المرفق");
            attachment = body.attachment;
          }
          if (mounted.current) {
            setFiles((old) => old.some((file) => file.id === attachment.id) ? old : [...old, attachment]);
            setPending((old) => old.filter((file) => file.id !== entry.id));
            if (initialRemaining.current?.delete(entry.id) && initialRemaining.current.size === 0) {
              initialRemaining.current = null;
              onInitialFilesUploaded?.();
            }
          }
        } catch (reason) {
          if (mounted.current) setPending((old) => old.map((file) => file.id === entry.id ? { ...file, error: reason instanceof Error ? reason.message : "تعذر رفع الملف" } : file));
        }
      }
    } finally { working.current = false; if (mounted.current) { setBusy(false); setStatus("اكتملت محاولة الرفع يمكنك إعادة محاولة الملفات المتعثرة"); } }
  }

  async function choose(selected: FileList | File[] | null, initial = false) {
    if (!selected || working.current) return;
    const selectedFiles = Array.from(selected);
    working.current = true; setBusy(true); setStatus("جار تجهيز الملفات وضغط الصور");
    const entries: PendingFile[] = [];
    try {
      // Decode one image at a time so a multi-photo upload stays within device memory
      for (const file of selectedFiles) {
        if (!mounted.current) break;
        const documentKey = `${slug}/${documentId}`;
        let entry = initial ? preparedDraftFiles.get(file)?.get(documentKey) : undefined;
        if (!entry) {
          entry = { id: crypto.randomUUID(), file: await compressTreasuryImage(file) };
          if (initial) {
            const drafts = preparedDraftFiles.get(file) ?? new Map<string, PendingFile>();
            drafts.set(documentKey, entry);
            preparedDraftFiles.set(file, drafts);
          }
        }
        entries.push(entry);
      }
    }
    finally { working.current = false; setBusy(false); }
    if (!mounted.current) return;
    if (initial) initialRemaining.current = new Set(entries.map((entry) => entry.id));
    setPending((old) => [...old, ...entries]);
    await upload(entries);
  }

  const uploadInitialFiles = useEffectEvent(() => {
    if (!initialStarted.current && initialFiles?.length && !readOnly) {
      initialStarted.current = true;
      void choose(initialFiles, true);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    uploadController.current = controller;
    mounted.current = true;
    fetch(base + query, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("تعذر تحميل المرفقات أعد المحاولة");
      const body = await response.json();
      if (!controller.signal.aborted) { setFiles(body.attachments); uploadInitialFiles(); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل المرفقات"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [base, query, reload]);

  return <section className={styles.root} aria-label="مرفقات السند">
    <div className={styles.heading}><Paperclip size={18} aria-hidden="true" /><strong>مرفقات السند</strong><span>{files.length} مرفق</span></div>
    {!readOnly && <>
      <p className={styles.hint}>المرفقات اختيارية أرفق الصور والمستندات أو صوّرها بالكاميرا مع ضغط الصور تلقائيًا والحفاظ على وضوحها</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy || loading || !!error} onClick={() => chooser.current?.click()}><Paperclip size={16} aria-hidden="true" />إرفاق ملفات</button>
        <button type="button" disabled={busy || loading || !!error} onClick={() => camera.current?.click()}><Camera size={16} aria-hidden="true" />تصوير مستند</button>
        <input ref={chooser} type="file" multiple hidden onChange={(event) => { void choose(event.currentTarget.files); event.currentTarget.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void choose(event.currentTarget.files); event.currentTarget.value = ""; }} />
      </div>
    </>}
    <p className={styles.status} role="status" aria-live="polite">{loading ? "جار تحميل المرفقات" : status}</p>
    {error && <div className={styles.error} role="alert">{error}<button type="button" disabled={busy} onClick={() => { setLoading(true); setError(""); setReload((value) => value + 1); }}>إعادة المحاولة</button></div>}
    {!loading && !error && !files.length && !pending.length && <p className={styles.hint}>لا توجد مرفقات لهذا السند</p>}
    <ul className={styles.list}>
      {files.map((file) => <li key={file.id}><FileText size={18} aria-hidden="true" /><a href={`${base}/${file.id}${query}`} download><span>{file.name}</span><Download size={16} aria-hidden="true" /></a><small dir="ltr">{fileSize(file.size)}</small></li>)}
    </ul>
    {pending.length > 0 && <ul className={styles.pending}>{pending.map((file) => <li key={file.id}>
      <span>{file.file.name}</span><small role={file.error ? "alert" : undefined}>{file.error || "بانتظار اكتمال الرفع"}</small>
      {file.error && <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void upload([file])}><RefreshCw size={15} aria-hidden="true" />إعادة رفع المرفق</button><button type="button" disabled={busy} onClick={() => setPending((old) => old.filter((item) => item.id !== file.id))}>إزالة من القائمة</button></div>}
    </li>)}</ul>}
  </section>;
}
