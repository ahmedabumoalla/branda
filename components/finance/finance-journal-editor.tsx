"use client";

import { useRef, useState } from "react";
import { Save, X } from "lucide-react";
import { saveJournalDescriptionsAction } from "@/app/actions/finance-journal-detail";
import type { JournalDetail } from "@/lib/finance/journal-detail";
import { Numeric } from "./finance-ui";
import styles from "./finance-journal-detail.module.css";

export function FinanceJournalEditor({ data, slug, disabled, onCancel, onSaved }: { data: JournalDetail; slug: string; disabled: boolean; onCancel: () => void; onSaved: () => void | Promise<void> }) {
  const [note, setNote] = useState(data.document.note);
  const [memos, setMemos] = useState(() => Object.fromEntries(data.journal.map(line => [line.id, line.memo])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), request = useRef<{ signature: string; id: string } | null>(null);
  const lineMemos = data.journal.filter(line => memos[line.id] !== line.memo).map(line => ({ id: line.id, memo: memos[line.id] }));
  const changed = note !== data.document.note || lineMemos.length > 0;
  const blocked = disabled || busy || !data.metadata?.canEdit;
  async function submit() {
    if (lock.current || blocked || !changed) return;
    lock.current = true; setBusy(true); setError("");
    let committed = false;
    try {
      const payload = { id: data.document.id, revision: data.metadata.revision, note, lineMemos };
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const result = await saveJournalDescriptionsAction({ ...payload, requestId: request.current.id }, slug);
      if (!result.ok) { setError(result.message); return; }
      committed = true; await onSaved();
    } catch { setError(committed ? "تم الحفظ وتعذر تحديث العرض أعد فتح القيد" : "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className={styles.page} dir="rtl" aria-label="تعديل وصف القيد" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className={styles.toolbar}><button type="submit" className={styles.primary} disabled={blocked || !changed}><Save size={16} aria-hidden="true" />{busy ? "جار حفظ القيد" : "حفظ التعديلات"}</button><button type="button" disabled={busy} onClick={onCancel}><X size={16} aria-hidden="true" />إلغاء</button></div>
    <section className={styles.content}><div className={styles.body}><h3>تعديل وصف القيد <bdi>#{String(data.document.number).padStart(6, "0")}</bdi></h3><p className={styles.notice}>يمكن تحديث الوصف وملاحظات السطور تبقى الحسابات والمبالغ والتاريخ المحاسبي كما رُحّلت</p>{error && <p role="alert" className={styles.error}>{error}</p>}<fieldset disabled={blocked} className={styles.editorFields}><label>الوصف<textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label><div className={styles.tableWrap} role="region" tabIndex={0} aria-label="ملاحظات سطور القيد"><table><thead><tr><th>الحساب</th><th>ملاحظات السطر</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{data.journal.map(line => <tr key={line.id}><td><bdi>{line.accountCode}</bdi> {line.accountName}</td><td><textarea aria-label={"ملاحظات " + line.accountCode + " " + line.accountName} rows={2} maxLength={300} value={memos[line.id]} onChange={event => setMemos(current => ({ ...current, [line.id]: event.target.value }))} /></td><td><Numeric value={line.debit} /></td><td><Numeric value={line.credit} /></td></tr>)}</tbody></table></div></fieldset></div></section>
  </form>;
}
