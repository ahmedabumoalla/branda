"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RefreshCw, Store } from "lucide-react";
import { readStockItemMenuState, setStockItemMenuVisibility, showStockItemInMenu } from "@/app/actions/inventory-item-menu-visibility";
import { FinancePosModal } from "@/components/finance/finance-pos-locale";
import type { InventoryItem, InventorySnapshot } from "@/lib/erp/inventory";
import styles from "./item-menu-links.module.css";

type State = Extract<Awaited<ReturnType<typeof readStockItemMenuState>>, { ok: true }>;

// Owner opt-in per stock item: show it in the menu and the cashier as a sellable product, or hide it again.
// Stock items stay out of the menu unless this is switched on.
export function ItemMenuVisibility({ snapshot, item, onClose, onLinked }: {
  snapshot: InventorySnapshot; item: InventoryItem; onClose: () => void;
  /** Called once after the first activation so the item remembers its menu product. */
  onLinked: (productId: string) => void;
}) {
  const hint = typeof item.meta.payload.menuProductId === "string" ? item.meta.payload.menuProductId : undefined;
  const units = (snapshot.catalogs.find(catalog => catalog.id === item.meta.unit_template_id)?.payload.units ?? []) as { name: string; factor: number }[];
  const saleUnit = units.find(unit => unit.name === item.meta.payload.saleUnitName);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [price, setPrice] = useState(String(Number(item.meta.payload.salePrice ?? 0)));
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState(String(saleUnit?.factor ?? 1));
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false), active = useRef(true), request = useRef({ body: "", id: "" });

  useEffect(() => {
    let current = true;
    active.current = true;
    readStockItemMenuState(snapshot.slug, item.id, hint).then(result => {
      if (!current) return;
      if (result.ok) setState(result); else setError(result.message);
    }).catch(() => { if (current) setError("تعذر تحميل حالة ظهور الصنف في المنيو أعد المحاولة"); });
    return () => { current = false; active.current = false; };
  }, [snapshot.slug, item.id, hint, retry]);

  function mark(value: boolean) { lock.current = value; setBusy(value); }

  async function show() {
    if (lock.current) return;
    setIssue(""); setNotice("");
    const input = { itemId: item.id, productHint: hint, price: Number(price), categoryId, quantity: Number(quantity) };
    if (!(input.price >= 0) || price.trim() === "") { setIssue("أدخل سعر البيع في المنيو"); return; }
    if (!(input.quantity > 0)) { setIssue("أدخل الكمية المخصومة من المخزون لكل بيعة"); return; }
    const body = JSON.stringify(input);
    if (request.current.body !== body) request.current = { body, id: crypto.randomUUID() };
    mark(true);
    try {
      const result = await showStockItemInMenu(snapshot.slug, input, request.current.id);
      if (!active.current) return;
      if (!result.ok) { setIssue(result.message); return; }
      onLinked(result.productId);
    } catch { if (active.current) setIssue("تعذر تأكيد العملية أعد المحاولة بنفس البيانات لمنع التكرار"); }
    finally { if (active.current) mark(false); }
  }

  async function toggle(available: boolean) {
    if (lock.current || !state?.product) return;
    setIssue(""); setNotice("");
    mark(true);
    try {
      const result = await setStockItemMenuVisibility(snapshot.slug, item.id, state.product.id, available);
      if (!active.current) return;
      if (!result.ok) { setIssue(result.message); return; }
      setState({ ...state, product: { ...state.product, available } });
      setNotice(available ? "الصنف ظاهر الآن في المنيو وصفحة الكاشير" : "تم إخفاء الصنف من المنيو وصفحة الكاشير");
    } catch { if (active.current) setIssue("تعذر تأكيد العملية أعد المحاولة"); }
    finally { if (active.current) mark(false); }
  }

  const product = state?.product;
  return <FinancePosModal open title={`إظهار ${item.name} في المنيو`} onClose={() => { if (!lock.current) onClose(); }} panelClassName={styles.panel}>
    <div className={styles.body} aria-busy={busy || (!state && !error)}>
      {error ? <div className={styles.empty}><p role="alert">{error}</p><button type="button" className={styles.button} onClick={() => { setError(""); setRetry(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />إعادة المحاولة</button></div>
        : !state ? <p role="status" className={styles.empty}>جار تحميل حالة الصنف في المنيو</p> : <>
          <div className={styles.heading}><Store size={24} aria-hidden="true" /><div><h3>بيع الصنف المخزني مباشرة</h3><p>الأصناف المخزنية لا تظهر للعميل إلا إذا فعلت هذا الخيار وعند تفعيله يظهر الصنف في المنيو وصفحة الكاشير وكل بيعة تخصم من رصيده</p></div></div>
          {notice && <p className={styles.success} role="status">{notice}</p>}
          {issue && <p className={styles.error} role="alert">{issue}</p>}
          {product ? <>
            <div className={styles.row} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
              <p className={styles.hint}><strong>{product.available ? "ظاهر في المنيو وصفحة الكاشير" : "مخفي من المنيو وصفحة الكاشير"}</strong></p>
              <p className={styles.hint}>سعر البيع <bdi dir="ltr">{product.price}</bdi> ر س وكل بيعة تخصم <bdi dir="ltr">{product.quantity}</bdi> {item.unit} من المخزون</p>
              <p className={styles.hint}>تعديل السعر والصورة والتصنيف من تبويب المنيو وتعديل الكمية المخصومة من ربط بمنتجات المنيو</p>
            </div>
            <footer className={styles.footer}>
              <button type="button" className={styles.button} disabled={busy} onClick={onClose}>إغلاق</button>
              <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => void toggle(!product.available)}>{product.available ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{busy ? "جار الحفظ" : product.available ? "إخفاء من المنيو" : "إظهار في المنيو"}</button>
            </footer>
          </> : <>
            <fieldset className={styles.rows} disabled={busy}>
              <div className={styles.row} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
                <label className={styles.field}><span>سعر البيع في المنيو ر س</span><input type="number" inputMode="decimal" min="0" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} /></label>
                <label className={styles.field}><span>الكمية المخصومة لكل بيعة {item.unit}</span><input type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" required value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
                <label className={styles.field}><span>تصنيف المنيو</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">بدون تصنيف</option>{state.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              </div>
            </fieldset>
            <p className={styles.hint}>{saleUnit ? `وحدة البيع المحددة للصنف ${saleUnit.name} وتساوي ${saleUnit.factor} ${item.unit}` : `كل بيعة تخصم الكمية المحددة بوحدة ${item.unit}`}{state.branchName ? ` ويضاف المنتج إلى منيو فرع ${state.branchName}` : ""}</p>
            <footer className={styles.footer}>
              <button type="button" className={styles.button} disabled={busy} onClick={onClose}>إلغاء</button>
              <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => void show()}><Eye size={16} aria-hidden="true" />{busy ? "جار الحفظ" : "إظهار في المنيو"}</button>
            </footer>
          </>}
        </>}
    </div>
  </FinancePosModal>;
}
