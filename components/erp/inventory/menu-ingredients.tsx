"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Package, Pencil, Plus, RefreshCw } from "lucide-react";
import { cachedMenuIngredients, isMenuIngredientsFresh, pendingMenuIngredients, rememberMenuIngredients, requestMenuIngredients } from "./menu-ingredients-cache";
import { FinanceInventoryItemForm } from "@/components/finance/finance-inventory-item-form";
import { FinancePosModal } from "@/components/finance/finance-pos-locale";
import type { FinanceItem, FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceInventoryUnit } from "@/lib/finance/inventory-catalog";
import styles from "./menu-ingredients.module.css";

type Props = { slug: string; productId: string; productName: string; onClose: () => void };
type Loaded = { key: string; snapshot?: FinanceSnapshot; error?: string };

function itemLinks(item: FinanceItem) {
  return item.product_links ?? (item.menu_product_id ? [{ product_id: item.menu_product_id, quantity: 1 }] : []);
}

export function MenuInventoryIngredients({ slug, productId, productName, onClose }: Props) {
  const key = `${slug}:${productId}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<{ key: string; item: FinanceItem } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [issue, setIssue] = useState("");
  const busyRef = useRef(false);
  const live = useRef({ active: true, key });
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectId = useId();
  const [, setCacheTick] = useState(0);
  const mine = loaded?.key === key ? loaded : null;
  // Show the last snapshot of this brand at once while the server confirms this product in the background.
  const snapshot = mine ? mine.snapshot : cachedMenuIngredients(slug, productId);
  const error = mine?.error;
  const confirmed = mine?.snapshot;
  useEffect(() => { if (confirmed) rememberMenuIngredients(slug, confirmed); }, [slug, confirmed]);
  const currentEdit = editing?.key === key ? editing.item : undefined;

  useEffect(() => {
    let active = true;
    live.current = { active: true, key };
    void pendingMenuIngredients(slug)?.then(() => { if (active) setCacheTick(value => value + 1); }, () => undefined);
    requestMenuIngredients(slug, productId).then(result => {
      if (active) setLoaded(result.ok ? { key, snapshot: result.snapshot } : { key, error: result.message });
    }).catch(() => {
      if (active) setLoaded({ key, error: "تعذر تحميل المكونات أعد المحاولة" });
    });
    return () => { active = false; live.current.active = false; };
  }, [slug, productId, key, retry]);

  function markBusy(value: boolean) { busyRef.current = value; setBusy(value); }
  function showList() {
    setEditing(null);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  async function edit(item: FinanceItem) {
    if (busyRef.current) return;
    markBusy(true);
    setNotice("");
    setIssue("");
    try {
      // Reuse the snapshot the server confirmed for this product within the last minute, otherwise read again.
      const result = confirmed && isMenuIngredientsFresh(slug, productId) ? { ok: true as const, snapshot: confirmed } : await requestMenuIngredients(slug, productId);
      if (!live.current.active || live.current.key !== key) return;
      if (!result.ok) { setIssue(result.message); return; }
      setLoaded({ key, snapshot: result.snapshot });
      const current = result.snapshot.items.find(row => row.id === item.id);
      if (!current) { setIssue("الصنف لم يعد متاحًا في المخزون المختار"); return; }
      const links = itemLinks(current);
      setEditing({ key, item: { ...current, product_links: links.some(link => link.product_id === productId) ? links : [...links, { product_id: productId, quantity: 1 }] } });
      requestAnimationFrame(() => content.current?.querySelector<HTMLInputElement>("form input:not(:disabled)")?.focus({ preventScroll: true }));
    } catch {
      if (live.current.active && live.current.key === key) setIssue("تعذر تحديث بيانات المكوّن أعد المحاولة");
    } finally {
      if (live.current.active && live.current.key === key) markBusy(false);
    }
  }
  function applyUnits(units: FinanceInventoryUnit[]) {
    setLoaded(previous => previous?.key === key && previous.snapshot ? { ...previous, snapshot: { ...previous.snapshot, units } } : previous);
  }
  function saved(item: FinanceItem, units: FinanceInventoryUnit[]) {
    setLoaded(previous => previous?.key === key && previous.snapshot ? { ...previous, snapshot: { ...previous.snapshot, items: previous.snapshot.items.map(row => row.id === item.id ? item : row), units } } : previous);
    markBusy(false);
    setSelected("");
    setNotice("تم حفظ المكوّن وتحديث روابطه");
    showList();
  }

  const components = snapshot?.items.flatMap(item => itemLinks(item).filter(link => link.product_id === productId).map(link => ({ item, quantity: link.quantity }))) ?? [];
  const choices = snapshot?.items.filter(item => item.active && !itemLinks(item).some(link => link.product_id === productId)) ?? [];

  return <FinancePosModal open title={`مكونات ${productName}`} onClose={() => { if (!busyRef.current) onClose(); }} panelClassName={styles.panel}>
    <div ref={content} className={styles.body} aria-busy={busy || (!snapshot && !error)}>
      {error ? <div className={styles.empty}><p role="alert">{error}</p><button type="button" className={styles.button} onClick={() => { setLoaded(null); setRetry(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />إعادة المحاولة</button></div> : !snapshot ? <p role="status" className={styles.empty}>جار تحميل المكونات</p> : currentEdit ? <>
        <p className={styles.hint}>حدد استهلاك هذا المنتج من الصنف ثم احفظ المكوّن</p>
        <FinanceInventoryItemForm key={`${key}:${currentEdit.id}`} snapshot={snapshot} item={currentEdit} onBusyChange={markBusy} onUnitsChanged={applyUnits} onSaved={saved} onCancel={() => { if (!busyRef.current) showList(); }} />
      </> : <>
        <div className={styles.heading}><Package size={24} aria-hidden="true" /><div><h3 ref={heading} tabIndex={-1}>مكونات من أصناف المخزون</h3><p>الربط اختياري وتُخصم كمية المكوّن المحددة عند بيع وحدة من هذا المنتج</p></div></div>
        {notice && <p className={styles.success} role="status">{notice}</p>}
        {issue && <p className={styles.error} role="alert">{issue}</p>}
        {busy && <p className={styles.hint} role="status">جار تحديث بيانات المكوّن</p>}
        {components.length ? <ul className={styles.list}>{components.map(({ item, quantity }) => <li key={item.id}>
          <div className={styles.item}><strong>{item.name}</strong><span>{Number(quantity).toLocaleString("ar-SA", { maximumFractionDigits: 3 })} {item.unit} لكل منتج{!item.active && " — صنف غير نشط"}</span></div>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void edit(item)} aria-label={`تعديل مكوّن ${item.name}`}><Pencil size={16} aria-hidden="true" />تعديل</button>
        </li>)}</ul> : <p className={styles.empty}>لا توجد مكونات مرتبطة بهذا المنتج</p>}
        {choices.length ? <div className={styles.add}><label htmlFor={selectId}>إضافة مكوّن من المخزون</label><div className={styles.controls}>
          <select id={selectId} disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">اختر صنفًا مخزنيًا</option>{choices.map(item => <option key={item.id} value={item.id}>{item.name} — {item.unit}</option>)}</select>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || !choices.some(item => item.id === selected)} onClick={() => { const item = choices.find(row => row.id === selected); if (item) void edit(item); }}><Plus size={17} aria-hidden="true" />إضافة مكوّن</button>
        </div></div> : <p className={styles.hint}>{snapshot.items.length ? "لا توجد أصناف نشطة أخرى لإضافتها" : "أضف أصناف المواد من تبويب أصناف المخزون ثم عد لربط المكونات"}</p>}
      </>}
    </div>
  </FinancePosModal>;
}

export default MenuInventoryIngredients;
