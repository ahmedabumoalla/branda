"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw } from "lucide-react";
import { completeFamilyOtp, requestFamilyOtp, signOutFamily } from "@/app/actions/erp-family-portal";
import { Action, Field, Help, aldeem as s, day, dayTime, money, quantity } from "@/components/aldeem/aldeem-ui";
import { familyModes, type FamilyPortalSnapshot } from "@/lib/erp/families";
import type { FamilyPortalState } from "@/lib/data/erp-family-portal";

const activityLabels = { received: "استلام من الأسرة", returned: "إرجاع للأسرة", paid: "دفعة مستلمة", sold: "بيع", sale_return: "مرتجع بيع" } as const;

export function FamilyPortal({ slug, result }: { slug: string; result: FamilyPortalState }) {
  if (result.state === "ready") return <FamilyHome data={result.data} />;
  if (result.state === "login") return <FamilyLogin slug={slug} />;
  return <FamilyMessage slug={slug} state={result.state} />;
}

function FamilyMessage({ slug, state }: { slug: string; state: "missing" | "unlinked" | "unavailable" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <main className={s.page} dir="rtl">
    <header className={s.hero}><div><span className={s.eyebrow}>لوحة الأسر المنتجة</span><h1>{state === "unlinked" ? "رقم الجوال غير مسجل كأسرة منتجة" : "اللوحة غير متاحة حاليًا"}</h1><p>{state === "unlinked" ? "تواصلي مع إدارة المتجر لتسجيل رقم جوالك في بيانات الأسرة ثم ادخلي مرة أخرى" : "حاولي بعد قليل وإن استمر التعذر تواصلي مع إدارة المتجر"}</p></div></header>
    <div className={s.body}><div className={s.toolbar}>
      <Action tone="primary" help="يعيد تحميل الصفحة ويقرأ البيانات من جديد" disabled={busy} onClick={() => { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 1500); }}><RefreshCw aria-hidden="true" />إعادة المحاولة</Action>
      {state === "unlinked" && <Action help="يخرج من هذا الرقم لتدخلي برقم آخر" disabled={busy} onClick={() => { setBusy(true); void signOutFamily().then(() => window.location.assign(`/finance/${slug}/family`)); }}><LogOut aria-hidden="true" />الدخول برقم آخر</Action>}
    </div></div>
  </main>;
}

function FamilyLogin({ slug }: { slug: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function requestCode() {
    if (lock.current || remaining > 0 || !phone.trim()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await requestFamilyOtp(slug, phone.trim());
      if (!result.ok) {
        const retry = "retryAfterSeconds" in result && typeof result.retryAfterSeconds === "number" ? result.retryAfterSeconds : 0;
        if (retry > 0) setRemaining(retry);
        setError(result.message);
        return;
      }
      setMasked(result.maskedPhone); setRemaining(result.resendAfterSeconds); setCode(""); setStage("code");
    } catch { setError("تعذر الاتصال حاولي مرة أخرى"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function verify() {
    if (lock.current) return;
    if (!/^\d{6}$/.test(code)) { setError("أدخلي رمز التحقق المكون من ستة أرقام"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await completeFamilyOtp(slug, phone.trim(), code);
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    } catch { setError("تعذر الاتصال حاولي مرة أخرى"); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className={s.page} dir="rtl">
    <header className={s.hero}><div><span className={s.eyebrow}>لوحة الأسر المنتجة</span><h1>تابعي منتجاتك ومستحقاتك</h1><p>ادخلي برقم الجوال المسجل لدى المتجر لتشاهدي ما بيع وما بقي وأين تعرض منتجاتك</p></div></header>
    <div className={s.body}>
      <form className={s.panel} style={{ maxWidth: 440 }} aria-busy={busy} onSubmit={event => { event.preventDefault(); if (stage === "phone") void requestCode(); else void verify(); }}>
        <div className={s.panelBody} style={{ display: "grid", gap: 14 }}>
          {stage === "phone"
            ? <Field label="رقم الجوال" help="الرقم الذي سجلته إدارة المتجر في بيانات أسرتك" hint="مثال 0512345678"><input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={25} value={phone} disabled={busy} onChange={event => { setPhone(event.target.value); setError(""); }} /></Field>
            : <Field label="رمز التحقق" help="رمز من ستة أرقام يصلك على الجوال" hint={`أرسلنا الرمز إلى ${masked}`}><input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} disabled={busy} onChange={event => { setCode(event.target.value.replace(/[^0-9]/g, "")); setError(""); }} /></Field>}
          {error && <p role="alert" className={s.error}>{error}</p>}
          <div className={s.toolbar}>
            <Action type="submit" tone="primary" side="start" help={stage === "phone" ? "يرسل رمز تحقق إلى جوالك المسجل" : "يتحقق من الرمز ويفتح لوحتك"} disabled={busy || stage === "phone" && remaining > 0}>{busy ? "لحظة" : stage === "phone" ? "إرسال رمز التحقق" : "دخول"}</Action>
            {stage === "code" && <Action help="يرسل رمزًا جديدًا بعد انتهاء مهلة الانتظار" disabled={busy || remaining > 0} onClick={() => void requestCode()}>إعادة إرسال الرمز</Action>}
            {stage === "code" && <Action help="يرجع لتعديل رقم الجوال" disabled={busy} onClick={() => { setStage("phone"); setCode(""); setError(""); }}>تغيير الرقم</Action>}
          </div>
          {remaining > 0 && <p className={s.rowSub} role="status">يمكن طلب رمز جديد بعد <bdi>{remaining}</bdi> ثانية</p>}
        </div>
      </form>
    </div>
  </main>;
}

function FamilyHome({ data }: { data: FamilyPortalSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const row = data.families[0];
  const branchName = new Map(data.branches.map(branch => [branch.id, branch.name]));
  const warehouse = new Map(data.warehouses.map(item => [item.id, item]));
  const itemName = new Map(data.items.map(item => [item.itemId, item.name]));
  const placeName = (id: string) => { const place = warehouse.get(id); return place?.branchId && branchName.get(place.branchId) ? branchName.get(place.branchId)! : place?.name ?? "المتجر"; };
  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div><span className={s.eyebrow}>{data.brand.name}</span><h1>{row.name}</h1><p>ما استلمه المتجر من منتجاتك وما بيع منها وما بقي معروضًا وما يستحق لك</p></div>
      <div className={s.heroActions}>
        <Action side="end" help="يحدث الأرقام بآخر المبيعات والدفعات" disabled={busy} onClick={() => { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 1200); }}><RefreshCw aria-hidden="true" />تحديث</Action>
        <Action side="end" help="يغلق لوحتك على هذا الجهاز" disabled={busy} onClick={() => { setBusy(true); void signOutFamily().then(() => window.location.assign(`/finance/${data.brand.slug}/family`)); }}><LogOut aria-hidden="true" />خروج</Action>
      </div>
    </header>
    <div className={s.body}>
      <section className={s.stats} aria-label="ملخص حسابك">
        <div className={s.stat}><span>مستلم منك<Help side="start" text="إجمالي الحبات التي استلمها المتجر منك" /></span><strong>{quantity(row.received)}</strong><small>حبة</small></div>
        <div className={s.stat} data-tone="good"><span>تم بيعه<Help side="start" text="الحبات التي اشتراها العملاء بعد خصم مرتجعاتهم" /></span><strong>{quantity(row.sold)}</strong><small>حبة</small></div>
        <div className={s.stat}><span>معروض الآن<Help side="start" text="الحبات الموجودة على رفوف الفروع ولم تبع" /></span><strong>{quantity(row.remaining)}</strong><small>مرتجع لك {quantity(row.returned)}</small></div>
        <div className={s.stat} data-tone="due"><span>مستحق لك الآن<Help side="start" text="قيمة ما بيع من بضاعة الدفع بعد البيع ولم تستلميه بعد" /></span><strong>{money(row.dueNow)}</strong><small>استلمت {money(row.paid)} ريال</small></div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>منتجاتك وأين تعرض</h2><p>كل صنف مع الفروع التي يعرض فيها الآن والفروع التي بيع فيها</p></div></div>
        {data.items.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الصنف</th><th data-num>سعرك للحبة</th><th data-num>مستلم</th><th data-num>مباع</th><th>معروض الآن في</th><th>بيع في</th></tr></thead>
          <tbody>{data.items.map(item => <tr key={item.itemId}>
            <td><span className={s.rowTitle}>{item.name}</span>{item.flavor && <span className={s.rowSub}>{item.flavor}</span>}</td>
            <td data-num>{money(item.cost)}</td><td data-num>{quantity(item.received)}</td><td data-num>{quantity(item.sold)}</td>
            <td><div className={s.places}>{item.stock.filter(place => place.quantity > 0).length ? item.stock.filter(place => place.quantity > 0).map(place => <span key={place.warehouseId} className={s.place}>{placeName(place.warehouseId)}<b>{quantity(place.quantity)}</b></span>) : <span className={s.rowSub}>غير معروض حاليًا</span>}</div></td>
            <td><div className={s.places}>{item.soldByBranch.filter(place => place.quantity > 0).length ? item.soldByBranch.filter(place => place.quantity > 0).map(place => <span key={place.branchId ?? "none"} className={s.place}>{place.branchId ? branchName.get(place.branchId) ?? "فرع" : "المتجر"}<b>{quantity(place.quantity)}</b></span>) : <span className={s.rowSub}>لم يبع بعد</span>}</div></td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد أصناف مسجلة لك بعد</strong></div>}
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>الاستلامات</h2><p>كل مرة استلم فيها المتجر بضاعة منك</p></div></div>
        {data.consignments.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الاستلام</th><th>الفرع</th><th>طريقة التسوية</th><th data-num>مستلم</th><th data-num>مباع</th><th data-num>مرتجع</th><th data-num>معروض</th><th data-num>القيمة</th><th data-num>استلمت</th><th data-num>مستحق الآن</th></tr></thead>
          <tbody>{data.consignments.map(receipt => { const sum = receipt.lines.reduce((total, line) => ({ quantity: total.quantity + line.quantity, sold: total.sold + line.sold, returned: total.returned + line.returned, remaining: total.remaining + line.remaining }), { quantity: 0, sold: 0, returned: 0, remaining: 0 }); return <tr key={receipt.id}>
            <td><span className={s.rowTitle}>استلام {receipt.number}</span><span className={s.rowSub}>{day(receipt.receivedAt)}</span></td>
            <td>{branchName.get(receipt.branchId) ?? ""}</td>
            <td><span className={s.badge} data-tone={receipt.mode === "cash" ? "good" : "warn"}>{familyModes[receipt.mode]}</span>{receipt.returnBy && <span className={s.rowSub}>موعد الإرجاع {day(receipt.returnBy)}</span>}</td>
            <td data-num>{quantity(sum.quantity)}</td><td data-num>{quantity(sum.sold)}</td><td data-num>{quantity(sum.returned)}</td><td data-num>{quantity(sum.remaining)}</td>
            <td data-num>{money(receipt.total - receipt.refunded)}</td><td data-num>{money(receipt.paid)}</td><td data-num>{money(receipt.dueNow)}</td>
          </tr>; })}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد استلامات بعد</strong></div>}
      </section>

      <section className={s.panel}>
        <div className={s.panelHead}><div><h2>سجل الحركة</h2><p>آخر عمليات البيع والدفع والإرجاع</p></div></div>
        {data.activity.length ? <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الوقت</th><th>الحركة</th><th>الصنف</th><th>الفرع</th><th data-num>الكمية</th><th data-num>المبلغ</th></tr></thead>
          <tbody>{data.activity.map((entry, index) => <tr key={`${entry.kind}-${entry.number}-${entry.itemId ?? ""}-${index}`}>
            <td>{dayTime(entry.at)}</td>
            <td><span className={s.badge} data-tone={entry.kind === "sold" ? "good" : entry.kind === "received" ? "mute" : entry.kind === "paid" ? undefined : "warn"}>{activityLabels[entry.kind]}</span></td>
            <td>{entry.itemId ? itemName.get(entry.itemId) ?? "" : "كل الأصناف"}</td><td>{entry.branchId ? branchName.get(entry.branchId) ?? "" : ""}</td>
            <td data-num>{entry.quantity === null ? "" : quantity(Math.abs(entry.quantity))}</td>
            <td data-num>{entry.kind === "sold" || entry.kind === "sale_return" ? "" : money(Math.abs(entry.amount))}</td>
          </tr>)}</tbody>
        </table></div> : <div className={s.empty}><strong>لا توجد حركات بعد</strong></div>}
      </section>
    </div>
  </main>;
}
