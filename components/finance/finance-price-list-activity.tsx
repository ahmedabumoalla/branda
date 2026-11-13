"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getFinancePriceListActivity } from "@/app/actions/finance-price-list-activity";
import type { PriceListActivityPage } from "@/lib/finance/price-list-activity";
import type { PriceListCatalogItem } from "@/lib/finance/price-list-csv";
import { financeDate } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";
import local from "./finance-price-lists.module.css";

export function FinancePriceListActivity({ slug, listId, catalog }: { slug: string; listId: string; catalog: PriceListCatalogItem[] }) {
  const [cursors, setCursors] = useState<(number | null)[]>([null]), [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ cursor: number | null; attempt: number; data?: PriceListActivityPage; error?: string } | null>(null);
  const cursor = cursors.at(-1) ?? null;
  useEffect(() => {
    let active = true;
    getFinancePriceListActivity(slug, listId, cursor).then(response => {
      if (active) setResult({ cursor, attempt, ...(response.ok ? { data: response.data } : { error: response.message }) });
    }).catch(() => { if (active) setResult({ cursor, attempt, error: "تعذر تحميل سجل النشاطات أعد المحاولة" }); });
    return () => { active = false; };
  }, [slug, listId, cursor, attempt]);
  const current = result?.cursor === cursor && result.attempt === attempt ? result : null;
  const page = current?.data;
  const valueText = (value: string | number | boolean | null) => value === null ? "غير موجود" : typeof value === "boolean" ? value ? "نشط" : "غير نشط" : typeof value === "number" ? new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 6 }).format(value) : value;
  return <section className={local.activity} aria-busy={!current} aria-label="سجل نشاط قائمة الأسعار">
    <div className={css.bar}><nav className={css.actions} aria-label="صفحات سجل النشاطات"><button type="button" className={styles.secondary} aria-label="الصفحة السابقة" disabled={!current || cursors.length === 1} onClick={() => setCursors(values => values.slice(0, -1))}><ChevronRight size={16} aria-hidden="true" /></button><span>صفحة {cursors.length}</span><button type="button" className={styles.secondary} aria-label="الصفحة التالية" disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors(values => [...values, page.nextCursor]); }}><ChevronLeft size={16} aria-hidden="true" /></button></nav><button type="button" className={styles.secondary} disabled={!current} onClick={() => { setCursors([null]); setAttempt(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" />تحديث</button></div>
    {!current ? <p role="status">جار تحميل سجل النشاطات</p> : current.error ? <div className={styles.error} role="alert"><p>{current.error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : !page?.items.length ? <p className={css.hint}>{page?.nextCursor ? "لا توجد تغييرات لهذه القائمة في هذه الفترة يمكنك عرض الصفحة التالية للأحداث الأقدم" : "لا توجد نشاطات مسجلة لهذه القائمة في الفترة المعروضة"}</p> : <div className={css.timeline}>{page.items.map(event => <article className={css.event} key={event.id}><h3>{event.action === "created" ? "إنشاء قائمة الأسعار" : event.action === "deleted" ? "حذف قائمة الأسعار" : "تعديل قائمة الأسعار"}</h3><p>{event.actor}</p><time dateTime={event.createdAt}>{financeDate(event.createdAt)}</time>{event.changes.length > 0 && <ul className={local.changes}>{event.changes.map((change, index) => <li key={`${change.field}:${change.productId ?? index}`}><strong>{change.field === "name" ? "الاسم" : change.field === "active" ? "الحالة" : change.field === "customers" ? "تعديل روابط العملاء وعدد المرتبطين" : `سعر ${catalog.find(item => item.id === change.productId)?.name ?? change.productId}`}</strong><span><del>{valueText(change.before)}</del><span aria-hidden="true"> ← </span><ins>{valueText(change.after)}</ins>{change.field === "price" && " ريال سعودي"}</span></li>)}</ul>}</article>)}</div>}
  </section>;
}
