"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Activity, Boxes, CalendarClock, CircleAlert, RefreshCw, Save, Store, Truck, TrendingUp } from "lucide-react";
import { readAldeemItemCard } from "@/app/actions/aldeem-item-card";
import { saveAldeemItemBranchPrice } from "@/app/actions/aldeem-item-prices";
import type { AldeemItemCard as ItemCardData, AldeemItemCardFilters } from "@/lib/aldeem/item-card";
import { deriveAldeemItemInsights } from "@/lib/aldeem/item-insights";
import { overviewPeriod } from "@/lib/aldeem/overview";
import { InventoryBarcode } from "@/components/erp/inventory/barcode";
import css from "./item-card.module.css";
import { itemInsightExample } from "@/lib/aldeem/item-insight-example";
import { useAldeemLocation } from "./use-location";

const itemPages = [["movements", "سجل الحركة"], ["stock", "المخزون والصلاحية"], ["sources", "المورد والأسرة المنتجة"], ["prices", "أسعار الفروع"], ["insights", "الدوران والطلب والخصم"]] as const;
type ItemPage = typeof itemPages[number][0];

const number = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 3 });
const money = (n: number | null) => n === null ? "غير محدد" : `${n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر س`;
const dateTime = (value: string) => new Date(value).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", dateStyle: "short", timeStyle: "short" });
const dateOnly = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory" });
const movementNames: Record<string, string> = { stock_adjust: "تسوية مخزون", stock_transfer: "تحويل مخزني", writeoff: "إتلاف", manufacture: "تصنيع", opening_balances: "رصيد افتتاحي", sale: "بيع", purchase: "شراء", refund: "مرتجع", transfer: "تحويل مخزني", adjustment: "تسوية مخزون", stocktake: "جرد", receipt: "استلام", issue: "صرف مخزني", assembly: "تجميع", disassembly: "تفكيك", opening: "رصيد افتتاحي", stock_in: "إضافة مخزون", stock_out: "صرف مخزون", production: "تصنيع", manufacturing: "تصنيع" };

function Metric({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <article className={css.metric}><span>{title}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>;
}
function Panel({ id, title, note, icon, children }: { id?: string; title: string; note?: string; icon?: ReactNode; children: ReactNode }) {
  return <section id={id} className={css.panel}><header className={css.sectionHead}><div><h3>{icon}{title}</h3>{note && <p>{note}</p>}</div></header>{children}</section>;
}
function Table({ label, children }: { label: string; children: ReactNode }) {
  return <div className={css.tableScroll} role="region" tabIndex={0} aria-label={label}><table>{children}</table></div>;
}
function Expiry({ days }: { days: number | null }) {
  const tone = days === null ? undefined : days < 0 ? "expired" : days <= 7 ? "soon" : "good";
  return <span className={css.badge} data-tone={tone}>{days === null ? "الصلاحية غير مسجلة" : days < 0 ? `منتهية منذ ${number(Math.abs(days))} يوم` : days === 0 ? "تنتهي اليوم" : `متبقي ${number(days)} يوم`}</span>;
}

type PriceRow = ItemCardData["branchPrices"][number];
type PriceRequest = { body: string; id: string; payload: { itemId: string; branchId: string; price: number | null; revision: number; unitName: string; unitFactor: number } };
// Keep only unconfirmed writes in memory so an in-app navigation can recover the exact request
const unconfirmedPrices = new Map<string, PriceRequest>();
function BranchPrice({ row, item, blocked, onBlock, onSaved }: {
  row: PriceRow; item: ItemCardData["item"]; blocked: boolean;
  onBlock: (branchId: string, value: boolean) => void;
  onSaved: (branchId: string, result: { price: number | null; revision: number }) => void;
}) {
  const inputId = useId(), errorId = useId();
  const recoveryKey = `${item.id}:${row.branchId}`;
  const recovered = useRef(unconfirmedPrices.get(recoveryKey));
  const [value, setValue] = useState(() => { const price = recovered.current ? recovered.current.payload.price : row.price; return price === null ? "" : String(price); });
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(!!recovered.current);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const request = useRef<PriceRequest | null>(recovered.current ?? null);
  const saving = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (recovered.current) onBlock(row.branchId, true);
    return () => { mounted.current = false; };
  }, [onBlock, row.branchId]);
  const changed = value !== (row.price === null ? "" : String(row.price));
  function validate(text: string) {
    const price = text.trim() === "" ? null : Number(text);
    return price !== null && (!Number.isFinite(price) || price < item.minimumPrice || price > 100000)
      ? `أدخل سعرًا بين ${money(item.minimumPrice)} و${money(100000)}` : "";
  }
  async function save(reset = false) {
    if (saving.current || blocked && !uncertain) return;
    const text = reset ? "" : value, invalid = validate(text);
    if (!uncertain && invalid) { setError(invalid); return; }
    const payload = { itemId: item.id, branchId: row.branchId, price: text.trim() === "" ? null : Number(text), revision: row.revision, unitName: item.saleUnitName, unitFactor: item.saleUnitFactor };
    const body = JSON.stringify(payload);
    if (!uncertain && request.current?.body !== body) request.current = { body, id: crypto.randomUUID(), payload };
    if (!request.current) return;
    const submitted = request.current;
    unconfirmedPrices.set(recoveryKey, submitted);
    if (!uncertain) setValue(text);
    saving.current = true; setPending(true); setError(""); setNotice(""); onBlock(row.branchId, true);
    try {
      const result = await saveAldeemItemBranchPrice(submitted.payload, submitted.id);
      if (!result.ok) {
        const unknown = uncertain || result.uncertain;
        if (!unknown && unconfirmedPrices.get(recoveryKey)?.id === submitted.id) unconfirmedPrices.delete(recoveryKey);
        if (!mounted.current) return;
        setUncertain(unknown); setError(result.message); onBlock(row.branchId, unknown); return;
      }
      if (unconfirmedPrices.get(recoveryKey)?.id === submitted.id) unconfirmedPrices.delete(recoveryKey);
      if (!mounted.current) return;
      onSaved(row.branchId, result.data); setValue(result.data.price === null ? "" : String(result.data.price));
      setUncertain(false); request.current = null; onBlock(row.branchId, false);
      setNotice(result.data.price === null ? "تمت استعادة السعر الافتراضي لهذا الفرع" : "تم حفظ سعر الفرع");
    } catch {
      if (!mounted.current) return;
      setUncertain(true); setError("تعذر تأكيد الحفظ أعد المحاولة بنفس السعر للتحقق دون تكرار العملية");
    } finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  return <form className={css.priceForm} onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={pending}>
    <div className={css.row}><h4>{row.branch}</h4><span className={css.badge}>{row.price === null ? "السعر الافتراضي" : "سعر مخصص"}</span></div>
    <p>السعر المعتمد للفرع <strong className={css.priceValue}>{money(row.effectivePrice)}</strong> لكل {item.saleUnitName}</p>
    {row.stale && <p className={css.warning}>تغيرت وحدة الصنف راجع السعر واحفظه للوحدة الحالية</p>}
    <label className={css.priceLabel} htmlFor={inputId}>سعر البيع لكل {item.saleUnitName}<input id={inputId} type="number" min={item.minimumPrice} max={100000} step="0.01" value={value} disabled={pending || uncertain || blocked} placeholder={item.defaultPrice === null ? "حدد السعر" : String(item.defaultPrice)} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={event => { setValue(event.target.value); setError(""); setNotice(""); }} onBlur={() => { if (!uncertain) setError(validate(value)); }} /></label>
    <p className={css.help}>ترك السعر فارغًا يعيد سعر الصنف الافتراضي <strong>{money(item.defaultPrice)}</strong></p>
    {uncertain && !error && <p className={css.warning}>هناك طلب حفظ لم يتأكد بعد تحقق من نتيجته بنفس السعر قبل إجراء تعديل جديد</p>}
    {error && <p id={errorId} role="alert" className={css.error}>{error}</p>}
    {notice && <p role="status" className={css.success}>{notice}</p>}
    <div className={css.priceActions}><button type="submit" className={css.primary} disabled={pending || blocked && !uncertain || !changed && !row.stale && !uncertain}><Save size={16} aria-hidden="true" />{pending ? "جار الحفظ" : uncertain ? "التحقق وإعادة المحاولة" : "حفظ سعر الفرع"}</button>{row.price !== null && <button type="button" disabled={pending || uncertain || blocked} onClick={() => void save(true)}>استعادة الافتراضي</button>}</div>
  </form>;
}

export function AldeemItemCard({ itemId, onPendingChange }: { itemId: string; onPendingChange?: (pending: boolean) => void }) {
  const [page, setPage] = useAldeemLocation<ItemPage>("itemPage", "movements", itemPages.map(([id]) => id));
  const [filters, setFilters] = useState<Omit<AldeemItemCardFilters, "itemId">>(() => ({ ...overviewPeriod(30), branchId: null, offset: 0 }));
  const [draft, setDraft] = useState(() => overviewPeriod(30));
  const [data, setData] = useState<ItemCardData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0), [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  const blocked = blocks.size > 0;
  useEffect(() => { onPendingChange?.(blocked); return () => onPendingChange?.(false); }, [blocked, onPendingChange]);
  const request = useRef<{ key: string; promise: ReturnType<typeof readAldeemItemCard> } | null>(null);
  useEffect(() => {
    let active = true;
    const query = { ...filters, itemId }, key = JSON.stringify({ query, refresh });
    setLoading(true); setError("");
    if (request.current?.key !== key) request.current = { key, promise: readAldeemItemCard(query) };
    request.current.promise.then(result => { if (!active) return; if (result.ok) setData(result.data); else setError(result.message); })
      .catch(() => { if (active) setError("تعذر تحميل بطاقة الصنف أعد المحاولة"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, itemId, refresh]);
  useEffect(() => {
    if (!blocked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocked]);
  const units = (value: number | null) => value === null ? "بيانات غير كافية" : `${number(value)} ${data?.item.unit ?? ""}`;
  const onBlock = useCallback((branchId: string, value: boolean) => { setBlocks(current => { if (current.has(branchId) === value) return current; const next = new Set(current); if (value) next.add(branchId); else next.delete(branchId); return next; }); }, []);
  function onPriceSaved() { setRefresh(value => value + 1); }
  return <div className={css.root} dir="rtl">
    <header className={css.hero}><div className={css.topline}><div className={css.identity}><span className={css.eyebrow}>بطاقة الصنف</span><h2>{data?.item.id === itemId ? data.item.name : "حركة المنتج ومخزونه"}</h2>{data?.item.id === itemId && <div className={css.identityMeta}><span>رقم الصنف <bdi>{data.item.sku || "غير مسجل"}</bdi></span><span>الباركود الموحد <bdi>{data.item.barcode || "غير مسجل"}</bdi></span><span>الوحدة الأساسية <strong>{data.item.unit}</strong></span></div>}</div><button type="button" disabled={loading || blocked} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} aria-hidden="true" />{loading ? "جار التحديث" : "تحديث البطاقة"}</button></div><p className={css.note}>اعرف مصدر الصنف ومكانه وحركته وصلاحيته وأسعاره في الفروع من السجلات الفعلية</p><nav className={css.anchorNav} aria-label="أقسام بطاقة الصنف">{itemPages.map(([id, title]) => <button key={id} type="button" aria-current={page === id ? "page" : undefined} disabled={blocked} onClick={() => setPage(id)}>{title}</button>)}</nav></header>
    <form className={css.filters} onSubmit={event => { event.preventDefault(); if (!blocked) setFilters(current => ({ ...current, ...draft, offset: 0 })); }}>
      <label>الفرع<select value={filters.branchId ?? ""} disabled={blocked || loading} onChange={event => setFilters(current => ({ ...current, branchId: event.target.value || null, offset: 0 }))}><option value="">جميع الفروع المتاحة</option>{data?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {page === "movements" && <><label>الحركة من تاريخ<input type="date" required value={draft.from} max={draft.to} disabled={blocked || loading} onChange={event => setDraft(current => ({ ...current, from: event.target.value }))} /></label>
      <label>إلى تاريخ<input type="date" required value={draft.to} min={draft.from} disabled={blocked || loading} onChange={event => setDraft(current => ({ ...current, to: event.target.value }))} /></label>
      <button type="submit" className={css.primary} disabled={blocked || loading}>تطبيق الفترة</button></>}
    </form>
    {blocked && <p className={css.warning} role="status">أكمل تأكيد حفظ سعر الفرع قبل تغيير التصفية أو مغادرة البطاقة</p>}
    {error && <p className={css.error} role="alert"><CircleAlert size={16} aria-hidden="true" /> {error}</p>}
    {loading ? <div className={css.loading} role="status"><RefreshCw size={22} aria-hidden="true" />جار قراءة حركة الصنف ومخزونه</div> : !error && data && <>
      <h2 className={css.pageTitle}>{itemPages.find(([id]) => id === page)?.[1]}</h2>
      {page === "stock" && data.item.barcode && <Panel title="باركود الصنف الموحد" note="نفس الباركود المحفوظ للصنف في جميع الفروع"><InventoryBarcode code={data.item.barcode} format={data.item.barcodeFormat} /></Panel>}
      <p className={css.note}>آخر قراءة {dateTime(data.asOf)} بتوقيت الرياض، والكميات أدناه بالوحدة الأساسية {data.item.unit}</p>
      {page !== "insights" && !!data.notes.length && <div className={css.warning}>{data.notes.map(note => <p key={note}>{note}</p>)}</div>}
      {page === "stock" && <><Panel title="أين يوجد الصنف الآن" icon={<Boxes size={20} aria-hidden="true" />} note="الرصيد الحالي مستقل عن الفترة المحددة لسجل الحركة">
        <div className={css.metrics}><Metric title="الرصيد المسجل" value={units(data.analyticsRaw.stock.onHand)} /><Metric title="الكميات المحجوزة" value={units(data.analyticsRaw.stock.reserved)} /><Metric title="منتهي الصلاحية" value={units(data.analyticsRaw.stock.expired)} /><Metric title="رصيد بلا صلاحية موثقة" value={units(data.analyticsRaw.stock.expiryUnknown)} /></div>
        {data.warehouses.length ? <Table label="رصيد الصنف حسب المستودع"><thead><tr><th>المستودع</th><th>الفرع</th><th>الرصيد</th><th>المحجوز</th><th>الرصيد بعد الحجز</th></tr></thead><tbody>{data.warehouses.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.branchName ?? "غير مرتبط بفرع"}</td><td>{number(row.quantity)}</td><td>{number(row.reserved)}</td><td>{number(row.available)}</td></tr>)}</tbody></Table> : <p className={css.empty}>لا يوجد رصيد مستودعات مسجل للصنف ضمن الفرع المحدد</p>}
      </Panel>
      <Panel title="الدفعات وتواريخ الصلاحية" icon={<CalendarClock size={20} aria-hidden="true" />} note="كل دفعة لها تاريخها ورصيدها ومكانها ولا نفترض تاريخ انتهاء غير مسجل">
        {data.lots.length ? <Table label="دفعات الصنف وتواريخ انتهائها"><thead><tr><th>الدفعة</th><th>المستودع</th><th>الكمية</th><th>تاريخ الانتهاء</th><th>المدة المتبقية</th></tr></thead><tbody>{data.lots.map(row => <tr key={`${row.id}-${row.warehouseId}`}><td>{row.lot || row.serial || "دفعة بدون رقم"}{row.lot && row.serial && <small>{row.serial}</small>}</td><td>{row.warehouse}</td><td>{number(row.quantity)}</td><td>{row.expiresOn ? dateOnly(row.expiresOn) : "غير مسجل"}</td><td><Expiry days={row.daysRemaining} /></td></tr>)}</tbody></Table> : <p className={css.empty}>لا توجد دفعات بصلاحية مسجلة للصنف سجّل بيانات الدفعة عند الاستلام لتظهر هنا</p>}
      </Panel>
      </>}
      {page === "sources" && <><Panel title="المورد والأسرة المنتجة" icon={<Truck size={20} aria-hidden="true" />} note="الجهات مرتبطة بسجلات التوريد أو الربط المسجل للصنف">
        {data.sources.length ? <div className={css.sourceList}>{data.sources.map(row => <article className={css.source} key={`${row.supplierId}-${row.familyId ?? "supplier"}`}><h4>{row.supplier}</h4>{row.family && <p><strong>الأسرة المنتجة</strong> {row.family}</p>}<dl><dt>الكمية المستلمة المسجلة</dt><dd>{units(row.receivedQuantity)}</dd><dt>آخر استلام مسجل</dt><dd>{row.lastReceivedAt ? dateTime(row.lastReceivedAt) : "لا يوجد استلام مسجل"}</dd></dl><span className={css.badge}>{row.linked ? "ربط مسجل للصنف" : "من مستندات التوريد"}</span></article>)}</div> : <p className={css.empty}>لم يُسجل مورد أو أسرة منتجة لهذا الصنف ضمن السجلات المتاحة</p>}
      </Panel>
      </>}
      {page === "movements" && <><Panel title="سجل حركة الصنف" icon={<Activity size={20} aria-hidden="true" />} note={`الحركات من ${dateOnly(data.filters.from)} إلى ${dateOnly(data.filters.to)} مع مكان الحركة والمستند والجهة المرتبطة`}>
        {data.movements.length ? <Table label="حركة الصنف التفصيلية"><thead><tr><th>التاريخ</th><th>العملية والمستند</th><th>الكمية</th><th>مكان الحركة</th><th>الجهة والمصدر</th><th>الدفعة والملاحظات</th></tr></thead><tbody>{data.movements.map(row => <tr key={row.id}><td>{dateTime(row.at)}</td><td><strong>{movementNames[row.kind] ?? "حركة مخزون"}</strong><small>مستند #{row.documentNumber}</small></td><td><bdi dir="ltr" className={row.quantity >= 0 ? css.positive : css.negative}>{row.quantity > 0 ? "+" : ""}{number(row.quantity)}</bdi></td><td className={css.wrap}>{row.warehouse}<small>{row.branch ?? "غير مرتبط بفرع"}</small>{!!row.relatedWarehouses.length && <small>المستودعات المرتبطة: {row.relatedWarehouses.join("، ")}</small>}</td><td className={css.wrap}>{row.party ?? "غير مسجل"}{row.family && <small>الأسرة المنتجة: {row.family}</small>}</td><td className={css.wrap}>{row.lots.map((lot, index) => <small key={`${lot.lot}-${index}`}>{lot.lot || "دفعة بدون رقم"} / {number(lot.quantity)} {lot.expiresOn && ` / انتهاء ${dateOnly(lot.expiresOn)}`}</small>)}{row.note || (!row.lots.length ? "—" : "")}</td></tr>)}</tbody></Table> : <p className={css.empty}>لا توجد حركات مسجلة في الفترة والفرع المحددين</p>}
        <footer className={css.pagination}><span>{number(data.movementCount)} حركة مسجلة</span><div><button type="button" disabled={blocked || data.filters.offset === 0} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - data.pageSize) }))}>السابق</button><span>صفحة {number(Math.floor(data.filters.offset / data.pageSize) + 1)} من {number(Math.max(1, Math.ceil(data.movementCount / data.pageSize)))}</span><button type="button" disabled={blocked || data.filters.offset + data.pageSize >= data.movementCount} onClick={() => setFilters(current => ({ ...current, offset: current.offset + data.pageSize }))}>التالي</button></div></footer>
      </Panel>
      <Panel title="أين بيع الصنف" icon={<Store size={20} aria-hidden="true" />} note="المبيعات والمرتجعات المسجلة في الفترة المحددة حسب فرع الفاتورة">
        {data.salesByBranch.length ? <Table label="مبيعات الصنف حسب الفرع"><thead><tr><th>الفرع</th><th>الكمية المباعة</th><th>المرتجعات</th><th>صافي الكمية</th><th>صافي قيمة البيع</th></tr></thead><tbody>{data.salesByBranch.map(row => <tr key={row.branchId ?? "unassigned"}><td>{row.branch ?? "غير مرتبط بفرع"}</td><td>{number(row.sold)}</td><td>{number(row.returned)}</td><td>{number(row.netQuantity)}</td><td>{money(row.netRevenue)}</td></tr>)}</tbody></Table> : <p className={css.empty}>لا توجد مبيعات مرتبطة بهذا الصنف في الفترة المحددة</p>}
      </Panel>
      </>}
      {page === "prices" && <><Panel title="سعر الصنف في كل فرع" icon={<Store size={20} aria-hidden="true" />} note={`نفس الصنف ونفس الباركود في جميع الفروع والأسعار لكل ${data.item.saleUnitName} = ${number(data.item.saleUnitFactor)} ${data.item.unit}`}>
        <p className={css.note}>السعر الخاص بنقطة البيع يسبق سعر الفرع ثم يستخدم سعر الصنف الافتراضي عند عدم تخصيص سعر</p>
        <div className={css.priceList}>{data.branchPrices.map(row => <BranchPrice key={`${row.branchId}-${data.item.id}`} row={row} item={data.item} blocked={blocked} onBlock={onBlock} onSaved={onPriceSaved} />)}</div>
        {!data.branchPrices.length && <p className={css.empty}>لا توجد فروع متاحة لتحديد أسعارها</p>}
        {!!data.pointOverrides.length && <div className={css.priceOverrides}><h4>نقاط بيع لها سعر خاص لهذا الصنف</h4><p className={css.note}>هذه النقاط تستخدم السعر الموضح هنا حتى عند تعديل سعر الفرع</p><Table label="أسعار نقاط البيع الخاصة"><thead><tr><th>الفرع</th><th>نقطة البيع</th><th>السعر الخاص</th></tr></thead><tbody>{data.pointOverrides.map(row => <tr key={row.pointId}><td>{row.branch}</td><td>{row.point}</td><td>{money(row.price)}</td></tr>)}</tbody></Table></div>}
      </Panel>
      </>}
      {page === "insights" && <ItemInsights live={data} />}
    </>}
  </div>;
}

function ItemInsights({ live }: { live: ItemCardData }) {
  const [analysisMode, setAnalysisMode] = useAldeemLocation("analysisMode", "example", ["example", "actual"] as const);
  const example = analysisMode === "example";
  const setExample = (value: boolean) => setAnalysisMode(value ? "example" : "actual");
  const data = example ? itemInsightExample(live) : live;
  const insight = deriveAldeemItemInsights(data);
  const units = (value: number | null) => value === null ? "بيانات غير كافية" : `${number(value)} ${data.item.unit}`;
  return <div className={css.insightPage}>
    <div className={css.exampleControls}><div><h3>{example ? "أرقام توضيحية للعرض" : "تحليل بيانات الصنف الفعلية"}</h3><p>{example ? "مثال افتراضي لشرح الدوران والطلب والخصم ولا يمثل مبيعات هذا الصنف أو مخزونه" : "الحسابات التالية من السجلات الفعلية للفرع المختار"}</p></div><div role="group" aria-label="مصدر أرقام التحليل"><button type="button" aria-pressed={example} onClick={() => setExample(true)}>أرقام توضيحية</button><button type="button" aria-pressed={!example} onClick={() => setExample(false)}>البيانات الفعلية</button></div></div>
    {example && <p className={css.warning}>في هذا المثال متوسط البيع ٦٠ وحدة يوميًا والرصيد ٣٢٠ والمحجوز ٢٠ والمنتظر ١٢٠ وهناك ١٨٠ وحدة تنتهي خلال يوم واحد</p>}
    {!example && !!live.notes.length && <div className={css.warning}>{live.notes.map(note => <p key={note}>{note}</p>)}</div>}
      <Panel title="دوران الصنف وخطة الطلب" icon={<TrendingUp size={20} aria-hidden="true" />} note={example ? "سيناريو توضيحي لنفس فترات التقويم دون ارتباط بأرقام الفرع المختار" : "تقدير للشهر الحالي مبني على الشهر السابق كاملًا للفرع المختار، ومستقل عن فترة سجل الحركة"}>
        <div className={css.period}><span>شهر الأساس: {dateOnly(data.analyticsRaw.previousMonth.from)} إلى {dateOnly(data.analyticsRaw.previousMonth.to)}</span><span>الفترة الحالية حتى اليوم: {dateOnly(data.analyticsRaw.currentMonth.from)} إلى {dateOnly(data.analyticsRaw.currentMonth.to)}</span></div>
        <div className={`${css.metrics} ${css.insightMetrics}`}><Metric title="صافي مبيعات الشهر الماضي" value={units(data.analyticsRaw.previousMonth.sold - data.analyticsRaw.previousMonth.returned)} /><Metric title="متوسط الطلب اليومي" value={units(insight.dailyDemand)} /><Metric title="تقدير الطلب للشهر الحالي كاملًا" value={units(insight.monthlyForecast)} /><Metric title="تقدير الطلب لبقية الشهر" value={units(insight.remainingDemand)} hint={`يشمل اليوم، ${number(insight.remainingDays)} يوم`} /><Metric title="المتاح لتخطيط الطلب" value={units(insight.availableToPlan)} /><Metric title="كميات مؤكدة منتظرة" value={units(insight.incoming)} /><Metric title="كمية الطلب المقترحة الآن" value={units(insight.suggestedOrder)} hint="اقتراح للمراجعة ولا ينشئ طلب شراء" /><Metric title="مدة دوران المخزون في الشهر الماضي" value={insight.turnoverDays === null ? "بيانات غير كافية" : `${number(insight.turnoverDays)} يوم`} hint="من متوسط الرصيد اليومي وصافي مبيعات شهر الأساس" /><Metric title="الرصيد الحالي يكفي لمدة" value={insight.stockCoverDays === null ? "بيانات غير كافية" : `${number(insight.stockCoverDays)} يوم`} hint="على متوسط الطلب السابق" /></div>
        <div className={css.recommendation} data-decision={insight.discount.decision}><h4>{insight.discount.title}</h4><p>{insight.discount.reason}</p>{insight.discount.atRiskQuantity > 0 && <p>كمية معرضة للبقاء حتى الانتهاء: <strong>{units(insight.discount.atRiskQuantity)}</strong></p>}<p>لا يتم تفعيل خصم أو تغيير سعر تلقائيًا</p></div>
        <details className={css.explanation}><summary>كيف حُسبت التوصيات وما حدودها</summary><ul>{insight.notes.map(note => <li key={note}>{note}</li>)}</ul></details>
      </Panel>
  </div>;
}
