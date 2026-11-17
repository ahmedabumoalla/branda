"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Barcode, CakeSlice, Check, ClipboardList, Cookie, Gift, PackageCheck, Plus, Search, ShoppingBasket, Trash2, Truck } from "lucide-react";
import s from "./branch-order-showcase.module.css";
import { useAldeemLocation } from "./use-location";
import { WorkshopOrderItems } from "./workshop-order-items";

type View = "employee" | "lab" | "deliveries";
type SearchField = "all" | "name" | "barcode" | "sku" | "flavor" | "shape" | "packaging";
type Product = { imageUrl?: string; id: string; name: string; sku: string; barcode: string; flavor: string; shape: string; packaging: string; unit: string; category: string; icon: "cookie" | "cake" | "gift" };
type Line = { productId: string; quantity: number };
type Order = { id: string; branch: string; employee: string; neededOn: string; notes: string; lines: Line[]; stage: number };

const products: Product[] = [
  { id: "kleija", name: "كليجا القصيم", sku: "D-101", barcode: "2000000000101", flavor: "دبس وبهارات", shape: "دائري", packaging: "علبة 12 حبة", unit: "علبة", category: "الكليجا والمعمول", icon: "cookie" },
  { id: "maamoul", name: "معمول التمر", sku: "D-102", barcode: "2000000000102", flavor: "تمر", shape: "بيضاوي", packaging: "علبة 16 حبة", unit: "علبة", category: "الكليجا والمعمول", icon: "cookie" },
  { imageUrl: "/menu-art/tea-bakery/products/cookies-v1.webp", id: "cookies", name: "كوكيز الشوكولاتة", sku: "D-103", barcode: "2000000000103", flavor: "شوكولاتة", shape: "دائري", packaging: "كيس فردي", unit: "حبة", category: "الحلويات", icon: "cookie" },
  { imageUrl: "/deli-cake/catalog-20261016/brownies-box.webp", id: "brownie", name: "براونيز", sku: "D-104", barcode: "2000000000104", flavor: "شوكولاتة", shape: "مربع", packaging: "علبة فردية", unit: "قطعة", category: "الحلويات", icon: "cake" },
  { imageUrl: "/menu-art/tea-bakery/products/strawberry-cheese-v1.webp", id: "strawberry", name: "تشيزكيك الفراولة", sku: "D-105", barcode: "2000000000105", flavor: "فراولة", shape: "شريحة", packaging: "علبة فردية", unit: "قطعة", category: "الحلويات", icon: "cake" },
  { id: "pistachio", name: "تشيزكيك الفستق", sku: "D-106", barcode: "2000000000106", flavor: "فستق", shape: "شريحة", packaging: "علبة فردية", unit: "قطعة", category: "الحلويات", icon: "cake" },
  { id: "hospitality", name: "بوكس ضيافة الديم", sku: "D-107", barcode: "2000000000107", flavor: "مشكل", shape: "مشكل", packaging: "بوكس ضيافة 24 حبة", unit: "بوكس", category: "بوكسات الضيافة", icon: "gift" },
  { id: "gift", name: "بوكس هدية الديم", sku: "D-108", barcode: "2000000000108", flavor: "مشكل", shape: "مشكل", packaging: "بوكس هدية 36 حبة", unit: "بوكس", category: "بوكسات الضيافة", icon: "gift" },
];
const fields: Record<SearchField, string> = { all: "كل بيانات الصنف", name: "الاسم", barcode: "الباركود", sku: "رقم الصنف", flavor: "النكهة", shape: "الشكل", packaging: "التغليف" };
const branches = ["الفرع الرئيسي — مثال", "فرع الشمال — مثال", "فرع الشرق — مثال"];
const stages = ["طلب جديد", "قيد التجهيز", "جاهز للإرسال", "في الطريق للفرع", "تم استلام الفرع"];
const views: Record<View, string> = { employee: "طلب منتجات للفرع", lab: "لوحة طلبات المعمل", deliveries: "التسليم والاستلام" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = (value: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).trim();
const getProduct = (id: string) => products.find(product => product.id === id)!;
const initialOrders = (): Order[] => [
  { id: "DEMO-001", branch: branches[0], employee: "موظف الفرع — مثال", neededOn: today(), notes: "تجهيز الكليجا بتغليف الفرع", lines: [{ productId: "kleija", quantity: 24 }, { productId: "maamoul", quantity: 12 }], stage: 1 },
  { id: "DEMO-002", branch: branches[1], employee: "مشرف الفرع — مثال", neededOn: today(), notes: "تسليم البوكسات مجمعة حسب الصنف", lines: [{ productId: "hospitality", quantity: 8 }, { productId: "gift", quantity: 4 }], stage: 3 },
  { id: "DEMO-003", branch: branches[2], employee: "موظف الفرع — مثال", neededOn: today(), notes: "التحقق من ملصقات الصنف قبل التسليم", lines: [{ productId: "strawberry", quantity: 18 }, { productId: "brownie", quantity: 24 }], stage: 2 },
];

/** Presentation-only requests stay in component memory and never enter stock or financial ledgers. */
export function AldeemBranchOrderShowcase({ initialView = "employee" }: { initialView?: View }) {
  const [view, setView] = useAldeemLocation<View>("workshopView", initialView, ["employee", "lab", "deliveries"]);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cart, setCart] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [category, setCategory] = useState("");
  const [flavor, setFlavor] = useState("");
  const [shape, setShape] = useState("");
  const [packaging, setPackaging] = useState("");
  const [branch, setBranch] = useState(branches[0]);
  const [employee, setEmployee] = useState("");
  const [neededOn, setNeededOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [selectedId, setSelectedId] = useState("DEMO-001");


  const matches = useMemo(() => {
    const search = normalize(query);
    return products.filter(product => (!category || product.category === category) && (!flavor || product.flavor === flavor) && (!shape || product.shape === shape) && (!packaging || product.packaging === packaging) && normalize(field === "all" ? [product.name, product.barcode, product.sku, product.flavor, product.shape, product.packaging].join(" ") : product[field]).includes(search));
  }, [query, field, category, flavor, shape, packaging]);
  const visibleOrders = orders.filter(order => (!branchFilter || order.branch === branchFilter) && (stageFilter === "" || order.stage === Number(stageFilter)) && (view !== "deliveries" || order.stage >= 2));
  const selected = visibleOrders.find(order => order.id === selectedId) ?? visibleOrders[0];
  function changeQuantity(productId: string, quantity: number) {
    const safe = Math.max(0, Math.min(999, Math.trunc(Number.isFinite(quantity) ? quantity : 0)));
    setCart(old => safe === 0 ? old.filter(line => line.productId !== productId) : old.some(line => line.productId === productId) ? old.map(line => line.productId === productId ? { ...line, quantity: safe } : line) : [...old, { productId, quantity: safe }]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) return;
    if (employee.trim().length < 2) { setFormError("أدخل اسم مقدم الطلب قبل الإرسال"); return; }
    if (!neededOn || neededOn < today()) { setFormError("اختر تاريخ احتياج يبدأ من اليوم"); return; }
    const id = `DEMO-${String(orders.length + 1).padStart(3, "0")}`;
    setOrders(old => [{ id, branch, employee: employee.trim(), neededOn, notes: notes.trim(), lines: cart.map(line => ({ ...line })), stage: 0 }, ...old]);
    setSelectedId(id); setCart([]); setNotes(""); setBranchFilter(""); setStageFilter(""); setFormError("");
    setNotice(`تم إنشاء طلب توضيحي ${id} ويمكن متابعته في لوحة المعمل`); setView("lab");
  }
  function advance(order: Order) {
    const stage = Math.min(4, order.stage + 1);
    setOrders(old => old.map(row => row.id === order.id ? { ...row, stage } : row));
    setStageFilter("");
    setNotice(`تم تحديث الطلب التوضيحي ${order.id} إلى ${stages[stage]}`);
  }
  function resetFilters() { setQuery(""); setField("all"); setCategory(""); setFlavor(""); setShape(""); setPackaging(""); }

  return <div className={s.workspace} dir="rtl">
    <header className={s.heading}><div><span className={s.eyebrow}>من الفرع إلى المعمل</span><h2>طلب واضح وتجهيز يمكن متابعته</h2><p>يختار الموظف المنتجات ويتابع المعمل الكميات المطلوبة لكل فرع حتى الاستلام</p></div><span className={s.demoLabel}>بيانات توضيحية</span></header>
    <p className={s.disclosure}>أمثلة لعرض طريقة العمل خلال الاجتماع وتبقى التعديلات في هذه الشاشة فقط</p>
    <nav className={s.tabs} aria-label="واجهات طلبات المعمل">{Object.entries(views).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => { setView(key as View); setStageFilter(""); }}>{label}</button>)}</nav>
    {notice && <div className={s.notice} role="status"><Check size={19} aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>إخفاء</button></div>}
    {view === "employee" ? <div className={s.orderLayout}><section className={s.catalog} aria-labelledby="aldeem-branch-products">
      <div className={s.sectionHead}><h3 id="aldeem-branch-products">منتجات الديم</h3><span>{matches.length} أصناف</span></div>
      <div className={s.searchRow}><label>البحث بواسطة<select value={field} onChange={event => setField(event.target.value as SearchField)}>{Object.entries(fields).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className={s.search}>ابحث أو امسح الباركود<span><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم المنتج أو الباركود أو رقم الصنف" /></span></label></div>
      <div className={s.filters}>{([["النكهة", flavor, setFlavor, "flavor"], ["الشكل", shape, setShape, "shape"], ["التغليف", packaging, setPackaging, "packaging"]] as const).map(([label, value, setValue, key]) => <label key={key}>{label}<select value={value} onChange={event => setValue(event.target.value)}><option value="">الكل</option>{[...new Set(products.map(product => product[key]))].map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
      <div className={s.categories} aria-label="تصنيف المنتجات">{["", ...new Set(products.map(product => product.category))].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value || "كل المنتجات"}</button>)}</div>
      <div className={s.products}>{matches.map(product => {
        const Icon = product.icon === "gift" ? Gift : product.icon === "cake" ? CakeSlice : Cookie;
        const count = cart.find(line => line.productId === product.id)?.quantity ?? 0;
        return <article className={s.product} key={product.id}><div className={s.productArt} data-kind={product.icon}><Icon size={42} strokeWidth={1.4} aria-hidden="true" /><span>{product.shape}</span></div><div className={s.productBody}><div className={s.productTitle}><h4>{product.name}</h4><bdi>{product.sku}</bdi></div><p>{product.flavor} / {product.packaging}</p><small><Barcode size={14} aria-hidden="true" /><bdi>{product.barcode}</bdi></small><button type="button" className={s.add} onClick={() => changeQuantity(product.id, count + 1)}><Plus size={17} aria-hidden="true" />أضف للطلب{count > 0 && <span>{count}</span>}</button></div></article>;
      })}</div>
      {!matches.length && <div className={s.empty}><Search size={28} aria-hidden="true" /><h4>لم نجد صنفًا بهذه المواصفات</h4><p>جرب جزءًا من الاسم أو امسح الباركود أو أزل أحد الفلاتر</p><button type="button" onClick={resetFilters}>إزالة الفلاتر</button></div>}
    </section><form className={s.cart} onSubmit={submit}><div className={s.sectionHead}><h3><ShoppingBasket size={20} aria-hidden="true" />طلب الفرع</h3><span>{cart.length} أصناف</span></div><div className={s.cartBody}><label>الفرع المستلم<select value={branch} onChange={event => setBranch(event.target.value)}>{branches.map(value => <option key={value}>{value}</option>)}</select></label><label>اسم الموظف<input required value={employee} minLength={2} maxLength={80} placeholder="اسم مقدم الطلب" onChange={event => setEmployee(event.target.value)} /></label><label>تاريخ الاحتياج<input type="date" required min={today()} value={neededOn} onChange={event => setNeededOn(event.target.value)} /></label>
      <div className={s.cartLines}>{cart.length ? cart.map(line => { const product = getProduct(line.productId); return <div className={s.cartLine} key={line.productId}><div><strong>{product.name}</strong><small>{product.packaging}</small></div><label className={s.quantity}>الكمية / {product.unit}<input aria-label={`كمية ${product.name}`} type="number" min={1} max={999} step={1} required value={line.quantity} onChange={event => changeQuantity(line.productId, Number(event.target.value))} /></label><button type="button" className={s.remove} aria-label={`إزالة ${product.name}`} onClick={() => changeQuantity(line.productId, 0)}><Trash2 size={17} aria-hidden="true" /></button></div>; }) : <div className={s.cartEmpty}><ShoppingBasket size={30} aria-hidden="true" /><p>أضف المنتجات والكميات المطلوبة</p></div>}</div>
      <label>ملاحظات التجهيز<textarea rows={3} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="تفاصيل التغليف أو التسليم" /></label>{formError && <p className={s.formError} role="alert">{formError}</p>}<button type="submit" className={s.primary} disabled={!cart.length}>إرسال الطلب التوضيحي للمعمل<ArrowLeft size={18} aria-hidden="true" /></button><p className={s.smallNote}>لا ينشئ هذا العرض طلبًا فعليًا أو حركة مخزون</p></div></form></div> : <>
      <div className={s.metrics}>{stages.map((stage, index) => <button type="button" key={stage} aria-pressed={stageFilter === String(index)} disabled={view === "deliveries" && index < 2} onClick={() => setStageFilter(stageFilter === String(index) ? "" : String(index))}><span>{stage}</span><strong>{orders.filter(order => order.stage === index && (!branchFilter || order.branch === branchFilter)).length}</strong><small>طلبات توضيحية</small></button>)}</div>
      <div className={s.listTools}><label>الفرع<select value={branchFilter} onChange={event => setBranchFilter(event.target.value)}><option value="">كل الفروع التوضيحية</option>{branches.map(value => <option key={value}>{value}</option>)}</select></label><p>{view === "lab" ? "اختر الطلب لاستعراض الأصناف والكميات ثم تجهيزه وإرساله" : "طلبات جاهزة للإرسال وفي الطريق مع تأكيد استلام الفرع"}</p><button type="button" onClick={() => setView("employee")}><Plus size={18} aria-hidden="true" />طلب منتجات</button></div>
      <div className={s.boardLayout}><section className={s.orderList} aria-label="طلبات الفروع">{visibleOrders.map(order => <button key={order.id} type="button" aria-pressed={selected?.id === order.id} className={s.orderCard} onClick={() => setSelectedId(order.id)}><span className={s.orderTop}><bdi>{order.id}</bdi><span className={s.status} data-stage={order.stage}>{stages[order.stage]}</span></span><strong>{order.branch}</strong><span>{order.lines.length} أصناف / الاحتياج {dateLabel(order.neededOn)}</span><small>{order.lines.map(line => getProduct(line.productId).name).join("، ")}</small></button>)}{!visibleOrders.length && <div className={s.empty}><ClipboardList size={30} aria-hidden="true" /><h4>لا توجد طلبات مطابقة</h4><p>غيّر الفرع أو الحالة لعرض الطلبات المتاحة</p><button type="button" onClick={() => { setBranchFilter(""); setStageFilter(""); }}>عرض كل الطلبات</button></div>}</section>
      {selected && <section className={s.orderDetail} aria-labelledby="aldeem-lab-order-detail"><header className={s.detailHead}><div><span>تفاصيل الطلب التوضيحي</span><h3 id="aldeem-lab-order-detail">{selected.branch}</h3><bdi>{selected.id}</bdi></div><PackageCheck size={30} aria-hidden="true" /></header><dl className={s.orderMeta}><div><dt>مقدم الطلب</dt><dd>{selected.employee}</dd></div><div><dt>تاريخ الاحتياج</dt><dd>{dateLabel(selected.neededOn)}</dd></div></dl><ol className={s.progress}>{stages.map((stage, index) => <li key={stage} data-complete={index < selected.stage} aria-current={index === selected.stage ? "step" : undefined}><span>{index < selected.stage ? <Check size={15} aria-hidden="true" /> : index + 1}</span>{stage}</li>)}</ol><WorkshopOrderItems illustrative lines={selected.lines.map(line => ({ ...getProduct(line.productId), quantity: line.quantity }))} />{selected.notes && <div className={s.orderNotes}><strong>ملاحظات الفرع</strong><p>{selected.notes}</p></div>}<div className={s.nextStep}><p>{selected.stage === 2 ? "اكتمل التجهيز راجع الأصناف والكميات ثم أرسل الطلب إلى الفرع" : selected.stage === 3 ? "الطلب في طريقه للفرع ويؤكد موظف الفرع الكميات عند الاستلام" : selected.stage === 4 ? "اكتملت دورة هذا الطلب التوضيحي من الفرع إلى الاستلام" : "يتابع موظف المعمل الأصناف المطلوبة والمرحلة الحالية لكل طلب"}</p>{selected.stage < 4 && <button type="button" className={s.primary} onClick={() => advance(selected)}>{selected.stage === 3 ? <Truck size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}{["بدء التجهيز", "تأكيد اكتمال التجهيز", "إرسال للفرع", "تأكيد استلام الفرع"][selected.stage]}</button>}</div></section>}</div>
    </>}
  </div>;
}
