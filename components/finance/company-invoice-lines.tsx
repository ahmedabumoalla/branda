"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronDown, GripVertical, Package, Plus, StickyNote, Trash2 } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { parseCompanyTable, type CompanyLine } from "@/lib/finance/company-invoice";
import { inventorySaleSelection, inventoryUnitPrice, type InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import { invoiceSettingsMoney, type AdvancedInvoiceSettings, type InvoiceSettings } from "@/lib/finance/invoice-settings";
import { Field } from "./finance-ui";
import { invoicePolicyLine } from "./company-invoice-policy";
import { CompanyInvoiceLineNotes, type InvoiceLineNoteControls } from "./company-invoice-line-notes";
import styles from "./finance.module.css";
import css from "./company-invoice-lines.module.css";

type Props = {
  lines: CompanyLine[]; products: InvoiceCatalogProduct[]; vatRate: number; disabled: boolean;
  amounts: { price: number; discount: number; tax: number; total: number }[];
  onChange: (lines: CompanyLine[]) => void;
  summary?: ReactNode;
  productHint?: (productId: string, line: CompanyLine) => ReactNode;
  allowLineEditing?: boolean;
  allowLineDiscount?: boolean;
  decimalDisplay?: InvoiceSettings["decimalDisplay"];
  currency?: string;
  allowFreeItems?: boolean;
  advanced?: AdvancedInvoiceSettings;
  lineNotes?: InvoiceLineNoteControls;
};

function ProductThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className={css.productThumbnail} aria-hidden="true">{src && !failed ? <Image src={src} alt="" width={44} height={44} unoptimized loading="lazy" onError={() => setFailed(true)} /> : <Package size={22} strokeWidth={1.5} />}</span>;
}

export function CompanyInvoiceLines({ lines, products, vatRate, disabled, amounts, onChange, summary, productHint, allowLineEditing = true, allowLineDiscount = true, decimalDisplay = "always", currency = "SAR", allowFreeItems = false, advanced, lineNotes }: Props) {
  const [allNotesOpen, setAllNotesOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState<Record<number, boolean>>({});
  const showNotes = !!lineNotes && (lineNotes.enabled || lines.some(line => lineNotes.values[line.key]?.length));
  const draggedKey = useRef<number | null>(null);
  const [dropKey, setDropKey] = useState<number | null>(null);
  const [reorderKey, setReorderKey] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [productPickerKey, setProductPickerKey] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productChoice, setProductChoice] = useState("");
  const [pickerMode, setPickerMode] = useState<"catalog" | "product" | "service">("catalog");
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [table, setTable] = useState("");
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState("");
  const matchingProducts = products.filter(product => product.available && (!productSearch.trim() || product.name.toLocaleLowerCase("ar").includes(productSearch.trim().toLocaleLowerCase("ar")) || product.id === productSearch.trim() || product.sku === productSearch.trim() || product.barcode === productSearch.trim()));
  const freeKindAllowed = allowFreeItems && (advanced?.activityKind === undefined || advanced.activityKind === "both" || (pickerMode === "product" ? advanced.activityKind === "products" : advanced.activityKind === "services"));
  const nextKey = () => Math.max(0, ...lines.map(line => line.key)) + 1;
  const patch = (key: number, values: Partial<CompanyLine>) => { if (!disabled) onChange(lines.map(line => line.key === key ? { ...line, ...values } : line)); };
  const move = (key: number, destination: number) => {
    const index = lines.findIndex(line => line.key === key);
    if (disabled || index < 0 || destination < 0 || destination >= lines.length || index === destination) return;
    const result = [...lines];
    const [line] = result.splice(index, 1);
    result.splice(destination, 0, line);
    onChange(result);
    setAnnouncement(`تم نقل البند إلى الصف ${destination + 1}`);
  };
  return <>
    <div className={`${styles.invoiceTableWrap} ${css.tableWrap}`} role="region" aria-label="جدول بنود الفاتورة" tabIndex={0}>
      <table className={`${styles.invoiceTable} ${css.table}`} dir="rtl">
        <caption className={styles.srOnly}>بنود الفاتورة وأسعارها وخصوماتها وضريبتها</caption>
        <thead><tr><th scope="col"><span className={styles.srOnly}>ترتيب البند</span></th>{["البند", "الوصف", "سعر الوحدة", "الكمية", "الخصم", "الضريبة", "المجموع"].map(label => <th key={label} scope="col">{label}</th>)}{showNotes && <th scope="col"><button type="button" className={css.handle} aria-label={allNotesOpen ? "إخفاء كل الملاحظات" : "عرض كل الملاحظات"} title={allNotesOpen ? "إخفاء كل الملاحظات" : "عرض كل الملاحظات"} aria-expanded={allNotesOpen} onClick={() => { setAllNotesOpen(value => !value); setNotesOpen({}); }}><StickyNote size={17} aria-hidden="true" /></button></th>}<th scope="col"><span className={styles.srOnly}>حذف البند</span></th></tr></thead>
        <tbody>{lines.map((line, index) => {
          const chosen = products.find(p => p.id === line.productId);
          const row = amounts[index];
          const effective = advanced ? invoicePolicyLine(line, advanced) : line;
          const taxEditable = !advanced || (advanced.taxMode === "product" && !line.productId);
          return <Fragment key={line.key}><tr className={dropKey === line.key ? css.dropTarget : undefined} onDragOver={event => { if (!disabled && draggedKey.current !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropKey(line.key); } }} onDrop={event => { event.preventDefault(); if (draggedKey.current !== null) move(draggedKey.current, index); draggedKey.current = null; setDropKey(null); }}>
            <td><button type="button" className={css.handle} disabled={disabled || lines.length < 2} draggable={!disabled && lines.length > 1} aria-label={`ترتيب البند ${index + 1}`} title="اسحب لترتيب البند أو اضغط لاختيار موضعه" onClick={() => setReorderKey(line.key)} onDragStart={event => { if (disabled) { event.preventDefault(); return; } draggedKey.current = line.key; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(line.key)); }} onDragEnd={() => { draggedKey.current = null; setDropKey(null); }} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(line.key, index + (event.key === "ArrowUp" ? -1 : 1)); } }}><GripVertical size={16} aria-hidden="true" /></button></td>
            <td><button type="button" className={css.productPicker} disabled={disabled} aria-label={`اختيار المنتج للبند ${index + 1}`} aria-haspopup="dialog" title={chosen?.stockTracked ? `المخزون ${chosen.quantity}` : undefined} onClick={() => { setProductPickerKey(line.key); setProductSearch(""); setProductChoice(line.productId); setPickerMode(!line.productId && line.name ? line.kind ?? "product" : "catalog"); setFreeName(line.name ?? ""); setFreePrice(line.price ?? 0); setError(""); }}><span>{chosen?.name || line.name || "البند"}</span><ChevronDown size={14} aria-hidden="true" /></button>{productHint?.(line.productId, line)}{!line.productId && line.name && <span className={css.lastSalePrice}>{line.kind === "service" ? "خدمة حرة" : "منتج حر غير مرتبط بالمخزون"}</span>}</td>
            <td><Field label={`الوصف ${index + 1}`}><input placeholder="الوصف" maxLength={500} value={line.description ?? ""} disabled={disabled || !allowLineEditing} onChange={e => { if (allowLineEditing) patch(line.key, { description: e.target.value }); }} /></Field>{chosen && !chosen.available && <span className={css.lastSalePrice}>الصنف المحفوظ غير متاح للبيع وفق الإعدادات الحالية</span>}</td>
            <td><Field label={`سعر الوحدة ${index + 1}`}><input type="number" min="0" max="10000000" step="0.01" required value={line.price ?? chosen?.price ?? 0} disabled={disabled || !allowLineEditing} onChange={e => { if (allowLineEditing) patch(line.key, { price: Number(e.target.value) }); }} /></Field></td>
            <td><Field label={`الكمية ${index + 1}`}><input type="number" min="0.001" max="9999" step="0.001" required value={line.quantity} disabled={disabled} onChange={e => patch(line.key, { quantity: Number(e.target.value) })} /></Field>{chosen?.catalogSource === "inventory" && <Field label={`وحدة البند ${index + 1}`}><select disabled={disabled} value={line.unitName ?? chosen.unitName} onChange={event => { const unit = chosen.units?.find(value => value.name === event.target.value); if (unit) patch(line.key, { unitName: unit.name, unitFactor: unit.factor, price: inventoryUnitPrice(chosen, unit.name) }); }}>{chosen.units?.map(unit => <option key={unit.name} value={unit.name}>{unit.name}</option>)}</select></Field>}</td>
            <td><Field label={`الخصم ${index + 1}`}><input type="number" aria-label={`قيمة الخصم للبند ${index + 1}`} min="0" max={line.discountKind === "percent" ? 100 : line.quantity * row.price} step="0.01" required value={line.discount ?? 0} disabled={disabled || !allowLineDiscount} onChange={e => { if (allowLineDiscount) patch(line.key, { discount: Number(e.target.value) }); }} /><select aria-label={`نوع الخصم ${index + 1}`} value={line.discountKind ?? "amount"} disabled={disabled || !allowLineDiscount} onChange={e => { if (allowLineDiscount) patch(line.key, { discountKind: e.target.value as "amount" | "percent", discount: 0 }); }}><option value="percent">%</option><option value="amount">ر س</option></select></Field>{!allowLineDiscount && (line.discount ?? 0) > 0 && <button type="button" className={styles.secondary} disabled={disabled} onClick={() => patch(line.key, { discount: 0 })}>إزالة خصم البند</button>}</td>
            <td><Field label={`الضريبة ${index + 1}`}><select title={`مبلغ الضريبة ${invoiceSettingsMoney(row.tax, decimalDisplay, currency)}`} value={effective.vatRate === undefined ? "default" : String(effective.vatRate)} disabled={disabled || !taxEditable} onChange={e => { if (taxEditable) patch(line.key, { vatRate: e.target.value === "default" ? undefined : Number(e.target.value) }); }}><option value="default">ضريبة الفاتورة {vatRate}%</option><option value="0">ضريبة صفرية أو إعفاء</option><option value="15">القيمة المضافة 15%</option>{effective.vatRate !== undefined && ![0, 15].includes(effective.vatRate) && <option value={effective.vatRate}>{effective.vatRate}%</option>}</select></Field>{advanced && effective.vatRate === 0 && <>
              <Field label={`الفئة الضريبية للبند ${index + 1}`}><select value={effective.taxCategory} disabled={disabled || advanced.taxMode === "none" || (advanced.taxMode === "product" && !!line.productId)} onChange={event => { if (advanced.taxMode !== "none" && (advanced.taxMode !== "product" || !line.productId)) patch(line.key, { taxCategory: event.target.value as CompanyLine["taxCategory"] }); }}><option value="Z">صفري</option><option value="E">معفى</option><option value="O">خارج نطاق الضريبة</option></select></Field>
              <Field label={`سبب الإعفاء للبند ${index + 1}`}><input maxLength={250} required={advanced.taxRequired && !effective.exemptionReason} value={line.exemptionReason ?? ""} placeholder={effective.exemptionReason || "سبب الضريبة الصفرية أو الإعفاء"} disabled={disabled} onChange={event => patch(line.key, { exemptionReason: event.target.value })} /></Field>
            </>}</td>
            <td><output className={css.rowTotal} aria-label={`إجمالي البند ${index + 1}`}><span className={styles.numeric}>{invoiceSettingsMoney(row.total, decimalDisplay, currency)}</span></output></td>
            {showNotes && <td><button type="button" className={css.handle} aria-label={`ملاحظات البند ${index + 1}`} aria-expanded={notesOpen[line.key] ?? allNotesOpen} onClick={() => setNotesOpen(value => ({ ...value, [line.key]: !(value[line.key] ?? allNotesOpen) }))}><StickyNote size={17} aria-hidden="true" />{lineNotes?.values[line.key]?.length || ""}</button></td>}
            <td><button type="button" className={css.remove} aria-label={`حذف البند ${index + 1}`} disabled={disabled || lines.length === 1} onClick={() => onChange(lines.filter(row => row.key !== line.key))}><Trash2 size={14} aria-hidden="true" /></button></td>
          </tr>{showNotes && lineNotes && (notesOpen[line.key] ?? allNotesOpen) && <tr><td colSpan={10} style={{ padding: 0 }}><CompanyInvoiceLineNotes rowKey={line.key} index={index} controls={lineNotes} disabled={disabled} /></td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </div>
    <div className={css.footer} dir="rtl"><div className={css.additions}><div className={css.addControl}><button type="button" className={css.addButton} disabled={disabled || lines.length >= 100} onClick={() => onChange([...lines, { key: nextKey(), productId: "", quantity: 1 }])}><Plus size={16} aria-hidden="true" />إضافة</button><details className={css.addMenu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="خيارات إضافة البنود" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><ChevronDown size={14} aria-hidden="true" /></summary><button type="button" disabled={disabled} onClick={event => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; setError(""); setImportOpen(true); }}>نسخ من جدول البيانات</button></details></div></div>{summary}</div>
    <span className={styles.srOnly} role="status">{announcement}</span>
    <Modal open={productPickerKey !== null} title="اختيار البند" onClose={() => setProductPickerKey(null)} panelClassName="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className={styles.form}>
        {(allowFreeItems || pickerMode !== "catalog") && <Field label="نوع البند"><select value={pickerMode} disabled={disabled} onChange={event => { setPickerMode(event.target.value as typeof pickerMode); setError(""); }}><option value="catalog">صنف مسجل</option>{(advanced?.activityKind !== "services" || pickerMode === "product") && <option value="product" disabled={!allowFreeItems || advanced?.activityKind === "services"}>منتج حر</option>}{(advanced?.activityKind !== "products" || pickerMode === "service") && <option value="service" disabled={!allowFreeItems || advanced?.activityKind === "products"}>خدمة حرة</option>}</select></Field>}
        {pickerMode !== "catalog" ? <div className={styles.fields}><Field label="اسم البند الحر"><input value={freeName} maxLength={160} required disabled={disabled || !freeKindAllowed} onChange={event => setFreeName(event.target.value)} /></Field><Field label="سعر البند الحر"><input type="number" min="0" max="10000000" step="0.01" value={freePrice} required disabled={disabled || !freeKindAllowed} onChange={event => setFreePrice(Number(event.target.value))} /></Field><p className={styles.muted}>يُحفظ البند في الفاتورة دون إنشاء صنف في الكتالوج أو حركة مخزون وهمية</p></div> : <>
        <Field label="البحث عن المنتجات"><input type="search" value={productSearch} onChange={event => { setProductSearch(event.target.value); setProductChoice(""); }} /></Field>
        <div className={css.productResults} role="region" aria-label="الأصناف وأسعارها" tabIndex={0}>
          <table className={css.productTable} dir="rtl">
            <caption className={styles.srOnly}>اختر صنفًا حسب اسمه وصورته وسعر الوحدة</caption>
            <thead><tr><th scope="col">الصنف</th><th scope="col">سعر الوحدة</th></tr></thead>
            <tbody>{matchingProducts.map(product => <tr key={product.id} data-selected={productChoice === product.id}>
              <td><label className={css.productOption}><input type="radio" name={`invoice-product-${productPickerKey}`} value={product.id} checked={productChoice === product.id} disabled={disabled} onChange={() => setProductChoice(product.id)} /><ProductThumbnail key={product.imageUrl ?? product.id} src={product.imageUrl} /><span className={css.productName}>{product.name}</span></label></td>
              <td className={css.productPrice}><span className={styles.numeric}>{invoiceSettingsMoney(product.price, decimalDisplay, currency)}</span></td>
            </tr>)}</tbody>
          </table>
          {!matchingProducts.length && <p className={css.noProducts} role="status">{productSearch.trim() ? "لا توجد أصناف مطابقة للبحث" : "لا توجد أصناف متاحة"}</p>}
        </div>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || (pickerMode === "catalog" ? !productChoice : !freeKindAllowed || !freeName.trim() || !Number.isFinite(freePrice) || freePrice < 0 || freePrice > 10000000)} onClick={() => {
          if (disabled || productPickerKey === null) return;
          if (pickerMode !== "catalog") {
            if (!freeKindAllowed || !freeName.trim() || !Number.isFinite(freePrice) || freePrice < 0 || freePrice > 10000000) return;
            patch(productPickerKey, { productId: "", catalogSource: undefined, unitName: undefined, unitFactor: undefined, name: freeName.trim(), kind: pickerMode, price: freePrice }); setProductPickerKey(null); return;
          }
          const product = products.find(item => item.id === productChoice && item.available);
          if (product) { const policy = advanced?.productPolicies.find(item => item.productId === product.id); patch(productPickerKey, { productId: product.id, name: undefined, kind: policy?.kind ?? "product", price: product.price, description: "", ...(policy ? { vatRate: policy.vatRate, taxCategory: policy.taxCategory, exemptionReason: policy.exemptionReason } : {}), ...inventorySaleSelection(product) }); setProductPickerKey(null); }
        }}>اختيار البند</button><button type="button" className={styles.secondary} onClick={() => setProductPickerKey(null)}>إلغاء</button></div>
      </div>
    </Modal>
    <Modal open={reorderKey !== null} title="ترتيب البند" onClose={() => setReorderKey(null)}>
      <div className={styles.form}><Field label="موضع البند"><select disabled={disabled} value={lines.findIndex(line => line.key === reorderKey)} onChange={event => { if (reorderKey !== null) move(reorderKey, Number(event.target.value)); setReorderKey(null); }}>{lines.map((line, index) => <option key={line.key} value={index}>الصف {index + 1}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setReorderKey(null)}>إغلاق</button></div>
    </Modal>
    <Modal open={importOpen} title="نسخ من جدول البيانات" onClose={() => setImportOpen(false)} panelClassName="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className={styles.form}><p>انسخ الأعمدة بالترتيب: اسم المنتج أو رمزه ثم الكمية ثم سعر الوحدة</p><Field label="بيانات الجدول"><textarea rows={10} value={table} maxLength={50000} onChange={e => setTable(e.target.value)} placeholder={"اسم المنتج\tالكمية\tسعر الوحدة"} /></Field><label className={styles.check}><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />استبدال البنود الحالية</label>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled} onClick={() => { if (disabled) return; try { const imported = parseCompanyTable(table, products.filter(p => p.available), nextKey()); if (!allowLineEditing && imported.some(line => line.price !== products.find(product => product.id === line.productId)?.price)) throw new Error("إعدادات الفواتير تمنع تغيير أسعار المنتجات عند الاستيراد"); const result = replace ? imported : [...lines.filter(line => line.productId || line.name?.trim()), ...imported]; if (result.length > 100) throw new Error("الحد الأقصى ١٠٠ بند"); onChange(result); setImportOpen(false); setTable(""); } catch (e) { setError(e instanceof Error ? e.message : "راجع بيانات الجدول"); } }}>استيراد البنود</button><button type="button" className={styles.secondary} onClick={() => setImportOpen(false)}>إلغاء</button></div></div>
    </Modal>
  </>;
}
