"use client";

import { useSearchParams } from "next/navigation";
import { BadgePercent, ClipboardList, FileCog, FilePenLine, Filter, Paintbrush, ReceiptText, StickyNote, Tags, Truck, WandSparkles } from "lucide-react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { isHospitalStore } from "@/lib/commerce/hospital-profile";
import { FinanceInvoiceSettings } from "./finance-invoice-settings";
import { FinancePriceLists, navigatePriceLists } from "./finance-price-lists";
import { FinanceOrderSources } from "./finance-order-sources";
import { FinanceInvoiceLineNotes } from "./finance-invoice-line-notes";
import { FinanceInvoiceCustomFields } from "./finance-invoice-custom-fields";
import { FinanceShipping, navigateShipping, shippingUrlKeys } from "./finance-shipping";
import styles from "./finance-sales-settings.module.css";

export const salesSettingsGroups = [
  { id: "invoices-payments", title: "الفواتير والمدفوعات", cards: [
    { id: "invoices", title: "إعدادات الفواتير", description: "تحكم في إعداد نموذج الفواتير وكيفية عرضها داخل النظام", icon: ReceiptText },
    { id: "electronic-invoices", title: "إعدادات الفاتورة الإلكترونية", description: "قم بإعداد وربط إعدادات الفواتير والإيصالات الإلكترونية مع الهيئة المختصة بالضرائب", icon: FileCog },
    { id: "designs", title: "تصميمات الفواتير وعروض الأسعار", description: "صمم وخصص نماذج عرض وطباعة مستندات المبيعات المختلفة", icon: Paintbrush },
    { id: "extra-fields", title: "حقول الفواتير الإضافية", description: "تحكم في الحقول الإضافية الخاصة بالفواتير بمختلف أنواع الحقول المتاحة وتفاصيلها", icon: WandSparkles },
    { id: "item-notes", title: "ملاحظات البنود", description: "إنشاء وإدارة ملاحظات البنود المستخدمة عبر الفواتير وطلبات نقاط البيع", icon: StickyNote },
    { id: "price-lists", title: "قوائم الأسعار", description: "أنشئ قوائم أسعار مختلفة للمنتجات وقم بإدارتها وتطبيقها حسب العميل أو نوع المعاملة", icon: Tags },
    { id: "order-sources", title: "مصادر الطلب", description: "أنشئ مصادر طلب مخصصة لتصنيف وتتبع فواتير المبيعات وطلبات وإيصالات نقاط البيع", icon: Filter },
    { id: "shipping", title: "خيارات الشحن", description: "حدد طرق وأسعار الشحن والتوصيل وإعدادات خيار الدفع عند التوصيل", icon: Truck },
    { id: "offers", title: "العروض", description: "خصص أنواع العروض الترويجية ومدتها ونسب الخصم وقواعد التطبيق على العملاء", icon: BadgePercent },
  ] },
  { id: "quotations", title: "عروض الأسعار", cards: [
    { id: "quotes", title: "إعدادات عروض الأسعار", description: "اضبط طريقة إنشاء عروض الأسعار وإدارتها وتحويلها إلى فواتير", icon: FilePenLine },
  ] },
  { id: "sales-orders", title: "أوامر البيع", cards: [
    { id: "orders", title: "إعدادات أوامر البيع", description: "تحكم بطريقة إصدار أوامر البيع وإدارتها وتحويلها إلى فواتير مبيعات", icon: ClipboardList },
  ] },
];

export function FinanceSalesSettings({ slug, settings, snapshot, disabled, onEditInvoices }: {
  slug: string; settings: FinanceSnapshot["settings"]; snapshot: FinanceSnapshot; disabled: boolean; onEditInvoices?: () => void;
}) {
  const params = useSearchParams();
  const invoiceSettings = params.get("settings") === "invoices";
  const priceLists = params.get("settings") === "price-lists";
  function openSettings(id: "invoices" | "order-sources" | "item-notes" | "extra-fields") {
    const url = new URL(window.location.href);
    url.searchParams.set("settings", id);
    for (const key of ["priceList", "priceListView", ...shippingUrlKeys]) url.searchParams.delete(key);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }
  function settingsBack() {
    const url = new URL(window.location.href);
    for (const key of ["settings", "priceList", "priceListView", ...shippingUrlKeys]) url.searchParams.delete(key);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }
  if (invoiceSettings) return <FinanceInvoiceSettings key={slug} slug={slug} settings={settings} snapshot={snapshot} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} onEditTax={onEditInvoices} />;
  if (priceLists) return <FinancePriceLists key={slug} slug={slug} snapshot={snapshot} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} />;
  if (params.get("settings") === "order-sources") return <FinanceOrderSources key={slug} slug={slug} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} />;
  if (params.get("settings") === "item-notes") return <FinanceInvoiceLineNotes key={slug} slug={slug} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} />;
  if (params.get("settings") === "extra-fields") return <FinanceInvoiceCustomFields key={slug} slug={slug} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} />;
  if (params.get("settings") === "shipping") return <FinanceShipping key={slug} slug={slug} canEdit={!!onEditInvoices} disabled={disabled} onBack={settingsBack} />;
  return <div className={styles.hub} dir="rtl" aria-label="أقسام إعدادات المبيعات">{isHospitalStore(slug) && <section className={styles.current}><header><h2>ضريبة الأسعار</h2>{onEditInvoices && <button type="button" disabled={disabled} onClick={onEditInvoices}>تعديل إعدادات ضريبة الأسعار</button>}</header><p>{settings.tax_inclusive ? "الأسعار الحالية شاملة ضريبة القيمة المضافة" : "الأسعار الحالية غير شاملة ضريبة القيمة المضافة"}</p></section>}{salesSettingsGroups.map(group => <section key={group.id} aria-labelledby={`sales-settings-${group.id}`}><h2 id={`sales-settings-${group.id}`}>{group.title}</h2><div className={styles.grid}>{group.cards.map(({ id, title, description, icon: Icon }) => {
    const content = <><Icon size={29} strokeWidth={1.8} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></>;
    return id === "invoices" || id === "price-lists" || id === "order-sources" || id === "item-notes" || id === "shipping" || id === "extra-fields" ? <button key={id} type="button" className={styles.card} onClick={() => id === "price-lists" ? navigatePriceLists() : id === "shipping" ? navigateShipping() : openSettings(id)}>{content}</button> : <article key={id} className={styles.card} aria-label={title}>{content}</article>;
  })}</div></section>)}</div>;
}
