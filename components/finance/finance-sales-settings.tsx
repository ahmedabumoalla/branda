"use client";

import { useState } from "react";
import { BadgePercent, ClipboardList, FileCog, FilePenLine, Filter, Paintbrush, ReceiptText, StickyNote, Tags, Truck, WandSparkles } from "lucide-react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { FinanceInvoiceSettings } from "./finance-invoice-settings";
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
  const [invoiceSettings, setInvoiceSettings] = useState(false);
  if (invoiceSettings) return <FinanceInvoiceSettings key={slug} slug={slug} settings={settings} snapshot={snapshot} canEdit={!!onEditInvoices} disabled={disabled} onBack={() => setInvoiceSettings(false)} onEditTax={onEditInvoices} />;
  return <div className={styles.hub} dir="rtl" aria-label="أقسام إعدادات المبيعات">{salesSettingsGroups.map(group => <section key={group.id} aria-labelledby={`sales-settings-${group.id}`}><h2 id={`sales-settings-${group.id}`}>{group.title}</h2><div className={styles.grid}>{group.cards.map(({ id, title, description, icon: Icon }) => {
    const content = <><Icon size={29} strokeWidth={1.8} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></>;
    return id === "invoices" ? <button key={id} type="button" className={styles.card} onClick={() => setInvoiceSettings(true)}>{content}</button> : <article key={id} className={styles.card} aria-label={title}>{content}</article>;
  })}</div></section>)}</div>;
}
