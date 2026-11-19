"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { DemoData, Row, WLine, WOrder, WStatus } from "./data";
import s from "./demo.module.css";

export type Activity = { at: string; text: string };
type Store = {
  d: DemoData;
  go: (section: string) => void;
  /** Branch price of an item: same barcode, a different price per branch. */
  prices: Record<string, Record<string, number>>;
  setPrice: (branch: string, sku: string, value: number) => void;
  orders: WOrder[];
  submitOrder: (branch: string, by: string, lines: WLine[], priority: string) => WOrder;
  /** Moves a workshop order one step: new, preparing, delivered to branch, received by branch, invoiced. */
  advanceOrder: (id: string) => void;
  workshopInvoices: Row[];
  /** Approved factory stage count per production order id (0 to 10). */
  stages: Record<string, number>;
  passStage: (orderId: string) => void;
  activity: Activity[];
  log: (text: string) => void;
  /** Records made at the cashier during this session. */
  records: Record<RecordKind, Row[]>;
  addRecord: (kind: RecordKind, row: Row) => void;
};
export type RecordKind = "sale" | "purchase" | "family";

const FLOW: WStatus[] = ["جديد", "قيد التجهيز", "تم التسليم للفرع", "مستلم في الفرع", "صدرت الفاتورة"];
const STEP_TEXT = ["", "استلم المعمل الطلب وبدأ التجهيز", "سلّم المعمل الطلب للفرع", "استلم الفرع الأصناف", "أصدر الفرع فاتورة الطلب"];
export const clock = () => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date());
export const orderTotal = (order: WOrder) => Math.round(order.lines.reduce((sum, line) => sum + line.qty * line.price, 0) * 1.15);
const invoiceOf = (order: WOrder, date: string): Row => ({ id: `wsinv-${order.id}`, type: "طلبات المعمل", no: order.invoice, date, customer: order.branch, branch: "المعمل المركزي", cashier: order.by, method: "تحويل داخلي", items: order.lines.length, total: orderTotal(order), paid: orderTotal(order), status: "صادرة", lines: order.lines.map(line => ({ name: line.name, qty: line.qty, unit: line.unit, price: line.price })) });

const Context = createContext<Store | null>(null);
export function useDemo() { const store = useContext(Context); if (!store) throw new Error("demo store missing"); return store; }

export function DemoStoreProvider({ d, go, children }: { d: DemoData; go: (section: string) => void; children: ReactNode }) {
  const [prices, setPrices] = useState(d.branchPrices);
  const [orders, setOrders] = useState(d.workshopOrders);
  const [stages, setStages] = useState<Record<string, number>>(() => Object.fromEntries(d.mfgOrders.map(order => [order.id, Number(order.stageIndex)])));
  const [activity, setActivity] = useState<Activity[]>([]);
  const [records, setRecords] = useState<Record<RecordKind, Row[]>>({ sale: [], purchase: [], family: [] });
  const log = useCallback((text: string) => setActivity(current => [{ at: clock(), text }, ...current].slice(0, 60)), []);
  const store = useMemo<Store>(() => ({
    d, go, prices, orders, stages, activity, log, records,
    addRecord: (kind, row) => setRecords(current => ({ ...current, [kind]: [row, ...current[kind]] })),
    setPrice: (branch, sku, value) => { setPrices(current => ({ ...current, [branch]: { ...current[branch], [sku]: value } })); log(`تعديل سعر الصنف ${sku} في ${branch} إلى ${value} ر.س`); },
    submitOrder: (branch, by, lines, priority) => {
      const order: WOrder = { id: `wo-new-${orders.length}`, no: `WRQ-${String(1881 + orders.length - 16).padStart(5, "0")}`, branch, by, date: d.day(0), needed: d.day(1), priority, status: "جديد", lines, invoice: "", log: [`${clock()} رفع موظف الفرع الطلب`] };
      setOrders(current => [order, ...current]); log(`طلب معمل جديد ${order.no} من ${branch}`);
      return order;
    },
    advanceOrder: id => {
      const order = orders.find(item => item.id === id); const step = order ? FLOW.indexOf(order.status) + 1 : 0;
      if (!order || step >= FLOW.length) return;
      const invoice = step === 4 ? `INV-WS-${String(311 + orders.filter(item => item.invoice).length).padStart(5, "0")}` : order.invoice;
      setOrders(current => current.map(item => item.id === id ? { ...item, status: FLOW[step], invoice, log: [...item.log, `${clock()} ${STEP_TEXT[step]}`] } : item));
      log(`${order.no}: ${STEP_TEXT[step]}`);
    },
    workshopInvoices: orders.filter(order => order.invoice).map(order => invoiceOf(order, d.day(0))),
    passStage: orderId => { setStages(current => ({ ...current, [orderId]: Math.min(10, (current[orderId] ?? 0) + 1) })); log(`اعتماد مرحلة تصنيع في أمر الإنتاج ${String(d.mfgOrders.find(order => order.id === orderId)?.no ?? "")}`); },
  }), [d, go, prices, orders, stages, activity, log, records]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

/** Operating interface shell: covers the whole screen like a station display, with its own bar and exit. */
export function FullScreen({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div className={s.station} role="dialog" aria-modal="true" aria-label={title}>
    <header className={s.stationBar}><div><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div><bdi>{clock()}</bdi><button type="button" className={s.stationExit} onClick={onClose}><X size={17} aria-hidden="true" />إغلاق الواجهة</button></header>
    <div className={s.stationBody}>{children}</div>
  </div>;
}
