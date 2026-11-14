"use client";

import { Plus, Trash2 } from "lucide-react";
import { BUTCHER_MEAT_TYPES, BUTCHER_STANDARD_UNITS, type ButcherProductDraft } from "@/lib/menu/butcher-products";

const inputClass = "mt-2 min-h-12 w-full min-w-0 rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]";

export function ButcherProductFields({ value, onChange, disabled, error }: {
  value: ButcherProductDraft;
  onChange: (value: ButcherProductDraft) => void;
  disabled: boolean;
  error?: string;
}) {
  function updateUnit(index: number, patch: Partial<ButcherProductDraft["units"][number]>) {
    onChange({ ...value, units: value.units.map((unit, position) => position === index ? { ...unit, ...patch } : unit) });
  }
  function addUnit() {
    const standard = BUTCHER_STANDARD_UNITS.find(unit => !value.units.some(selected => selected.id === unit.id));
    onChange({ ...value, units: [...value.units, { ...(standard ?? { id: `custom_${crypto.randomUUID()}`, label: "" }), price: "" }] });
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-5 rounded-2xl border border-[#E5D8CD] bg-[#FBF8F5] p-4 sm:p-5">
    <legend className="px-2 text-sm font-black text-[#3A2117]">مواصفات اللحم وأسعار الوحدات</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-black text-[#7A6255]" htmlFor="butcher-meat-type">نوع اللحم
        <select id="butcher-meat-type" required value={value.meatType} onChange={event => onChange({ ...value, meatType: event.target.value as ButcherProductDraft["meatType"] })} className={inputClass}>
          <option value="" disabled>اختر نوع اللحم</option>
          {BUTCHER_MEAT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-black text-[#7A6255]" htmlFor="butcher-origin">منشأ اللحم اختياري
        <input id="butcher-origin" list="butcher-origin-options" maxLength={60} value={value.origin} onChange={event => onChange({ ...value, origin: event.target.value })} placeholder="بلدي أو سواكن أو مستورد" className={inputClass} />
        <datalist id="butcher-origin-options"><option value="بلدي" /><option value="سواكن" /><option value="مستورد" /></datalist>
      </label>
    </div>
    <p id="butcher-units-hint" className="text-xs leading-6 text-[#7A6255]">حدد الوحدات التي تبيع بها وسعر كل وحدة وستظهر للاختيار في الكاشير</p>
    <div className="space-y-3">
      {value.units.map((unit, index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] items-end gap-2 rounded-2xl border border-[#E5D8CD] bg-white p-3">
        <label className="min-w-0 text-xs font-black text-[#7A6255]" htmlFor={`butcher-unit-${index}`}>وحدة القياس
          <select id={`butcher-unit-${index}`} value={unit.id.startsWith("custom_") ? "custom" : unit.id} aria-describedby="butcher-units-hint" className={inputClass} onChange={event => {
            const standard = BUTCHER_STANDARD_UNITS.find(item => item.id === event.target.value);
            updateUnit(index, standard ?? { id: `custom_${crypto.randomUUID()}`, label: "" });
          }}>
            {BUTCHER_STANDARD_UNITS.map(option => <option key={option.id} value={option.id} disabled={value.units.some((selected, position) => position !== index && selected.id === option.id)}>{option.label}</option>)}
            <option value="custom">وحدة أخرى</option>
          </select>
        </label>
        {unit.priceMode === "cashier" ? <p className="min-w-0 pb-3 text-xs font-bold leading-5 text-[#7A6255]">يُدخل السعر عند البيع</p> : <label className="min-w-0 text-xs font-black text-[#7A6255]" htmlFor={`butcher-price-${index}`}>السعر ر.س
          <input id={`butcher-price-${index}`} type="number" inputMode="decimal" required min="0.000001" max="1000000" step="0.000001" dir="ltr" value={unit.price} onChange={event => updateUnit(index, { price: event.target.value })} placeholder={unit.id === "g" ? "0.065" : "65"} className={inputClass} />
        </label>}
        <button type="button" disabled={value.units.length === 1} onClick={() => onChange({ ...value, units: value.units.filter((_, position) => position !== index) })} aria-label={`حذف وحدة ${unit.label || index + 1}`} className="flex h-12 w-12 items-center justify-center rounded-xl text-[#934833] hover:bg-[#FBF0E9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#934833] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={18} aria-hidden="true" /></button>
        <label className="col-span-3 flex min-h-12 items-start gap-3 py-2 text-xs font-bold leading-6 text-[#5B3825]" htmlFor={`butcher-price-mode-${index}`}>
          <input id={`butcher-price-mode-${index}`} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#5B3825]" checked={unit.priceMode === "cashier"} onChange={event => updateUnit(index, { priceMode: event.target.checked ? "cashier" : "fixed", price: "" })} />
          السعر يحدده الكاشير وقت البيع
        </label>
        {unit.id.startsWith("custom_") && <label className="col-span-3 text-xs font-black text-[#7A6255]" htmlFor={`butcher-label-${index}`}>اسم الوحدة
          <input id={`butcher-label-${index}`} required maxLength={60} value={unit.label} onChange={event => updateUnit(index, { label: event.target.value })} placeholder="مثال: قطعة أو عبوة" className={inputClass} />
        </label>}
      </div>)}
    </div>
    <button type="button" disabled={value.units.length >= 24} onClick={addUnit} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D6C1AD] px-4 text-sm font-black text-[#5B3825] hover:bg-[#F3EADF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B3825] disabled:opacity-40"><Plus size={18} aria-hidden="true" />إضافة وحدة وسعر</button>
    {error && <p id="butcher-product-error" role="alert" tabIndex={-1} className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>}
  </fieldset>;
}
