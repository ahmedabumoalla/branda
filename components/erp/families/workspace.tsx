"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, HandCoins, PackagePlus, Plus, Undo2, UserRoundPlus, Store, Pencil, LayoutDashboard, Link2 } from "lucide-react";
import { createFamilyItem, getFamilies, linkFamilyItem, payFamily, receiveFamilyGoods, returnFamilyGoods, saveFamily } from "@/app/actions/erp-families";
import { withBranchScope } from "@/components/erp/branches/context";
import { Action, Dialog, Field, Help, aldeem as s, day, dayTime, money, quantity } from "@/components/aldeem/aldeem-ui";
import { emptyFamilyProfile, familyModes, familyReceiptTotal, familyReturnTotal, type FamilyConsignment, type FamilyMode, type FamilyProfile, type FamilyRecord, type FamilySnapshot } from "@/lib/erp/families";

type View = "families" | "receipts" | "items" | "activity";
type Open =
  | { kind: "family"; family?: FamilyRecord }
  | { kind: "item"; familyId: string }
  | { kind: "receive"; mode: FamilyMode; familyId?: string }
  | { kind: "return"; familyId?: string; consignmentId?: string }
  | { kind: "pay"; consignmentId: string }
  | { kind: "dashboard"; familyId: string }
  | null;

const activityLabels = { received: "استلام", returned: "إرجاع للأسرة", paid: "دفعة للأسرة", sold: "بيع", sale_return: "مرتجع بيع" } as const;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

export function FamiliesWorkspace({ initialSnapshot }: { initialSnapshot: FamilySnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [source, setSource] = useState(initialSnapshot);
  if (source !== initialSnapshot) { setSource(initialSnapshot); setSnapshot(initialSnapshot); }
  const [view, setView] = useState<View>("families");
  const [open, setOpen] = useState<Open>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const branchName = useMemo(() => new Map(snapshot.branches.map(row => [row.id, row.name])), [snapshot.branches]);
  const warehouse = useMemo(() => new Map(snapshot.warehouses.map(row => [row.id, row])), [snapshot.warehouses]);
  const familyName = useMemo(() => new Map(snapshot.families.map(row => [row.id, row.name])), [snapshot.families]);
  const placeName = (warehouseId: string) => { const row = warehouse.get(warehouseId); return row ? row.branchId && branchName.get(row.branchId) ? `${branchName.get(row.branchId)} · ${row.name}` : row.name : "مستودع غير معروف"; };
  const totals = useMemo(() => snapshot.families.reduce((sum, row) => ({ remaining: sum.remaining + row.remaining, sold: sum.sold + row.sold, due: sum.due + row.dueNow, payable: sum.payable + row.payable }), { remaining: 0, sold: 0, due: 0, payable: 0 }), [snapshot.families]);
  const needle = query.trim();
  const families = snapshot.families.filter(row => !needle || row.name.includes(needle) || row.phone.includes(needle) || (row.profile.ownerName ?? "").includes(needle));

  async function reload(message: string) {
    setOpen(null); setNotice(message);
    const result = await getFamilies(snapshot.slug);
    if (result.ok) setSnapshot(result.data);
    router.refresh();
  }

  return <main className={s.page} dir="rtl">
    <header className={s.hero}>
      <div>
        <span className={s.eyebrow}>{snapshot.brand}</span>
        <h1>الأسر المنتجة</h1>
        <p>استلام منتجات الأسر وعرضها في الفروع ومتابعة ما بيع وما بقي وما يستحق لكل أسرة</p>
      </div>
      {snapshot.canWrite && <div className={s.heroActions}>
        <Action tone="primary" side="end" help="يستلم بضاعة من الأسرة ويدفع قيمتها فورًا من الخزينة فتصبح ملكًا للمتجر" onClick={() => setOpen({ kind: "receive", mode: "cash" })}><Banknote aria-hidden="true" />استلام ودفع نقدي</Action>
        <Action side="end" help="يستلم البضاعة ويعرضها دون دفع ثم تستحق الأسرة قيمة ما يباع فقط" onClick={() => setOpen({ kind: "receive", mode: "after_sale" })}><HandCoins aria-hidden="true" />استلام والدفع بعد البيع</Action>
        <Action side="end" help="يعيد للأسرة الكمية التي لم تبع من استلام سابق ويخصمها من المخزون ومن المستحق" onClick={() => setOpen({ kind: "return" })}><Undo2 aria-hidden="true" />استلام وإرجاع</Action>
        <Action side="end" help="يضيف أسرة منتجة جديدة ببياناتها ووثيقتها وحسابها البنكي" onClick={() => setOpen({ kind: "family" })}><UserRoundPlus aria-hidden="true" />أسرة جديدة</Action>
      </div>}
    </header>

    <div className={s.body}>
      {notice && <p className={s.notice} data-tone="good" role="status">{notice}</p>}
      <section className={s.stats} aria-label="ملخص الأسر المنتجة">
        <div className={s.stat}><span>الأسر المسجلة<Help side="start" text="عدد الأسر الفعالة والموقوفة المسجلة في الحساب" /></span><strong>{quantity(snapshot.families.length)}</strong><small>{quantity(snapshot.families.filter(row => row.active).length)} فعالة</small></div>
        <div className={s.stat}><span>معروض الآن<Help side="start" text="عدد الحبات الموجودة حاليًا على الرفوف في كل الفروع ولم تبع ولم ترجع" /></span><strong>{quantity(totals.remaining)}</strong><small>حبة في الفروع</small></div>
        <div className={s.stat} data-tone="good"><span>تم بيعه<Help side="start" text="إجمالي الحبات المباعة من منتجات الأسر بعد خصم مرتجعات العملاء" /></span><strong>{quantity(totals.sold)}</strong><small>حبة</small></div>
        <div className={s.stat} data-tone="due"><span>مستحق الدفع الآن<Help side="start" text="قيمة ما بيع من استلامات الدفع بعد البيع ولم يدفع للأسر بعد" /></span><strong>{money(totals.due)}</strong><small>ريال من أصل {money(totals.payable)} غير مسدد</small></div>
      </section>

      <div className={s.toolbar}>
        <div className={s.tabs} role="tablist" aria-label="أقسام الأسر المنتجة">
          {([["families", "الأسر"], ["receipts", "الاستلامات"], ["items", "الأصناف وأماكن العرض"], ["activity", "سجل الحركة"]] as const).map(([id, label]) =>
            <button key={id} type="button" role="tab" aria-selected={view === id} className={s.tab} onClick={() => setView(id)}>{label}</button>)}
        </div>
        {view === "families" && <input className={s.search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم الأسرة أو الجوال" aria-label="بحث في الأسر" />}
      </div>

      {view === "families" && (families.length ? <section className={s.cards}>
        {families.map(row => <article key={row.id} className={s.card}>
          <div className={s.cardHead}>
            <div><h3>{row.name}</h3><span className={s.rowSub}>{row.profile.ownerName || "بدون اسم مسؤولة"}{row.phone ? ` · ${row.phone}` : ""}</span></div>
            <span className={s.badge} data-tone={row.active ? "good" : "mute"}>{row.active ? "فعالة" : "موقوفة"}</span>
          </div>
          <div className={s.cardGrid}>
            <div><span>مستلم</span><b>{quantity(row.received)}</b></div>
            <div><span>مباع</span><b>{quantity(row.sold)}</b></div>
            <div><span>معروض</span><b>{quantity(row.remaining)}</b></div>
          </div>
          <Meter received={row.received} sold={row.sold} returned={row.returned} />
          <div className={s.cardGrid}>
            <div><span>مدفوع</span><b>{money(row.paid)}</b></div>
            <div><span>غير مسدد</span><b>{money(row.payable)}</b></div>
            <div><span>مستحق الآن</span><b>{money(row.dueNow)}</b></div>
          </div>
          <div className={s.cardFoot}>
            <Action small tone="primary" side="start" help="يفتح لوحة الأسرة: ما بيع وما بقي وأين تعرض كل حبة وكل استلاماتها ودفعاتها" onClick={() => setOpen({ kind: "dashboard", familyId: row.id })}><LayoutDashboard aria-hidden="true" />لوحة الأسرة</Action>
            {snapshot.canWrite && <Action small side="start" help="يعدل بيانات الأسرة أو يوقفها عن الاستلامات الجديدة" onClick={() => setOpen({ kind: "family", family: row })}><Pencil aria-hidden="true" />تعديل</Action>}
            {snapshot.canWrite && <Action small side="start" help="يضيف صنفًا جديدًا لهذه الأسرة بباركود وسعر شراء وسعر بيع" onClick={() => setOpen({ kind: "item", familyId: row.id })}><PackagePlus aria-hidden="true" />صنف</Action>}
          </div>
        </article>)}
      </section> : <div className={s.panel}><div className={s.empty}><Store size={30} aria-hidden="true" /><strong>{needle ? "لا توجد أسرة بهذا البحث" : "لم تسجل أي أسرة منتجة بعد"}</strong>{!needle && snapshot.canWrite && <Action tone="primary" help="يضيف أول أسرة منتجة لتبدأ استلام منتجاتها" onClick={() => setOpen({ kind: "family" })}><Plus aria-hidden="true" />أضف أول أسرة</Action>}</div></div>)}

      {view === "receipts" && <ReceiptsTable snapshot={snapshot} rows={snapshot.consignments} familyName={familyName} branchName={branchName} onReturn={id => setOpen({ kind: "return", consignmentId: id })} onPay={id => setOpen({ kind: "pay", consignmentId: id })} />}
      {view === "items" && <ItemsTable snapshot={snapshot} items={snapshot.items} familyName={familyName} placeName={placeName} branchName={branchName} />}
      {view === "activity" && <ActivityTable snapshot={snapshot} rows={snapshot.activity} familyName={familyName} branchName={branchName} />}
    </div>

    {open?.kind === "family" && <FamilyDialog snapshot={snapshot} family={open.family} onClose={() => setOpen(null)} onSaved={() => reload("تم حفظ بيانات الأسرة")} />}
    {open?.kind === "item" && <ItemDialog snapshot={snapshot} familyId={open.familyId} onClose={() => setOpen(null)} onSaved={() => reload("تم ربط الصنف بالأسرة")} />}
    {open?.kind === "receive" && <ReceiveDialog snapshot={snapshot} mode={open.mode} familyId={open.familyId} onClose={() => setOpen(null)} onSaved={() => reload("تم تسجيل الاستلام وإضافة الكميات إلى مخزون الفرع")} />}
    {open?.kind === "return" && <ReturnDialog snapshot={snapshot} familyId={open.familyId} consignmentId={open.consignmentId} familyName={familyName} branchName={branchName} onClose={() => setOpen(null)} onSaved={() => reload("تم تسجيل الإرجاع وخصم الكميات من المخزون")} />}
    {open?.kind === "pay" && <PayDialog snapshot={snapshot} consignmentId={open.consignmentId} familyName={familyName} onClose={() => setOpen(null)} onSaved={() => reload("تم تسجيل الدفعة للأسرة")} />}
    {open?.kind === "dashboard" && <FamilyDashboard snapshot={snapshot} familyId={open.familyId} branchName={branchName} placeName={placeName} familyName={familyName} onClose={() => setOpen(null)} onOpen={setOpen} />}
  </main>;
}

function Meter({ received, sold, returned }: { received: number; sold: number; returned: number }) {
  const base = received > 0 ? received : 1;
  return <div>
    <div className={s.meter} role="img" aria-label={`مباع ${quantity(sold)} ومرتجع ${quantity(returned)} من ${quantity(received)}`}>
      <i data-part="sold" style={{ width: `${Math.min(100, Math.max(0, sold) / base * 100)}%` }} /><i data-part="returned" style={{ width: `${Math.min(100, returned / base * 100)}%` }} />
    </div>
    <div className={s.legend}><span data-part="sold">مباع</span><span data-part="returned">مرتجع للأسرة</span><span>معروض</span></div>
  </div>;
}

type Names = Map<string, string>;

function ReceiptsTable({ snapshot, rows, familyName, branchName, onReturn, onPay }: { snapshot: FamilySnapshot; rows: FamilyConsignment[]; familyName: Names; branchName: Names; onReturn?: (id: string) => void; onPay?: (id: string) => void }) {
  if (!rows.length) return <div className={s.panel}><div className={s.empty}><strong>لا توجد استلامات مسجلة</strong><span>تظهر هنا كل بضاعة استلمت من الأسر مع ما بيع منها وما بقي</span></div></div>;
  return <div className={s.panel}><div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>الاستلام</th><th>الأسرة</th><th>الفرع</th><th>طريقة التسوية</th><th data-num>مستلم</th><th data-num>مباع</th><th data-num>مرتجع</th><th data-num>معروض</th><th data-num>القيمة</th><th data-num>مدفوع</th><th data-num>مستحق الآن</th><th>إجراءات</th></tr></thead>
    <tbody>{rows.map(row => {
      const sum = row.lines.reduce((total, line) => ({ quantity: total.quantity + line.quantity, sold: total.sold + line.sold, returned: total.returned + line.returned, remaining: total.remaining + line.remaining }), { quantity: 0, sold: 0, returned: 0, remaining: 0 });
      const late = row.returnBy && sum.remaining > 0 && row.returnBy < today();
      return <tr key={row.id}>
        <td><span className={s.rowTitle}>استلام {row.number}</span><span className={s.rowSub}>{day(row.receivedAt)} · فاتورة {row.purchaseNumber}</span></td>
        <td>{familyName.get(row.familyId) ?? ""}</td>
        <td>{branchName.get(row.branchId) ?? ""}</td>
        <td><span className={s.badge} data-tone={row.mode === "cash" ? "good" : "warn"}>{familyModes[row.mode]}</span>{row.returnBy && <span className={s.rowSub} data-late={late || undefined}>{late ? "تجاوز موعد الإرجاع " : "موعد الإرجاع "}{day(row.returnBy)}</span>}</td>
        <td data-num>{quantity(sum.quantity)}</td><td data-num>{quantity(sum.sold)}</td><td data-num>{quantity(sum.returned)}</td><td data-num>{quantity(sum.remaining)}</td>
        <td data-num>{money(row.total - row.refunded)}</td><td data-num>{money(row.paid)}</td><td data-num>{row.dueNow > 0 ? <span className={s.badge} data-tone="warn">{money(row.dueNow)}</span> : money(0)}</td>
        <td><div className={s.rowActions}>
          {snapshot.canWrite && onReturn && sum.remaining > 0 && <Action small side="end" help="يعيد للأسرة كمية لم تبع من هذا الاستلام" onClick={() => onReturn(row.id)}><Undo2 aria-hidden="true" />إرجاع</Action>}
          {snapshot.canPay && onPay && row.outstanding > 0 && <Action small tone="primary" side="end" help="يسجل دفعة للأسرة عن هذا الاستلام من الخزينة أو البنك" onClick={() => onPay(row.id)}><HandCoins aria-hidden="true" />دفع</Action>}
        </div></td>
      </tr>;
    })}</tbody>
  </table></div></div>;
}

function ItemsTable({ snapshot, items, familyName, placeName, branchName }: { snapshot: FamilySnapshot; items: FamilySnapshot["items"]; familyName: Names; placeName: (id: string) => string; branchName: Names }) {
  if (!items.length) return <div className={s.panel}><div className={s.empty}><strong>لا توجد أصناف مرتبطة بالأسر</strong><span>أضف صنفًا من بطاقة الأسرة ليظهر هنا مع أماكن عرضه</span></div></div>;
  return <div className={s.panel}><div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>الصنف</th><th>الأسرة</th><th data-num>سعر الشراء</th><th data-num>سعر البيع</th><th data-num>مستلم</th><th data-num>مباع</th><th>أين يعرض الآن</th><th>أين بيع</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.itemId}>
      <td><span className={s.rowTitle}>{item.name}</span><span className={s.rowSub}>{item.flavor ? `${item.flavor} · ` : ""}<bdi dir="ltr">{item.barcode ?? item.sku}</bdi></span></td>
      <td>{familyName.get(item.familyId) ?? ""}</td>
      <td data-num>{money(item.cost)}</td><td data-num>{money(item.price)}</td><td data-num>{quantity(item.received)}</td><td data-num>{quantity(item.sold)}</td>
      <td><div className={s.places}>{item.stock.filter(place => place.quantity > 0).length ? item.stock.filter(place => place.quantity > 0).map(place => <span key={place.warehouseId} className={s.place}>{placeName(place.warehouseId)}<b>{quantity(place.quantity)}</b></span>) : <span className={s.rowSub}>غير معروض حاليًا</span>}</div></td>
      <td><div className={s.places}>{item.soldByBranch.filter(place => place.quantity > 0).length ? item.soldByBranch.filter(place => place.quantity > 0).map(place => <span key={place.branchId ?? "none"} className={s.place}>{place.branchId ? branchName.get(place.branchId) ?? "فرع" : "بدون فرع محدد"}<b>{quantity(place.quantity)}</b></span>) : <span className={s.rowSub}>لم يبع بعد</span>}</div></td>
    </tr>)}</tbody>
  </table></div>{snapshot.unlinkedItems.length > 0 && <p className={s.notice} style={{ margin: 14 }}>يوجد {quantity(snapshot.unlinkedItems.length)} صنف مسجل كمنتج أسرة ولم يربط بأسرة بعد اربطه من زر صنف في بطاقة الأسرة</p>}</div>;
}

function ActivityTable({ rows, familyName, branchName, snapshot }: { snapshot: FamilySnapshot; rows: FamilySnapshot["activity"]; familyName: Names; branchName: Names }) {
  const itemName = new Map(snapshot.items.map(item => [item.itemId, item.name]));
  if (!rows.length) return <div className={s.panel}><div className={s.empty}><strong>لا توجد حركات بعد</strong><span>كل استلام وبيع وإرجاع ودفعة يسجل هنا بتاريخه وفرعه</span></div></div>;
  return <div className={s.panel}><div className={s.tableWrap}><table className={s.table}>
    <thead><tr><th>الوقت</th><th>الحركة</th><th>الأسرة</th><th>الصنف</th><th>الفرع</th><th data-num>الكمية</th><th data-num>المبلغ</th><th data-num>رقم المستند</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.kind}-${row.number}-${row.itemId ?? ""}-${index}`}>
      <td>{dayTime(row.at)}</td>
      <td><span className={s.badge} data-tone={row.kind === "sold" ? "good" : row.kind === "paid" ? undefined : row.kind === "received" ? "mute" : "warn"}>{activityLabels[row.kind]}</span></td>
      <td>{familyName.get(row.familyId) ?? ""}</td><td>{row.itemId ? itemName.get(row.itemId) ?? "" : "كل الأصناف"}</td><td>{row.branchId ? branchName.get(row.branchId) ?? "" : ""}</td>
      <td data-num>{row.quantity === null ? "" : quantity(Math.abs(row.quantity))}</td><td data-num>{money(Math.abs(row.amount))}</td><td data-num>{row.number}</td>
    </tr>)}</tbody>
  </table></div></div>;
}

function useSubmit(onSaved: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const run = (operation: (requestId: string) => Promise<{ ok: true } | { ok: false; message: string }>) => {
    if (pending) return;
    setError("");
    start(async () => {
      try { const result = await operation(requestId); if (result.ok) onSaved(); else setError(result.message); }
      catch { setError("انقطع الاتصال قبل تأكيد الحفظ اضغط حفظ مرة أخرى وسيكمل النظام من حيث توقف"); }
    });
  };
  return { pending, error, setError, run };
}

function FamilyDialog({ snapshot, family, onClose, onSaved }: { snapshot: FamilySnapshot; family?: FamilyRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(family?.name ?? "");
  const [profile, setProfile] = useState<FamilyProfile>({ ...emptyFamilyProfile, ...family?.profile, phone: family?.profile.phone ?? family?.phone ?? "" });
  const [active, setActive] = useState(family?.active ?? true);
  const [existingSupplier, setExistingSupplier] = useState("");
  const [newSupplierId] = useState(() => crypto.randomUUID());
  const { pending, error, run } = useSubmit(onSaved);
  const set = <K extends keyof FamilyProfile>(key: K, value: FamilyProfile[K]) => setProfile(current => ({ ...current, [key]: value }));
  const picked = snapshot.suppliers.find(row => row.id === existingSupplier);
  return <Dialog open wide title={family ? "تعديل بيانات الأسرة" : "أسرة منتجة جديدة"} subtitle="بيانات الأسرة تستخدم في الاستلامات والدفعات ولوحة الأسرة" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); run(requestId => saveFamily(withBranchScope({ requestId, id: family?.id ?? null, revision: family?.revision ?? 0, supplierId: family?.supplierId ?? (existingSupplier || newSupplierId), createSupplier: !family && !existingSupplier, name: picked?.name ?? name, active, profile }, snapshot), snapshot.slug)); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {!family && snapshot.suppliers.length > 0 && <Field label="حساب مورد موجود" help="إذا كانت الأسرة مسجلة سابقًا كمورد اخترها هنا ليبقى كشف حسابها واحدًا وإلا اتركه فارغًا لإنشاء حساب جديد">
          <select value={existingSupplier} onChange={event => setExistingSupplier(event.target.value)}><option value="">إنشاء حساب جديد للأسرة</option>{snapshot.suppliers.map(row => <option key={row.id} value={row.id}>{row.name}{row.phone ? ` · ${row.phone}` : ""}</option>)}</select>
        </Field>}
        <div className={s.grid}>
          {!picked && <Field label="اسم الأسرة أو النشاط" help="الاسم الذي يظهر على المنتجات وفي كشف الحساب"><input required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} /></Field>}
          <Field label="اسم المسؤولة" help="الشخص الذي يسلم البضاعة ويستلم المبالغ"><input maxLength={160} value={profile.ownerName} onChange={event => set("ownerName", event.target.value)} /></Field>
          <Field label="رقم الجوال" help="رقم سعودي يبدأ بـ 05 تدخل به الأسرة إلى لوحتها الخاصة" hint="مثال 0512345678"><input inputMode="tel" dir="ltr" maxLength={20} value={profile.phone} onChange={event => set("phone", event.target.value)} /></Field>
          <Field label="المدينة"><input maxLength={160} value={profile.city} onChange={event => set("city", event.target.value)} /></Field>
          <Field label="رقم الهوية"><input inputMode="numeric" dir="ltr" maxLength={20} value={profile.nationalId} onChange={event => set("nationalId", event.target.value)} /></Field>
          <Field label="رقم وثيقة العمل الحر أو ترخيص الأسر المنتجة" help="يحفظ للرجوع إليه عند التدقيق"><input dir="ltr" maxLength={60} value={profile.licenseNumber} onChange={event => set("licenseNumber", event.target.value)} /></Field>
          <Field label="تاريخ انتهاء الوثيقة"><input type="date" value={profile.licenseExpiry} onChange={event => set("licenseExpiry", event.target.value)} /></Field>
          <Field label="البنك"><input maxLength={160} value={profile.bankName} onChange={event => set("bankName", event.target.value)} /></Field>
          <Field label="رقم الآيبان" help="يظهر عند تجهيز تحويل مستحقات الأسرة"><input dir="ltr" maxLength={34} value={profile.iban} onChange={event => set("iban", event.target.value)} /></Field>
          <Field label="طريقة التسوية المعتادة" help="تقترح تلقائيًا عند كل استلام جديد ويمكن تغييرها وقت الاستلام"><select value={profile.defaultMode} onChange={event => set("defaultMode", event.target.value as FamilyMode)}>{Object.entries(familyModes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          {family && <Field label="حالة الأسرة" help="الأسرة الموقوفة تبقى بياناتها وحسابها لكن لا يسجل لها استلام جديد"><select value={active ? "1" : "0"} onChange={event => setActive(event.target.value === "1")}><option value="1">فعالة</option><option value="0">موقوفة</option></select></Field>}
        </div>
        <Field label="ملاحظات"><textarea maxLength={1000} value={profile.note} onChange={event => set("note", event.target.value)} /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة دون حفظ أي تغيير" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يحفظ بيانات الأسرة وينشئ حسابها المالي إن كانت جديدة" disabled={pending}>{pending ? "جار الحفظ" : "حفظ الأسرة"}</Action>
      </footer>
    </form>
  </Dialog>;
}

function ItemDialog({ snapshot, familyId, onClose, onSaved }: { snapshot: FamilySnapshot; familyId: string; onClose: () => void; onSaved: () => void }) {
  const owner = snapshot.families.find(row => row.id === familyId);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [form, setForm] = useState({ name: "", flavor: "", barcode: "", buyPrice: 0, salePrice: 0, minQuantity: 0 });
  const [existing, setExisting] = useState("");
  const { pending, error, run } = useSubmit(onSaved);
  const number = (value: number) => Number.isFinite(value) ? value : 0;
  return <Dialog open title={`صنف جديد للأسرة ${owner?.name ?? ""}`} subtitle="الصنف يدخل المخزون باسم الأسرة ويباع من الكاشير بباركوده" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); run(requestId => mode === "new" ? createFamilyItem({ requestId, familyId, ...form }, snapshot.slug) : linkFamilyItem({ familyId, itemId: existing, linked: true }, snapshot.slug)); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {snapshot.unlinkedItems.length > 0 && <div className={s.choice}>
          <label className={s.option}><input type="radio" name="item-mode" checked={mode === "new"} onChange={() => setMode("new")} /><span><b>صنف جديد</b><small>ينشأ الآن ويربط بالأسرة</small></span></label>
          <label className={s.option}><input type="radio" name="item-mode" checked={mode === "existing"} onChange={() => setMode("existing")} /><span><b>صنف موجود في المخزون</b><small>مسجل كمنتج أسرة ولم يربط بعد</small></span></label>
        </div>}
        {mode === "existing" ? <Field label="الصنف" help="أصناف المخزون المسجلة كمنتج أسرة وغير مرتبطة بأي أسرة"><select required value={existing} onChange={event => setExisting(event.target.value)}><option value="">اختر الصنف</option>{snapshot.unlinkedItems.map(item => <option key={item.id} value={item.id}>{item.name}{item.barcode ? ` · ${item.barcode}` : ""}</option>)}</select></Field>
          : <div className={s.grid}>
            <Field label="اسم الصنف" help="كما يظهر للكاشير وعلى الفاتورة"><input required minLength={2} maxLength={150} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="النكهة أو النوع" help="تميز الأصناف المتشابهة مثل تمر أو فستق"><input maxLength={100} value={form.flavor} onChange={event => setForm({ ...form, flavor: event.target.value })} /></Field>
            <Field label="الباركود" help="اتركه فارغًا ليولد النظام باركودًا خاصًا يطبع على الملصق" hint="أرقام وحروف إنجليزية فقط"><input dir="ltr" maxLength={64} value={form.barcode} onChange={event => setForm({ ...form, barcode: event.target.value.trim() })} /></Field>
            <Field label="سعر الشراء من الأسرة" help="المبلغ المستحق للأسرة عن كل حبة"><input required type="number" min="0" step=".01" value={form.buyPrice} onChange={event => setForm({ ...form, buyPrice: number(event.target.valueAsNumber) })} /></Field>
            <Field label="سعر البيع للعميل" help="السعر الذي يظهر في الكاشير شاملًا الضريبة"><input required type="number" min="0" step=".01" value={form.salePrice} onChange={event => setForm({ ...form, salePrice: number(event.target.valueAsNumber) })} /></Field>
            <Field label="حد التنبيه" help="ينبه النظام عندما ينزل المعروض عن هذه الكمية"><input type="number" min="0" step="1" value={form.minQuantity} onChange={event => setForm({ ...form, minQuantity: number(event.target.valueAsNumber) })} /></Field>
          </div>}
        {mode === "new" && form.salePrice > 0 && form.salePrice < form.buyPrice && <p className={s.notice}>سعر البيع أقل من سعر الشراء راجع السعرين قبل الحفظ</p>}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة دون إضافة الصنف" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يضيف الصنف إلى المخزون ويربطه بهذه الأسرة" disabled={pending}>{pending ? "جار الحفظ" : "حفظ الصنف"}</Action>
      </footer>
    </form>
  </Dialog>;
}

function ReceiveDialog({ snapshot, mode: initialMode, familyId: initialFamily, onClose, onSaved }: { snapshot: FamilySnapshot; mode: FamilyMode; familyId?: string; onClose: () => void; onSaved: () => void }) {
  const activeFamilies = snapshot.families.filter(row => row.active);
  const [familyId, setFamilyId] = useState(initialFamily ?? (activeFamilies.length === 1 ? activeFamilies[0].id : ""));
  const [mode, setMode] = useState<FamilyMode>(initialMode);
  const scopedBranch = snapshot.branchScope?.branchId ?? "";
  const [branchId, setBranchId] = useState(scopedBranch || (snapshot.branches.length === 1 ? snapshot.branches[0].id : ""));
  const branchWarehouses = snapshot.warehouses.filter(row => !row.branchId || row.branchId === branchId);
  const [warehouseId, setWarehouseId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [returnBy, setReturnBy] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [note, setNote] = useState("");
  const [purchaseId] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<{ id: string; itemId: string; quantity: number; price: number }[]>([]);
  const { pending, error, setError, run } = useSubmit(onSaved);
  const items = snapshot.items.filter(item => item.familyId === familyId && item.active);
  const preferred = branchWarehouses.find(row => row.branchId === branchId) ?? branchWarehouses[0];
  const warehouse = branchWarehouses.some(row => row.id === warehouseId) ? warehouseId : preferred?.id ?? "";
  const total = familyReceiptTotal(lines.filter(line => line.itemId && line.quantity > 0));
  const available = items.filter(item => !lines.some(line => line.itemId === item.itemId));
  const addLine = (itemId: string) => { const item = items.find(row => row.itemId === itemId); if (item) setLines(current => [...current, { id: crypto.randomUUID(), itemId, quantity: 1, price: item.cost }]); };
  function submit() {
    const ready = lines.filter(line => line.quantity > 0);
    if (!familyId) return setError("اختر الأسرة");
    if (!branchId || !warehouse) return setError("اختر الفرع والمستودع الذي تدخل إليه البضاعة");
    if (!ready.length) return setError("أضف صنفًا واحدًا على الأقل بكمية صحيحة");
    if (mode === "cash" && !accountId) return setError("اختر الخزينة التي يصرف منها المبلغ");
    run(requestId => receiveFamilyGoods(withBranchScope({ requestId, purchaseId, familyId, branchId, warehouseId: warehouse, mode, accountId: mode === "cash" ? accountId : null, date, returnBy, invoiceNumber, note, lines: ready }, snapshot), snapshot.slug));
  }
  return <Dialog open wide title={familyModes[mode]} subtitle={mode === "cash" ? "تدخل البضاعة المخزون ويصرف ثمنها الآن من الخزينة" : "تدخل البضاعة المخزون وتستحق الأسرة قيمة ما يباع منها فقط"} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); submit(); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <div className={s.choice}>
          <label className={s.option}><input type="radio" name="receive-mode" checked={mode === "cash"} onChange={() => setMode("cash")} /><span><b>{familyModes.cash}</b><small>يخصم المبلغ من الخزينة فورًا</small></span></label>
          <label className={s.option}><input type="radio" name="receive-mode" checked={mode === "after_sale"} onChange={() => setMode("after_sale")} /><span><b>{familyModes.after_sale}</b><small>لا يدفع شيء الآن وما لم يبع يرجع للأسرة</small></span></label>
        </div>
        <div className={s.grid}>
          <Field label="الأسرة" help="الأسرة صاحبة البضاعة المستلمة"><select required value={familyId} onChange={event => { setFamilyId(event.target.value); setLines([]); const next = snapshot.families.find(row => row.id === event.target.value); if (next?.profile.defaultMode && !initialFamily) setMode(next.profile.defaultMode); }}><option value="">اختر الأسرة</option>{activeFamilies.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="الفرع المستلم" help="الفرع الذي تعرض فيه البضاعة وتحسب عليه مبيعاتها"><select required value={branchId} disabled={!!scopedBranch} onChange={event => { setBranchId(event.target.value); setWarehouseId(""); }}><option value="">اختر الفرع</option>{snapshot.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="المستودع" help="مستودع الفرع الذي تضاف إليه الكميات"><select required value={warehouse} onChange={event => setWarehouseId(event.target.value)}><option value="">اختر المستودع</option>{branchWarehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="تاريخ الاستلام"><input required type="date" max={today()} value={date} onChange={event => setDate(event.target.value)} /></Field>
          {mode === "cash" && <Field label="الصرف من" help="الخزينة أو الحساب البنكي الذي يدفع منه ثمن البضاعة"><select required value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر الحساب</option>{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
          {mode === "after_sale" && <Field label="موعد إرجاع ما لم يبع" help="تاريخ اختياري ينبهك النظام بعده إلى الكميات التي ما زالت معروضة"><input type="date" min={date} value={returnBy} onChange={event => setReturnBy(event.target.value)} /></Field>}
          <Field label="رقم سند الأسرة" help="رقم الفاتورة أو السند الورقي إن وجد ويترك فارغًا ليرقمه النظام"><input dir="ltr" maxLength={80} value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} /></Field>
        </div>
        <div className={s.lines}>
          {lines.map(line => { const item = items.find(row => row.itemId === line.itemId); return <div key={line.id} className={s.line}>
            <Field label="الصنف"><input readOnly value={item?.name ?? ""} /></Field>
            <Field label="الكمية"><input required type="number" min=".001" step=".001" value={line.quantity} onChange={event => setLines(current => current.map(row => row.id === line.id ? { ...row, quantity: event.target.valueAsNumber || 0 } : row))} /></Field>
            <Field label="سعر الشراء"><input required type="number" min="0" step=".01" value={line.price} onChange={event => setLines(current => current.map(row => row.id === line.id ? { ...row, price: event.target.valueAsNumber || 0 } : row))} /></Field>
            <Field label="الإجمالي"><input readOnly value={money(familyReceiptTotal([line]))} /></Field>
            <Action small tone="danger" side="end" help="يحذف هذا الصنف من الاستلام" onClick={() => setLines(current => current.filter(row => row.id !== line.id))}>حذف</Action>
          </div>; })}
          {familyId && (available.length ? <Field label="إضافة صنف للاستلام" help="اختر صنفًا من أصناف الأسرة ليضاف سطرًا في الاستلام"><select value="" onChange={event => addLine(event.target.value)}><option value="">اختر صنفًا من أصناف الأسرة</option>{available.map(item => <option key={item.itemId} value={item.itemId}>{item.name}{item.flavor ? ` · ${item.flavor}` : ""}</option>)}</select></Field>
            : !items.length && <p className={s.notice}>لا توجد أصناف لهذه الأسرة أضف صنفًا من زر صنف في بطاقة الأسرة أولًا</p>)}
        </div>
        <Field label="ملاحظات"><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <p className={s.total}>إجمالي الاستلام<strong>{money(total)}</strong>ريال</p>
        <div className={s.toolbar}>
          <Action type="button" help="يغلق النافذة دون تسجيل الاستلام" onClick={onClose} disabled={pending}>إلغاء</Action>
          <Action type="submit" tone="primary" side="end" help={mode === "cash" ? "يرحل فاتورة الاستلام ويضيف الكميات للمخزون ويخصم المبلغ من الخزينة" : "يرحل فاتورة الاستلام ويضيف الكميات للمخزون ويسجل القيمة على حساب الأسرة"} disabled={pending}>{pending ? "جار التسجيل" : "تأكيد الاستلام"}</Action>
        </div>
      </footer>
    </form>
  </Dialog>;
}

function ReturnDialog({ snapshot, familyId, consignmentId, familyName, branchName, onClose, onSaved }: { snapshot: FamilySnapshot; familyId?: string; consignmentId?: string; familyName: Names; branchName: Names; onClose: () => void; onSaved: () => void }) {
  const candidates = snapshot.consignments.filter(row => (!familyId || row.familyId === familyId) && row.lines.some(line => line.remaining > 0));
  const [selected, setSelected] = useState(consignmentId ?? (candidates.length === 1 ? candidates[0].id : ""));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, setError, run } = useSubmit(onSaved);
  const receipt = snapshot.consignments.find(row => row.id === selected);
  const remainingOf = (itemId: string | null) => receipt?.lines.find(line => line.itemId === itemId)?.remaining ?? 0;
  const total = receipt ? familyReturnTotal(receipt.refundLines, quantities) : 0;
  // Money goes back only for what was already paid; an unpaid receipt simply owes the family less
  const refundable = receipt ? Math.max(0, Math.min(total, receipt.paid)) : 0;
  function submit() {
    if (!receipt) return setError("اختر الاستلام المراد الإرجاع منه");
    const lines = receipt.refundLines.filter(line => (quantities[line.id] ?? 0) > 0).map(line => ({ lineId: line.id, quantity: quantities[line.id], expectedReturnedQuantity: line.returned_quantity }));
    if (!lines.length) return setError("حدد كمية الإرجاع لصنف واحد على الأقل");
    if (receipt.refundLines.some(line => (quantities[line.id] ?? 0) > Math.min(line.quantity - line.returned_quantity, remainingOf(line.item_id)) + .0001)) return setError("كمية الإرجاع أكبر من المعروض المتبقي من هذا الاستلام");
    if (refundable > 0 && !accountId) return setError("اختر الحساب الذي يستلم المبلغ المسترد من الأسرة");
    run(requestId => returnFamilyGoods(withBranchScope({ requestId, financeId: receipt.financeId, accountId: refundable > 0 ? accountId : null, expectedTotal: total, note, lines }, snapshot), snapshot.slug));
  }
  return <Dialog open wide title="استلام وإرجاع" subtitle="إرجاع ما لم يبع للأسرة يخصم من المخزون ومن حساب الأسرة" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); submit(); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {candidates.length ? <Field label="الاستلام" help="تظهر الاستلامات التي ما زال منها كمية معروضة لم تبع">
          <select required value={selected} onChange={event => { setSelected(event.target.value); setQuantities({}); }}><option value="">اختر الاستلام</option>{candidates.map(row => <option key={row.id} value={row.id}>استلام {row.number} · {familyName.get(row.familyId)} · {branchName.get(row.branchId)} · {day(row.receivedAt)}</option>)}</select>
        </Field> : <p className={s.notice}>لا يوجد استلام فيه كمية معروضة يمكن إرجاعها</p>}
        {receipt && <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>الصنف</th><th data-num>مستلم</th><th data-num>مباع</th><th data-num>المتاح للإرجاع</th><th data-num>كمية الإرجاع</th></tr></thead>
          <tbody>{receipt.refundLines.map(line => { const info = receipt.lines.find(row => row.itemId === line.item_id); const max = Math.max(0, Math.min(line.quantity - line.returned_quantity, info?.remaining ?? 0)); return <tr key={line.id}>
            <td>{line.name}</td><td data-num>{quantity(line.quantity)}</td><td data-num>{quantity(info?.sold ?? 0)}</td><td data-num>{quantity(max)}</td>
            <td data-num><input aria-label={`كمية إرجاع ${line.name}`} type="number" min="0" max={max} step=".001" disabled={max <= 0} value={quantities[line.id] ?? 0} onChange={event => setQuantities({ ...quantities, [line.id]: event.target.valueAsNumber || 0 })} style={{ width: 110, minHeight: 36, padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--paper)" }} /></td>
          </tr>; })}</tbody>
        </table></div>}
        {receipt && refundable > 0 && <Field label="استلام المبلغ المسترد في" help="هذا الاستلام مدفوع فتعيد الأسرة قيمة المرتجع إلى هذا الحساب"><select required value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر الحساب</option>{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        <Field label="سبب الإرجاع"><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="مثال انتهاء مدة العرض" /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <p className={s.total}>قيمة المرتجع<strong>{money(total)}</strong>ريال</p>
        <div className={s.toolbar}>
          <Action type="button" help="يغلق النافذة دون تسجيل الإرجاع" onClick={onClose} disabled={pending}>إلغاء</Action>
          <Action type="submit" tone="primary" side="end" help="يرحل مرتجعًا للأسرة ويخصم الكميات من مخزون الفرع" disabled={pending || !receipt}>{pending ? "جار التسجيل" : "تأكيد الإرجاع"}</Action>
        </div>
      </footer>
    </form>
  </Dialog>;
}

function PayDialog({ snapshot, consignmentId, familyName, onClose, onSaved }: { snapshot: FamilySnapshot; consignmentId: string; familyName: Names; onClose: () => void; onSaved: () => void }) {
  const receipt = snapshot.consignments.find(row => row.id === consignmentId);
  const owner = receipt && snapshot.families.find(row => row.id === receipt.familyId);
  const [amount, setAmount] = useState(receipt ? receipt.dueNow > 0 ? receipt.dueNow : receipt.outstanding : 0);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, setError, run } = useSubmit(onSaved);
  if (!receipt || !owner) return null;
  const early = receipt.mode === "after_sale" && amount > receipt.dueNow + .001;
  return <Dialog open title={`دفعة للأسرة ${familyName.get(receipt.familyId) ?? ""}`} subtitle={`عن الاستلام ${receipt.number} بتاريخ ${day(receipt.receivedAt)}`} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (!(amount > 0) || amount > receipt.outstanding + .001) return setError("المبلغ يجب أن يكون أكبر من صفر ولا يتجاوز المتبقي على الاستلام"); run(requestId => payFamily(withBranchScope({ requestId, supplierId: owner.supplierId, financeId: receipt.financeId, accountId, amount: Math.round(amount * 100) / 100, note }, snapshot), snapshot.slug)); }} style={{ display: "contents" }}>
      <fieldset disabled={pending} className={s.dialogBody} style={{ border: 0, margin: 0, minWidth: 0 }}>
        <div className={s.stats}>
          <div className={s.stat}><span>قيمة الاستلام</span><strong>{money(receipt.total - receipt.refunded)}</strong></div>
          <div className={s.stat}><span>مدفوع سابقًا</span><strong>{money(receipt.paid)}</strong></div>
          <div className={s.stat} data-tone="due"><span>مستحق عن المباع</span><strong>{money(receipt.dueNow)}</strong></div>
        </div>
        <div className={s.grid}>
          <Field label="المبلغ بالريال" help="يقترح النظام قيمة ما بيع ولم يدفع ويمكن تعديله حتى حد المتبقي على الاستلام"><input required type="number" min=".01" max={receipt.outstanding} step=".01" value={amount} onChange={event => setAmount(event.target.valueAsNumber || 0)} /></Field>
          <Field label="الدفع من" help="الخزينة أو الحساب البنكي الذي يخرج منه المبلغ"><select required value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر الحساب</option>{snapshot.accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        </div>
        {early && <p className={s.notice}>المبلغ أكبر من قيمة ما بيع حتى الآن والزيادة تعد دفعًا مقدمًا عن بضاعة ما زالت معروضة</p>}
        {owner.profile.iban && <p className={s.rowSub}>آيبان الأسرة <bdi dir="ltr">{owner.profile.iban}</bdi>{owner.profile.bankName ? ` · ${owner.profile.bankName}` : ""}</p>}
        <Field label="ملاحظة الدفعة"><textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </fieldset>
      <footer className={s.dialogFoot}>
        <Action type="button" help="يغلق النافذة دون تسجيل الدفعة" onClick={onClose} disabled={pending}>إلغاء</Action>
        <Action type="submit" tone="primary" side="end" help="يسجل سند صرف للأسرة ويخصم المبلغ من الحساب المختار" disabled={pending}>{pending ? "جار التسجيل" : "تأكيد الدفعة"}</Action>
      </footer>
    </form>
  </Dialog>;
}

function FamilyDashboard({ snapshot, familyId, branchName, placeName, familyName, onClose, onOpen }: { snapshot: FamilySnapshot; familyId: string; branchName: Names; placeName: (id: string) => string; familyName: Names; onClose: () => void; onOpen: (open: Open) => void }) {
  const row = snapshot.families.find(item => item.id === familyId);
  const [copied, setCopied] = useState(false);
  if (!row) return null;
  const portal = typeof window === "undefined" ? "" : `${window.location.origin}/finance/${snapshot.slug}/family`;
  const receipts = snapshot.consignments.filter(item => item.familyId === familyId);
  return <Dialog open wide title={`لوحة الأسرة ${row.name}`} subtitle={`${row.profile.ownerName || ""}${row.phone ? ` · ${row.phone}` : ""}`} onClose={onClose}>
    <div className={s.dialogBody}>
      <div className={s.stats}>
        <div className={s.stat}><span>مستلم</span><strong>{quantity(row.received)}</strong><small>بقيمة {money(row.receivedValue)}</small></div>
        <div className={s.stat} data-tone="good"><span>مباع</span><strong>{quantity(row.sold)}</strong><small>بقيمة {money(row.soldValue)}</small></div>
        <div className={s.stat}><span>معروض الآن</span><strong>{quantity(row.remaining)}</strong><small>مرتجع {quantity(row.returned)}</small></div>
        <div className={s.stat} data-tone="due"><span>مستحق الآن</span><strong>{money(row.dueNow)}</strong><small>مدفوع {money(row.paid)}</small></div>
      </div>
      {snapshot.canWrite && <div className={s.toolbar}>
        <Action small tone="primary" side="start" help="استلام بضاعة جديدة من هذه الأسرة بطريقتها المعتادة" onClick={() => onOpen({ kind: "receive", mode: row.profile.defaultMode ?? "after_sale", familyId })} disabled={!row.active}><PackagePlus aria-hidden="true" />استلام جديد</Action>
        <Action small side="start" help="إرجاع كمية لم تبع من استلامات هذه الأسرة" onClick={() => onOpen({ kind: "return", familyId })}><Undo2 aria-hidden="true" />إرجاع</Action>
        <Action small side="start" help="إضافة صنف جديد لهذه الأسرة" onClick={() => onOpen({ kind: "item", familyId })}><Plus aria-hidden="true" />صنف</Action>
        {row.phone && <Action small side="start" help="ينسخ رابط لوحة الأسرة الخاصة لترسله لها وتدخل برقم جوالها ورمز تحقق" onClick={() => { void navigator.clipboard.writeText(portal).then(() => setCopied(true)); }}><Link2 aria-hidden="true" />{copied ? "تم نسخ الرابط" : "رابط لوحة الأسرة"}</Action>}
      </div>}
      <h3 style={{ fontSize: 13 }}>أين تعرض منتجاتها الآن</h3>
      <ItemsTable snapshot={{ ...snapshot, unlinkedItems: [] }} items={snapshot.items.filter(item => item.familyId === familyId)} familyName={familyName} placeName={placeName} branchName={branchName} />
      <h3 style={{ fontSize: 13 }}>الاستلامات</h3>
      <ReceiptsTable snapshot={snapshot} rows={receipts} familyName={familyName} branchName={branchName} onReturn={id => onOpen({ kind: "return", consignmentId: id })} onPay={id => onOpen({ kind: "pay", consignmentId: id })} />
      <h3 style={{ fontSize: 13 }}>آخر الحركات</h3>
      <ActivityTable snapshot={snapshot} rows={snapshot.activity.filter(item => item.familyId === familyId).slice(0, 40)} familyName={familyName} branchName={branchName} />
    </div>
  </Dialog>;
}
