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
}[] = [
  { id: "cafes_coffee", label: "مقاهي وكوفيهات", available: true, dashboardPath: "/dashboard" },
  { id: "restaurants", label: "مطاعم", available: false, dashboardPath: null },
  { id: "massage_centers", label: "مراكز مساج", available: false, dashboardPath: null },
  { id: "beauty_centers", label: "مراكز تجميل", available: false, dashboardPath: null },
  { id: "hair_salons", label: "صالونات العناية بالشعر", available: false, dashboardPath: null },
  { id: "clinics_health_centers", label: "العيادات والمراكز الصحية", available: false, dashboardPath: null },
  { id: "gyms_fitness", label: "صالات الرياضة واللياقة البدنية", available: false, dashboardPath: null },
  { id: "retail_stores", label: "متاجر البيع بالتجزئة", available: false, dashboardPath: null },
  { id: "clothing_stores", label: "متاجر الملابس", available: false, dashboardPath: null },
  { id: "furniture", label: "المفروشات", available: false, dashboardPath: null },
  { id: "events_conferences", label: "الفعاليات والمؤتمرات", available: false, dashboardPath: null },
];

export function getDashboardPathForCategory(category: string | null | undefined) {
  return BUSINESS_CATEGORIES.find((item) => item.id === category)?.dashboardPath ?? "/dashboard";
}
