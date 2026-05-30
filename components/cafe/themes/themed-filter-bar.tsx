"use client";

import { RotateCcw, Search, Tag } from "lucide-react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { PriceRangeFilter } from "@/lib/cafe/menu-category-utils";
import { isFilterActive } from "@/lib/cafe/menu-category-utils";

export type FilterBarState = {
  query: string;
  category: string;
  priceRange: PriceRangeFilter;
  onlyOffers: boolean;
  sort: "latest" | "popular" | "price-low" | "price-high" | "offers";
};

type Props = {
  experience: ThemeExperience;
  categories: string[];
  state: FilterBarState;
  onChange: (patch: Partial<FilterBarState>) => void;
  onReset?: () => void;
};

const SORT_OPTIONS: { value: FilterBarState["sort"]; label: string }[] = [
  { value: "popular", label: "الأكثر طلبًا" },
  { value: "latest", label: "الأحدث" },
  { value: "price-low", label: "السعر: الأقل أولًا" },
  { value: "price-high", label: "السعر: الأعلى أولًا" },
  { value: "offers", label: "المنتجات ذات العروض" },
];

const PRICE_OPTIONS: { value: PriceRangeFilter; label: string }[] = [
  { value: "all", label: "جميع الأسعار" },
  { value: "under-20", label: "أقل من 20 ر.س" },
  { value: "20-40", label: "20 إلى 40 ر.س" },
  { value: "over-40", label: "أكثر من 40 ر.س" },
];

function FilterSelect({
  label,
  value,
  onChange,
  options,
  fieldClass,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  fieldClass: string;
}) {
  return (
    <label className="block min-w-0 flex-1 sm:min-w-[140px] sm:flex-none">
      <span className="mb-1.5 block text-[11px] font-black opacity-80">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`brand-cafe-form-select ${fieldClass} cursor-pointer appearance-none bg-no-repeat`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B3A25' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundPosition: "left 0.85rem center",
          paddingLeft: "2.25rem",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ThemedFilterBar({
  experience,
  categories,
  state,
  onChange,
  onReset,
}: Props) {
  const { theme } = experience;
  const fieldClass = `${experience.formInput} h-11 w-full text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--ci-accent-bg,var(--ci-accent,#D9A33F))]/30`;
  const hasActive = isFilterActive(state);

  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${theme.card}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className={`h-4 w-4 ${theme.accent}`} />
          <h2 className="text-sm font-black">فلترة المنيو</h2>
        </div>
        {hasActive && onReset ? (
          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black ${theme.buttonOutline}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            مسح الفلاتر
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black opacity-80">بحث</span>
          <div className="relative">
            <Search className={`absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
            <input
              value={state.query}
              onChange={(e) => onChange({ query: e.target.value })}
              placeholder="ابحث عن مشروب أو منتج..."
              className={`${fieldClass} pr-10`}
            />
          </div>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="التصنيف"
            value={state.category}
            onChange={(v) => onChange({ category: v })}
            options={categories.map((name) => ({ value: name, label: name }))}
            fieldClass={fieldClass}
          />
          <FilterSelect
            label="الترتيب"
            value={state.sort}
            onChange={(v) =>
              onChange({
                sort: v as FilterBarState["sort"],
                onlyOffers: v === "offers" ? true : state.onlyOffers,
              })
            }
            options={SORT_OPTIONS}
            fieldClass={fieldClass}
          />
          <FilterSelect
            label="السعر"
            value={state.priceRange}
            onChange={(v) => onChange({ priceRange: v as PriceRangeFilter })}
            options={PRICE_OPTIONS}
            fieldClass={fieldClass}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onChange({ onlyOffers: !state.onlyOffers })}
              className={`h-11 w-full rounded-2xl text-sm font-black transition ${
                state.onlyOffers ? theme.button : theme.buttonOutline
              }`}
            >
              {state.onlyOffers ? "✓ العروض فقط" : "العروض فقط"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function defaultProductFilters(
  overrides?: Partial<FilterBarState>
): FilterBarState {
  return {
    query: "",
    category: "الكل",
    priceRange: "all",
    onlyOffers: false,
    sort: "popular",
    ...overrides,
  };
}
