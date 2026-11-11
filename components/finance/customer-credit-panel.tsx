"use client";
import { useEffect, useRef, useState } from "react";
import { getCustomerCredit, changeCustomerCredit } from "@/app/actions/finance-invoice-extensions";
import { getFinanceInvoiceSettings } from "@/app/actions/finance-invoice-settings";
import type { CustomerCreditState } from "@/lib/finance/invoice-extensions";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { Field, Numeric, financeDate } from "./finance-ui";
import css from "./finance.module.css";

export function CustomerCreditPanel({ partyId, snapshot, disabled, onClose, onChanged, onInvoice }: { partyId: string; snapshot: FinanceSnapshot; disabled: boolean; onClose: () => void; onChanged: () => void; onInvoice: (id: string) => void }) {
  const [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState<{ key: string; data?: CustomerCreditState; enabled?: boolean; error?: string } | null>(null);
  const [action, setAction] = useState<"receive" | "refund" | "unapply">("receive"), [amount, setAmount] = useState(""), [account, setAccount] = useState(""), [note, setNote] = useState(""), [payment, setPayment] = useState("");
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const request = useRef<{ fingerprint: string; id: string } | null>(null), lock = useRef(false);
  const key = JSON.stringify([snapshot.cafe.slug, partyId, attempt]);
  useEffect(() => {
    let active = true;
    Promise.all([getCustomerCredit(snapshot.cafe.slug, partyId), getFinanceInvoiceSettings(snapshot.cafe.slug)]).then(([credit, settings]) => {
      if (active) setLoaded({ key, ...(credit.ok && settings.ok ? { data: credit.data, enabled: settings.data.settings.allowDeposits } : { error: !credit.ok ? credit.message : !settings.ok ? settings.message : "تعذر تحميل الرصيد" }) });
    }).catch(() => { if (active) setLoaded({ key, error: "تعذر تحميل الرصيد المقدم أعد المحاولة" }); });
    return () => { active = false; };
  }, [key, partyId, snapshot.cafe.slug]);
  const current = loaded?.key === key ? loaded : null, data = current?.data;
  const blocked = disabled || busy || !data || !canFinance(snapshot.role, "accounting_write");
  const accounts = snapshot.accounts.filter(item => item.active && !item.is_cashier_drawer && ["cash", "bank", "pos"].includes(item.kind));
  const kinds = { receive: "إضافة رصيد مقدم", refund: "إعادة رصيد للعميل", apply: "استخدام الرصيد في فاتورة", unapply: "إلغاء استخدام الرصيد" };
  function validate() {
    if (note.trim().length < 3) return "أدخل بيانًا للعملية من ثلاثة أحرف على الأقل";
    if (action === "unapply") return data?.applications.some(row => row.paymentId === payment && row.reversible) ? "" : "اختر دفعة رصيد قابلة للإلغاء";
    if (!accounts.some(row => row.id === account)) return "اختر حساب التحصيل أو الصرف";
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1e9 || Math.round(Number(amount) * 100) / 100 !== Number(amount)) return "أدخل مبلغًا صحيحًا بالريال";
    if (action === "receive" && !current?.enabled) return "الدفعات المقدمة غير مفعلة في إعدادات الفواتير";
    if (action === "refund" && Number(amount) > (data?.balance ?? 0)) return "المبلغ يتجاوز الرصيد المقدم المتاح";
    return "";
  }
  async function submit() {
    if (blocked || lock.current || !review) return;
    const validation = validate(); if (validation) { setError(validation); return; }
    const payload = action === "unapply" ? { action, partyId, paymentId: payment, note: note.trim() } : { action, partyId, accountId: account, amount: Number(amount), note: note.trim() };
    const fingerprint = JSON.stringify(payload);
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await changeCustomerCredit(snapshot.cafe.slug, { ...payload, requestId: request.current.id });
      if (!result.ok) { setError(result.message); return; }
      request.current = null; setReview(false); setAmount(""); setNote(""); setPayment(""); setMessage("تم تسجيل حركة الرصيد"); setAttempt(value => value + 1); onChanged();
    } catch { setError("تعذر تأكيد العملية أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={css.panel} dir="rtl" aria-label="الرصيد المقدم للعميل"><header className={css.actions}><h3>الرصيد المقدم للعميل</h3><button type="button" className={css.secondary} disabled={busy} onClick={onClose}>إغلاق</button></header>
    {!current && <p role="status">جار تحميل الرصيد المقدم</p>}{current?.error && <div role="alert"><p>{current.error}</p><button type="button" className={css.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}
    {error && <p role="alert" className={css.error}>{error}</p>}{message && <p role="status" className={css.notice}>{message}</p>}
    {data && <><p>الرصيد المقدم المتاح <strong><Numeric value={data.balance} money /></strong></p><p className={css.muted}>العمليات بالريال السعودي ويُستخدم الرصيد عند إصدار فاتورة لهذا العميل</p>
      {canFinance(snapshot.role, "accounting_write") && <form onSubmit={event => { event.preventDefault(); if (blocked) return; const validation = validate(); setError(validation); if (!validation) setReview(true); }}><fieldset disabled={blocked || review} className={css.fields}>
        <Field label="العملية"><select value={action} onChange={event => { setAction(event.target.value as typeof action); setError(""); }}><option value="receive" disabled={!current.enabled}>إضافة رصيد مقدم</option><option value="refund">إعادة رصيد للعميل</option><option value="unapply">إلغاء استخدام الرصيد في فاتورة</option></select></Field>
        {action === "unapply" ? <Field label="دفعة الرصيد"><select required value={payment} onChange={event => setPayment(event.target.value)}><option value="">اختر الدفعة</option>{data.applications.filter(row => row.reversible).map(row => <option key={row.paymentId} value={row.paymentId}>فاتورة {row.displayNumber || row.invoiceNumber || snapshot.documents.find(item => item.id === row.documentId)?.number || row.documentId} — {row.amount} ر س</option>)}</select></Field> : <><Field label="المبلغ بالريال"><input type="number" required min="0.01" max="1000000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="حساب التحصيل أو الصرف"><select required value={account} onChange={event => setAccount(event.target.value)}><option value="">اختر الحساب</option>{accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field></>}
        <Field label="بيان العملية"><textarea required minLength={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></Field></fieldset>
        {review ? <div className={css.notice}><strong>تأكيد {kinds[action]}</strong><p>{note}</p><p><Numeric value={action === "unapply" ? data.applications.find(row => row.paymentId === payment)?.amount ?? 0 : Number(amount)} money /></p><button type="button" className={css.primary} disabled={blocked} onClick={() => void submit()}>تأكيد تسجيل العملية</button><button type="button" className={css.secondary} disabled={busy} onClick={() => setReview(false)}>رجوع</button></div> : <button type="submit" className={css.primary} disabled={blocked}>مراجعة العملية</button>}
      </form>}
      <div className={css.tableWrap}><table className={css.table}><caption>حركات الرصيد المقدم</caption><thead><tr><th>العملية</th><th>المبلغ</th><th>التاريخ</th><th>البيان</th></tr></thead><tbody>{data.entries.map(row => <tr key={row.id}><td>{kinds[row.kind]}{row.documentId && row.kind === "apply" && <button type="button" className={css.secondary} onClick={() => onInvoice(row.documentId!)}>الفاتورة</button>}</td><td><Numeric value={row.amount} money /></td><td>{financeDate(row.createdAt)}</td><td>{row.note}</td></tr>)}</tbody></table>{!data.entries.length && <p>لا توجد حركات رصيد مقدم</p>}</div>
    </>}
  </section>;
}
