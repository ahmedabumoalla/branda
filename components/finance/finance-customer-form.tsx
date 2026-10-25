"use client";

import { useRef, useState } from "react";
import type { FinanceFormOperation } from "./finance-operation-form";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";

const groups = [
  { title: "البيانات الضريبية", fields: [["legalName", "الاسم القانوني أو اسم المنشأة"], ["taxRegistration", "حالة التسجيل الضريبي"]] },
  { title: "العنوان الوطني", fields: [["shortAddress", "العنوان المختصر"], ["buildingNumber", "رقم المبنى"], ["street", "اسم الشارع"], ["district", "الحي"], ["city", "المدينة"], ["region", "المنطقة"], ["postalCode", "الرمز البريدي"], ["additionalNumber", "الرقم الإضافي"], ["unitNumber", "رقم الوحدة"], ["country", "الدولة"], ["addressNotes", "تفاصيل إضافية للعنوان"]] },
  { title: "البيانات الحكومية", fields: [["governmentIdType", "نوع الهوية أو الوثيقة"], ["governmentId", "رقم الهوية أو الوثيقة"], ["commercialRegistration", "رقم السجل التجاري"], ["unifiedNumber", "الرقم الموحد للمنشأة"]] },
  { title: "معلومات إضافية", fields: [["contactName", "اسم مسؤول التواصل"], ["notes", "ملاحظات العميل"]] },
] as const;

export function customerPayload(form: FormData, id: string, active = true) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const name = text("name");
  if (!name) throw new Error("أدخل اسم العميل");
  if (name.length > 150) throw new Error("اسم العميل يجب ألا يتجاوز ١٥٠ حرفًا");
  const phone = text("phone");
  if (!phone) throw new Error("أدخل رقم جوال العميل");
  if (phone.length > 30) throw new Error("رقم الجوال يجب ألا يتجاوز ٣٠ حرفًا");
  const details: Record<string, string> = {};
  for (const group of groups) for (const [key] of group.fields) if (text(key)) details[key] = text(key);
  return { id, kind: "customer", name, phone, email: text("email"), taxNumber: text("taxNumber"), active, details };
}

export function FinanceCustomerForm({ values = {}, pending, error, onCancel, onSubmit, onSaved }: {
  values?: Record<string, unknown>; pending: boolean; error: string; onCancel: () => void;
  onSubmit: (operation: FinanceFormOperation, payload: Record<string, unknown>) => Promise<boolean>;
  onSaved?: (id: string) => void;
}) {
  const [id] = useState(() => typeof values.id === "string" ? values.id : crypto.randomUUID());
  const [localError, setLocalError] = useState("");
  const busy = useRef(false);
  const details = (values.details ?? {}) as Record<string, string>;
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault(); if (pending || busy.current) return;
    setLocalError("");
    let payload: ReturnType<typeof customerPayload>;
    try { payload = customerPayload(new FormData(event.currentTarget), id, values.active !== false); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع بيانات العميل"); return; }
    busy.current = true;
    try { if (await onSubmit("party", payload)) onSaved?.(id); }
    finally { busy.current = false; }
  }}>
    <p className={styles.muted}>اسم العميل ورقم الجوال إلزاميان ويمكنك استكمال بقية البيانات لاحقًا</p>
    {(localError || error) && <p role="alert" className={styles.error}>{localError || error}</p>}
    <fieldset disabled={pending} className={styles.form}>
      <Field label="اسم العميل"><input name="name" required maxLength={150} autoComplete="name" defaultValue={String(values.name ?? "")} /></Field>
      <div className={styles.fields}>
        <Field label="رقم الجوال"><input name="phone" type="tel" required dir="ltr" maxLength={30} autoComplete="tel" defaultValue={String(values.phone ?? "")} /></Field>
        <Field label="البريد الإلكتروني — اختياري"><input name="email" type="email" dir="ltr" maxLength={254} autoComplete="email" defaultValue={String(values.email ?? "")} /></Field>
      </div>
      {groups.map(group => <details key={group.title} className="rounded-xl border border-[#E6DACB] p-4">
        <summary className="min-h-11 cursor-pointer content-center font-semibold text-[#39251B]">{group.title}<span className="mr-2 text-xs font-normal text-[#78675C]">اختياري</span></summary>
        <div className={`${styles.fields} mt-3`}>
          {group.title === "البيانات الضريبية" && <Field label="الرقم الضريبي"><input name="taxNumber" maxLength={30} dir="ltr" defaultValue={String(values.tax_number ?? values.taxNumber ?? "")} /></Field>}
          {group.fields.map(([key, label]) => <Field key={key} label={label}>{key === "notes" || key === "addressNotes"
            ? <textarea name={key} maxLength={2000} defaultValue={details[key] ?? ""} />
            : <input name={key} maxLength={250} defaultValue={details[key] ?? ""} />}</Field>)}
        </div>
      </details>)}
      <div className={styles.formFooter}><button type="button" className={styles.secondary} onClick={onCancel}>إلغاء</button><button type="submit" className={styles.primary}>{pending ? "جار حفظ العميل" : "حفظ العميل"}</button></div>
    </fieldset>
  </form>;
}
