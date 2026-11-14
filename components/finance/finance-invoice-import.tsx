"use client";
import { useRef, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import { previewInvoiceImportAction } from "@/app/actions/finance-invoice-import";
import { saveInvoiceDraftAction } from "@/app/actions/finance-invoice-drafts";
import { importedInvoiceDraft, type ImportedInvoice } from "@/lib/finance/invoice-import";
import s from "./finance-invoice-import.module.css";

export function FinanceInvoiceImport({ mode, slug, onClose, onImported }: { mode: "sheet" | "ai"; slug: string; onClose: () => void; onImported: (id: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportedInvoice | null>(null);
  const file = useRef<HTMLInputElement>(null), lock = useRef(false), identity = useRef("");
  function example() {
    const blob = new Blob(["\uFEFFاسم الصنف,الكمية,سعر الوحدة,نسبة الضريبة,خصم البند\nقميص,2,100,15,0\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "invoice-import.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function read() {
    if (lock.current) return;
    const selected = file.current?.files?.[0];
    if (!selected || selected.size > 3 * 1024 * 1024 || !selected.size) { setError("اختر ملفًا بحجم لا يتجاوز ثلاثة ميجابايت"); return; }
    lock.current = true; setBusy(true); setError(""); setPreview(null);
    try {
      const form = new FormData(); form.set("file", selected); form.set("mode", mode);
      const result = await previewInvoiceImportAction(form, slug);
      if (!result.ok) { setError(result.message); return; }
      identity.current = crypto.randomUUID(); setPreview(result.data);
    } catch { setError("تعذر الاتصال حاول قراءة الملف مرة أخرى"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (lock.current || !preview) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await saveInvoiceDraftAction({ id: identity.current, revision: 0, payload: importedInvoiceDraft(preview) }, slug);
      if (!result.ok) { setError(result.message); return; }
      onImported(result.data.id);
    } catch { setError("تعذر تأكيد حفظ المسودة راجع المسودات المحفوظة قبل إعادة الاستيراد"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal open title={mode === "ai" ? "قراءة فاتورة بالذكاء الاصطناعي" : "استيراد بنود فاتورة"} onClose={() => { if (!busy) onClose(); }}>
    <div className={s.body} aria-busy={busy}>
      <p>{mode === "ai" ? "ارفع فاتورة واحدة بصيغة PDF أو صورة JPG أو PNG وستُرسل لخدمة OpenAI لاستخراج بياناتها" : "ملف CSV أو Excel بصيغة XLSX لفاتورة واحدة حتى مائة بند"}</p>
      <p className={s.hint}>راجع البنود والضريبة والعميل قبل الإصدار لا تُسجل مبيعات أو دفعات عند قراءة الملف</p>
      {!preview && <form onSubmit={event => { event.preventDefault(); void read(); }}>
        <label className={s.field}>ملف الفاتورة<input ref={file} type="file" required disabled={busy} accept={mode === "ai" ? ".pdf,.png,.jpg,.jpeg" : ".csv,.xlsx"} /></label>
        <p className={s.hint}>الحد الأقصى ثلاثة ميجابايت</p>
        {mode === "sheet" && <><button type="button" onClick={example}>تنزيل نموذج الاستيراد</button><p className={s.hint}>الأسعار قبل الضريبة والخصم مبلغ على كامل البند والحقول الاختيارية الفارغة تُقرأ صفرًا</p></>}
        <div className={s.actions}><button type="submit" disabled={busy}>{busy ? "جارٍ قراءة الملف" : "قراءة ومراجعة"}</button></div>
      </form>}
      {error && <p role="alert" className={s.error}>{error}</p>}
      {preview && <>
        <div className={s.summary}><span>{preview.lines.length} بند</span><span>{preview.currency}</span><span>{preview.taxInclusive ? "الأسعار تشمل الضريبة" : "الأسعار قبل الضريبة"}</span></div>
        {preview.customerName && <p>العميل في المصدر: {preview.customerName}</p>}
        {preview.invoiceNumber && <p>رقم المستند المصدر: {preview.invoiceNumber}</p>}
        {preview.total !== null && <p>إجمالي المستند المصدر: {preview.total.toLocaleString("ar-SA")} {preview.currency}</p>}
        {preview.notes && <p className={s.warning}>{preview.notes}</p>}
        <div className={s.table}><table><caption>البنود المقروءة من الملف</caption><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الضريبة ٪</th></tr></thead><tbody>{preview.lines.map((line, i) => <tr key={i}><td>{line.name}</td><td>{line.quantity}</td><td>{line.price}</td><td>{line.discount}</td><td>{line.vatRate}</td></tr>)}</tbody></table></div>
        <p className={s.hint}>الخطوة التالية تفتح محرر الفاتورة لتحديد العميل وربط الأصناف ومراجعة الإجمالي والضريبة وسعر الصرف قبل الإصدار</p>
        <div className={s.actions}><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "جارٍ حفظ المسودة" : "فتح المسودة للمراجعة"}</button><button type="button" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>اختيار ملف آخر</button></div>
      </>}
    </div>
  </Modal>;
}
