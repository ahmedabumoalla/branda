"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { loadInventoryItemMenuLinks } from "@/app/actions/inventory-item-menu-links";
import { saveFinanceInventoryItemAction } from "@/app/actions/finance-inventory-catalog";
import { FinancePosModal } from "@/components/finance/finance-pos-locale";
import type { FinanceItem } from "@/lib/finance/brand-finance";
import { inventoryItemInputSchema, type FinanceInventoryUnit } from "@/lib/finance/inventory-catalog";
import styles from "./item-menu-links.module.css";

type Props = { slug: string; itemId: string; itemName: string; onClose: () => void };
type Loaded = { item: FinanceItem; units: FinanceInventoryUnit[]; products: { id: string; name: string }[]; canWrite: boolean; slug: string };
type Row = { key: number; productId: string; quantity: string };
type Result = Awaited<ReturnType<typeof loadInventoryItemMenuLinks>>;

// Session memory for this browser tab only: the dialog reopens at once from the last read while the
// server read runs again in the background, and saving stays locked until that fresh read arrives.
const pending = new Map<string, Promise<Result>>();
const remembered = new Map<string, Loaded>();
const keyOf = (slug: string, itemId: string) => `${slug}:${itemId}`;
function requestItemMenuLinks(slug: string, itemId: string) {
  const key = keyOf(slug, itemId);
  const running = pending.get(key);
  if (running) return running;
  const promise = loadInventoryItemMenuLinks(slug, itemId).then(result => {
    if (result.ok) remembered.set(key, { item: result.item, units: result.units, products: result.products, canWrite: result.canWrite, slug: result.slug });
    return result;
  }).finally(() => { pending.delete(key); });
  pending.set(key, promise);
  return promise;
}
/** Starts the read when the pointer or focus reaches the link button, before the click. */
export function prewarmItemMenuLinks(slug: string, itemId: string) {
  void requestItemMenuLinks(slug, itemId).catch(() => undefined);
}

function toRows(item: FinanceItem): Row[] {
  return (item.product_links ?? (item.menu_product_id ? [{ product_id: item.menu_product_id, quantity: 1 }] : []))
    .map((link, key) => ({ key, productId: link.product_id, quantity: String(link.quantity) }));
}

const fieldLabels: Record<string, string> = {
  id: "معرف الصنف", name: "اسم الصنف", sku: "الرمز الداخلي", unitId: "وحدة القياس", barcode: "باركود الصنف",
  imagePath: "صورة الصنف", minQuantity: "حد تنبيه المخزون", costMode: "طريقة احتساب التكلفة",
};

// Links one stock item to the menu products that consume it. The stock item never appears on the customer menu:
// the link only deducts the quantity and carries its cost when the menu product is sold.
export function ItemMenuLinks({ slug, itemId, itemName, onClose }: Props) {
  const key = keyOf(slug, itemId);
  const [loaded, setLoaded] = useState<Loaded | null>(() => remembered.get(key) ?? null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<Row[]>(() => { const known = remembered.get(key); return known ? toRows(known.item) : []; });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [issue, setIssue] = useState("");
  const lock = useRef(false);
  const active = useRef(true);
  const touched = useRef(false);
  const request = useRef({ fingerprint: "", id: "" });

  useEffect(() => {
    let current = true;
    active.current = true;
    requestItemMenuLinks(slug, itemId).then(result => {
      if (!current) return;
      if (!result.ok) { setError(result.message); return; }
      setLoaded({ item: result.item, units: result.units, products: result.products, canWrite: result.canWrite, slug: result.slug });
      // Keep rows the user already changed while the background read was running.
      if (!touched.current) setRows(toRows(result.item));
      setFresh(true);
    }).catch(() => { if (current) setError("تعذر تحميل روابط المنيو أعد المحاولة"); });
    return () => { current = false; active.current = false; };
  }, [slug, itemId, retry]);

  function markBusy(value: boolean) { lock.current = value; setBusy(value); }
  function change(update: (list: Row[]) => Row[]) { touched.current = true; setRows(update); setNotice(""); }

  async function save() {
    if (!loaded || !fresh || lock.current) return;
    const { item, units } = loaded;
    setIssue(""); setNotice("");
    if (rows.some(row => !row.productId || !(Number(row.quantity) > 0))) { setIssue("اختر منتجا لكل سطر وأدخل كمية استهلاك أكبر من صفر"); return; }
    const unitId = units.find(unit => unit.id === item.unit_id)?.id ?? units.find(unit => unit.name === item.unit)?.id ?? item.unit_id ?? "";
    if (!unitId) { setIssue("حدد وحدة قياس الصنف من تعديل الصنف ثم أعد الربط"); return; }
    const payload = {
      id: item.id, name: item.name.trim(), sku: (item.sku ?? "").trim(), unitId, barcode: (item.barcode ?? "").trim(),
      imagePath: item.image_path ?? null, minQuantity: Number(item.min_quantity ?? 0), costMode: item.cost_mode ?? "full",
      productLinks: rows.map(row => ({ productId: row.productId, quantity: Number(row.quantity) })),
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const input = inventoryItemInputSchema.safeParse({ requestId: request.current.id, payload });
    if (!input.success) {
      // Name the exact field so a stored value that the shared item rules reject is visible, not hidden.
      const first = input.error.issues[0];
      const field = String(first?.path[1] ?? "");
      if (first?.message.includes("استخدم") || first?.message.includes("لا تكرر")) setIssue(first.message);
      else if (field === "productLinks") setIssue(first?.path[3] === "productId" ? `معرف المنتج في السطر ${Number(first.path[2]) + 1} غير مقبول في قواعد حفظ الصنف` : `راجع كمية الاستهلاك في السطر ${Number(first?.path[2] ?? 0) + 1}`);
      else setIssue(`تعذر الحفظ لأن حقل ${fieldLabels[field] ?? field} المحفوظ للصنف غير مقبول عدله من تعديل الصنف ثم أعد الربط`);
      return;
    }
    markBusy(true);
    try {
      const result = await saveFinanceInventoryItemAction(input.data, loaded.slug);
      if (!active.current) return;
      if (!result.ok) { setIssue(result.message); return; }
      const next = { ...loaded, item: result.item, units: result.units };
      remembered.set(key, next);
      setLoaded(next);
      touched.current = false;
      setRows(toRows(result.item));
      setNotice("تم حفظ ربط الصنف بمنتجات المنيو");
    } catch { if (active.current) setIssue("تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات لمنع التكرار"); }
    finally { if (active.current) markBusy(false); }
  }

  const item = loaded?.item;
  const linkedCount = rows.filter(row => row.productId).length;
  const costOf = (quantity: string) => item ? item.average_cost * Number(quantity) / (item.cost_mode === "equal_split" ? Math.max(1, linkedCount) : 1) : 0;

  return <FinancePosModal open title={`ربط ${itemName} بمنتجات المنيو`} onClose={() => { if (!lock.current) onClose(); }} panelClassName={styles.panel}>
    <div className={styles.body} aria-busy={busy || (!loaded && !error)}>
      {error && !loaded ? <div className={styles.empty}><p role="alert">{error}</p><button type="button" className={styles.button} onClick={() => { setError(""); setRetry(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />إعادة المحاولة</button></div>
        : !loaded || !item ? <p role="status" className={styles.empty}>جار تحميل روابط المنيو</p> : <>
          <div className={styles.heading}><Link2 size={24} aria-hidden="true" /><div><h3>منتجات المنيو التي تستهلك هذا الصنف</h3><p>عند بيع المنتج تخصم الكمية المحددة من هذا الصنف وتحسب تكلفتها ضمن تكلفة المنتج والصنف المخزني لا يظهر للعميل في المنيو</p></div></div>
          {notice && <p className={styles.success} role="status">{notice}</p>}
          {issue && <p className={styles.error} role="alert">{issue}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <fieldset className={styles.rows} disabled={busy || !loaded.canWrite}>
            {rows.length === 0 && <p className={styles.empty}>لا توجد منتجات مرتبطة بهذا الصنف</p>}
            {rows.map((row, index) => <div className={styles.row} key={row.key}>
              <label className={styles.field}><span>المنتج {index + 1}</span>
                <select required value={row.productId} onChange={event => change(list => list.map(other => other.key === row.key ? { ...other, productId: event.target.value } : other))}>
                  <option value="">اختر منتجا من المنيو</option>
                  {loaded.products.filter(product => product.id === row.productId || !rows.some(other => other.productId === product.id)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                  {row.productId && !loaded.products.some(product => product.id === row.productId) && <option value={row.productId}>منتج مرتبط غير متاح حاليا</option>}
                </select>
              </label>
              <label className={styles.field}><span>الاستهلاك لكل منتج {item.unit}</span>
                <input type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" required value={row.quantity} onChange={event => change(list => list.map(other => other.key === row.key ? { ...other, quantity: event.target.value } : other))} />
              </label>
              <button type="button" className={styles.remove} onClick={() => change(list => list.filter(other => other.key !== row.key))} aria-label={`إزالة ربط المنتج ${index + 1}`}><Trash2 size={17} aria-hidden="true" /></button>
              {item.cost_known && row.productId && Number(row.quantity) > 0 && <p className={styles.cost}>تكلفة هذا الصنف ضمن المنتج <bdi dir="ltr">{costOf(row.quantity).toFixed(2)}</bdi> ر س</p>}
            </div>)}
            <button type="button" className={styles.button} disabled={rows.length >= 200} onClick={() => change(list => [...list, { key: Math.max(-1, ...list.map(row => row.key)) + 1, productId: "", quantity: "1" }])}><Plus size={16} aria-hidden="true" />ربط منتج</button>
          </fieldset>
          {!item.cost_known && <p className={styles.hint}>تتحدد التكلفة بعد إدخال مشتريات بتكلفة موثقة</p>}
          {!loaded.canWrite && <p className={styles.hint}>تعديل الربط يحتاج صلاحية إدارة المخزون</p>}
          <footer className={styles.footer}>
            <button type="button" className={styles.button} disabled={busy} onClick={onClose}>إغلاق</button>
            {loaded.canWrite && <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || !fresh} onClick={() => void save()}>{busy ? "جار الحفظ" : fresh ? "حفظ الربط" : "جار تحديث البيانات"}</button>}
          </footer>
        </>}
    </div>
  </FinancePosModal>;
}
