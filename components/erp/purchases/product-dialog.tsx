'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Barcode, Camera, ImagePlus, PackagePlus, Plus, RefreshCw, Save, Trash2, TrendingUp, Warehouse, Layers3, LoaderCircle } from 'lucide-react';
import { Modal } from '@/components/dashboard/ui/modal';
import { FinanceInventoryBarcodeScanner } from '@/components/finance/finance-inventory-barcode-scanner';
import { uploadInventoryImage } from '@/lib/finance/inventory-image-upload';
import { INVENTORY_IMAGE_MAX_BYTES } from '@/lib/finance/inventory-catalog';
import type { FinanceSnapshot } from '@/lib/finance/brand-finance';
import { purchaseProductSchema, saleFromMargin, marginFromSale, productBarcode, type PurchaseProductInput, type PurchaseProductSaved } from '@/lib/erp/purchase-product';
import { savePurchaseProduct } from '@/app/actions/purchase-product';
import s from './product-dialog.module.css';

export function PurchaseProductDialog({ snapshot, categories, sellers, shiftId, onClose, onSaved }: {
  snapshot: FinanceSnapshot; categories: { id: string; name: string }[]; sellers: string[];
  shiftId?: string; onClose: () => void; onSaved: (product: PurchaseProductSaved) => void;
}) {
  const [draft, setDraft] = useState<PurchaseProductInput>(() => purchaseProductSchema.parse({}));
  const [camera, setCamera] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState(''), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0);
  const retry = useRef({ body: '', id: '' }), lock = useRef(false), barcodeInput = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const active = useRef(true), ids = useId();
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  const patch = (change: Partial<PurchaseProductInput>) => setDraft(v => ({ ...v, ...change }));
  function pricing(change: Partial<PurchaseProductInput>, fromSale = false) {
    setDraft(v => { const next = { ...v, ...change }; return fromSale ? { ...next, margin: marginFromSale(next.buyPrice, next.salePrice, next.marginType) } : { ...next, salePrice: saleFromMargin(next.buyPrice, next.margin, next.marginType) }; });
  }
  async function upload(file?: File) {
    if (!file || lock.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > INVENTORY_IMAGE_MAX_BYTES) { setError('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 3 ميجابايت'); return; }
    lock.current = true; setUploading(true); setError(''); setProgress(0);
    const abort = new AbortController(); controller.current = abort;
    try {
      const endpoint = `/api/finance/${encodeURIComponent(snapshot.cafe.slug)}/inventory-image${shiftId ? `?shiftId=${encodeURIComponent(shiftId)}` : ''}`;
      const result = await uploadInventoryImage(endpoint, file, abort.signal, p => { if (active.current) setProgress(p.percent ?? 0); });
      if (active.current) { patch({ imagePath: result.path }); setImageUrl(result.url); }
    } catch { if (active.current) setError('تعذر رفع الصورة أعد المحاولة'); }
    finally { lock.current = false; if (active.current) setUploading(false); }
  }
  async function save() {
    if (lock.current) return;
    const parsed = purchaseProductSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'راجع البيانات'); return; }
    const body = JSON.stringify(parsed.data);
    if (retry.current.body !== body) retry.current = { body, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setCamera(false); setError('');
    try {
      const result = await savePurchaseProduct(snapshot.cafe.slug, parsed.data, retry.current.id, shiftId);
      if (!active.current) return;
      if (!result.ok) { setError(result.message); return; }
      onSaved(result.data);
    } catch { if (active.current) setError('تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const profit = Math.round((draft.salePrice - draft.buyPrice) * 100) / 100;
  return createPortal(<Modal open title="إضافة منتج" onClose={() => { if (!lock.current) onClose(); }} panelClassName={s.modal}>
    <form className={s.form} onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className={s.intro}><span className={s.productIcon}><PackagePlus /></span><div><h3>منتجك يبدأ من هنا</h3><p>احفظه في المنتجات والمخزون وأضفه إلى الفاتورة مباشرة</p></div><span className={s.optional}>جميع الحقول اختيارية</span></div>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <fieldset disabled={busy || uploading} className={s.fields}>
        <section className={s.section}><header><PackagePlus /><h3>هوية المنتج</h3></header><div className={s.identity}>
          <label className={s.name}>اسم الصنف<input autoFocus maxLength={150} placeholder="مثل كيك التمر أو قهوة مختصة" value={draft.name} onChange={e => patch({ name: e.target.value })} /></label>
          <label>التصنيف<input list={`${ids}-categories`} placeholder="اختر أو اكتب تصنيفًا" maxLength={150} value={draft.category} onChange={e => patch({ category: e.target.value })} /><datalist id={`${ids}-categories`}>{categories.map(c => <option key={c.id} value={c.name} />)}</datalist></label>
          <label>الماركة<input maxLength={150} placeholder={draft.sellerKind === 'family' ? 'تستخدم تسمية الأسرة المنتجة' : 'اسم العلامة التجارية'} value={draft.sellerKind === 'family' ? draft.seller : draft.brand} readOnly={draft.sellerKind === 'family'} onChange={e => patch({ brand: e.target.value })} /></label>
          <label>نوع البائع<select value={draft.sellerKind} onChange={e => patch({ sellerKind: e.target.value as PurchaseProductInput['sellerKind'] })}><option value="supplier">مورد أو بائع</option><option value="family">أسرة منتجة</option></select></label>
          <label>{draft.sellerKind === 'family' ? 'اسم الأسرة المنتجة' : 'اسم البائع'}<input list={draft.sellerKind === 'supplier' ? `${ids}-sellers` : undefined} maxLength={150} placeholder={draft.sellerKind === 'family' ? 'يصبح علامة تجارية لهذا الصنف' : 'اختر أو اكتب اسم البائع'} value={draft.seller} onChange={e => patch({ seller: e.target.value })} /><datalist id={`${ids}-sellers`}>{sellers.map((seller, i) => <option key={i} value={seller} />)}</datalist></label>
          <label>النكهة<input maxLength={100} placeholder="مثل الفانيلا أو الشوكولاتة" value={draft.flavor} onChange={e => patch({ flavor: e.target.value })} /></label>
          <label>وحدة القياس<select value={draft.unitId} onChange={e => patch({ unitId: e.target.value })}><option value="">وحدة افتراضية</option>{snapshot.units?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div></section>
        <section className={s.barcodeSection}><header><Barcode /><h3>باركود المنتج</h3><span>كتابة أو قارئ أو كاميرا</span></header><div className={s.barcodeRow}><label className={s.barcodeInput}><span className={s.srOnly}>باركود المنتج</span><input ref={barcodeInput} dir="ltr" autoComplete="off" maxLength={64} placeholder="امسح الباركود أو اكتبه هنا" value={draft.barcode} onChange={e => patch({ barcode: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} /></label><button type="button" onClick={() => barcodeInput.current?.focus()}><Barcode /> قارئ الباركود</button><button type="button" aria-expanded={camera} onClick={() => setCamera(v => !v)}><Camera /> الكاميرا</button><button type="button" onClick={() => patch({ barcode: productBarcode() })}><RefreshCw /> توليد باركود</button></div>{camera && <FinanceInventoryBarcodeScanner onClose={() => setCamera(false)} onDetected={barcode => { patch({ barcode }); setCamera(false); barcodeInput.current?.focus(); }} />}</section>
        <section className={s.section}><header><TrendingUp /><h3>التكلفة والتسعير</h3><span>الأسعار بالريال</span></header><div className={s.pricing}>
          <label>سعر الشراء<input type="number" min="0" max="99999999" step=".01" value={draft.buyPrice || ''} placeholder="0.00" onChange={e => pricing({ buyPrice: Number(e.target.value) })} /></label>
          <label>هامش الربح<div className={s.margin}><input aria-label="قيمة هامش الربح" type="number" min="0" max="99999999" step=".01" value={draft.margin || ''} placeholder="0" onChange={e => pricing({ margin: Number(e.target.value) })} /><select aria-label="نوع هامش الربح" value={draft.marginType} onChange={e => pricing({ marginType: e.target.value as 'amount' | 'percent' })}><option value="percent">نسبة %</option><option value="amount">مبلغ ر س</option></select></div></label>
          <label className={s.sale}>سعر البيع<input type="number" min="0" max="99999999" step=".01" value={draft.salePrice || ''} placeholder="0.00" onChange={e => pricing({ salePrice: Number(e.target.value) }, true)} /></label>
          <div className={s.profit}><span>الفرق بين البيع والشراء</span><strong dir="ltr">{profit.toFixed(2)} <small>ر س</small></strong><span>قبل الضرائب والمصاريف</span></div>
        </div></section>
        <section className={s.stock}><div><header><Warehouse /><h3>تتبع المخزون</h3></header><p>اربط البيع بالرصيد وتابع المنتجات التي توشك على النفاد</p></div><label className={s.toggle}><input type="checkbox" checked={draft.trackStock} onChange={e => patch({ trackStock: e.target.checked })} /><span>{draft.trackStock ? 'مفعّل' : 'غير مفعّل'}</span></label>{draft.trackStock && <label className={s.threshold}>تنبيه عند وصول الكمية إلى<input type="number" min="0" max="1000000" step=".001" value={draft.minQuantity || ''} placeholder="مثل 5" onChange={e => patch({ minQuantity: Number(e.target.value) })} /><small>يظهر في تنبيهات المخزون عند بلوغ هذا الحد</small></label>}</section>
        <details className={s.recipe}><summary><Layers3 /> مكونات المنتج <span>اختياري</span></summary><p>حدد استهلاك كل مكون لكل وحدة مباعة باستخدام وحدته المخزنية</p>{!draft.trackStock && <p className={s.info}>فعّل تتبع المخزون لخصم المكونات عند البيع</p>}
          {draft.components.map((part, i) => <div key={i} className={s.componentRow}><label>المكون<select value={part.itemId} onChange={e => patch({ components: draft.components.map((p, j) => j === i ? { ...p, itemId: e.target.value } : p) })}><option value="">اختر مكونًا</option>{snapshot.items.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>كمية الاستهلاك<input type="number" min=".001" max="1000000" step=".001" value={part.quantity} onChange={e => patch({ components: draft.components.map((p, j) => j === i ? { ...p, quantity: Number(e.target.value) } : p) })} /></label><span>{snapshot.items.find(item => item.id === part.itemId)?.unit ?? 'الوحدة الأساسية'}</span><button type="button" aria-label={`حذف المكون ${i + 1}`} onClick={() => patch({ components: draft.components.filter((_, j) => j !== i) })}><Trash2 /></button></div>)}
          <button type="button" disabled={draft.components.length >= 100} onClick={() => patch({ components: [...draft.components, { itemId: '', quantity: 1 }] })}><Plus /> إضافة مكون</button>
        </details>
        <section className={s.photo}><div className={s.photoPreview}>{imageUrl ? <Image src={imageUrl} unoptimized width={88} height={88} alt="صورة المنتج" /> : <ImagePlus />}</div><div><h3>صورة المنتج <small>اختياري</small></h3><p>JPG أو PNG أو WebP حتى 3 ميجابايت</p><label className={s.upload}><ImagePlus />{uploading ? `جارٍ الرفع ${progress}%` : imageUrl ? 'تغيير الصورة' : 'اختيار صورة'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></label>{imageUrl && <button type="button" className={s.removeImage} onClick={() => { patch({ imagePath: null }); setImageUrl(''); }}>إزالة</button>}</div></section>
      </fieldset>
      <footer className={s.footer}><div><strong>{draft.name.trim() || 'منتج جديد'}</strong><span>يُحفظ في المنتجات والمخزون</span></div><div><button type="button" disabled={busy || uploading} onClick={onClose}>إلغاء</button><button type="submit" className={s.save} disabled={busy || uploading}>{busy ? <LoaderCircle /> : <Save />}{busy ? 'جارٍ الحفظ' : 'حفظ وإضافة للفاتورة'}</button></div></footer>
    </form>
  </Modal>, document.body);
}
