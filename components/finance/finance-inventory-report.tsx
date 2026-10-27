"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, CircleAlert, Package, Search, Warehouse } from "lucide-react";
import type { FinanceItem, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { buildInventoryReport, inventoryReportCsvRows, inventoryStatusNames, type InventoryFilter, type InventoryReportRow } from "@/lib/finance/inventory-report";
import { downloadFinanceCsv, Empty, Numeric } from "./finance-ui";
import shared from "./finance.module.css";
import styles from "./finance-inventory-report.module.css";

const filterOptions: { value: InventoryFilter; label: string }[] = [
  { value: "all", label: "كل الأرصدة" }, { value: "negative", label: "رصيد سالب" },
  { value: "zero", label: "نفد المخزون" }, { value: "low", label: "عند حد التنبيه أو أقل" },
  { value: "missing_cost", label: "تكلفة تحتاج مراجعة" }, { value: "unlinked", label: "غير مرتبط بالمنيو" },
  { value: "available", label: "متوفر" },
];
const pageSize = 50;

export function FinanceInventoryReport({ snapshot, disabled = false, onAdjust, onItemEdit }: {
  snapshot: FinanceSnapshot;
  disabled?: boolean;
  /** Parent supplies callbacks only when the authenticated role has the corresponding permission. */
  onAdjust?: (row: InventoryReportRow) => void;
  onItemEdit?: (item: FinanceItem) => void;
}) {
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryFilter>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(0);
  const { rows, summary } = useMemo(() => buildInventoryReport(snapshot, { warehouseId, search, status, includeInactive }), [snapshot, warehouseId, search, status, includeInactive]);
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const actions = !!onAdjust || !!onItemEdit;

  return <section className={styles.report} aria-label="رقابة المخزون حسب المستودع">
    <header className={styles.heading}>
      <div><p className={shared.eyebrow}><Warehouse size={16} aria-hidden="true" />المخزون تحت الرقابة</p><h2>كل مستودع برصيده وتكلفته</h2><p>أرصدة حالية حسب آخر تحديث مع إبراز النواقص قبل أن تختفي داخل إجمالي العلامة</p></div>
      <button type="button" className={shared.secondary} disabled={!rows.length} onClick={() => downloadFinanceCsv("branda-inventory-by-warehouse.csv", inventoryReportCsvRows(rows))}><ArrowDownToLine size={16} aria-hidden="true" />تصدير النتائج</button>
    </header>

    <div className={styles.metrics} aria-label="ملخص الأرصدة المطابقة للتصفية">
      <div className={styles.valuation}><span>صافي القيمة التقديرية للأرصدة المعروفة</span><strong><Numeric value={summary.estimatedValue} money /></strong><small>{summary.missingCost ? "التقييم غير مكتمل بسبب أرصدة بلا تكلفة موثقة" : "يشمل أثر الأرصدة السالبة بالتكلفة المتاحة"}</small></div>
      <div className={styles.metric}><span>أصناف ضمن التصفية</span><strong><Numeric value={summary.items} /></strong><small><Numeric value={summary.warehouses} /> مستودع</small></div>
      <div className={styles.metric} data-tone="danger"><span>أرصدة سالبة</span><strong><Numeric value={summary.negative} /></strong><small>صنف داخل مستودع</small></div>
      <div className={styles.metric}><span>نفدت أو وصلت للتنبيه</span><strong><Numeric value={summary.zero + summary.low} /></strong><small><Numeric value={summary.zero} /> نفدت و<Numeric value={summary.low} /> منخفضة</small></div>
    </div>

    <div className={styles.controls}>
      <label className={styles.search}><span>البحث في الأرصدة</span><div><Search size={17} aria-hidden="true" /><input type="search" value={search} placeholder="الصنف أو الرمز أو المستودع" onChange={event => { setSearch(event.target.value); setPage(0); }} /></div></label>
      <label><span>المستودع</span><select value={warehouseId} onChange={event => { setWarehouseId(event.target.value); setPage(0); }}><option value="">كل المستودعات</option>{snapshot.warehouses.filter(warehouse => includeInactive || warehouse.active).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{!warehouse.active ? " — مؤرشف" : ""}</option>)}</select></label>
      <label><span>حالة الرصيد</span><select value={status} onChange={event => { setStatus(event.target.value as InventoryFilter); setPage(0); }}>{filterOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={includeInactive} onChange={event => { setIncludeInactive(event.target.checked); setWarehouseId(""); setPage(0); }} /><span>إظهار المؤرشف</span></label>
    </div>

    <div className={styles.notices}>
      <p><Package size={16} aria-hidden="true" />القيمة تقديرية من كمية كل مستودع × متوسط تكلفته وليست مطابقة محاسبية للقيمة الدفترية</p>
      {!!summary.missingCost && <p className={styles.warning}><CircleAlert size={16} aria-hidden="true" /><Numeric value={summary.missingCost} /> رصيد بلا تكلفة موثقة مستبعد من التقييم حتى مراجعته والتكلفة الصفرية الموثقة مقبولة</p>}
      {!!summary.negative && <p className={styles.warning}>البيع بالسالب متاح وهذه الأرصدة تحتاج مراجعة الجرد أو تسجيل الاستلام الفعلي</p>}
    </div>

    {!rows.length ? <Empty title={snapshot.items.length ? "لا توجد أرصدة مطابقة للتصفية" : "لا توجد أصناف مخزنية بعد"}>أضف الأصناف والمستودعات أو غيّر عوامل التصفية لعرض الرصيد</Empty> : <>
      <div className={styles.tableWrap} role="region" aria-label="جدول أرصدة الأصناف حسب المستودع" tabIndex={0}>
        <table className={styles.table}><caption>النتائج حسب التصفية الحالية وتظهر الأرصدة السالبة أولًا</caption><thead><tr>
          <th scope="col">الصنف والمستودع</th><th scope="col">الرصيد الحالي</th><th scope="col">الحالة</th><th scope="col">متوسط تكلفة المستودع</th><th scope="col">القيمة التقديرية</th><th scope="col">حد التنبيه</th><th scope="col">للوصول إلى الحد</th>{actions && <th scope="col">الإجراء</th>}
        </tr></thead><tbody>{visible.map(row => <tr key={row.key}>
          <th scope="row" className={styles.item}><strong>{row.item.name}</strong><span>{row.warehouseName}{!row.active && " — مؤرشف"}</span><small><bdi>{row.item.sku || "بدون رمز"}</bdi> · {row.productName ?? (row.item.menu_product_id ? "منتج مرتبط غير ظاهر" : "صنف مستقل")}</small></th>
          <td><strong className={row.quantity < 0 ? styles.negative : styles.quantity}><bdi dir="ltr">{new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(row.quantity)}</bdi></strong><small>{row.item.unit}</small></td>
          <td><span className={styles.status} data-status={row.status}>{inventoryStatusNames[row.status]}</span></td>
          <td>{row.averageCost === null ? <span className={styles.muted}>غير متاحة</span> : <Numeric value={row.averageCost} money />}</td>
          <td>{row.estimatedValue === null ? <span className={styles.warning}>تحتاج تكلفة</span> : <Numeric value={row.estimatedValue} money />}</td>
          <td><Numeric value={row.minimumQuantity} /> {row.item.unit}</td><td><Numeric value={row.belowMinimum} /> {row.item.unit}</td>
          {actions && <td><div className={shared.actions}>{onAdjust && row.active && <button type="button" className={shared.secondary} disabled={disabled} onClick={() => onAdjust(row)}>جرد</button>}{onItemEdit && <button type="button" className={shared.secondary} disabled={disabled} onClick={() => onItemEdit(row.item)}>تعديل الصنف</button>}</div></td>}
        </tr>)}</tbody></table>
      </div>
      <footer className={styles.footer}><span role="status">عرض <Numeric value={currentPage * pageSize + 1} /> إلى <Numeric value={Math.min((currentPage + 1) * pageSize, rows.length)} /> من <Numeric value={rows.length} /> رصيد</span><div className={shared.actions}><button type="button" className={shared.secondary} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</button><button type="button" className={shared.secondary} disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>التالي</button></div></footer>
    </>}
    <p className={styles.footnote}>حد التنبيه معرّف للصنف ويطبّق هنا على كل مستودع والأصناف النشطة بلا رصيد مسجل تظهر بصفر ولا يجمع التقرير كميات الوحدات المختلفة أو يستنتج دوران المخزون من سجل الحركات الجزئي</p>
  </section>;
}
