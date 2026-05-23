"use client";

import { Filter, Search, SlidersHorizontal } from "lucide-react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

export type FilterBarState = {
  query: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  onlyOffers: boolean;
  sort: "latest" | "popular" | "price-low" | "price-high";
};

type Props = {
  experience: ThemeExperience;
  categories: string[];
  state: FilterBarState;
  onChange: (patch: Partial<FilterBarState>) => void;
  layout?: "sidebar" | "horizontal" | "compact";
};

export function ThemedFilterBar({
  experience,
  categories,
  state,
  onChange,
  layout = "sidebar",
}: Props) {
  const { theme, collection } = experience;
  const isSidebar = layout === "sidebar" || collection === "sidebar-grid";

  const shell = isSidebar
    ? `rounded-2xl p-5 ${theme.card}`
    : `rounded-xl p-4 ${theme.card} flex flex-wrap gap-3 items-end`;

  const fieldClass = `${experience.formInput} h-12 w-full`;

  const inner = (
    <div className={isSidebar ? "space-y-3" : "flex flex-1 flex-wrap gap-3"}>
      <div className={`relative min-w-0 ${isSidebar ? "" : "w-full flex-1 sm:min-w-[160px]"}`}>
        <Search className={`absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 ${theme.muted}`} />
        <input
          value={state.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="ابحث عن منتج..."
          className={`${fieldClass} pr-12`}
        />
      </div>

      <select
        value={state.category}
        onChange={(e) => onChange({ category: e.target.value })}
        className={isSidebar ? fieldClass : `${fieldClass} min-w-[140px]`}
      >
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <div className={isSidebar ? "grid grid-cols-2 gap-2" : "flex gap-2"}>
        <input
          value={state.minPrice}
          onChange={(e) => onChange({ minPrice: e.target.value })}
          placeholder="من"
          className={fieldClass}
        />
        <input
          value={state.maxPrice}
          onChange={(e) => onChange({ maxPrice: e.target.value })}
          placeholder="إلى"
          className={fieldClass}
        />
      </div>

      <select
        value={state.sort}
        onChange={(e) =>
          onChange({
            sort: e.target.value as FilterBarState["sort"],
          })
        }
        className={isSidebar ? fieldClass : `${fieldClass} min-w-[140px]`}
      >
        <option value="latest">الأحدث</option>
        <option value="popular">الأكثر طلبًا</option>
        <option value="price-low">السعر الأقل</option>
        <option value="price-high">السعر الأعلى</option>
      </select>

      <button
        type="button"
        onClick={() => onChange({ onlyOffers: !state.onlyOffers })}
        className={`flex h-12 items-center justify-center gap-2 font-black ${
          isSidebar ? "w-full rounded-2xl" : "rounded-xl px-4"
        } ${state.onlyOffers ? theme.button : theme.buttonOutline}`}
      >
        <Filter className="h-4 w-4" />
        عروض فقط
      </button>
    </div>
  );

  return (
    <div className={shell}>
      {isSidebar ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal className={`h-5 w-5 ${theme.accent}`} />
            <h2 className="font-black">فلترة</h2>
          </div>
          {inner}
        </>
      ) : (
        inner
      )}
    </div>
  );
}
