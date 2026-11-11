"use client";

import { useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FinanceFormOperation } from "./finance-operation-form";
import { buildCustomerPayload, customerAddressFields, customerCountries, customerIdentifierOptions } from "@/lib/finance/customer-fields";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
import layout from "./finance-customer-form.module.css";

export const customerPayload = buildCustomerPayload;
function Country({ name, value = "" }: { name: string; value?: string }) {
  return <Field label="البلد"><select name={name} defaultValue={value}><option value="">اختر البلد</option>{value && !customerCountries.some(c => c.code === value) && <option>{value}</option>}{customerCountries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>;
}
type Contact = { key: number; firstName?: string; lastName?: string; email?: string; telephone?: string; phone?: string };
function contactsFrom(raw?: string): Contact[] {
  try { const rows: unknown = JSON.parse(raw || "[]"); return Array.isArray(rows) ? rows.slice(0, 10).filter(r => r && typeof r === "object").map((r, key) => ({ key, ...Object.fromEntries(["firstName", "lastName", "email", "telephone", "phone"].map(k => [k, typeof r[k] === "string" ? r[k] : ""])) })) : []; } catch { return []; }
}

export function FinanceCustomerForm({ values = {}, pending, error, onCancel, onSubmit, onSaved, onAdvancedChange }: {
  values?: Record<string, unknown>; pending: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: FinanceFormOperation, payload: Record<string, unknown>) => Promise<boolean>;
  onSaved?: (id: string) => void; onAdvancedChange?: (advanced: boolean) => void;
}) {
  const [id] = useState(() => typeof values.id === "string" ? values.id : crypto.randomUUID());
  const info = (values.details ?? {}) as Record<string, string>;
  const [type, setType] = useState(info.customerType || "individual");
  const [shipping, setShipping] = useState(info.shippingEnabled === "true");
  const [advanced, setAdvanced] = useState(false);
  const [contacts, setContacts] = useState(() => contactsFrom(info.contacts));
  const contactKey = useRef(10), busy = useRef(false);
  const [saving, setSaving] = useState(false), [localError, setLocalError] = useState("");
  const advancedId = useId(), shippingId = useId();
  const address = (prefix = "") => <div className={layout.address}>{customerAddressFields.map(([key, label]) => { const name = prefix ? prefix + key[0].toUpperCase() + key.slice(1) : key; return <Field key={key} label={label}><input name={name} maxLength={250} defaultValue={info[name] || ""} /></Field>; })}</div>;
  return <form className={`${styles.form} ${layout.customerForm}`} onSubmit={async event => {
    event.preventDefault(); if (pending || busy.current) return; setLocalError("");
    let payload: ReturnType<typeof customerPayload>;
    try { payload = customerPayload(new FormData(event.currentTarget), id, values.active !== false); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع بيانات العميل"); return; }
    busy.current = true; setSaving(true);
    try { if (await onSubmit("party", payload)) onSaved?.(id); }
    catch { setLocalError("تعذر حفظ العميل أعد المحاولة"); }
    finally { busy.current = false; setSaving(false); }
  }}>
    <div className={layout.heading}><div><h3>بيانات العميل</h3><p className={styles.muted}>اسم العميل ورقم الجوال إلزاميان</p></div><button type="button" className={styles.secondary} aria-expanded={advanced} aria-controls={advancedId} onClick={() => { setAdvanced(!advanced); onAdvancedChange?.(!advanced); }}>{advanced ? "عرض مبسط" : "متقدم"}</button></div>
    {(localError || error) && <p role="alert" className={styles.error}>{localError || error}</p>}
    <fieldset disabled={pending || saving} className={styles.form}>
      <div className={`${layout.columns} ${advanced ? layout.expanded : ""}`}>
      <section className={layout.panel} aria-label="بيانات العميل">
        <fieldset className={layout.type}><legend>نوع العميل</legend>{[["individual", "فرد"], ["business", "شركة"]].map(([value, label]) => <label key={value}><input type="radio" name="customerType" value={value} checked={type === value} onChange={() => setType(value)} />{label}</label>)}</fieldset>
        <Field label={type === "business" ? "الاسم التجاري *" : "الاسم بالكامل *"}><input name="name" required maxLength={150} defaultValue={String(values.name ?? "")} /></Field>
        <fieldset hidden={type !== "business"} disabled={type !== "business"} className={styles.fields}><Field label="الاسم الأول"><input name="firstName" maxLength={250} defaultValue={info.firstName} /></Field><Field label="الاسم الأخير"><input name="lastName" maxLength={250} defaultValue={info.lastName} /></Field></fieldset>
        <Field label="البريد الإلكتروني"><input name="email" type="email" dir="ltr" maxLength={254} defaultValue={String(values.email ?? "")} /></Field>
        {address()}
        <div className={styles.fields}><Field label="الهاتف"><input name="telephone" type="tel" dir="ltr" maxLength={30} defaultValue={info.telephone} /></Field><Field label="الجوال *"><input name="phone" type="tel" dir="ltr" required maxLength={30} defaultValue={String(values.phone ?? "")} /></Field></div>
        <Country name="country" value={info.country ?? (values.id ? "" : "SA")} />
        <fieldset hidden={type !== "business"} disabled={type !== "business"}><label className={layout.check}><input type="checkbox" name="governmentEntity" value="true" defaultChecked={info.governmentEntity === "true"} />العميل جهة حكومية</label></fieldset>
        <div className={styles.fields}><Field label="نوع المعرف"><select name="governmentIdType" defaultValue={info.governmentIdType || ""}><option value="">اختر نوع المعرف</option>{info.governmentIdType && !customerIdentifierOptions.some(v => v === info.governmentIdType) && <option>{info.governmentIdType}</option>}{customerIdentifierOptions.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="رقم المعرف"><input name="governmentId" maxLength={250} defaultValue={info.governmentId} /></Field><Field label="الرقم الضريبي" hint="اختياري"><input name="taxNumber" dir="ltr" maxLength={30} defaultValue={String(values.tax_number ?? values.taxNumber ?? "")} /></Field><Field label="سجل تجاري أو رقم موحد"><input name="unifiedNumber" maxLength={250} defaultValue={info.unifiedNumber} /></Field></div>
        <label className={layout.check}><input type="checkbox" name="shippingEnabled" value="true" checked={shipping} aria-controls={shippingId} aria-expanded={shipping} onChange={e => setShipping(e.target.checked)} />إضافة عنوان شحن</label>
        <fieldset id={shippingId} className={layout.shipping} hidden={!shipping} disabled={!shipping}><legend>عنوان الشحن</legend><Field label="الاسم"><input name="shippingName" maxLength={250} defaultValue={info.shippingName} /></Field>{address("shipping")}<Country name="shippingCountry" value={info.shippingCountry} /></fieldset>
      </section>
      <section id={advancedId} className={layout.panel} hidden={!advanced} aria-label="بيانات الحساب">
        <h3>بيانات الحساب</h3>
        <Field label="رقم العميل" hint="يُنشأ تلقائيًا"><input readOnly value={id} dir="ltr" /></Field>
        <Field label="طريقة الفاتورة"><select name="invoiceMethod" defaultValue={info.invoiceMethod === "whatsapp" ? "whatsapp" : "print"}><option value="print">طباعة</option><option value="whatsapp">أرسل عبر الواتساب</option></select></Field>
        <Field label="العملة"><select name="currency" defaultValue={info.currency || "SAR"}>{["SAR", "AED", "USD", "EUR", "GBP", "KWD", "BHD", "QAR", "OMR", "EGP"].map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="التصنيف"><input name="classification" maxLength={250} defaultValue={info.classification} /></Field>
        <Field label="الملاحظات"><textarea name="notes" maxLength={2000} defaultValue={info.notes} /></Field>
        <Field label="لغة العرض"><select name="language" defaultValue={info.language || "ar"}><option value="ar">العربية</option><option value="en">الإنجليزية</option></select></Field>
        <details className={layout.extra}><summary>بيانات إضافية</summary><div className={styles.fields}>{[["legalName", "الاسم القانوني"], ["taxRegistration", "حالة التسجيل الضريبي"], ["commercialRegistration", "السجل التجاري"], ["region", "المنطقة"], ["unitNumber", "رقم الوحدة"], ["contactName", "مسؤول التواصل"]].map(([key, label]) => <Field key={key} label={label}><input name={key} maxLength={250} defaultValue={info[key]} /></Field>)}</div><Field label="ملاحظات العنوان"><textarea name="addressNotes" maxLength={2000} defaultValue={info.addressNotes} /></Field></details>
        <section className={layout.contacts} aria-label="جهات الاتصال"><h3>قائمة الاتصال</h3>{contacts.map((contact, index) => <div className={layout.contact} key={contact.key}><div className={layout.heading}><span>جهة اتصال {index + 1}</span><button type="button" className={styles.iconButton} aria-label={`حذف جهة الاتصال ${index + 1}`} onClick={() => setContacts(rows => rows.filter(r => r.key !== contact.key))}><Trash2 size={16} /></button></div><div className={styles.fields}>{([['firstName', 'الاسم الأول'], ['lastName', 'الاسم الأخير'], ['email', 'البريد الإلكتروني'], ['telephone', 'الهاتف'], ['phone', 'الجوال']] as const).map(([key, label]) => <Field key={key} label={label}><input name={`contact_${key}`} type={key === 'email' ? 'email' : key === 'phone' || key === 'telephone' ? 'tel' : 'text'} maxLength={key === 'phone' || key === 'telephone' ? 30 : 250} defaultValue={contact[key]} /></Field>)}</div></div>)}<button type="button" className={styles.secondary} disabled={contacts.length >= 10} onClick={() => setContacts(rows => [...rows, { key: ++contactKey.current }])}><Plus size={16} />إضافة جهة اتصال</button></section>
      </section>
      </div>
      <div className={styles.formFooter}><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button><button type="submit" className={styles.primary}>{pending || saving ? "جار حفظ العميل" : "حفظ العميل"}</button></div>
    </fieldset>
  </form>;
}
