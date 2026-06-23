export type BusinessCategoryId =
  | "cafes_coffee"
  | "restaurants"
  | "massage_centers"
  | "beauty_centers"
  | "hair_salons"
  | "clinics_health_centers"
  | "gyms_fitness"
  | "retail_stores"
  | "clothing_stores"
  | "furniture"
  | "events_conferences";

export const BUSINESS_CATEGORIES: {
  id: BusinessCategoryId;
  label: string;
  available: boolean;
  dashboardPath: string | null;
  icon: string;
}[] = [
  { id: "cafes_coffee", label: "مقاهي وكوفيهات", available: true, dashboardPath: "/dashboard", icon: "Coffee" },
  { id: "restaurants", label: "مطاعم", available: true, dashboardPath: "/dashboard", icon: "Utensils" },
  { id: "massage_centers", label: "مراكز مساج", available: false, dashboardPath: null, icon: "Sparkles" },
  { id: "beauty_centers", label: "مراكز تجميل", available: false, dashboardPath: null, icon: "Scissors" },
  { id: "hair_salons", label: "صالونات العناية بالشعر", available: false, dashboardPath: null, icon: "Scissors" },
  { id: "clinics_health_centers", label: "العيادات والمراكز الصحية", available: false, dashboardPath: null, icon: "HeartPulse" },
  { id: "gyms_fitness", label: "صالات الرياضة واللياقة البدنية", available: false, dashboardPath: null, icon: "Dumbbell" },
  { id: "retail_stores", label: "متاجر البيع بالتجزئة", available: false, dashboardPath: null, icon: "ShoppingBag" },
  { id: "clothing_stores", label: "متاجر الملابس", available: false, dashboardPath: null, icon: "Shirt" },
  { id: "furniture", label: "المفروشات", available: false, dashboardPath: null, icon: "Armchair" },
  { id: "events_conferences", label: "الفعاليات والمؤتمرات", available: true, dashboardPath: "/dashboard", icon: "CalendarDays" },
];

export function getDashboardPathForCategory(category: string | null | undefined) {
  return BUSINESS_CATEGORIES.find((item) => item.id === category)?.dashboardPath ?? "/dashboard";
}
