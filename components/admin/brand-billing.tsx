"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { BadgeCheck, ReceiptText } from "lucide-react";
import { fetchAdminBrandBillingAction, saveAdminSubscriptionPriceAction } from "@/app/actions/admin-brand-onboarding";
import { normalizeInputDigits } from "@/lib/auth/input-digits";
import type { AdminBrandBilling, AdminBrandBillingRow } from "@/lib/data/admin-brand-billing";
import { formatSar } from "@/lib/format";
import b from "./brand-billing.module.css";

export type BrandBillingState = { loading: boolean; error: string; data: AdminBrandBilling | null };

/** One read per opened brand file, repeated when its packages change */
export function useBrandBilling(cafeId: string, revision: string | null | undefined) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<BrandBillingState>({ loading: true, error: "", data: null });
  useEffect(() => {
    let cancelled = false;
    fetchAdminBrandBillingAction(cafeId).then(result => {
      if (cancelled) return;
      setState(result.ok ? { loading: false, error: "", data: result.data } : { loading: false, error: result.message, data: null });
    }).catch(() => {
      if (!cancelled) setState({ loading: false, error: "تعذر تحميل أسعار اشتراك العلامة حاول مجددًا", data: null });
    });
    return () => { cancelled = true; };
  }, [cafeId, revision, refresh]);
  return { ...state, cafeId, reload: () => setRefresh(value => value + 1) };
}

const day = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

function totalText(data: AdminBrandBilling) {
  if (!data.currentCount) return "لا توجد باقة حالية";
  return data.currentTotal > 0 || data.rows.some(row => row.current && row.manualPrice !== null) ? formatSar(data.currentTotal) : "بدون مبلغ مسجل";
}

/** Compact answer on the brand file: which package the account runs on and the price recorded for it */
export function BrandBillingCard({ billing, planName }: { billing: BrandBillingState; planName: string }) {
  return <section className={b.card} aria-label="الباقة وسعر الاشتراك" aria-busy={billing.loading}>
    <div><BadgeCheck aria-hidden="true" /><span><small>الباقة التي يعمل عليها الحساب</small><strong dir="auto">{planName}</strong></span></div>
    <div><ReceiptText aria-hidden="true" /><span><small>سعر الاشتراك</small><strong>{billing.loading ? "جارٍ التحميل" : billing.data ? totalText(billing.data) : "تعذر التحميل"}</strong></span></div>
  </section>;
}

type BillingEditor = Pick<ReturnType<typeof useBrandBilling>, "cafeId" | "reload">;

function PriceEditor({ row, editor }: { row: AdminBrandBillingRow; editor: BillingEditor }) {
  const field = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || draft === null) return;
    const price = normalizeInputDigits(draft.trim()).replace("٫", ".");
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(price)) {
      setError("أدخل مبلغًا من صفر إلى ٩٩٩٩٩٩٩٩٫٩٩ ريال وبحد أقصى منزلتين عشريتين");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await saveAdminSubscriptionPriceAction(editor.cafeId, row.id, price, expected);
      if (!result.ok) { setError(result.message); return; }
      setDraft(null);
      setNotice("تم حفظ سعر الاشتراك");
      editor.reload();
    } catch {
      setError("تعذر تأكيد حفظ السعر أعد فتح ملف العلامة للتحقق");
    } finally {
      setSaving(false);
    }
  }

  if (draft === null) return <div className={b.priceTools}>
    <button type="button" onClick={() => {
      setExpected(row.manualPrice);
      setDraft(row.manualPrice !== null || row.amount > 0 ? String(row.manualPrice ?? row.amount) : "");
      setError(""); setNotice("");
    }}>{row.manualPrice === null && row.amount === 0 ? "تحديد سعر الاشتراك" : "تعديل سعر الاشتراك"}</button>
    {notice && <span role="status">{notice}</span>}
  </div>;
  return <form className={b.priceTools} onSubmit={save} aria-busy={saving}>
    <label htmlFor={field}>سعر الاشتراك بالريال</label>
    <input id={field} dir="ltr" inputMode="decimal" value={draft} autoFocus disabled={saving}
      aria-invalid={!!error} aria-describedby={error ? field + "-error" : undefined}
      onChange={event => { setDraft(event.target.value); setError(""); }} />
    <button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ" : "حفظ السعر"}</button>
    <button type="button" disabled={saving} onClick={() => setDraft(null)}>إلغاء</button>
    {error && <p id={field + "-error"} className={b.error} role="alert">{error}</p>}
  </form>;
}

function Row({ row, editor }: { row: AdminBrandBillingRow; editor?: BillingEditor }) {
  const prepared = row.state === "جاهزة ولم تبدأ التجربة";
  const facts = [
    row.duration && `المدة ${row.duration}`,
    row.method,
    prepared ? "تبدأ بعد إرسال تفاصيل الدخول" : row.startedAt && `من ${day(row.startedAt)}`,
    !prepared && row.expiresAt && `إلى ${day(row.expiresAt)}`,
    row.paidAt && `دُفع في ${day(row.paidAt)}`,
  ].filter(Boolean);
  return <li className={`${b.row} ${row.current ? b.current : ""}`}>
    <div className={b.rowHead}><strong dir="auto">{row.planName}</strong><span className={row.current ? b.stateOn : b.stateOff}>{row.state}</span></div>
    <p className={b.price}>
      <span>{row.manualPrice !== null ? "السعر المحدد يدويًا" : "السعر المحسوب"}</span><b>{row.manualPrice !== null || row.amount > 0 ? formatSar(row.manualPrice ?? row.amount) : "بدون مبلغ"}</b>
      {row.manualPrice === null && row.amount > 0 && row.discount > 0 && row.baseAmount !== null && <em>بعد خصم {formatSar(row.discount)} من {formatSar(row.baseAmount)}</em>}
      {row.listPrice !== null && row.listPrice > 0 && <em>سعر الباقة في القائمة {formatSar(row.listPrice)}</em>}
    </p>
    {!!facts.length && <p className={b.facts}>{facts.join(" · ")}</p>}
    {editor && <PriceEditor row={row} editor={editor} />}
  </li>;
}

/** Every package of the brand with the price recorded on its subscription */
export function BrandBillingDetails({ billing }: { billing: ReturnType<typeof useBrandBilling> }) {
  const titleId = useId();
  const current = billing.data?.rows.filter(row => row.current) ?? [];
  const previous = billing.data?.rows.filter(row => !row.current) ?? [];
  return <section className={b.details} aria-labelledby={titleId} aria-busy={billing.loading}>
    <h3 id={titleId}>الباقات وسعر الاشتراك</h3>
    <p className={b.hint}>يمكنك تحديد سعر كل باقة حالية لهذه العلامة بالريال</p>
    {billing.loading && <p className={b.hint} role="status">جارٍ تحميل أسعار الاشتراك</p>}
    {billing.error && <p className={b.error} role="alert">{billing.error}</p>}
    {billing.data && <>
      <p className={b.total}><span>إجمالي سعر الباقات الحالية</span><strong>{totalText(billing.data)}</strong></p>
      {current.length ? <ul className={b.rows}>{current.map(row => <Row key={row.id} row={row} editor={billing} />)}</ul> : <p className={b.hint}>لا توجد باقة حالية لهذه العلامة</p>}
      {!!previous.length && <details className={b.previous}><summary>الاشتراكات السابقة {previous.length}</summary><ul className={b.rows}>{previous.map(row => <Row key={row.id} row={row} />)}</ul></details>}
    </>}
  </section>;
}
