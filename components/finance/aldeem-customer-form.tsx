"use client";

import { useId, useRef, useState } from "react";
import { Building2, ChevronDown, MapPin, Save, ShieldCheck, Truck, UserRound } from "lucide-react";
import { buildCustomerPayload, customerCountries } from "@/lib/finance/customer-fields";
import type { FinanceFormOperation } from "./finance-operation-form";
import css from "./aldeem-customer-form.module.css";

type Props = {
  values?: Record<string, unknown>;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (operation: FinanceFormOperation, payload: Record<string, unknown>) => Promise<boolean>;
  onSaved?: (id: string) => void;
};

const addressFields = [["city", "المدينة"], ["district", "الحي"], ["street", "الشارع"], ["buildingNumber", "رقم المبنى"], ["additionalNumber", "الرقم الإضافي"], ["postalCode", "الرمز البريدي"], ["shortAddress", "العنوان الوطني المختصر"], ["unitNumber", "رقم الوحدة أو الشقة"], ["landmark", "معلم قريب"]] as const;
const managedDetails = new Set(["customerType", "address", "country", "shippingEnabled", "shippingAddress", "shippingCountry", "creditEnabled", "creditLimit", "creditDays", "commercialRegistration", ...addressFields.flatMap(([key]) => [key, `shipping${key[0].toUpperCase()}${key.slice(1)}`])]);

function CountryField({ name, value }: { name: string; value?: string }) {
  return <label className={css.field}><span>البلد</span><select name={name} defaultValue={value || ""} autoComplete={name === "country" ? "country" : "shipping country"}>
    <option value="">اختر البلد</option>{value && !customerCountries.some(country => country.code === value) && <option value={value}>{value}</option>}
    {customerCountries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
  </select></label>;
}

export function AldeemCustomerForm({ values = {}, pending, error, onCancel, onSubmit, onSaved }: Props) {
  const [id] = useState(() => typeof values.id === "string" ? values.id : crypto.randomUUID());
  const info = (values.details ?? {}) as Record<string, string>;
  const [type, setType] = useState(info.customerType === "business" ? "business" : "individual");
  const [shipping, setShipping] = useState(info.shippingEnabled === "true");
  const [credit, setCredit] = useState(info.creditEnabled === "true");
  const [saving, setSaving] = useState(false), [localError, setLocalError] = useState("");
  const locked = useRef(false), shippingId = useId(), creditId = useId();
  const busy = pending || saving;
  const address = (prefix = "") => <>
    <label className={`${css.field} ${css.full}`}><span>العنوان</span><input name={prefix ? "shippingAddress" : "address"} maxLength={250} defaultValue={info[prefix ? "shippingAddress" : "address"] || ""} placeholder="وصف العنوان" /></label>
    <CountryField name={prefix ? "shippingCountry" : "country"} value={info[prefix ? "shippingCountry" : "country"]} />
    {addressFields.map(([key, label]) => { const name = prefix ? `shipping${key[0].toUpperCase()}${key.slice(1)}` : key; return <label className={css.field} key={name}><span>{label}</span><input name={name} maxLength={250} defaultValue={info[name] || ""} /></label>; })}
  </>;

  return <form className={css.form} dir="rtl" onSubmit={async event => {
    event.preventDefault(); if (busy || locked.current) return;
    setLocalError("");
    let payload: ReturnType<typeof buildCustomerPayload>;
    try {
      const form = new FormData(event.currentTarget);
      form.set("creditEnabled", String(credit));
      form.set("shippingEnabled", String(shipping));
      payload = buildCustomerPayload(form, id, values.active !== false, { phoneOptional: true });
      const preserved = Object.fromEntries(Object.entries(info).filter(([key]) => !managedDetails.has(key)));
      payload.details = { ...preserved, ...payload.details };
      payload.details.shippingEnabled = String(shipping);
      if (info.contacts) payload.details.contacts = info.contacts;
      // Fields hidden by the individual/company choice must not silently erase saved tax identity.
      if (type === "individual") {
        payload.taxNumber = String(values.tax_number ?? values.taxNumber ?? "");
        if (info.commercialRegistration) payload.details.commercialRegistration = info.commercialRegistration;
      }
      if (new TextEncoder().encode(JSON.stringify(payload.details)).length > 16000) throw new Error("بيانات العميل أكبر من الحد المسموح");
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "راجع بيانات العميل"); return; }
    locked.current = true; setSaving(true);
    try { if (await onSubmit("party", payload)) onSaved?.(id); }
    catch { setLocalError("تعذر حفظ العميل أعد المحاولة"); }
    finally { locked.current = false; setSaving(false); }
  }}>
    <div className={css.intro}><span className={css.introIcon}><UserRound size={22} aria-hidden="true" /></span><div><h3>ملف العميل</h3><p>الاسم فقط مطلوب للفرد والشركة وجميع بيانات التواصل والعنوان والضريبة والسجل التجاري اختيارية</p></div></div>
    {(localError || error) && <p className={css.error} role="alert">{localError || error}</p>}
    <fieldset className={css.body} disabled={busy}>
      <section className={css.section} aria-label="بيانات العميل">
        <fieldset className={css.types}><legend>نوع العميل</legend>{[["individual", "فرد", UserRound], ["business", "شركة", Building2]].map(([value, title, Icon]) => {
          const TypeIcon = Icon as typeof UserRound;
          return <label key={String(value)} data-selected={type === value}><input type="radio" name="customerType" value={String(value)} checked={type === value} onChange={() => setType(String(value))} /><TypeIcon size={17} aria-hidden="true" /><span>{String(title)}</span></label>;
        })}</fieldset>
        <div className={css.grid}>
          <label className={`${css.field} ${css.full}`}><span>{type === "business" ? "اسم الشركة" : "اسم العميل"}<em>مطلوب</em></span><input name="name" required maxLength={150} autoComplete="name" defaultValue={String(values.name ?? "")} placeholder={type === "business" ? "الاسم التجاري للشركة" : "اسم العميل بالكامل"} /></label>
          <label className={css.field}><span>رقم الجوال</span><input name="phone" type="tel" dir="ltr" maxLength={30} autoComplete="tel" defaultValue={String(values.phone ?? "")} placeholder="05xxxxxxxx" /></label>
          <label className={css.field}><span>البريد الإلكتروني</span><input name="email" type="email" dir="ltr" maxLength={254} autoComplete="email" defaultValue={String(values.email ?? "")} placeholder="name@example.com" /></label>
        </div>
        <fieldset className={css.grid} hidden={type !== "business"} disabled={type !== "business"}>
          <label className={css.field}><span>الرقم الضريبي<em>اختياري</em></span><input name="taxNumber" dir="ltr" maxLength={30} defaultValue={String(values.tax_number ?? values.taxNumber ?? "")} /></label>
          <label className={css.field}><span>السجل التجاري<em>اختياري</em></span><input name="commercialRegistration" maxLength={250} defaultValue={info.commercialRegistration || ""} /></label>
        </fieldset>
      </section>

      <details className={css.address}>
        <summary><MapPin size={18} aria-hidden="true" /><span>{type === "business" ? "العنوان الوطني" : "العنوان"}<small>جميع الحقول اختيارية</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className={css.grid}>{address()}</div>
      </details>
      <section className={css.section}>
        <label className={css.toggleRow}><span className={css.toggleIcon}><Truck size={19} aria-hidden="true" /></span><span><strong>عنوان الشحن والتوصيل</strong><small>أضف عنوانًا مستقلًا لتسليم الطلبات</small></span><input type="checkbox" role="switch" checked={shipping} aria-controls={shippingId} aria-expanded={shipping} onChange={event => setShipping(event.target.checked)} /></label>
        <fieldset id={shippingId} className={css.grid} hidden={!shipping} disabled={!shipping}>{address("shipping")}</fieldset>
      </section>
      <section className={`${css.section} ${css.credit}`}>
        <label className={css.toggleRow}><span className={css.toggleIcon}><ShieldCheck size={19} aria-hidden="true" /></span><span><strong>السماح بالبيع الآجل</strong><small>حدد سقف المديونية ومدة السداد لهذا العميل</small></span><input type="checkbox" role="switch" checked={credit} aria-controls={creditId} aria-expanded={credit} onChange={event => setCredit(event.target.checked)} /></label>
        <fieldset id={creditId} hidden={!credit} disabled={!credit} className={css.creditFields}>
          <div className={css.grid}>
            <label className={css.field}><span>أقصى مبلغ مستحق<em>ريال سعودي</em></span><input name="creditLimit" type="number" min="0" max="1000000000000" step="0.01" required defaultValue={info.creditLimit ?? ""} placeholder="مثال 500" /></label>
            <label className={css.field}><span>مدة السداد<em>يوم</em></span><input name="creditDays" type="number" min="0" max="3650" step="1" required defaultValue={info.creditDays ?? ""} placeholder="مثال 30" /></label>
          </div>
          <p className={css.hint}>ما يتجاوز الحد يُدفع نقدًا وتوقف الفواتير المتأخرة البيع الآجل حتى سدادها</p>
          <p className={css.hint}>مدة صفر تعني أن السداد مستحق في يوم إصدار الفاتورة</p>
        </fieldset>
      </section>
      <div className={css.footer}><button type="submit" className={css.save}><Save size={17} aria-hidden="true" />{busy ? "جار حفظ العميل" : "حفظ العميل"}</button><button type="button" className={css.cancel} onClick={onCancel}>إلغاء</button></div>
    </fieldset>
  </form>;
}
