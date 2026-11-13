"use client";

import { Field } from "./finance-ui";
import type { useInvoiceShippingCharge } from "./use-invoice-shipping-charge";
import css from "./invoice-shipping-charge-editor.module.css";

export function InvoiceShippingChargeEditor({ resource, disabled }: { resource: ReturnType<typeof useInvoiceShippingCharge>; disabled: boolean }) {
  const { context, selection, change } = resource;
  if (!context || (!context.enabled && !selection)) return null;
  const blocked = disabled || !context.enabled;
  const patch = (value: Partial<NonNullable<typeof selection>>) => change({ optionId: null, name: "الشحن", amount: 0, taxRate: null, ...selection, ...value });
  const missing = selection?.optionId && !context.options.some(option => option.id === selection.optionId);
  return <div className={css.panel}>
    {!context.enabled && <p role="status">رسوم الشحن معطلة أزل الرسوم المحفوظة أو فعّل خيارات الشحن قبل الإصدار</p>}
    <div className={css.fields}>
      <Field label="خيار الشحن"><select value={selection?.optionId ?? ""} disabled={blocked} onChange={event => {
        const option = context.options.find(item => item.id === event.target.value);
        change(option ? { optionId: option.id, name: option.name, amount: option.fee, taxRate: option.taxRate } : selection ? { ...selection, optionId: null, name: "الشحن" } : null);
      }}><option value="">أخرى</option>{context.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}{missing && <option value={selection!.optionId!}>{selection!.name} — غير متاح</option>}</select></Field>
      <Field label="الضرائب"><select value={selection?.taxRate ?? ""} disabled={blocked} onChange={event => patch({ taxRate: event.target.value === "15" ? 15 : null })}><option value="">اختر ضريبة</option><option value="15">القيمة المضافة 15%</option></select></Field>
      <Field label="مصاريف الشحن" hint="غير شاملة الضريبة"><input type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={selection?.amount ?? ""} disabled={blocked} onChange={event => patch({ amount: Number(event.target.value) })} /></Field>
    </div>
    {missing && <p role="alert">خيار الشحن المحفوظ غير متاح اختر خيارًا نشطًا أو أخرى قبل الإصدار</p>}
    {selection && <button type="button" disabled={disabled} onClick={() => change(null)}>إزالة رسوم الشحن</button>}
  </div>;
}
