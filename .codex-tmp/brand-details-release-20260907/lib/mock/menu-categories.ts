export type MenuCategoryRecord = {
  id: string;
  cafeSlug: string;
  name: string;
  description?: string;
  imageDataUrl?: string;
  /** IndexedDB reference — mock only */
  imageAssetId?: string;
  icon?: string;
  sortOrder: number;
  visible: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MENU_CATEGORIES_KEY = "barndaksa_qatrah_menu_categories";

export const defaultMenuCategories: MenuCategoryRecord[] = [
  {
    id: "cat_hot",
    cafeSlug: "qatrah",
    name: "قهوة ساخنة",
    description: "مشروبات القهوة الكلاسيكية والمميزة",
    sortOrder: 1,
    visible: true,
    featured: true,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
  {
    id: "cat_cold",
    cafeSlug: "qatrah",
    name: "قهوة باردة",
    sortOrder: 2,
    visible: true,
    featured: false,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
  {
    id: "cat_sweets",
    cafeSlug: "qatrah",
    name: "حلويات",
    sortOrder: 3,
    visible: true,
    featured: false,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
  {
    id: "cat_bakery",
    cafeSlug: "qatrah",
    name: "مخبوزات",
    sortOrder: 4,
    visible: true,
    featured: false,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
  {
    id: "cat_tea",
    cafeSlug: "qatrah",
    name: "شاي",
    sortOrder: 5,
    visible: true,
    featured: false,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
  {
    id: "cat_snacks",
    cafeSlug: "qatrah",
    name: "وجبات خفيفة",
    sortOrder: 6,
    visible: true,
    featured: false,
    createdAt: "2026-05-22",
    updatedAt: "2026-05-22",
  },
];

export function loadMenuCategories(): MenuCategoryRecord[] {
  throw new Error("Use Supabase — fetch via lib/data/menu or /api/public/cafe/[slug]/menu");
}

export function saveMenuCategories(_categories: MenuCategoryRecord[]) {
  throw new Error("Use Supabase — save via app/actions/menu");
}

export function getCategoryNameById(
  categories: MenuCategoryRecord[],
  categoryId?: string,
  fallback = "أخرى"
) {
  if (!categoryId) return fallback;
  return categories.find((c) => c.id === categoryId)?.name ?? fallback;
}
