"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Coins, Settings2, SlidersHorizontal } from "lucide-react";
import { adjustPoints, getPoints, savePointsSettings } from "@/app/actions/erp-points";
import { Action, Dialog, Field, Help, aldeem as s, day, dayTime, money, quantity } from "./aldeem-ui";
import { localPhone, pointsKindLabels, type PointsSettings, type PointsSnapshot } from "@/lib/erp/points";
import { invoiceHref } from "@/lib/erp/overview";

type View = "ledger" | "customers" | "branches" | "settings";

export function PointsWorkspace({ initialSnapshot }: { initialSnapshot: PointsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<View>("ledger");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<{ phone: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const branchName = new Map(snapshot.branches.map(row => [row.id, row.name]));
  const settings = snapshot.settings;

  function load(next: { phone?: string | null; query?: string }, message = "") {
    setError("");
    start(async () => {
      const phone = next.phone === undefined ? focus : next.phone;
      const result = await getPoints({ phone: phone ?? undefined, query: next.query ?? query }, snapshot.slug);
      if (!result.ok) return setError(result.message);
      setSnapshot(result.data); setFocus(phone ?? null); if (message) setNotice(message);
    });
  }

  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{snapshot.brand}</span><h1>نقاط الولاء</h1>
        <p>{settings.enabled ? `كل ريال يكسب ${quantity(settings.earnPerRiyal)} نقطة والنقطة تساوي ${money(settings.pointValue)} ريال عند الاستبدال في أي فرع` : "النقاط متوقفة حاليًا فعلها من الإعدادات ليبدأ العملاء بالاكتساب مع كل فاتورة"}</p></div>
      {snapshot.canManage && <div className={s.heroActions}>
        <Action tone="primary" side="end" help="يضيف أو يخصم نقاطًا من رصيد عميل مع سبب مكتوب يظهر في السجل" onClick={() => setAdjusting({ phone: focus ? localPhone(focus) : "" })}><SlidersHorizontal aria-hidden="true" />تعديل رصيد عميل</Action>
        <Action side="end" help="يفتح حدود النقاط: معدل الاكتساب وقيمة النقطة والحد الأدنى للاستبدال ومدة الصلاحية" onClick={() => setView("settings")}><Settings2 aria-hidden="true" />حدود النقاط</Action>
      </div>}
    </header>

    <div className={s.body}>
      {notice && <p className={s.notice} data-tone="good" role="status">{notice}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <section className={s.stats} aria-label="ملخص النقاط">
        <div className={s.stat}><span>نقاط مكتسبة<Help side="start" text="مجموع النقاط التي كسبها العملاء من فواتيرهم في كل الفروع" /></span><strong>{quantity(snapshot.totals.earned)}</strong></div>
        <div className={s.stat} data-tone="good"><span>نقاط مستبدلة<Help side="start" text="النقاط التي صرفها العملاء كخصم على فواتيرهم" /></span><strong>{quantity(snapshot.totals.redeemed)}</strong><small>بقيمة {money(snapshot.totals.redeemedValue)} ريال</small></div>
        <div className={s.stat} data-tone="due"><span>رصيد قائم<Help side="start" text="النقاط الصالحة التي لم تستبدل بعد وقيمتها التزام على المتجر" /></span><strong>{quantity(snapshot.totals.outstanding)}</strong><small>بقيمة {money(snapshot.totals.outstanding * settings.pointValue)} ريال</small></div>
        <div className={s.stat}><span>عملاء لديهم نقاط<Help side="start" text="عدد أرقام الجوال التي لها حركة نقاط" /></span><strong>{quantity(snapshot.totals.customers)}</strong></div>
      </section>

      <div className={s.toolbar}>
        <div className={s.tabs} role="tablist" aria-label="أقسام النقاط">
          {([["ledger", "سجل النقاط"], ["customers", "أرصدة العملاء"], ["branches", "حسب الفرع"], ["settings", "الحدود والإعدادات"]] as const).map(([id, label]) =>
            <button key={id} type="button" role="tab" aria-selected={view === id} className={s.tab} onClick={() => setView(id)}>{label}</button>)}
        </div>
        {view === "customers" && <form className={s.toolbar} onSubmit={event => { event.preventDefault(); load({ query }); }}>
          <input className={s.search} type="search" inputMode="tel" dir="ltr" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث برقم الجوال" aria-label="بحث برقم الجوال" />
          <Action small type="submit" help="يعرض العملاء الذين يحتوي رقم جوالهم على الأرقام المكتوبة" disabled={pending}>بحث</Action>
        </form>}
        {focus && <Action small help="يلغي تصفية السجل على عميل واحد ويعرض كل الحركات" disabled={pending} onClick={() => load({ phone: null })}>عرض كل العملاء</Action>}
      </div>

      {view === "ledger" && <section className={s.panel}>
        <div className={s.panelHead}><div><h2>{focus ? `سجل نقاط العميل ${localPhone(focus)}` : "آخر حركات النقاط"}</h2><p>{focus && snapshot.customer ? `الرصيد الحالي ${quantity(snapshot.customer.balance)} نقطة` : "كل نقطة مع الفرع الذي اكتسبت أو صرفت فيه والفاتورة المرتبطة بها"}</p></div></div>
        {snapshot.ledger.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الوقت</th><th>العميل</th><th>الحركة</th><th data-num>النقاط</th><th>الفرع</th><th>مقابل</th><th>تنتهي</th><th>بواسطة</th></tr></thead>
          <tbody>{snapshot.ledger.map(row => <tr key={row.id}>
            <td>{dayTime(row.createdAt)}</td>
            <td><button type="button" className={s.rowTitle} style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }} onClick={() => load({ phone: row.phone })}><bdi dir="ltr">{localPhone(row.phone)}</bdi></button></td>
            <td><span className={s.badge} data-tone={row.kind === "earn" ? "good" : row.kind === "redeem" ? undefined : "warn"}>{pointsKindLabels[row.kind]}</span></td>
            <td data-num><bdi dir="ltr">{row.points > 0 ? `+${quantity(row.points)}` : `-${quantity(-row.points)}`}</bdi></td>
            <td>{row.branchId ? branchName.get(row.branchId) ?? "" : "بدون فرع"}</td>
            <td>{row.documentId && row.documentNumber ? row.documentKind === "sale" ? <Link href={invoiceHref(row.documentId)} className={s.rowTitle}>فاتورة {row.documentNumber} · {money(row.amount)} ريال</Link> : <span>مرتجع رقم {row.documentNumber}</span> : <span className={s.rowSub}>{row.note}</span>}{row.kind === "redeem" && <span className={s.rowSub}>خصم بقيمة {money(row.amount)} ريال</span>}</td>
            <td>{row.expiresAt ? day(row.expiresAt) : ""}</td>
            <td>{row.actor}</td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><Coins size={30} aria-hidden="true" /><strong>لا توجد حركات نقاط بعد</strong><span>تسجل النقاط تلقائيًا عند كل بيع في الكاشير يدخل فيه رقم جوال العميل</span></div>}
      </section>}

      {view === "customers" && <section className={s.panel}>
        {snapshot.customers.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>العميل</th><th data-num>الرصيد الصالح</th><th data-num>قيمته بالريال</th><th data-num>مكتسب</th><th data-num>مستبدل</th><th>آخر حركة</th><th>إجراءات</th></tr></thead>
          <tbody>{snapshot.customers.map(row => <tr key={row.phone}>
            <td><span className={s.rowTitle}>{row.name || "عميل"}</span><span className={s.rowSub}><bdi dir="ltr">{localPhone(row.phone)}</bdi></span></td>
            <td data-num>{quantity(row.balance)}</td><td data-num>{money(row.balance * settings.pointValue)}</td><td data-num>{quantity(row.earned)}</td><td data-num>{quantity(row.redeemed)}</td><td>{dayTime(row.lastAt)}</td>
            <td><div className={s.rowActions}>
              <Action small side="end" help="يعرض سجل هذا العميل: أين كسب كل نقطة وأين صرفها" disabled={pending} onClick={() => { setView("ledger"); load({ phone: row.phone }); }}>السجل</Action>
              {snapshot.canManage && <Action small side="end" help="يضيف أو يخصم نقاطًا من رصيد هذا العميل مع ذكر السبب" onClick={() => setAdjusting({ phone: localPhone(row.phone) })}>تعديل</Action>}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا يوجد عملاء لديهم نقاط</strong></div>}
      </section>}

      {view === "branches" && <section className={s.panel}>
        <div className={s.panelHead}><div><h2>النقاط حسب الفرع</h2><p>الفرع الذي اكتسبت فيه النقاط والفرع الذي صرفت فيه قد يختلفان لأن الرصيد واحد لكل الفروع</p></div></div>
        {snapshot.byBranch.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الفرع</th><th data-num>نقاط اكتسبت فيه</th><th data-num>نقاط صرفت فيه</th><th data-num>قيمة المصروف بالريال</th></tr></thead>
          <tbody>{snapshot.byBranch.map(row => <tr key={row.branchId ?? "none"}><td>{row.branchId ? branchName.get(row.branchId) ?? "فرع" : "بدون فرع محدد"}</td><td data-num>{quantity(row.earned)}</td><td data-num>{quantity(row.redeemed)}</td><td data-num>{money(row.redeemed * settings.pointValue)}</td></tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد حركات بعد</strong></div>}
      </section>}

      {view === "settings" && <SettingsPanel key={settings.revision} snapshot={snapshot} onSaved={() => load({}, "تم حفظ حدود النقاط وتطبق على الفواتير الجديدة")} />}
    </div>
    {adjusting && <AdjustDialog snapshot={snapshot} phone={adjusting.phone} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load({}, "تم تعديل رصيد العميل وتسجيله في السجل"); }} />}
  </main>;
}

function SettingsPanel({ snapshot, onSaved }: { snapshot: PointsSnapshot; onSaved: () => void }) {
  const [form, setForm] = useState<PointsSettings>(snapshot.settings);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const number = (key: keyof PointsSettings, step: string, min: string) => <input type="number" min={min} step={step} value={Number(form[key])} disabled={!snapshot.canManage || pending} onChange={event => setForm({ ...form, [key]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0 })} />;
  const sample = Math.floor(100 * form.earnPerRiyal);
  return <form className={s.panel} onSubmit={event => { event.preventDefault(); setError(""); start(async () => { const result = await savePointsSettings(form, snapshot.slug); if (result.ok) onSaved(); else setError(result.message); }); }}>
    <div className={s.panelHead}><div><h2>حدود النقاط واستخداماتها</h2><p>تطبق على كل الفروع والرصيد واحد للعميل أينما اشترى</p></div></div>
    <div className={s.panelBody} style={{ display: "grid", gap: 14 }}>
      <label className={s.option} style={{ maxWidth: 420 }}><input type="checkbox" checked={form.enabled} disabled={!snapshot.canManage || pending} onChange={event => setForm({ ...form, enabled: event.target.checked })} /><span><b>تفعيل نقاط الولاء</b><small>عند الإيقاف يتوقف الاكتساب والاستبدال وتبقى الأرصدة محفوظة</small></span></label>
      <div className={s.grid}>
        <Field label="نقاط كل ريال" help="عدد النقاط التي يكسبها العميل عن كل ريال يدفعه">{number("earnPerRiyal", ".01", ".01")}</Field>
        <Field label="أقل فاتورة تكسب نقاطًا" help="الفاتورة التي تقل عن هذا المبلغ لا تكسب نقاطًا والصفر يعني كل الفواتير" hint="بالريال">{number("minInvoice", ".01", "0")}</Field>
        <Field label="قيمة النقطة عند الاستبدال" help="المبلغ الذي تخصمه النقطة الواحدة من الفاتورة" hint="بالريال">{number("pointValue", ".001", ".001")}</Field>
        <Field label="أقل عدد نقاط للاستبدال" help="لا يستطيع العميل الاستبدال قبل أن يصل رصيده إلى هذا العدد">{number("minRedeemPoints", "1", "1")}</Field>
        <Field label="أقصى نسبة تدفع بالنقاط" help="أعلى نسبة من قيمة الفاتورة يمكن دفعها بالنقاط والباقي يدفع نقدًا أو شبكة" hint="من 1 إلى 95 بالمئة">{number("maxRedeemPercent", "1", "1")}</Field>
        <Field label="صلاحية النقاط بالأيام" help="النقطة التي لا تستبدل خلال هذه المدة تسقط والصفر يعني بلا انتهاء">{number("expiryDays", "1", "0")}</Field>
      </div>
      <p className={s.notice}>مثال: فاتورة بمئة ريال تكسب {quantity(sample)} نقطة قيمتها عند الاستبدال {money(sample * form.pointValue)} ريال</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {snapshot.canManage ? <div className={s.toolbar}><Action type="submit" tone="primary" side="start" help="يحفظ الحدود ويطبقها على الفواتير الجديدة في كل الفروع" disabled={pending}>{pending ? "جار الحفظ" : "حفظ الحدود"}</Action></div> : <p className={s.rowSub}>تعديل الحدود متاح للمالك أو المدير</p>}
    </div>
  </form>;
}

function AdjustDialog({ snapshot, phone: initialPhone, onClose, onSaved }: { snapshot: PointsSnapshot; phone: string; onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState(initialPhone);
  const [direction, setDirection] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <Dialog open title="تعديل رصيد نقاط عميل" subtitle="يسجل التعديل في السجل باسم من نفذه وسببه ولا يمكن حذفه" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (!(amount > 0)) return setError("أدخل عدد نقاط أكبر من صفر"); setError(""); start(async () => { const result = await adjustPoints({ phone, points: direction === "add" ? amount : -amount, note, branchId: branchId || null }, snapshot.slug); if (result.ok) onSaved(); else setError(result.message); }); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <div className={s.choice}>
          <label className={s.option}><input type="radio" name="direction" checked={direction === "add"} onChange={() => setDirection("add")} /><span><b>إضافة نقاط</b><small>تعويض أو هدية للعميل</small></span></label>
          <label className={s.option}><input type="radio" name="direction" checked={direction === "deduct"} onChange={() => setDirection("deduct")} /><span><b>خصم نقاط</b><small>تصحيح خطأ ولا يتجاوز رصيد العميل</small></span></label>
        </div>
        <div className={s.grid}>
          <Field label="رقم جوال العميل" help="الرقم الذي يعطيه العميل للكاشير عند الشراء" hint="مثال 0512345678"><input required inputMode="tel" dir="ltr" maxLength={20} value={phone} onChange={event => setPhone(event.target.value)} /></Field>
          <Field label="عدد النقاط"><input required type="number" min="1" step="1" value={amount || ""} onChange={event => setAmount(Math.max(0, Math.floor(event.target.valueAsNumber || 0)))} /></Field>
          <Field label="الفرع" help="الفرع الذي يسجل عليه هذا التعديل في التقارير"><select value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">بدون فرع محدد</option>{snapshot.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        </div>
        <Field label="سبب التعديل" help="يظهر في سجل النقاط ليعرف المراجع لماذا تغير الرصيد"><textarea required minLength={5} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة دون تعديل الرصيد" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يسجل التعديل في سجل النقاط ويغير رصيد العميل فورًا" disabled={pending}>{pending ? "جار التسجيل" : "تأكيد التعديل"}</Action>
      </footer>
    </form>
  </Dialog>;
}
