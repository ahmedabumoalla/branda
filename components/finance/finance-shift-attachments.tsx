"use client";

import { useRef, useState } from "react";
import { Camera, FileUp, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressShiftImage, FINANCE_ATTACHMENT_BUCKET, type FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import styles from "./finance-shift-attachments.module.css";

type Props = { slug: string; shiftId: string; value: FinanceShiftAttachment[]; onChange: (files: FinanceShiftAttachment[]) => void; disabled?: boolean; onBusyChange?: (busy: boolean) => void };
export function FinanceShiftAttachments({ slug, shiftId, value, onChange, disabled, onBusyChange }: Props) {
  const filesInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const uploading = useRef(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const base = `/api/finance/${encodeURIComponent(slug)}/shift-attachments`;

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading.current || disabled) return;
    uploading.current = true; setBusy(true); onBusyChange?.(true); setErrors([]);
    const complete = [...value]; const failures: string[] = [];
    try {
      const storage = createClient().storage.from(FINANCE_ATTACHMENT_BUCKET);
      for (let index = 0; index < files.length; index++) {
        const original = files[index];
        setProgress(`جارٍ تجهيز ورفع الملف ${index + 1} من ${files.length}`);
        try {
          const file = await compressShiftImage(original);
          const prepared = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftId, name: file.name, mime: file.type, size: file.size }) });
          const upload = await prepared.json();
          if (!prepared.ok) throw new Error(upload.error);
          const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type || "application/octet-stream", upsert: false });
          if (error) throw new Error("تعذر رفع الملف تحقق من الاتصال والحد المتاح لدى خدمة التخزين");
          const finalized = await fetch(`${base}/${upload.attachment.id}`, { method: "POST" });
          const attachment = await finalized.json();
          if (!finalized.ok) throw new Error(attachment.error);
          complete.push(attachment as FinanceShiftAttachment); onChange([...complete]);
        } catch (error) { failures.push(`${original.name}: ${error instanceof Error ? error.message : "تعذر رفع الملف أعد اختياره للمحاولة"}`); }
      }
    } finally {
      setErrors(failures); setProgress(""); setBusy(false); uploading.current = false; onBusyChange?.(false);
      if (filesInput.current) filesInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  return <section className={styles.root} aria-label="مرفقات سند الصرف" aria-busy={busy}>
    <div className={styles.heading}><strong>مرفقات السداد</strong><span>اختياري</span></div>
    <p className={styles.hint}>أضف صور الفاتورة أو مستنداتها وتُضغط الصور تلقائيًا مع الحفاظ على وضوحها</p>
    <div className={styles.actions}>
      <button type="button" disabled={disabled || busy} onClick={() => filesInput.current?.click()}><FileUp size={18} aria-hidden="true" />إضافة صور أو مستندات</button>
      <button type="button" disabled={disabled || busy} onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />تصوير الفاتورة</button>
    </div>
    <input hidden ref={filesInput} type="file" multiple onChange={(event) => void uploadFiles(event.target.files)} />
    <input hidden ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={(event) => void uploadFiles(event.target.files)} />
    <p className={styles.status} role="status" aria-live="polite">{progress || (value.length ? `تم رفع ${value.length} من المرفقات` : "")}</p>
    {value.length > 0 && <ul className={styles.list}>{value.map((file) => <li key={file.id}>
      <Paperclip size={16} aria-hidden="true" /><a href={`${base}/${file.id}`} download>{file.name}</a>
      <small dir="ltr">{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(file.size / 1024)} KB</small>
      <button type="button" disabled={disabled || busy} aria-label={`إزالة ${file.name} من السند`} onClick={() => onChange(value.filter((entry) => entry.id !== file.id))}><X size={16} aria-hidden="true" /></button>
    </li>)}</ul>}
    {errors.length > 0 && <ul className={styles.errors} role="alert">{errors.map((error, index) => <li key={index}>{error}</li>)}<li>يمكنك اختيار الملفات التي لم تكتمل للمحاولة مجددًا</li></ul>}
  </section>;
}
