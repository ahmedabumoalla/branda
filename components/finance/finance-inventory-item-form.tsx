"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ImagePlus, PackagePlus, Plus, Trash2, Upload } from "lucide-react";
import { uploadInventoryImage, type InventoryUploadProgress } from "@/lib/finance/inventory-image-upload";
import { saveFinanceInventoryItemAction, saveFinanceInventoryUnitAction } from "@/app/actions/finance-inventory-catalog";
import type { FinanceItem, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { INVENTORY_IMAGE_MAX_BYTES, inventoryImageUrl, inventoryItemInputSchema, type FinanceInventoryUnit } from "@/lib/finance/inventory-catalog";
import { canFinance } from "@/lib/finance/permissions";
import { Field } from "./finance-ui";
import { FinanceInventoryBarcodeScanner } from "./finance-inventory-barcode-scanner";
import { FinanceInventoryBarcode } from "./finance-inventory-barcode";
import shared from "./finance.module.css";
import styles from "./finance-inventory-item-form.module.css";

export type InventorySaved = (item: FinanceItem, units: FinanceInventoryUnit[]) => void;
export function FinanceInventoryItemForm({ snapshot, item, onSaved, onCancel, onBusyChange, onUnitsChanged }: {
  snapshot: FinanceSnapshot; item?: FinanceItem; onSaved: InventorySaved; onCancel: () => void; onBusyChange?: (busy: boolean) => void; onUnitsChanged?: (units: FinanceInventoryUnit[]) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [units, setUnits] = useState(snapshot.units ?? []);
  const [unitId, setUnitId] = useState(item?.unit_id ?? snapshot.units?.find(unit => unit.name === item?.unit)?.id ?? snapshot.units?.[0]?.id ?? "");
  const [newUnit, setNewUnit] = useState("");
  const [unitOpen, setUnitOpen] = useState(false);
  const [barcode, setBarcode] = useState(item?.barcode ?? "");
  const [camera, setCamera] = useState(false);
  const [minQuantity, setMinQuantity] = useState(String(item?.min_quantity ?? 0));
  const [imagePath, setImagePath] = useState(item?.image_path ?? null);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? (item?.image_path ? inventoryImageUrl(item.image_path, snapshot.cafe.slug) : ""));
  const [costMode, setCostMode] = useState<"equal_split" | "full">(item?.cost_mode ?? "full");
  const [links, setLinks] = useState(() => (item?.product_links ?? (item?.menu_product_id ? [{ product_id: item.menu_product_id, quantity: 1 }] : [])).map((link, key) => ({ key, productId: link.product_id, quantity: String(link.quantity) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef({ fingerprint: "", id: "" });
  const unitRequest = useRef({ name: "", id: "" });
  const active = useRef(true);
  const lock = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [imageProgress, setImageProgress] = useState<InventoryUploadProgress | null>(null);
  const [imageState, setImageState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [imageName, setImageName] = useState("");
  useEffect(() => { active.current = true; return () => { active.current = false; upload.current?.abort(); }; }, []);
  function markBusy(value: boolean) { lock.current = value; setBusy(value); onBusyChange?.(value); }
  async function addUnit() {
    if (lock.current || !newUnit.trim()) return;
    const value = newUnit.trim();
    if (unitRequest.current.name !== value) unitRequest.current = { name: value, id: crypto.randomUUID() };
    markBusy(true); setError("");
    try {
      const result = await saveFinanceInventoryUnitAction({ requestId: unitRequest.current.id, name: value }, snapshot.cafe.slug);
      if (!active.current) return;
      if (!result.ok) { setError(result.message); return; }
      const updatedUnits = [...units.filter(unit => unit.id !== result.unit.id), result.unit];
      setUnits(updatedUnits); onUnitsChanged?.(updatedUnits);
      setUnitId(result.unit.id); setUnitOpen(false); setNewUnit(""); setStatus("تمت إضافة وحدة القياس");
    } catch { if (active.current) setError("تعذر تأكيد حفظ الوحدة أعد المحاولة بنفس الاسم"); }
    finally { if (active.current) markBusy(false); }
  }
  async function uploadImage(file?: File) {
    if (!file || lock.current) return;
    setError(""); setStatus("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > INVENTORY_IMAGE_MAX_BYTES) { setImageState("error"); setError("اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 3 ميجابايت"); return; }
    setImageState("uploading"); setImageName(file.name); setImageProgress({ percent: 0, processing: false });
    const controller = new AbortController(); upload.current = controller; markBusy(true);
    try {
      const result = await uploadInventoryImage(`/api/finance/${encodeURIComponent(snapshot.cafe.slug)}/inventory-image`, file, controller.signal, progress => { if (active.current) setImageProgress(progress); });
      if (active.current) { setImagePath(result.path); setImageUrl(result.url); setImageState("success"); setImageProgress(null); }
    } catch { if (active.current && !controller.signal.aborted) { setImageState("error"); setImageProgress(null); setError("تعذر رفع الصورة حاول مرة أخرى"); } }
    finally { if (active.current) markBusy(false); }
  }
  if (!canFinance(snapshot.role, "inventory_write")) return <p className={shared.notice}>تعديل الأصناف يحتاج صلاحية إدارة المخزون</p>;
  return <form className={styles.editor} onSubmit={async event => {
    event.preventDefault();
    if (lock.current) return;
    setError(""); setStatus(""); setCamera(false);
    const payload = { ...(item ? { id: item.id } : {}), name: name.trim(), sku: sku.trim(), unitId, barcode: barcode.trim(), imagePath, minQuantity: minQuantity === "" ? NaN : Number(minQuantity), costMode, productLinks: links.map(link => ({ productId: link.productId, quantity: Number(link.quantity) })) };
    const fingerprint = JSON.stringify(payload);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const input = inventoryItemInputSchema.safeParse({ requestId: request.current.id, payload });
    if (!input.success) { setError(input.error.issues[0]?.message.includes("استخدم") ? input.error.issues[0].message : "راجع اسم الصنف ووحدة القياس والباركود وكميات استهلاك المنتجات"); return; }
    markBusy(true);
    try {
      const result = await saveFinanceInventoryItemAction(input.data, snapshot.cafe.slug);
      if (!active.current) return;
      if (!result.ok) { setError(result.message); return; }
      markBusy(false); onSaved(result.item, result.units);
    } catch { if (active.current) setError("تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات لمنع التكرار"); }
    finally { if (active.current && lock.current) markBusy(false); }
  }}>
    <div className={styles.hero}><PackagePlus size={28} aria-hidden="true" /><div><h3>{item ? "بيانات الصنف المخزني" : "صنف واحد ومخزون واضح"}</h3><p>عرّف الوحدة والباركود ثم اربط المنتجات بكميات استهلاكها الفعلية</p></div></div>
    {error && <p className={shared.error} role="alert">{error}</p>}
    {status && <p className={styles.hint} role="status">{status}</p>}
    <fieldset disabled={busy} className={styles.fieldset}>
      <section className={styles.section}><h3>هوية الصنف</h3><div className={styles.grid}>
        <Field label="اسم الصنف"><input name="name" required maxLength={150} value={name} onChange={event => setName(event.target.value)} /></Field>
        <Field label="رمز داخلي اختياري"><input name="sku" dir="ltr" maxLength={60} value={sku} onChange={event => setSku(event.target.value)} /></Field>
        <div className={styles.unit}><Field label="وحدة القياس"><select name="unitId" required value={unitId} onChange={event => setUnitId(event.target.value)}><option value="">اختر الوحدة</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field><button type="button" className={shared.secondary} aria-expanded={unitOpen} onClick={() => setUnitOpen(!unitOpen)}><Plus size={15} />إضافة وحدة قياس</button>
          {unitOpen && <div className={styles.inline}><input aria-label="اسم وحدة القياس الجديدة" maxLength={30} value={newUnit} onChange={event => setNewUnit(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void addUnit(); } }} placeholder="مثل كيلو أو لتر أو حبة" /><button type="button" className={shared.secondary} disabled={!newUnit.trim()} onClick={() => void addUnit()}>حفظ الوحدة</button></div>}
        </div>
        <Field label="حد تنبيه المخزون"><input name="minQuantity" type="number" min="0" max="99999999" step="0.001" required value={minQuantity} onChange={event => setMinQuantity(event.target.value)} /></Field>
        <div className={styles.wide}><Field label="باركود الصنف" hint="أدخل الرمز أو امسحه بالقارئ واتركه فارغًا لتوليد باركود فريد من 6 أرقام عند الحفظ"><input name="barcode" dir="ltr" autoComplete="off" maxLength={64} value={barcode} onChange={event => setBarcode(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setStatus("تم إدخال الباركود راجع البيانات ثم احفظ الصنف"); } }} /></Field><button type="button" className={shared.secondary} onClick={() => setCamera(!camera)} aria-expanded={camera}><Camera size={17} />قراءة بالكاميرا</button></div>
      </div>
      {camera && <FinanceInventoryBarcodeScanner onClose={() => setCamera(false)} onDetected={value => { setBarcode(value); setCamera(false); setStatus("تمت قراءة الباركود"); }} />}
      {item?.barcode && <FinanceInventoryBarcode value={item.barcode} name={item.name} />}
      <div className={styles.imageRow} data-state={imageState} aria-busy={imageState === "uploading"}>
        <div className={styles.imagePreview}>
          {imageState === "uploading" ? <div className={styles.uploadMeter} role="progressbar" aria-label="رفع صورة الصنف" aria-valuemin={0} aria-valuemax={100} aria-valuenow={imageProgress?.percent ?? undefined} aria-valuetext={imageProgress?.processing ? "اكتمل نقل الصورة وجارٍ تجهيزها" : undefined}>
            <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" className={styles.meterTrack} /><circle cx="40" cy="40" r="34" pathLength="100" className={styles.meterFill} strokeDasharray="100" strokeDashoffset={100 - (imageProgress?.percent ?? 0)} /></svg>
            <bdi dir="ltr">{imageProgress?.percent == null ? "…" : `${imageProgress.percent}%`}</bdi>
          </div> : imageUrl ? <Image unoptimized src={imageUrl} className={styles.image} alt="صورة الصنف" width={78} height={78} /> : <span className={styles.imagePlaceholder}><ImagePlus size={25} aria-hidden="true" /></span>}
          {imageState === "success" && <span className={styles.imageSuccess} aria-hidden="true"><Check size={14} /></span>}
        </div>
        <div className={styles.upload}>
          <div className={styles.uploadHeading}>صورة الصنف <span>اختياري</span></div>
          <input ref={imageInput} hidden type="file" aria-label="اختيار صورة الصنف" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void uploadImage(file); }} />
          <div className={styles.uploadActions}><button type="button" className={styles.uploadButton} disabled={busy} onClick={() => imageInput.current?.click()}><Upload size={17} aria-hidden="true" />{imageState === "uploading" ? "جارٍ رفع الصورة" : imageState === "error" ? "إعادة اختيار الصورة" : imagePath ? "تغيير الصورة" : "رفع صورة الصنف"}</button>
          {imagePath && <button type="button" className={styles.removeImage} aria-label="إزالة صورة الصنف" onClick={() => { setImagePath(null); setImageUrl(""); setImageState("idle"); setImageName(""); }}><Trash2 size={17} aria-hidden="true" /></button>}</div>
          <small className={styles.uploadStatus} role="status">{imageState === "uploading" ? imageProgress?.processing ? "جارٍ تجهيز الصورة وحفظها" : "جارٍ نقل الصورة" : imageState === "success" ? "تم الرفع بنجاح احفظ الصنف لاعتماد الصورة" : imageState === "error" ? "لم ترفع الصورة اختر صورة سليمة وحاول مجددًا" : "JPG أو PNG أو WebP حتى 3 ميجابايت"}</small>
          {imageName && <span className={styles.imageName} dir="auto" title={imageName}>{imageName}</span>}
        </div>
      </div>
      </section>
      <section className={styles.section}><h3>استهلاك منتجات المنيو</h3><p>كل وحدة مباعة من المنتج تخصم الكمية المحددة من هذا الصنف بوحدته المخزنية</p>
        <div className={styles.linkRows}>{links.map((link, index) => <div className={styles.linkRow} key={link.key}><Field label={`المنتج ${index + 1}`}><select required value={link.productId} onChange={event => setLinks(links.map(row => row.key === link.key ? { ...row, productId: event.target.value } : row))}><option value="">اختر المنتج</option>{snapshot.products.filter(product => product.id === link.productId || !links.some(row => row.productId === product.id)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}{link.productId && !snapshot.products.some(product => product.id === link.productId) && <option value={link.productId}>منتج مرتبط غير متاح حاليًا</option>}</select></Field><Field label={`الاستهلاك ${units.find(unit => unit.id === unitId)?.name ?? ""}`}><input aria-label={`كمية استهلاك المنتج ${index + 1}`} type="number" min="0.001" max="1000000" step="0.001" required value={link.quantity} onChange={event => setLinks(links.map(row => row.key === link.key ? { ...row, quantity: event.target.value } : row))} /></Field><button type="button" className={shared.iconButton} aria-label={`إزالة ربط المنتج ${index + 1}`} onClick={() => setLinks(links.filter(row => row.key !== link.key))}><Trash2 size={16} /></button></div>)}</div>
        <button type="button" className={shared.secondary} disabled={links.length >= 200} onClick={() => setLinks([...links, { key: Math.max(-1, ...links.map(link => link.key)) + 1, productId: "", quantity: "1" }])}><Plus size={16} />ربط منتج</button>
        <div className={styles.choice} role="group" aria-label="احتساب التكلفة التحليلية"><label><input type="radio" name="costMode" checked={costMode === "full"} onChange={() => setCostMode("full")} />كامل تكلفة الاستهلاك لكل منتج</label><label><input type="radio" name="costMode" checked={costMode === "equal_split"} onChange={() => setCostMode("equal_split")} />تقسيم التكلفة بالتساوي</label></div>
        <p className={styles.hint}>{costMode === "equal_split" ? "تكلفة الوحدة × كمية الاستهلاك ÷ عدد المنتجات المرتبطة" : "تكلفة الوحدة × كمية استهلاك المنتج"} — توزيع تحليلي للتكلفة ولا يغيّر قيمة المخزون المستهلك</p>
        {!item?.cost_known ? <p className={styles.hint}>تتحدد التكلفة بعد إدخال مشتريات بتكلفة موثقة</p> : links.filter(link => link.productId && Number(link.quantity) > 0).map(link => <p className={styles.hint} key={link.key}>{snapshot.products.find(product => product.id === link.productId)?.name ?? "المنتج المرتبط"} — مساهمة هذا الصنف في التكلفة التحليلية <bdi dir="ltr">{(item.average_cost * Number(link.quantity) / (costMode === "equal_split" ? Math.max(1, links.filter(row => row.productId).length) : 1)).toFixed(2)}</bdi> ر س</p>)}
      </section>
    </fieldset>
    <footer className={styles.footer}><button type="button" className={shared.secondary} disabled={busy} onClick={onCancel}>إلغاء</button><button type="submit" className={shared.primary} disabled={busy}>{busy ? "جارٍ الحفظ" : "حفظ الصنف"}</button></footer>
  </form>;
}
