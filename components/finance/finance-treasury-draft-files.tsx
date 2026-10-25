"use client";

import { useRef } from "react";
import { Camera, Paperclip, X } from "lucide-react";
import styles from "./finance-treasury-attachments.module.css";

export function TreasuryDraftFiles({ files, onChange, disabled }: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const add = (selected: FileList | null) => { if (selected) onChange([...files, ...Array.from(selected)]); };
  return <section className={styles.root} aria-label="مرفقات السند الاختيارية">
    <div className={styles.heading}><Paperclip size={18} aria-hidden="true" /><strong>مرفقات السند</strong><span>اختياري</span></div>
    <p className={styles.hint}>أرفق الصور والمستندات أو صوّرها بالكاميرا تُرفع المرفقات بعد حفظ السند مع ضغط الصور تلقائيًا</p>
    <div className={styles.actions}>
      <button type="button" disabled={disabled} onClick={() => picker.current?.click()}><Paperclip size={16} aria-hidden="true" />إرفاق ملفات</button>
      <button type="button" disabled={disabled} onClick={() => camera.current?.click()}><Camera size={16} aria-hidden="true" />تصوير مستند</button>
    </div>
    <input ref={picker} type="file" multiple hidden onChange={(event) => { add(event.currentTarget.files); event.currentTarget.value = ""; }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { add(event.currentTarget.files); event.currentTarget.value = ""; }} />
    {files.length > 0 && <ul className={styles.draftList}>{files.map((file, index) => <li key={`${index}:${file.name}`}>
      <span>{file.name}</span><div className={styles.actions}><button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, position) => position !== index))} aria-label={`إزالة ${file.name}`}><X size={15} aria-hidden="true" />إزالة</button></div>
    </li>)}</ul>}
  </section>;
}
