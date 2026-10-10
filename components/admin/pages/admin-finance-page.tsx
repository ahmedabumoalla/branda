"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, FileText, Plus, RefreshCw, Wallet, X } from "lucide-react";
import { fetchFinanceAction, financeOptionsAction, financeReceiptAction, postFinanceAction } from "@/app/actions/platform-finance";
import { financeCategories, saudiDate, type FinanceDraft, type FinanceFilter, type FinanceOptions, type FinancePage } from "@/lib/finance/platform-finance";
import styles from "./admin-finance-page.module.css";

const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const terms: Record<number, string> = { 1: "شهر", 3: "ثلاثة أشهر", 6: "ستة أشهر", 12: "سنة" };
function DateField({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max?: string }) {
  return <label>{label}<span className={styles.dateField}>
    <input type="text" dir="ltr" required value={value} placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} title="السنة ثم الشهر ثم اليوم" onChange={event => onChange(event.target.value)} />
    <CalendarDays size={18} aria-hidden="true" />
    <input type="date" className={styles.calendar} aria-label={`اختيار ${label} من التقويم`} value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} max={max}
      onChange={event => onChange(event.target.value)} onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* Native calendar remains available */ } }} />
  </span></label>;
}

export function AdminFinancePage({ initialData, configError }: { initialData: FinancePage; configError?: string }) {
  const [data, setData] = useState(initialData);
  const [hasData, setHasData] = useState(!configError);
  const [filter, setFilter] = useState(initialData.filter);
  const [error, setError] = useState(configError ?? "");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [draft, setDraft] = useState<FinanceDraft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; url: string } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState("");
  const saveLock = useRef(false);
  const loadLock = useRef(false);
  const formRef = useRef<HTMLElement>(null);

  async function refresh(next: FinanceFilter = filter) {
    if (loadLock.current) return;
    loadLock.current = true; setLoading(true); setError(""); setReceipt(null);
    try {
      const result = await fetchFinanceAction(next);
      if (!result.ok) setError(result.message);
      else { setData(result.data); setFilter(result.data.filter); setHasData(true); }
    } catch { setError("تعذر تحديث السجل حاول مجددًا"); }
    finally { loadLock.current = false; setLoading(false); }
  }
  async function openForm(kind: FinanceDraft["kind"]) {
    if (saving || loading) return;
    setNotice(""); setFormError(""); setConfirmed(false); setFile(null);
    setDraft({ id: crypto.randomUUID(), kind, category: kind === "collection" ? "subscription" : "hosting", party: "", description: "", date: saudiDate(),
      currency: "SAR", amount: 0, exchangeRate: 1, reference: "", notes: "", cafeId: "", requestId: "", planId: "", months: 1 });
    if (kind === "collection") {
      setOptions(null); setLoading(true);
      try { const result = await financeOptionsAction(); if (result.ok) setOptions(result.data); else setFormError(result.message); }
      catch { setFormError("تعذر تحميل العلامات والباقات أعد فتح سند التحصيل للمحاولة"); }
      finally { setLoading(false); }
    }
    requestAnimationFrame(() => formRef.current?.focus());
  }
  function edit(patch: Partial<FinanceDraft>) {
    if (saveLock.current) return;
    setDraft(current => current ? { ...current, ...patch } : null); setConfirmed(false); setFormError("");
  }
  function selectSubscription(patch: Partial<FinanceDraft>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    const request = options?.requests.find(row => row.id === next.requestId);
    const plan = options?.plans.find(row => row.id === next.planId);
    if (request) edit({ ...patch, planId: request.plan_id, months: request.duration_count, amount: Number(request.amount_sar), description: `تحصيل اشتراك ${request.plan_name}`, party: options?.cafes.find(row => row.id === next.cafeId)?.name ?? "" });
    else {
      const base = Math.round(Number(plan?.price_sar ?? 0) * next.months * 100) / 100;
      const annual = next.months === 12 ? Math.round(base * Number(plan?.annual_discount_percent ?? 0)) / 100 : 0;
      edit({ ...patch, amount: Math.round((base - annual) * 100) / 100, description: plan ? `تحصيل اشتراك ${plan.name}` : "", party: options?.cafes.find(row => row.id === next.cafeId)?.name ?? "" });
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saveLock.current) return;
    if (!confirmed || !file) { setFormError("أرفق الإيصال وراجع تفاصيل السند قبل الحفظ"); return; }
    if (file.size > 4 * 1024 * 1024) { setFormError("حجم الإيصال يجب ألا يتجاوز 4 ميجابايت"); return; }
    saveLock.current = true; setSaving(true); setFormError(""); setNotice("");
    const form = new FormData(); form.set("receipt", file);
    try {
      const result = await postFinanceAction(draft, form);
      if (!result.ok) { setFormError(result.message); return; }
      setNotice(result.data.kind === "collection" ? "تم تسجيل التحصيل وتفعيل الباقة للعميل" : "تم تسجيل المدفوعات وإرفاق الإيصال");
      setDraft(null); setFile(null); setOptions(null);
      await refresh({ ...filter, page: 0 });
    } catch { setFormError("تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات للتحقق دون تكرار السند"); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function showReceipt(id: string) {
    if (receiptBusy) return;
    setReceiptBusy(id); setError(""); setReceipt(null);
    try { const result = await financeReceiptAction(id); if (result.ok) setReceipt({ id, url: result.data }); else setError(result.message); }
    catch { setError("تعذر تجهيز الإيصال حاول مجددًا"); }
    finally { setReceiptBusy(""); }
  }

  const selectedRequest = options?.requests.find(row => row.id === draft?.requestId);
  const selectedPlan = options?.plans.find(row => row.id === draft?.planId);
  const brandRequest = options?.requests.find(row => row.cafe_id === draft?.cafeId);
  const net = Number(data.totals.collections) - Number(data.totals.payments);
  return <main className={styles.page} dir="rtl">
    <header className={styles.header}><div><span className={styles.eyebrow}>إدارة أموال المنصة</span><h1>المالية</h1><p>كل تحصيل وكل دفعة في سجل واحد واضح</p></div>
      <div className={styles.actions}><button className={styles.primary} disabled={saving || loading} onClick={() => void openForm("collection")}><Plus size={18} />سند تحصيل</button>
        <button disabled={saving || loading} onClick={() => void openForm("payment")}><ArrowUpRight size={18} />تسجيل مدفوعات</button></div></header>
    <section className={styles.summary} aria-label="ملخص الفترة المحددة">
      <article className={styles.balance}><Wallet size={24} /><span>صافي حركة النقد</span><strong>{hasData ? money(net) : "—"} <small>ر س</small></strong><p>التحصيلات ناقص المدفوعات خلال الفترة المحددة</p></article>
      <article><span className={styles.incomeIcon}><ArrowDownLeft size={22} /></span><span>إجمالي التحصيل</span><strong>{hasData ? money(Number(data.totals.collections)) : "—"} <small>ر س</small></strong><p>اشتراكات محصلة ومعتمدة</p></article>
      <article><span className={styles.paymentIcon}><ArrowUpRight size={22} /></span><span>إجمالي المدفوعات</span><strong>{hasData ? money(Number(data.totals.payments)) : "—"} <small>ر س</small></strong><p>تكاليف تشغيل المنصة وخدماتها</p></article>
    </section>
    {notice && <div className={styles.success} role="status"><Check size={18} />{notice}</div>}
    {draft && <section ref={formRef} tabIndex={-1} className={styles.formPanel} aria-labelledby="finance-form-title">
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>{draft.kind === "collection" ? "تحصيل وتفعيل في خطوة واحدة" : "سجل تكاليف التشغيل"}</span>
        <h2 id="finance-form-title">{draft.kind === "collection" ? "سند تحصيل اشتراك" : "تسجيل مدفوعات"}</h2></div>
        <button type="button" aria-label="إغلاق إضافة السند" disabled={saving} onClick={() => setDraft(null)}><X size={20} /></button></div>
      <form onSubmit={submit}><fieldset disabled={saving || loading} className={styles.fields}>
        {draft.kind === "collection" ? <>
          <label>العلامة التجارية<select required value={draft.cafeId} onChange={event => {
            const cafeId = event.target.value; const existing = options?.requests.find(row => row.cafe_id === cafeId);
            selectSubscription({ cafeId, requestId: existing?.id ?? "", planId: existing?.plan_id ?? "", months: existing?.duration_count ?? 1 });
          }}><option value="">اختر العلامة</option>{options?.cafes.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
          <label>طلب الاشتراك<select value={draft.requestId} disabled={!draft.cafeId || !!brandRequest} onChange={event => selectSubscription({ requestId: event.target.value })}>
            {!brandRequest && <option value="">إنشاء طلب وتفعيله مع التحصيل</option>}
            {brandRequest && <option value={brandRequest.id}>{brandRequest.plan_name} — {money(Number(brandRequest.amount_sar))} ر س</option>}</select>
            <small>{brandRequest ? "مرتبط بطلب العميل الحالي للحفاظ على السعر والكوبون ومنع التكرار" : "إذا كان لدى العميل كوبون ينشئ طلبه من صفحة الاشتراكات ثم تحصله هنا"}</small></label>
          <label>الباقة<select required value={draft.planId} disabled={!!selectedRequest} onChange={event => selectSubscription({ planId: event.target.value })}>
            <option value="">اختر الباقة</option>{selectedRequest && !selectedPlan && <option value={selectedRequest.plan_id}>{selectedRequest.plan_name}</option>}{options?.plans.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>مدة الاشتراك<select value={draft.months} disabled={!!selectedRequest} onChange={event => selectSubscription({ months: Number(event.target.value) })}>
            {[1, 3, 6, 12].map(months => <option key={months} value={months} disabled={!!selectedPlan && !selectedPlan.duration_options?.includes(months)}>{terms[months]}</option>)}</select></label>
          {selectedRequest?.coupon_code_snapshot && <p className={styles.full}>السعر يتضمن خصم كوبون العميل <b dir="ltr">{selectedRequest.coupon_code_snapshot}</b></p>}
        </> : <>
          <label>تصنيف المدفوعات<select value={draft.category} onChange={event => edit({ category: event.target.value as FinanceDraft["category"] })}>
            {Object.entries(financeCategories).filter(([key]) => key !== "subscription").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>الجهة المستفيدة<input list="finance-providers" required maxLength={200} value={draft.party} onChange={event => edit({ party: event.target.value })} placeholder="اسم الشركة أو مقدم الخدمة" />
            <datalist id="finance-providers"><option value="Supabase" /><option value="Vercel" /><option value="GREEN-API" /></datalist></label>
        </>}
        <label className={styles.full}>وصف السند<input required maxLength={500} value={draft.description} onChange={event => edit({ description: event.target.value })} placeholder="مثال اشتراك الاستضافة لشهر أكتوبر" /></label>
        <DateField label="تاريخ التحصيل أو الدفع" value={draft.date} max={saudiDate()} onChange={date => edit({ date })} />
        <label>المبلغ {draft.kind === "collection" && "المستحق"}<input type="number" dir="ltr" min="0.01" step="0.01" required readOnly={draft.kind === "collection"} value={draft.amount || ""} onChange={event => edit({ amount: Number(event.target.value) })} />
          {draft.kind === "collection" && <small>حسب سعر الباقة وخصم السنة أو سعر طلب العميل المحفوظ</small>}</label>
        <label>العملة<select disabled={draft.kind === "collection"} value={draft.currency} onChange={event => edit({ currency: event.target.value as "SAR" | "USD", exchangeRate: event.target.value === "SAR" ? 1 : 0 })}><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option></select></label>
        {draft.currency === "USD" ? <label>سعر الصرف الفعلي للريال<input type="number" dir="ltr" required min="0.000001" step="0.000001" max="10000" value={draft.exchangeRate} onChange={event => edit({ exchangeRate: Number(event.target.value) })} /><small>استخدم سعر الصرف المسجل في عملية الدفع</small></label> : <label>مرجع التحويل <span className={styles.muted}>اختياري</span><input maxLength={200} value={draft.reference} onChange={event => edit({ reference: event.target.value })} /></label>}
        {draft.currency === "USD" && <label>مرجع التحويل <span className={styles.muted}>اختياري</span><input maxLength={200} value={draft.reference} onChange={event => edit({ reference: event.target.value })} /></label>}
        <label className={styles.upload}><FileText size={24} /><span>إيصال التحويل أو فاتورة الدفع</span><small>ملف PDF أو صورة JPG أو PNG حتى 4 ميجابايت</small>
          <input type="file" required accept="application/pdf,image/jpeg,image/png" onChange={event => { setFile(event.target.files?.[0] ?? null); setConfirmed(false); }} /></label>
        <label className={styles.full}>ملاحظات <span className={styles.muted}>اختياري</span><textarea maxLength={2000} rows={2} value={draft.notes} onChange={event => edit({ notes: event.target.value })} /></label>
        <div className={styles.postPreview}><div><span>{draft.kind === "collection" ? "قيمة التحصيل وتفعيل الباقة" : "المبلغ المسجل بالريال"}</span><strong>{money(Math.round(draft.amount * draft.exchangeRate * 100) / 100)} <small>ر س</small></strong></div>
          <p>{draft.kind === "collection" ? "عند الحفظ تُفعّل الباقة من الآن وتحل محل الاشتراك الحالي مع حفظ الإيصال" : "تُحفظ الدفعة ضمن مصروفات المنصة مع الجهة والإيصال"}</p></div>
        <label className={styles.confirm}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />راجعت المبلغ والإيصال وأؤكد تسجيل السند</label>
      </fieldset>
        {formError && <p className={styles.error} role="alert">{formError}</p>}
        <footer className={styles.formFooter}><span>السند المعتمد محفوظ للحفاظ على السجل المالي</span><button className={styles.primary} disabled={saving || loading || (draft.kind === "collection" && !options)} type="submit">{saving ? "جار الحفظ والتحقق" : draft.kind === "collection" ? "تسجيل التحصيل وتفعيل الباقة" : "حفظ المدفوعات"}</button></footer>
      </form>
    </section>}
    <section className={styles.ledger} aria-labelledby="finance-ledger-title" aria-busy={loading}>
      <div className={styles.sectionHead}><div><h2 id="finance-ledger-title">السجل المالي</h2><p>{data.total} سند خلال الفترة المحددة</p></div><button disabled={loading || saving} onClick={() => void refresh()}><RefreshCw size={16} />{loading ? "جار التحديث" : "تحديث السجل"}</button></div>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); void refresh({ ...filter, page: 0 }); }}>
        <fieldset disabled={loading || saving}><DateField label="من تاريخ" value={filter.from} onChange={from => setFilter({ ...filter, from })} /><DateField label="إلى تاريخ" value={filter.to} onChange={to => setFilter({ ...filter, to })} />
          <label>نوع الحركة<select value={filter.kind} onChange={event => setFilter({ ...filter, kind: event.target.value as FinanceFilter["kind"] })}><option value="all">جميع الحركات</option><option value="collection">التحصيلات</option><option value="payment">المدفوعات</option></select></label><button type="submit">عرض النتائج</button></fieldset>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {receipt && <p className={styles.success} role="status"><FileText size={18} /><a href={receipt.url} target="_blank" rel="noopener noreferrer">فتح الإيصال المجهز</a><small>الرابط متاح لمدة خمس دقائق</small></p>}
      {data.entries.length ? <div className={styles.tableWrap}><table><thead><tr><th>السند والجهة</th><th>التصنيف</th><th>التاريخ</th><th>المبلغ</th><th>التفاصيل والإيصال</th></tr></thead>
        <tbody>{data.entries.map(row => <tr key={row.id}><td><span className={row.kind === "collection" ? styles.incomeTag : styles.paymentTag}>{row.kind === "collection" ? "تحصيل" : "مدفوعات"} #{row.voucher_number}</span><b>{row.party}</b><small>{row.description}</small></td>
          <td>{financeCategories[row.category]}{row.subscription_id && <small className={styles.activated}><Check size={13} />تم تفعيل الباقة</small>}</td><td><time dateTime={row.occurred_on} dir="ltr">{row.occurred_on}</time></td>
          <td><strong className={styles.amount}>{money(Number(row.amount_sar))}</strong><small>ر س</small>{row.currency !== "SAR" && <small>{money(Number(row.amount))} دولار بسعر صرف {row.exchange_rate}</small>}</td>
          <td><details><summary>تفاصيل السند</summary><p>{row.notes || "لا توجد ملاحظات"}</p><p>مرجع التحويل {row.reference || "غير مسجل"}</p></details>
            {row.hasReceipt ? <button disabled={!!receiptBusy} onClick={() => void showReceipt(row.id)}><FileText size={16} />{receiptBusy === row.id ? "جار التجهيز" : "عرض الإيصال"}</button> : <small>الإيصال عبر واتساب</small>}</td></tr>)}</tbody></table></div>
        : !error && <div className={styles.empty}><Wallet size={36} /><h3>سجلك المالي يبدأ من هنا</h3><p>لا توجد حركات خلال الفترة المحددة</p></div>}
      <footer className={styles.pagination}><span>صفحة {data.filter.page + 1} من {Math.max(1, Math.ceil(data.total / 20))}</span><div><button disabled={loading || saving || data.filter.page === 0} onClick={() => void refresh({ ...data.filter, page: data.filter.page - 1 })}>السابق</button><button disabled={loading || saving || (data.filter.page + 1) * 20 >= data.total} onClick={() => void refresh({ ...data.filter, page: data.filter.page + 1 })}>التالي</button></div></footer>
    </section>
  </main>;
}
