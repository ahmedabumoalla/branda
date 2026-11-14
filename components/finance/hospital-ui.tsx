"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import s from "./hospital-pos.module.css";

export type HospitalLanguage = "ar" | "en";
export const hospitalText = (language: HospitalLanguage, ar: string, en: string) => language === "ar" ? ar : en;
export const hospitalMoney = (value: number, language: HospitalLanguage) => new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(value);
export const hospitalDate = (value: string, language: HospitalLanguage) => new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));

export function hospitalFailure(language: HospitalLanguage, error?: string, code?: string) {
  const known: Record<string, [string, string]> = {
    HOSPITAL_INVALID_INPUT: ["راجع بيانات العميل والطلب", "Review the customer and order details"],
    HOSPITAL_RATE_LIMIT: ["انتظر قليلًا قبل إرسال طلب جديد", "Please wait before placing another order"],
    HOSPITAL_UNAVAILABLE: ["الطلبات غير متاحة حاليًا", "Ordering is currently unavailable"],
    HOSPITAL_PRODUCT_UNAVAILABLE: ["أحد المنتجات غير متاح حدّث المنيو", "An item is unavailable Refresh the menu"],
    HOSPITAL_CHOOSE_OPTION: ["حدد خيار المنتج", "Select the product option"],
    HOSPITAL_CONFIRM_PRICES: ["أكد الأسعار ضمن النطاق المعروض", "Confirm each price within the displayed range"],
    HOSPITAL_DEBTOR_REQUIRED: ["حدد الدكتور أو العيادة صاحب المديونية", "Select the doctor or clinic responsible for this balance"],
    HOSPITAL_SHIFT_REQUIRED: ["افتح ورديتك واختر صندوقها للتحصيل", "Open your shift and select its cash drawer"],
    HOSPITAL_OVERPAYMENT: ["المبلغ يتجاوز المديونية الحالية", "The amount exceeds the current outstanding balance"],
    HOSPITAL_REQUEST_CHANGED: ["تغيّرت بيانات المحاولة حدّث الطلب", "The request changed Refresh the order"],
    HOSPITAL_ALREADY_INVOICED: ["الطلب مفوتر أو مغلق حدّث الطلبات", "This order is already invoiced or closed Refresh orders"],
    HOSPITAL_INVALID_STATE: ["الإجراء غير متاح لهذه الحالة حدّث الطلب", "This action is unavailable for the current status Refresh the order"],
    HOSPITAL_PERIOD_CLOSED: ["الفترة المحاسبية مقفلة", "The accounting period is closed"],
    HOSPITAL_TAX_CHANGED: ["تغيّرت الضريبة أعد إنشاء الطلب بالأسعار الحالية", "Tax settings changed Recreate the order with current prices"],
    HOSPITAL_INVALID_PAYMENT: ["اختر حساب النقد أو الشبكة الصحيح", "Select the correct cash or card account"],
    HOSPITAL_FORBIDDEN: ["لا تملك صلاحية طلبات المستشفى", "Hospital ordering access is unavailable for this account"],
    PRICE_CHANGED: ["تغيّر سعر الصنف حدّث الطلب وراجع السعر", "The product price changed Refresh and review the order"],
    SHIFT_REQUIRED: ["ابدأ ورديتك قبل تسجيل العملية", "Open your shift before recording this transaction"],
    INVALID_PRICE: ["راجع الأسعار وأدخل سعرًا ضمن النطاق المعروض", "Enter a confirmed price within the displayed range"],
    INSUFFICIENT_STOCK: ["المخزون لا يكفي لهذه الكمية", "Insufficient stock for this quantity"],
    INVALID_AMOUNT: ["راجع المبلغ المطلوب تحصيله", "Review the collection amount"],
    FORBIDDEN: ["لا تملك صلاحية تنفيذ هذه العملية", "You do not have permission for this action"],
  };
  const message = code ? known[code] : undefined;
  if (message) return hospitalText(language, ...message);
  return language === "ar" && error && /[\u0600-\u06ff]/.test(error) ? error : hospitalText(language, "تعذر تأكيد العملية حدّث البيانات وأعد المحاولة بنفس الخيارات لمنع التكرار", "The result could not be confirmed Refresh and retry with the same details to avoid duplication");
}

export function HospitalDialog({ title, language, close, children, busy = false, wide = false }: { title: string; language: HospitalLanguage; close: () => void; children: ReactNode; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current, trigger = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`${s.dialog} ${wide ? s.wideDialog : ""}`} dir={language === "ar" ? "rtl" : "ltr"} lang={language} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClick={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <header className={s.dialogHeader}><h2>{title}</h2><button type="button" className={s.icon} disabled={busy} onClick={close} aria-label={hospitalText(language, "إغلاق", "Close")}><X size={20} /></button></header>
    <div className={s.dialogBody}>{children}</div>
  </dialog>;
}

export function HospitalField({ label, children }: { label: string; children: ReactNode }) { return <label className={s.field}><span>{label}</span>{children}</label>; }
