"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { demoData } from "./data";
import { Register, ToastHost } from "./kit";
import { demoSections } from "./sections";
import { DemoOverview, DemoWarehouses } from "./views";
import { DemoLoyaltyCard, DemoPoints } from "./loyalty";
import { DemoStoreProvider, useDemo } from "./store";
import { ItemPage } from "./item";
import { ProductForm } from "./product-form";
import { InvoiceForm } from "./invoice-form";
import { invoiceView } from "./tax-invoice";
import { DemoWorkshop } from "./workshop";
import { DemoFactory } from "./factory";
import { DemoPos } from "./pos";
import { DemoCustomerPoints } from "./points";
import { DemoReports } from "./reports";
import s from "./demo.module.css";

const KEY = "aldeem.demo";
const EVENT = "aldeem-demo-change";
// Owner request 2026-11-19: the presentation opens by default everywhere for the client meeting; the sidebar switch turns it off.
const fallback = true;
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onChange); };
}
function read() {
  try { const saved = window.localStorage.getItem(KEY); return saved === null ? fallback : saved === "1"; } catch { return fallback; }
}

/** Presentation mode switch, remembered per browser. */
export function useAldeemDemo() {
  const demo = useSyncExternalStore(subscribe, read, () => false);
  const setDemo = (next: boolean) => { try { window.localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* private window */ } window.dispatchEvent(new Event(EVENT)); };
  return [demo, setDemo] as const;
}

function SectionView({ section, title }: { section: string; title: string }) {
  const { d, go, workshopInvoices, records } = useDemo();
  const [version, setVersion] = useState(0);
  // The products list grows when the owner adds a product, so the registers are rebuilt on each addition.
  const defs = useMemo(() => demoSections(d), [d, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [product, setProduct] = useState("");
  const [adding, setAdding] = useState(false);
  if (section === "overview") return <DemoOverview d={d} go={go} />;
  if (section === "inventory-warehouses") return <DemoWarehouses d={d} />;
  if (section === "loyalty-card") return <DemoLoyaltyCard d={d} />;
  if (section === "loyalty-points") return <DemoPoints d={d} />;
  if (section === "customer-points") return <DemoCustomerPoints />;
  if (section === "finance-reports") return <DemoReports />;
  if (section.startsWith("workshop-")) return <DemoWorkshop section={section} />;
  if (section.startsWith("manufacturing-")) return <DemoFactory section={section} />;
  if (section === "branch-pos-management" || section === "pos-price-management" || section === "pos-active-shifts") return <DemoPos section={section} />;
  if (section === "inventory-products" && adding) return <ProductForm back={() => setAdding(false)} saved={name => { setVersion(current => current + 1); setAdding(false); setProduct(name); }} />;
  if (section === "inventory-products") return product ? <ItemPage name={product} back={() => setProduct("")} backLabel="العودة إلى المنتجات" /> : <Register def={defs[section]} title={title} onOpen={row => setProduct(String(row.name))} onCreate={() => setAdding(true)} />;
  const def = section === "sales-invoices" ? { ...defs[section], rows: [...records.sale, ...workshopInvoices, ...d.invoices] } : defs[section];
  if (section === "sales-invoices" && adding) return <InvoiceForm back={() => setAdding(false)} />;
  return def ? <Register def={def} title={title} onCreate={section === "sales-invoices" ? () => setAdding(true) : undefined} renderOpen={invoiceView} /> : <p className={s.empty}>هذه الصفحة غير متاحة في العرض التجريبي</p>;
}

/** Every Aldeem page filled from the in-browser presentation dataset: no server reads, so navigation is instant. */
export function AldeemDemo({ section, title, go }: { section: string; title: string; go: (section: string) => void }) {
  const d = useMemo(demoData, []);
  return <ToastHost><DemoStoreProvider d={d} go={go}><div className={s.page} dir="rtl"><SectionView key={section} section={section} title={title} /></div></DemoStoreProvider></ToastHost>;
}

export function DemoSwitch({ demo, onChange }: { demo: boolean; onChange: (next: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={demo} className={s.demoSwitch} onClick={() => onChange(!demo)}><span>العرض التجريبي</span><i aria-hidden="true" /></button>;
}
