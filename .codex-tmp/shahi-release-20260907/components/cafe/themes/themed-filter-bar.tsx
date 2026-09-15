"use client";

import { BadgePercent, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { PriceRangeFilter } from "@/lib/cafe/menu-category-utils";
import { isFilterActive } from "@/lib/cafe/menu-category-utils";
import { getBusinessCopy } from "@/lib/platform/business-copy";

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
  businessCategory?: string;
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
  businessCategory,
}: Props) {
  const { theme } = experience;
  const copy = getBusinessCopy(businessCategory);
  const fieldClass = `${experience.formInput} h-11 w-full text-sm font-bold outline-none transition focus:ring-2 focus:ring-[var(--ci-accent-bg,var(--ci-accent,#D9A33F))]/30`;
  const hasActive = isFilterActive(state);

  return (
    <div className={`barndaksa-premium-card overflow-hidden rounded-[28px] border border-black/5 p-4 shadow-[0_18px_55px_rgba(49,25,18,0.08)] backdrop-blur sm:p-5 ${theme.card}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${theme.badge}`}>
            <SlidersHorizontal className={`h-4 w-4 ${theme.accent}`} />
          </span>
          <div>
            <p className={`text-[11px] font-black ${theme.muted}`}>تخصيص العرض</p>
            <h2 className="text-sm font-black">فلترة المنيو</h2>
          </div>
        </div>
        {hasActive && onReset ? (
          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-black transition active:scale-95 ${theme.buttonOutline}`}
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
              placeholder={copy.menuSearchPlaceholder}
              className={`${fieldClass} pr-10`}
            />
          </div>
        </label>

        {categories.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.slice(0, 8).map((name) => {
              const active = state.category === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ category: name })}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition active:scale-95 ${
                    active ? theme.button : theme.buttonOutline
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}

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
              className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-95 ${
                state.onlyOffers ? theme.button : theme.buttonOutline
              }`}
            >
              <BadgePercent className="h-4 w-4" />
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
