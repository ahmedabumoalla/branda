"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, Plus, Save, Trash2 } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { readInvoiceAmendmentContext, saveInvoiceAmendment } from "@/app/actions/finance-invoice-amendment";
import type { InvoiceAmendmentContext } from "@/lib/finance/invoice-amendment";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import { companyAmounts } from "@/lib/finance/company-invoice";
import { Numeric } from "./finance-ui";
import css from "./invoice-amendment-dialog.module.css";

type Row = InvoiceAmendmentContext["lines"][number] & { key: string };
export function InvoiceAmendmentDialog({ open, detail, snapshot, onClose, onSaved }: {
  open: boolean; detail: InvoiceDetail; snapshot: FinanceSnapshot; onClose: () => void; onSaved: () => void;
}) {
  const [context, setContext] = useState<InvoiceAmendmentContext | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const formId = useId();
  const slug = snapshot.cafe.slug;
  const id = detail.document.id;
  const loaded = useRef<InvoiceAmendmentContext | null>(null);
  const request = useRef<{ key: string; promise: ReturnType<typeof readInvoiceAmendmentContext> } | null>(null);
  useEffect(() => {
    if (!open || loaded.current) return;
    let active = true;
    const key = `${id}:${slug}:${attempt}`;
    if (request.current?.key !== key) request.current = { key, promise: readInvoiceAmendmentContext(id, slug) };
    const currentRequest = request.current;
    currentRequest.promise.then(result => {
      if (request.current !== currentRequest || !active) return;
      if (!result.ok) { setError(result.message); return; }
      loaded.current = result.data;
      setContext(result.data);
      setRows(result.data.lines.map((line, index) => ({ ...line, key: line.id || `saved-${index}` })));
      setNote(result.data.note);
    }).catch(() => { if (active) setError("تعذر التحقق من إمكانية تعديل الفاتورة أعد المحاولة"); });
    return () => { active = false; };
  }, [open, id, slug, attempt]);
  const totals = companyAmounts(rows.map((row, index) => ({ key: index, productId: row.productId, quantity: row.quantity, price: row.price })), [], context?.discount ?? 0, "amount", context?.taxRate ?? 0, context?.taxInclusive ?? false);
  const valid = !!context?.canAmend && rows.length > 0 && rows.length <= 100 && rows.every(row => !!row.productId && Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= 9999 && Number.isFinite(row.price) && row.price >= 0 && row.price <= 10_000_000) && totals.total + .009 >= context.currentPaid;
  function close() {
    if (lock.current) return;
    if (context) { setRows(context.lines.map((line, index) => ({ ...line, key: line.id || `saved-${index}` }))); setNote(context.note); }
    setError(""); onClose();
  }
  function patch(key: string, change: Partial<Row>) { if (!lock.current) setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row)); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!context?.canAmend || !valid || lock.current) return;
    const input = { invoiceId: id, expectedRevision: context.revision, note, lines: rows.map(({ id, productId, quantity, price, description }) => ({ id, productId, quantity, price, description })) };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    lock.current = true; setPending(true); setError("");
    try {
      const result = await saveInvoiceAmendment({ ...input, requestId: retry.current.requestId }, slug);
      if (!result.ok) { setError(result.message); return; }
      loaded.current = null; setContext(null); retry.current = null;
      onSaved();
    } catch { setError("تعذر تأكيد الحفظ أعد المحاولة للتحقق من العملية نفسها"); }
    finally { lock.current = false; setPending(false); }
  }
  return <Modal open={open} title={`تعديل الفاتورة #${detail.document.number}`} onClose={close} panelClassName={css.panel} footer={<div className={css.footer}><p>{context?.canAmend ? "تُحفظ التغييرات في سجل الفاتورة وتُحدّث الأرصدة المرتبطة بها" : ""}</p><div className={css.actions}><button type="button" disabled={pending} onClick={close}>{context?.canAmend ? "إلغاء" : "إغلاق"}</button>{context?.canAmend && <button type="submit" form={formId} className={css.save} disabled={!valid || pending}><Save size={17} aria-hidden="true" />{pending ? "جار حفظ التعديلات" : "حفظ التعديلات"}</button>}</div></div>}>
    <div className={css.content}>
      {!context && !error && <p className={css.loading} role="status">جار التحقق من إمكانية تعديل الفاتورة</p>}
      {error && <div className={css.error} role="alert">{error}{!context && <div className={css.actions}><button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>إعادة المحاولة</button></div>}</div>}
      {context && !context.canAmend && <><div className={css.notice} role="status"><AlertCircle size={20} aria-hidden="true" /><p>{context.message}</p></div><div className={css.actions}>{snapshot.role === "owner" && <Link className={css.settingLink} href="/dashboard/system/settings/apps">إدارة التطبيقات</Link>}<button type="button" className={css.settingLink} onClick={() => { loaded.current = null; setContext(null); setError(""); setAttempt(value => value + 1); }}>إعادة التحقق</button></div></>}
      {context?.canAmend && <form id={formId} onSubmit={save}>
        <div className={css.summary}><div><span>العميل</span><strong>{detail.customer?.name || "عميل نقدي"}</strong></div><div><span>المستودع</span><strong>{detail.warehouse?.name || "غير مسجل"}</strong></div><div><span>الإجمالي السابق</span><strong><Numeric value={context.currentTotal} money /></strong></div><div><span>المبلغ المحصل</span><strong><Numeric value={context.currentPaid} money /></strong></div></div>
        <div className={css.tableWrap} role="region" aria-label="أصناف الفاتورة القابلة للتعديل" tabIndex={0}><table className={css.table}><thead><tr><th scope="col">الصنف والوصف</th><th scope="col">الكمية</th><th scope="col">سعر الوحدة</th><th scope="col">الإجمالي</th><th scope="col"><span className="sr-only">حذف الصنف</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.key}>
          <td><select value={row.productId} disabled={pending} required aria-label={`الصنف ${index + 1}`} onChange={event => { const product = snapshot.products.find(product => product.id === event.target.value); patch(row.key, { productId: event.target.value, name: product?.name || "", price: product?.price ?? 0, unitLabel: "وحدة", unitFactor: 1 }); }}><option value="">اختر الصنف</option>{row.productId && !snapshot.products.some(product => product.id === row.productId && product.available) && <option value={row.productId}>{row.name}</option>}{snapshot.products.filter(product => product.available).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input className={css.description} value={row.description} maxLength={500} disabled={pending} aria-label={`وصف الصنف ${index + 1}`} placeholder="وصف إضافي اختياري" onChange={event => patch(row.key, { description: event.target.value })} /></td>
          <td><input type="number" min="0.001" max="9999" step="0.001" required value={row.quantity} disabled={pending} aria-label={`كمية ${row.name || `الصنف ${index + 1}`}`} onChange={event => patch(row.key, { quantity: Number(event.target.value) })} /><small>{row.unitLabel}</small></td>
          <td><input type="number" min="0" max="10000000" step="0.000001" required value={row.price} disabled={pending} aria-label={`سعر ${row.name || `الصنف ${index + 1}`}`} onChange={event => patch(row.key, { price: Number(event.target.value) })} /></td>
          <td className={css.lineTotal}><Numeric value={totals.rows[index]?.total ?? 0} money /></td><td><button className={css.delete} type="button" aria-label={`حذف ${row.name || `الصنف ${index + 1}`}`} disabled={pending || rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}><Trash2 size={17} aria-hidden="true" /></button></td>
        </tr>)}</tbody></table></div>
        <button type="button" className={css.add} disabled={pending || rows.length >= 100} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), id: null, productId: "", name: "", quantity: 1, price: 0, description: "", unitLabel: "وحدة", unitFactor: 1 }])}><Plus size={17} aria-hidden="true" />إضافة صنف</button>
        <div className={css.bottom}><label className={css.note}>ملاحظات الفاتورة<textarea value={note} maxLength={1000} disabled={pending} onChange={event => setNote(event.target.value)} /></label><dl className={css.totals}><div><dt>مجموع الأصناف</dt><dd><Numeric value={totals.subtotal} money /></dd></div><div><dt>الخصم المسجل</dt><dd><Numeric value={context.discount} money /></dd></div>{totals.tax > 0 && <div><dt>الضريبة</dt><dd><Numeric value={totals.tax} money /></dd></div>}<div className={css.total}><dt>الإجمالي الجديد</dt><dd><Numeric value={totals.total} money /></dd></div></dl></div>
        {totals.total + .009 < context.currentPaid && <p className={css.error} role="alert">الإجمالي الجديد أقل من المبلغ المحصل استخدم المرتجع لتسوية الفرق مع العميل</p>}
      </form>}
    </div>
  </Modal>;
}
