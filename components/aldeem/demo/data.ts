// Aldeem presentation dataset: illustrative records generated in the browser only.
// Nothing here is read from or written to the database, so every demo page opens instantly.

export type Line = { name: string; qty: number; unit: string; price: number };
export type Row = { id: string; lines?: Line[]; [key: string]: string | number | Line[] | undefined };
export type Lot = { id: string; warehouse: string; item: string; category: string; unit: string; code: string; qty: number; cost: number; produced: string; expiry: string; daysLeft: number; state: "صالح" | "قريب الانتهاء" | "منتهي" | "تالف"; reason: string };
export type WLine = { sku: string; barcode: string; name: string; category: string; unit: string; qty: number; price: number };
export type WStatus = "جديد" | "قيد التجهيز" | "تم التسليم للفرع" | "مستلم في الفرع" | "صدرت الفاتورة";
export type WOrder = { id: string; no: string; branch: string; by: string; date: string; needed: string; priority: string; status: WStatus; lines: WLine[]; invoice: string; log: string[] };
export type WarehouseInfo = { id: string; name: string; kind: string; city: string; manager: string; temperature: string; capacity: number };

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRODUCTS: [string, string, string, number, number][] = [
  ["كنافة بالقشطة", "حلويات شرقية", "كجم", 85, 3], ["كنافة نابلسية", "حلويات شرقية", "كجم", 95, 3], ["بقلاوة مشكلة فاخرة", "حلويات شرقية", "كجم", 140, 21], ["بقلاوة بالفستق", "حلويات شرقية", "كجم", 165, 21],
  ["معمول بالتمر", "حلويات شرقية", "كجم", 75, 30], ["معمول بالفستق", "حلويات شرقية", "كجم", 120, 30], ["بسبوسة بالقشطة", "حلويات شرقية", "صينية", 60, 4], ["هريسة باللوز", "حلويات شرقية", "صينية", 55, 5],
  ["غريبة بالفستق", "حلويات شرقية", "كجم", 90, 30], ["كليجا القصيم", "حلويات شرقية", "علبة", 45, 45], ["لقيمات بالعسل", "حلويات شرقية", "علبة", 28, 2], ["عش البلبل", "حلويات شرقية", "كجم", 150, 21],
  ["أصابع زينب", "حلويات شرقية", "كجم", 55, 3], ["كيكة العسل", "كيك وحلى", "قطعة", 22, 5], ["تشيز كيك التوت", "كيك وحلى", "قطعة", 24, 4], ["كيكة الزعفران", "كيك وحلى", "كيكة", 180, 4],
  ["كيكة الشوكولاتة البلجيكية", "كيك وحلى", "كيكة", 195, 4], ["تيراميسو", "كيك وحلى", "علبة", 26, 4], ["ماكرون مشكل", "كيك وحلى", "علبة", 96, 10], ["بيتي فور فاخر", "كيك وحلى", "كجم", 130, 25],
  ["كوكيز بالشوكولاتة", "كيك وحلى", "علبة", 38, 14], ["براونيز", "كيك وحلى", "علبة", 42, 7], ["إكلير بالكراميل", "كيك وحلى", "حبة", 14, 3], ["ميل فاي", "كيك وحلى", "قطعة", 20, 3],
  ["شوكولاتة محشوة بالتمر", "شوكولاتة وتمور", "علبة", 110, 90], ["تمر سكري محشو باللوز", "شوكولاتة وتمور", "علبة", 85, 120], ["تمر مجدول فاخر", "شوكولاتة وتمور", "علبة", 135, 120], ["حلاوة طحينية", "شوكولاتة وتمور", "علبة", 34, 180],
  ["نوغا بالفستق", "شوكولاتة وتمور", "علبة", 68, 90], ["ملبن بالمكسرات", "شوكولاتة وتمور", "علبة", 72, 90], ["راحة الحلقوم", "شوكولاتة وتمور", "علبة", 58, 120], ["علبة ضيافة ملكية", "ضيافة ومناسبات", "علبة", 320, 20],
  ["صينية مناسبات كبيرة", "ضيافة ومناسبات", "صينية", 450, 3], ["توزيعات مواليد", "ضيافة ومناسبات", "علبة", 18, 30], ["آيس كريم عربي بالفستق", "مبردات", "علبة", 36, 60], ["مهلبية بالمستكة", "مبردات", "كوب", 16, 3],
];
// Storefront photos used as illustrative pictures for the demo products, in the same order as PRODUCTS.
const PHOTOS = ["left-1", "middle-1", "left-16", "left-18", "left-15", "right-8", "left-13", "right-5", "left-14", "left-19", "middle-10", "left-4", "middle-7", "middle-16", "right-12", "right-21", "middle-17", "left-21", "middle-19", "right-23", "middle-23", "middle-4", "left-2", "left-20", "middle-8", "middle-5", "middle-6", "left-11", "right-2", "right-4", "middle-21", "left-17", "middle-15", "middle-2", "right-3", "middle-11"];
const RAW: [string, string, number, number][] = [
  ["سكر ناعم", "كيس 50 كجم", 145, 365], ["طحين فاخر", "كيس 50 كجم", 118, 180], ["سمن بلدي", "تنكة 16 كجم", 520, 240], ["فستق حلبي", "كجم", 96, 150], ["قشطة طازجة", "كجم", 32, 6], ["تمر سكري", "كرتون 10 كجم", 160, 200],
  ["جوز مقشر", "كجم", 58, 150], ["لوز مقشر", "كجم", 52, 150], ["عسل طبيعي", "جالون 5 كجم", 310, 400], ["شوكولاتة خام بلجيكية", "كجم", 64, 300], ["زبدة غير مملحة", "كرتون 10 كجم", 290, 60], ["كريمة خفق", "لتر", 19, 20],
  ["جبن عكاوي", "كجم", 44, 14], ["ماء ورد", "لتر", 14, 365], ["هيل مطحون", "كجم", 185, 300], ["علب تغليف فاخرة", "كرتون 200 علبة", 240, 900],
];
const FIRST = ["عبدالله", "محمد", "فهد", "سلطان", "خالد", "ناصر", "تركي", "سعود", "فيصل", "بندر", "ماجد", "يوسف", "عمر", "راكان", "مشعل", "نورة", "سارة", "ريم", "هيفاء", "العنود", "منيرة", "لمى", "شهد", "جواهر", "أمل", "دانة"];
const LAST = ["العتيبي", "القحطاني", "الدوسري", "الشمري", "الحربي", "المطيري", "الغامدي", "الزهراني", "السبيعي", "العنزي", "الشهري", "المالكي", "البقمي", "الرشيدي", "السلمي", "العمري"];
const BRANCHES: [string, string][] = [["فرع العليا", "الرياض"], ["فرع النرجس", "الرياض"], ["فرع التحلية", "جدة"], ["فرع الشاطئ", "الدمام"], ["فرع العزيزية", "مكة المكرمة"], ["فرع قباء", "المدينة المنورة"]];
const SUPPLIERS = ["مطاحن الرياض الحديثة", "شركة ألبان الصافي", "مؤسسة تمور القصيم", "مكسرات الشام للتجارة", "مصنع التغليف الذهبي", "شركة السكر المتحدة", "مزارع العسل الجبلي", "شوكولاتة بروكسل للاستيراد", "مؤسسة السمن البلدي", "توريدات الضيافة الفاخرة"];
const FAMILIES = ["أسرة أم عبدالله للمعمول", "مطبخ أم فهد", "حلا أم ريان", "أسرة الجوهرة للكليجا", "مخبوزات أم سلطان", "ضيافة أم نواف", "حلويات بيت العز", "أسرة لمسة أمل"];
const FRANCHISE = ["شركة مذاق الخليج", "مؤسسة ركن الحلا", "مجموعة ضيافة نجد", "شركة أطايب الحجاز", "مؤسسة سكر وعنبر", "مجموعة الواحة التجارية"];
const DAMAGE = ["كسر أثناء النقل", "انقطاع التبريد", "تلف في التغليف", "عيب تصنيع", "مرتجع عميل", "انتهاء صلاحية أثناء التخزين"];
export const TIERS = ["برونزي", "فضي", "ذهبي", "بلاتيني"] as const;

function build() {
  const r = rng(20261119);
  const int = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const now = Date.now();
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(now + offset * 86400000));
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const phone = () => `05${int(0, 9)}${String(int(1000000, 9999999))}`;
  const no = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, "0")}`;
  const round = (n: number) => Math.round(n * 100) / 100;

  const branches = BRANCHES.map(([name, city], i) => ({ id: `b${i + 1}`, name, city, full: `${name} - ${city}`, manager: person(), cashiers: int(3, 6) }));
  const products = PRODUCTS.map(([name, category, unit, price, shelf], i) => ({ id: `p${i + 1}`, image: PHOTOS[i] ? `/aldeem/${PHOTOS[i]}.webp` : "", name, category, unit, price, cost: round(price * (0.38 + r() * 0.14)), shelf, sku: `ALD-${String(1001 + i)}`, barcode: `628100${String(4100000 + i * 137).padStart(7, "0")}`, sold: int(40, 900) }));
  const lines = (max = 4): Line[] => Array.from({ length: int(1, max) }, () => { const p = pick(products); return { name: p.name, qty: int(1, 6), unit: p.unit, price: p.price }; });
  const total = (list: Line[]) => round(list.reduce((sum, l) => sum + l.qty * l.price, 0) * 1.15);

  const customers: Row[] = Array.from({ length: 64 }, (_, i) => {
    const spent = int(180, 24000); const tier = spent > 15000 ? "بلاتيني" : spent > 8000 ? "ذهبي" : spent > 2500 ? "فضي" : "برونزي";
    return { id: `c${i}`, code: no("CUS", 1200 + i), name: person(), phone: phone(), tier, branch: pick(branches).name, visits: int(2, 96), spent, balance: r() < 0.3 ? int(120, 4800) : 0, points: int(40, 6200), stamps: int(0, 9), lastVisit: day(-int(0, 45)), status: r() < 0.86 ? "نشط" : "غائب منذ شهر" };
  });
  const customer = () => String(pick(customers).name);

  const invoices: Row[] = Array.from({ length: 96 }, (_, i) => {
    const list = lines(); const sum = total(list); const state = r() < 0.72 ? "مدفوعة" : r() < 0.5 ? "آجلة" : r() < 0.6 ? "مدفوعة جزئيًا" : "ملغاة";
    return { id: `inv${i}`, type: r() < 0.84 ? "نقطة بيع" : "مناسبات وشركات", no: no("INV", 48210 - i), date: day(-Math.floor(i / 5)), customer: r() < 0.25 ? "عميل نقدي" : customer(), branch: pick(branches).name, cashier: person(), method: state === "آجلة" ? "آجل" : pick(["مدى", "مدى", "نقدي", "فيزا", "Apple Pay"]), items: list.length, total: sum, paid: state === "مدفوعة" ? sum : state === "مدفوعة جزئيًا" ? round(sum / 2) : 0, status: state, lines: list };
  });
  const quotes: Row[] = Array.from({ length: 28 }, (_, i) => { const list = lines(6).map(l => ({ ...l, qty: l.qty * int(3, 12) })); return { id: `q${i}`, no: no("QUO", 2310 - i), date: day(-i * 2), validUntil: day(14 - i * 2), customer: pick(["فندق الريتز كارلتون", "شركة أرامكو - إدارة الفعاليات", "قاعة ليلتي للأفراح", "جامعة الملك سعود", "مستشفى المملكة", "شركة الاتصالات السعودية", customer(), customer()]), branch: pick(branches).name, occasion: pick(["حفل زفاف", "ضيافة شركات", "استقبال مواليد", "مؤتمر", "تخرج", "عيد"]), total: total(list), status: pick(["مسودة", "جاهز", "جاهز", "مقبول", "مقبول", "مرفوض", "منتهي", "محول إلى فاتورة", "محول إلى فاتورة"]), lines: list }; });
  const salesReturns: Row[] = Array.from({ length: 16 }, (_, i) => { const list = lines(2); return { id: `sr${i}`, no: no("RET", 880 - i), date: day(-i * 3), invoice: String(invoices[i * 4].no), customer: String(invoices[i * 4].customer), branch: pick(branches).name, reason: pick(["اختلاف الطلب", "ملاحظة جودة", "تأخر التوصيل", "تغيير رأي العميل"]), total: total(list), refund: pick(["رد على البطاقة", "نقدي", "رصيد للعميل"]), status: pick(["معتمد", "معتمد", "قيد المراجعة", "مرفوض"]), lines: list }; });

  const rawLines = (): Line[] => Array.from({ length: int(2, 5) }, () => { const [name, unit, cost] = pick(RAW); return { name, qty: int(4, 60), unit, price: cost }; });
  const purchase = (prefix: string, count: number, states: string[], start: number) => Array.from({ length: count }, (_, i): Row => { const list = rawLines(); return { id: `${prefix}${i}`, no: no(prefix, start - i), date: day(-i * 2 - 1), supplier: pick(SUPPLIERS), warehouse: pick(["المستودع الرئيسي", "مستودع المواد الخام", "مستودع التبريد والمجمدات"]), requestedBy: person(), due: day(20 - i * 2), total: total(list), status: pick(states), lines: list }; });
  const purchaseInvoices = purchase("PIN", 34, ["مدفوعة", "مدفوعة", "مستحقة", "مدفوعة جزئيًا"], 3140);
  const purchaseReturns = purchase("PRT", 9, ["معتمد", "قيد المراجعة", "مستلم من المورد"], 214);
  const purchaseRequests = purchase("PRQ", 14, ["بانتظار الاعتماد", "معتمد", "محول إلى أمر شراء", "مرفوض"], 760);
  const purchaseOrders = purchase("POR", 18, ["مرسل للمورد", "مستلم جزئيًا", "مستلم بالكامل", "مسودة"], 1420);

  const posPoints: Row[] = branches.flatMap((b, bi) => Array.from({ length: bi < 3 ? 2 : 1 }, (_, i): Row => ({ id: `pos${bi}${i}`, code: `POS-${bi + 1}${i + 1}`, name: `كاشير ${i + 1}`, branch: b.name, city: b.city, warehouse: `مخزن ${b.name}`, device: pick(["iPad Pro 11", "Sunmi T2", "Windows POS"]), today: int(2100, 18400), invoices: int(24, 160), lastSync: `منذ ${int(1, 9)} دقائق`, status: r() < 0.85 ? "تعمل الآن" : "متوقفة" })));
  const shifts: Row[] = posPoints.filter(p => p.status === "تعمل الآن").map((p, i) => { const sales = Number(p.today); const cash = round(sales * (0.2 + r() * 0.2)); return { id: `sh${i}`, no: no("SHF", 5210 + i), cashier: person(), point: `${p.branch} - ${p.name}`, opened: `${day(0)} ${String(int(7, 10)).padStart(2, "0")}:${pick(["00", "15", "30"])}`, openingCash: 500, sales, cash, card: round(sales - cash), invoices: Number(p.invoices), returns: int(0, 3), status: "مفتوحة" }; });
  const pointPrices: Row[] = products.slice(0, 24).map((p, i) => ({ id: `pp${i}`, sku: p.sku, name: p.name, unit: p.unit, base: p.price, riyadh: p.price, jeddah: round(p.price * 1.04), dammam: p.price, makkah: round(p.price * 1.06), status: r() < 0.2 ? "سعر خاص" : "السعر الأساسي" }));

  const warehouses: WarehouseInfo[] = [
    { id: "w1", name: "المستودع الرئيسي", kind: "مستودع رئيسي", city: "الرياض - السلي", manager: person(), temperature: "18 إلى 22 م", capacity: 82 },
    { id: "w2", name: "مستودع المواد الخام", kind: "مواد خام", city: "الرياض - المصنع", manager: person(), temperature: "16 إلى 20 م", capacity: 67 },
    { id: "w3", name: "مستودع التبريد والمجمدات", kind: "تبريد", city: "الرياض - السلي", manager: person(), temperature: "2 إلى 5 م", capacity: 74 },
    { id: "w4", name: "مخزن فرع العليا", kind: "مخزن فرع", city: "الرياض", manager: person(), temperature: "20 م", capacity: 58 },
    { id: "w5", name: "مخزن فرع التحلية", kind: "مخزن فرع", city: "جدة", manager: person(), temperature: "20 م", capacity: 63 },
    { id: "w6", name: "مستودع التالف والمرتجعات", kind: "عزل وإتلاف", city: "الرياض - السلي", manager: person(), temperature: "محيط", capacity: 31 },
  ];
  const lots: Lot[] = [];
  const addLot = (w: string, item: string, category: string, unit: string, cost: number, shelf: number, force?: Lot["state"]) => {
    const age = force === "منتهي" || (!force && r() < 0.04) ? shelf + int(1, 6) : force === "قريب الانتهاء" ? Math.max(0, shelf - int(1, 2)) : Math.floor(Math.pow(r(), 1.7) * shelf * 0.95);
    const daysLeft = shelf - age; const near = Math.max(2, Math.round(shelf * 0.2));
    const state: Lot["state"] = force === "تالف" || (!force && r() < 0.05) ? "تالف" : daysLeft < 0 ? "منتهي" : daysLeft <= near ? "قريب الانتهاء" : "صالح";
    lots.push({ id: `l${lots.length}`, warehouse: w, item, category, unit, code: `LOT-${day(-age).slice(2).replaceAll("-", "")}-${String(lots.length + 11).padStart(3, "0")}`, qty: state === "تالف" ? int(2, 18) : int(8, 240), cost, produced: day(-age), expiry: day(daysLeft), daysLeft, state, reason: state === "تالف" ? pick(DAMAGE) : state === "منتهي" ? "تجاوز تاريخ الصلاحية" : "" });
  };
  products.forEach(p => { for (let i = 0; i < int(1, 3); i++) addLot("w1", p.name, p.category, p.unit, p.cost, p.shelf); });
  RAW.forEach(([name, unit, cost, shelf]) => { for (let i = 0; i < int(1, 3); i++) addLot("w2", name, "مواد خام", unit, cost, shelf); });
  products.filter(p => p.shelf <= 10 || p.category === "مبردات").forEach(p => { for (let i = 0; i < int(1, 2); i++) addLot("w3", p.name, p.category, p.unit, p.cost, p.shelf); });
  products.filter((_, i) => i % 2 === 0).forEach(p => addLot("w4", p.name, p.category, p.unit, p.cost, p.shelf));
  products.filter((_, i) => i % 2 === 1).forEach(p => addLot("w5", p.name, p.category, p.unit, p.cost, p.shelf));
  products.filter((_, i) => i % 3 === 0).forEach(p => addLot("w6", p.name, p.category, p.unit, p.cost, p.shelf, r() < 0.6 ? "تالف" : "منتهي"));
  addLot("w1", "كنافة بالقشطة", "حلويات شرقية", "كجم", 36, 3, "قريب الانتهاء"); addLot("w3", "مهلبية بالمستكة", "مبردات", "كوب", 7, 3, "قريب الانتهاء"); addLot("w2", "قشطة طازجة", "مواد خام", "كجم", 32, 6, "قريب الانتهاء");
  const movements: Row[] = warehouses.flatMap(w => Array.from({ length: 22 }, (_, i): Row => { const lot = pick(lots.filter(l => l.warehouse === w.id)); const kind = pick(["استلام من المصنع", "تحويل إلى فرع", "صرف للمبيعات", "استلام مشتريات", "إتلاف", "تسوية جرد", "تحويل بين المستودعات"]); const out = ["تحويل إلى فرع", "صرف للمبيعات", "إتلاف"].includes(kind); return { id: `mv${w.id}${i}`, warehouse: w.id, date: day(-i), no: no("MOV", 9300 - i - Number(w.id.slice(1)) * 40), kind, item: lot.item, lot: lot.code, qty: (out ? -1 : 1) * int(2, 60), unit: lot.unit, by: person(), status: r() < 0.9 ? "مرحّل" : "بانتظار الاعتماد" }; }));
  const disposals: Row[] = lots.filter(l => l.state === "تالف" || l.state === "منتهي").slice(0, 22).map((l, i) => ({ id: `ds${i}`, no: no("DSP", 412 - i), date: day(-i), warehouse: warehouses.find(w => w.id === l.warehouse)!.name, item: l.item, lot: l.code, qty: l.qty, unit: l.unit, value: round(l.qty * l.cost), reason: l.reason, approvedBy: person(), status: pick(["منفذ", "منفذ", "بانتظار الاعتماد", "معتمد"]) }));

  const families: Row[] = FAMILIES.map((name, i) => { const sales = int(6200, 48000); return { id: `fm${i}`, code: no("FAM", 30 + i), name, owner: person(), phone: phone(), specialty: pick(["معمول وكليجا", "حلى قهوة", "مخبوزات منزلية", "ضيافة مناسبات"]), commission: `${pick([12, 15, 18, 20])}%`, products: int(4, 16), sales, due: round(sales * 0.22), license: `رخصة أسر منتجة ${int(10200, 98000)}`, status: r() < 0.85 ? "نشطة" : "موقوفة مؤقتًا" }; });
  const familyDoc = (prefix: string, count: number, states: string[]) => Array.from({ length: count }, (_, i): Row => { const list = lines(3); return { id: `${prefix}${i}`, no: no(prefix, 640 - i), date: day(-i), family: pick(FAMILIES), branch: pick(branches).name, total: total(list), share: round(total(list) * 0.82), status: pick(states), lines: list }; });
  const familySales = familyDoc("FSL", 30, ["مباعة", "مباعة", "معروضة"]);
  const familyReturns = familyDoc("FRT", 10, ["مرتجع للأسرة", "قيد المراجعة"]);
  const familySettlements: Row[] = Array.from({ length: 16 }, (_, i) => { const gross = int(3200, 21000); return { id: `fst${i}`, no: no("FSM", 210 - i), period: `${day(-i * 15 - 15)} إلى ${day(-i * 15)}`, family: FAMILIES[i % FAMILIES.length], gross, commission: round(gross * 0.18), net: round(gross * 0.82), method: "تحويل بنكي", status: i < 3 ? "بانتظار الصرف" : "مصروفة" }; });

  const partners: Row[] = FRANCHISE.map((name, i) => ({ id: `fr${i}`, code: no("FRN", 10 + i), name, contact: person(), phone: phone(), city: pick(["أبها", "تبوك", "حائل", "الطائف", "الكويت", "المنامة"]), branches: int(1, 5), royalty: `${pick([5, 6, 7])}%`, sales: int(120000, 640000), started: day(-int(200, 900)), status: i === 5 ? "قيد التأسيس" : "نشط" }));
  const franchiseProducts: Row[] = products.slice(0, 20).map((p, i) => ({ id: `fp${i}`, sku: p.sku, name: p.name, category: p.category, unit: p.unit, wholesale: round(p.price * 0.68), retail: p.price, minOrder: int(5, 40), status: r() < 0.9 ? "متاح للشركاء" : "موقوف" }));
  const agreements: Row[] = FRANCHISE.map((name, i) => ({ id: `ag${i}`, no: no("AGR", 40 + i), partner: name, territory: pick(["المنطقة الجنوبية", "المنطقة الشمالية", "الطائف", "دولة الكويت", "مملكة البحرين", "حائل"]), start: day(-int(200, 900)), end: day(int(200, 1500)), fee: int(150000, 400000), royalty: `${pick([5, 6, 7])}%`, status: i === 5 ? "بانتظار التوقيع" : i === 2 ? "تنتهي قريبًا" : "سارية" }));
  const franchiseSettlements: Row[] = Array.from({ length: 18 }, (_, i) => { const sales = int(60000, 260000); return { id: `fs${i}`, no: no("FRS", 330 - i), month: day(-i * 30).slice(0, 7), partner: FRANCHISE[i % 5], sales, royalty: round(sales * 0.06), supplies: int(18000, 90000), due: round(sales * 0.06 + int(2000, 9000)), status: i < 4 ? "مستحقة" : "مسددة" }; });

  const workshopRequests: Row[] = Array.from({ length: 22 }, (_, i) => { const list = lines(5).map(l => ({ ...l, qty: l.qty * int(2, 8) })); return { id: `wr${i}`, no: no("WRQ", 1880 - i), date: day(-Math.floor(i / 4)), branch: pick(branches).name, requestedBy: person(), items: list.length, units: list.reduce((s, l) => s + l.qty, 0), needed: day(1 - Math.floor(i / 6)), priority: pick(["عادي", "عادي", "عاجل"]), status: pick(["جديد", "قيد التجهيز", "قيد التجهيز", "جاهز للإرسال", "في الطريق", "مستلم", "مستلم"]), lines: list }; });
  const deliveries: Row[] = workshopRequests.filter(w => ["جاهز للإرسال", "في الطريق", "مستلم"].includes(String(w.status))).map((w, i) => ({ id: `dl${i}`, no: no("DLV", 940 - i), request: String(w.no), branch: String(w.branch), driver: person(), vehicle: `ثلاجة ${pick(["أ ب ج", "د هـ و", "ر س ص"])} ${int(1000, 9999)}`, temperature: `${int(2, 5)} م`, departed: `${String(w.date)} ${int(6, 11)}:30`, units: Number(w.units), status: String(w.status), lines: w.lines }));
  const orderCatalog: Row[] = products.map((p, i) => ({ id: `oc${i}`, sku: p.sku, barcode: p.barcode, name: p.name, category: p.category, unit: p.unit, available: int(0, 320), minimum: int(10, 40), status: r() < 0.88 ? "متاح للطلب" : "يجهز عند الطلب" }));

  const STAGES = ["استلام المواد الخام وفحصها", "التخزين وفصل مسببات الحساسية", "الوزن والتحضير", "العجن والتشكيل", "الخبز والمعالجة الحرارية", "التبريد السريع", "الحشو والتزيين", "التعبئة وبطاقة البيان", "كشف المعادن والفحص النهائي", "الإفراج والتخزين المبرد"];
  const mfgOrders: Row[] = Array.from({ length: 18 }, (_, i) => { const p = pick(products); const planned = int(60, 600); const stage = i < 6 ? int(0, 8) : 10; return { id: `mo${i}`, no: no("MFG", 2760 - i), date: day(-Math.floor(i / 3)), product: p.name, batch: `B-${day(-Math.floor(i / 3)).slice(2).replaceAll("-", "")}-${String(i + 1).padStart(2, "0")}`, planned, produced: stage === 10 ? planned - int(0, 12) : Math.round(planned * stage / 10), unit: p.unit, line: pick(["خط الشرقيات", "خط الكيك", "خط الشوكولاتة", "خط التغليف"]), stageIndex: stage, stage: stage === 10 ? "اكتملت كل المراحل" : STAGES[stage], progress: stage * 10, supervisor: person(), inspector: person(), status: stage === 10 ? "مكتمل" : "قيد الإنتاج" }; });
  const quality: Row[] = Array.from({ length: 20 }, (_, i) => { const o = mfgOrders[i % mfgOrders.length]; return { id: `qc${i}`, no: no("QC", 5120 - i), date: String(o.date), batch: String(o.batch), product: String(o.product), check: pick(["درجة حرارة الخبز", "الوزن الصافي", "الفحص الحسي", "سلامة التغليف", "الفحص الميكروبي", "مطابقة الملصق"]), reading: pick(["180 م", "498 جم", "مطابق", "سليم", "سلبي", "مطابق"]), inspector: person(), result: r() < 0.88 ? "مطابق" : "غير مطابق", status: r() < 0.88 ? "مفرج عنه" : "محجوز" }; });
  const qualityReports: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `qr${i}`, no: no("QRP", 310 - i), period: `أسبوع ${day(-i * 7)}`, batches: int(18, 46), checks: int(120, 380), pass: `${(96 + r() * 3.6).toFixed(1)}%`, rejected: int(0, 4), complaints: int(0, 3), issuedBy: person(), status: i === 0 ? "قيد الإعداد" : "معتمد" }));
  const batches: Row[] = mfgOrders.map((o, i) => ({ id: `bt${i}`, orderId: o.id, batch: String(o.batch), product: String(o.product), produced: String(o.date), expiry: day(int(2, 60)), qty: Number(o.produced), unit: String(o.unit), raw: `${pick(RAW)[0]} و${pick(RAW)[0]}`, location: pick(["المستودع الرئيسي", "مستودع التبريد والمجمدات", "فرع العليا", "فرع التحلية", "خط الإنتاج"]), sold: `${int(10, 96)}%`, status: String(o.status) === "مكتمل" ? "مفرج عنه" : "قيد الإنتاج" }));

  const treasuries: Row[] = [
    ...branches.map((b, i): Row => ({ id: `tr${i}`, code: `110${i + 1}`, name: `خزينة ${b.name}`, kind: "خزينة فرع", holder: b.manager, balance: int(4200, 38000), today: int(2000, 16000), lastCount: day(-int(0, 3)), status: "نشطة" })),
    { id: "trm", code: "1100", name: "الخزينة الرئيسية", kind: "خزينة رئيسية", holder: person(), balance: 184600, today: 42300, lastCount: day(0), status: "نشطة" },
    { id: "bk1", code: "1201", name: "مصرف الراجحي - الحساب الجاري", kind: "حساب بنكي", holder: "SA•• •••• 4471", balance: 1286400, today: 96200, lastCount: day(-1), status: "مطابق" },
    { id: "bk2", code: "1202", name: "البنك الأهلي السعودي - المبيعات الشبكية", kind: "حساب بنكي", holder: "SA•• •••• 9025", balance: 742150, today: 131800, lastCount: day(-1), status: "مطابق" },
    { id: "bk3", code: "1203", name: "مصرف الإنماء - الرواتب", kind: "حساب بنكي", holder: "SA•• •••• 1180", balance: 318000, today: 0, lastCount: day(-4), status: "بانتظار المطابقة" },
  ];
  const ACCOUNTS: [string, string, string, number][] = [["1", "الأصول", "رئيسي", 0], ["11", "النقد وما في حكمه", "فرعي", 2531150], ["12", "المدينون", "فرعي", 164800], ["13", "المخزون", "فرعي", 912400], ["15", "الأصول الثابتة", "فرعي", 3860000], ["2", "الالتزامات", "رئيسي", 0], ["21", "الدائنون", "فرعي", 428300], ["22", "ضريبة القيمة المضافة المستحقة", "فرعي", 196450], ["23", "رواتب مستحقة", "فرعي", 312000], ["3", "حقوق الملكية", "رئيسي", 0], ["31", "رأس المال", "فرعي", 5000000], ["32", "الأرباح المبقاة", "فرعي", 1124600], ["4", "الإيرادات", "رئيسي", 0], ["41", "مبيعات الفروع", "فرعي", 3984200], ["42", "مبيعات المناسبات والشركات", "فرعي", 862300], ["43", "إيرادات الفرنشايز", "فرعي", 214800], ["5", "المصروفات", "رئيسي", 0], ["51", "تكلفة المبيعات", "فرعي", 1986400], ["52", "الرواتب والأجور", "فرعي", 936000], ["53", "الإيجارات", "فرعي", 420000], ["54", "الكهرباء والمياه", "فرعي", 86300], ["55", "التسويق والولاء", "فرعي", 124500], ["56", "الإهلاك", "فرعي", 96500]];
  const accounts: Row[] = ACCOUNTS.map(([code, name, level, balance], i) => ({ id: `ac${i}`, code, name, level, nature: "1" === code[0] || "5" === code[0] ? "مدين" : "دائن", balance, status: "نشط" }));
  const leaf = accounts.filter(a => a.level === "فرعي");
  const journals: Row[] = Array.from({ length: 34 }, (_, i) => { const amount = int(800, 96000); return { id: `jr${i}`, no: no("JRN", 7410 - i), date: day(-Math.floor(i / 3)), description: pick(["إقفال مبيعات اليوم", "سداد مورد", "صرف رواتب", "تحويل بين الخزائن", "إثبات مشتريات مواد خام", "قيد إهلاك شهري", "تسوية مخزون", "إيداع بنكي"]), debit: String(pick(leaf).name), credit: String(pick(leaf).name), amount, source: pick(["نقاط البيع", "المشتريات", "يدوي", "الرواتب", "المخزون"]), createdBy: person(), status: i < 3 ? "مسودة" : i < 6 ? "بانتظار الاعتماد" : "مرحّل" }; });
  const voucher = (prefix: string, count: number, labels: string[], start: number) => Array.from({ length: count }, (_, i): Row => ({ id: `${prefix}${i}`, no: no(prefix, start - i), date: day(-Math.floor(i / 2)), party: prefix === "RCV" ? customer() : pick([...SUPPLIERS, "شركة الكهرباء", "مالك عقار فرع العليا", "شركة التوصيل السريع"]), description: pick(labels), treasury: String(pick(treasuries).name), method: pick(["تحويل بنكي", "نقدي", "شيك", "مدى"]), amount: int(350, 48000), status: i < 2 ? "بانتظار الاعتماد" : "معتمد" }));
  const disbursements = voucher("PAY", 26, ["سداد فاتورة مشتريات", "إيجار شهري", "فاتورة كهرباء", "صيانة أفران", "مصاريف نقل", "عهدة نثرية"], 4120);
  const receipts = voucher("RCV", 26, ["تحصيل فاتورة آجلة", "دفعة مقدمة لمناسبة", "سداد رصيد عميل", "تحصيل شركة"], 3980);
  const costCenters: Row[] = [...branches.map((b, i): Row => ({ id: `cc${i}`, code: `CC-${i + 1}0`, name: b.full, kind: "فرع", manager: b.manager, revenue: int(280000, 920000), expense: int(160000, 520000), status: "نشط" })), { id: "ccf", code: "CC-70", name: "المصنع المركزي", kind: "إنتاج", manager: person(), revenue: 0, expense: 1284000, status: "نشط" }, { id: "cca", code: "CC-80", name: "الإدارة العامة", kind: "إدارة", manager: person(), revenue: 0, expense: 462000, status: "نشط" }].map(c => ({ ...c, margin: Number(c.revenue) ? `${Math.round((Number(c.revenue) - Number(c.expense)) / Number(c.revenue) * 100)}%` : "مركز تكلفة" }));
  const trial: Row[] = leaf.map((a, i) => ({ id: `tb${i}`, code: String(a.code), name: String(a.name), debit: a.nature === "مدين" ? Number(a.balance) : 0, credit: a.nature === "دائن" ? Number(a.balance) : 0, movement: int(12000, 380000), status: a.nature === "مدين" ? "مدين" : "دائن" }));

  const JOBS = ["مدير فرع", "كاشير", "كاشير", "بائع", "حلواني", "حلواني", "مساعد حلواني", "أمين مستودع", "سائق توزيع", "مراقب جودة", "محاسب", "مشرف وردية"];
  const employees: Row[] = Array.from({ length: 42 }, (_, i) => { const job = JOBS[i % JOBS.length]; return { id: `em${i}`, code: no("EMP", 100 + i), name: person(), job, department: ["حلواني", "مساعد حلواني", "مراقب جودة"].includes(job) ? "المصنع" : job === "محاسب" ? "المالية" : ["أمين مستودع", "سائق توزيع"].includes(job) ? "المستودعات والتوزيع" : "الفروع", branch: ["حلواني", "مساعد حلواني", "مراقب جودة", "محاسب"].includes(job) ? "الإدارة والمصنع" : pick(branches).name, phone: phone(), joined: day(-int(60, 2200)), salary: job === "مدير فرع" ? int(9000, 12500) : job === "محاسب" ? int(7500, 9500) : int(4200, 7200), shift: pick(["صباحية 7 - 3", "مسائية 3 - 11", "مسائية 3 - 11"]), nationality: pick(["سعودي", "سعودي", "سعودي", "مصري", "سوري", "فلبيني"]), status: r() < 0.9 ? "على رأس العمل" : "في إجازة" }; });
  const roles: Row[] = [["مالك الحساب", "كل الأقسام والاعتمادات", 1], ["مدير عام", "كل الأقسام عدا إعدادات الحساب", 2], ["مدير فرع", "مبيعات الفرع وورديته ومخزنه وموظفيه", 6], ["كاشير", "نقطة البيع ووردية الكاشير فقط", 14], ["أمين مستودع", "المخزون والتحويلات والإتلاف", 4], ["محاسب", "المالية والقيود والتقارير", 3], ["مشرف إنتاج", "المصنع والجودة والباتشات", 5], ["مسؤول ولاء", "العملاء والنقاط وبطاقة الولاء", 2]].map(([name, scope, users], i) => ({ id: `rl${i}`, name: String(name), scope: String(scope), users: Number(users), sections: int(3, 12), approvals: i < 3 ? "يعتمد" : "لا يعتمد", status: "مفعّل" }));
  const schedules: Row[] = employees.slice(0, 30).map((e, i) => ({ id: `sc${i}`, name: String(e.name), job: String(e.job), branch: String(e.branch), shift: String(e.shift), days: pick(["السبت إلى الخميس", "الأحد إلى الجمعة", "السبت إلى الأربعاء"]), checkIn: e.status === "في إجازة" ? "إجازة" : `${String(e.shift).startsWith("ص") ? "06" : "14"}:${String(int(48, 59))}`, late: r() < 0.14 ? `${int(4, 25)} د` : "في الوقت", overtime: `${int(0, 6)} س`, status: e.status === "في إجازة" ? "في إجازة" : r() < 0.9 ? "حاضر" : "متأخر" }));
  const payroll: Row[] = Array.from({ length: 8 }, (_, i) => { const base = 268000 + int(-9000, 9000); return { id: `py${i}`, no: no("PRL", 96 - i), month: day(-i * 30).slice(0, 7), employees: 42 - (i > 4 ? 3 : 0), basic: base, allowances: round(base * 0.22), overtime: int(4200, 16800), deductions: int(2800, 11200), net: round(base * 1.22 + 9000), paidOn: i ? `${day(-i * 30).slice(0, 7)}-27` : "لم يصرف بعد", status: i === 0 ? "قيد المراجعة" : "مصروف" }; });
  const organization: Row[] = [["الإدارة العامة", "—", 3], ["الفروع والمبيعات", "الإدارة العامة", 22], ["المصنع المركزي", "الإدارة العامة", 9], ["الجودة وسلامة الغذاء", "المصنع المركزي", 2], ["المستودعات والتوزيع", "الإدارة العامة", 6], ["المالية والمحاسبة", "الإدارة العامة", 3], ["التسويق والولاء", "الإدارة العامة", 2], ["الموارد البشرية", "الإدارة العامة", 2]].map(([name, parent, count], i) => ({ id: `og${i}`, code: `D-${i + 1}0`, name: String(name), parent: String(parent), head: person(), employees: Number(count), titles: int(2, 6), status: "نشط" }));

  const ownPlaces = branches.map(b => b.name);
  const franchisePlaces = partners.slice(0, 5).map(p => `${p.name} - ${p.city}`);
  const pointMoves: Row[] = [];
  customers.forEach(c => {
    let balance = 0; const totals = { earnedOwn: 0, earnedFranchise: 0, redeemedOwn: 0, redeemedFranchise: 0 };
    for (let i = int(5, 10); i > 0; i--) {
      const franchise = r() < 0.3; const redeem = balance > 300 && r() < 0.32; const pts = redeem ? Math.min(balance, int(1, 6) * 100) : int(20, 520);
      balance += redeem ? -pts : pts; totals[redeem ? (franchise ? "redeemedFranchise" : "redeemedOwn") : (franchise ? "earnedFranchise" : "earnedOwn")] += pts;
      pointMoves.push({ id: `pm${pointMoves.length}`, date: day(-i * 5 - int(0, 4)), customer: String(c.name), customerId: c.id, tier: String(c.tier), placeType: franchise ? "الفرنشايز" : "فروعنا", place: pick(franchise ? franchisePlaces : ownPlaces), kind: redeem ? "استبدال" : "اكتساب", basis: redeem ? "خصم من الفاتورة" : pick(["قيمة الفاتورة", "قيمة الفاتورة", "نقاط الصنف", "مضاعف الفرع", "مكافأة الفئة"]), invoice: no("INV", int(40100, 48200)), points: redeem ? -pts : pts, status: redeem ? "مستبدلة" : "مضافة" });
    }
    Object.assign(c, { points: balance, ...totals });
  });
  // Showcase customer requested for the presentation: found by phone at the cashier with 1000 points.
  customers.unshift({ id: "c-demo", code: "CUS-01000", name: "عميل العرض المميز", phone: "0508424401", tier: "ذهبي", branch: branches[0].name, visits: 14, spent: 6200, balance: 0, points: 1000, stamps: 6, lastVisit: day(-2), status: "نشط", earnedOwn: 1000, earnedFranchise: 0, redeemedOwn: 0, redeemedFranchise: 0 });
  pointMoves.push({ id: "pm-demo", date: day(-2), customer: "عميل العرض المميز", customerId: "c-demo", tier: "ذهبي", placeType: "فروعنا", place: branches[0].name, kind: "اكتساب", basis: "قيمة الفاتورة", invoice: no("INV", 48100), points: 1000, status: "مضافة" });
  pointMoves.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pointsLedger = pointMoves;
  const branchStock: Record<string, Record<string, number>> = {}; const branchPrices: Record<string, Record<string, number>> = {};
  branches.forEach((b, bi) => { branchStock[b.name] = {}; branchPrices[b.name] = {}; products.forEach(p => { branchStock[b.name][p.sku] = r() < 0.07 ? 0 : int(3, 90); const factor = [1, 1, 1.04, 1, 1.06, 1.03][bi]; branchPrices[b.name][p.sku] = Math.round(p.price * (r() < 0.2 ? factor + 0.04 : factor)); }); });
  const W_STATES: WStatus[] = ["جديد", "جديد", "قيد التجهيز", "قيد التجهيز", "تم التسليم للفرع", "تم التسليم للفرع", "مستلم في الفرع", "صدرت الفاتورة"];
  const workshopOrders: WOrder[] = Array.from({ length: 16 }, (_, i) => { const status = W_STATES[i % W_STATES.length]; const chosen = Array.from({ length: int(2, 5) }, () => pick(products)).filter((p, index, list) => list.indexOf(p) === index); return { id: `wo${i}`, no: no("WRQ", 1880 - i), branch: branches[i % branches.length].name, by: person(), date: day(-Math.floor(i / 5)), needed: day(1 - Math.floor(i / 6)), priority: i % 5 === 0 ? "عاجل" : "عادي", status, lines: chosen.map(p => ({ sku: p.sku, barcode: p.barcode, name: p.name, category: p.category, unit: p.unit, qty: int(4, 40), price: p.price })), invoice: status === "صدرت الفاتورة" ? no("INV-WS", 310 - i) : "", log: ["رفع موظف الفرع الطلب"] }; });
  const stampLog: Row[] = Array.from({ length: 40 }, (_, i) => { const c = pick(customers); return { id: `st${i}`, date: day(-Math.floor(i / 5)), customer: String(c.name), phone: String(c.phone), branch: pick(branches).name, cashier: person(), stamps: `${int(1, 9)} / 10`, wallet: pick(["Apple Wallet", "Google Wallet", "Apple Wallet"]), status: r() < 0.12 ? "استبدل المكافأة" : "ختم جديد" }; });
  const loyaltyBranches: Row[] = branches.map((b, i) => ({ id: `lb${i}`, name: b.name, city: b.city, cards: int(380, 2400), stampsMonth: int(600, 4200), pointsMonth: int(18000, 96000), rewards: int(22, 210), multiplier: i === 4 ? "×2" : i === 1 ? "×1.5" : "×1", cashiers: b.cashiers, status: "مفعّل" }));
  const sections: Row[] = ["المبيعات", "المشتريات", "نقاط البيع", "المخزون", "الأسر المنتجة", "الفرنشايز", "المعمل", "العملاء", "الولاء", "المصنع", "المالية", "الموظفين"].map((name, i) => ({ id: `sx${i}`, name, pages: int(3, 7), users: int(2, 30), lastChange: day(-int(0, 20)), package: pick(["برندة المالية", "برندة التصنيع", "برندة الموظفين", "برندة الولاء"]), status: "مفعّل" }));

  const daily = Array.from({ length: 14 }, (_, i) => ({ day: day(i - 13), total: int(38000, 96000) + (i === 13 ? 9000 : 0) }));
  return { day, branches, products, customers, invoices, quotes, salesReturns, purchaseInvoices, purchaseReturns, purchaseRequests, purchaseOrders, posPoints, shifts, pointPrices, warehouses, lots, movements, disposals, families, familySales, familyReturns, familySettlements, partners, franchiseProducts, agreements, franchiseSettlements, workshopRequests, deliveries, orderCatalog, mfgOrders, quality, qualityReports, batches, treasuries, accounts, journals, disbursements, receipts, costCenters, trial, employees, roles, schedules, payroll, organization, pointsLedger, branchStock, branchPrices, workshopOrders, stampLog, loyaltyBranches, sections, daily, stages: STAGES };
}

export type DemoData = ReturnType<typeof build>;
let cache: DemoData | null = null;
export const demoData = () => cache ??= build();
export const money = (value: number) => `${Math.round(value).toLocaleString("en-US")} ر.س`;
export const sum = (rows: Row[], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
export const count = (rows: Row[], key: string, value: string) => rows.filter(row => row[key] === value).length;
