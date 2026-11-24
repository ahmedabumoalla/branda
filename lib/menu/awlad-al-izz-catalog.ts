/** Commissioned draft catalog from the owner's 2026-11-24 menu and service list.
 * Owner confirmed IQD; salon amounts 10/15 were interpreted as 10,000/15,000.
 * This data does not write to the database or grant publication access.
 */
export type AwladSection = "salon" | "cafe" | "laser";
export const AWLAD_CATALOG_CURRENCY = "IQD" as const;
export type AwladCatalogCategory = {
  id: string;
  name: string;
  description: string;
  section: AwladSection;
};
export type AwladCatalogProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  catalogKind: "service" | "product";
  image: string;
};

export const AWLAD_CATEGORY_IDS = {
  salon: "aeef5901-6ec7-4d77-bac8-569995ac0001",
  hot: "aeef5901-6ec7-4d77-bac8-569995ac0002",
  cold: "aeef5901-6ec7-4d77-bac8-569995ac0003",
  bakery: "aeef5901-6ec7-4d77-bac8-569995ac0004",
  laser: "aeef5901-6ec7-4d77-bac8-569995ac0005",
} as const;

export const AWLAD_CATEGORIES: AwladCatalogCategory[] = [
  { id: AWLAD_CATEGORY_IDS.salon, name: "الحلاقة والعناية", description: "خدمات الحلاقة والعناية بالبشرة وبكج العرسان", section: "salon" },
  { id: AWLAD_CATEGORY_IDS.hot, name: "المشروبات الساخنة", description: "القهوة والشاي", section: "cafe" },
  { id: AWLAD_CATEGORY_IDS.cold, name: "المشروبات الباردة", description: "مشروبات باردة وعصائر", section: "cafe" },
  { id: AWLAD_CATEGORY_IDS.bakery, name: "المعجنات والتسالي", description: "معجنات وبسكويت وتسالي", section: "cafe" },
  { id: AWLAD_CATEGORY_IDS.laser, name: "خدمات الليزر", description: "", section: "laser" },
];

export const AWLAD_PRODUCTS: AwladCatalogProduct[] = [
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0001", name: "الحلاقة العادية", description: "حلاقة الشعر", price: 10000, categoryId: AWLAD_CATEGORY_IDS.salon, catalogKind: "service", image: "haircut.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0002", name: "حلاقة بمواد استخدام واحد", description: "حلاقة باستخدام مواد مخصصة للاستخدام مرة واحدة", price: 15000, categoryId: AWLAD_CATEGORY_IDS.salon, catalogKind: "service", image: "single-use.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0003", name: "تنظيف البشرة ١٢ مرحلة", description: "تنظيف البشرة بجهاز ١٢ مرحلة ومواد طبية", price: 25000, categoryId: AWLAD_CATEGORY_IDS.salon, catalogKind: "service", image: "facial.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0004", name: "بكج العرسان VIP", description: "حلاقة VIP مع تنظيف البشرة والضيافة", price: 50000, categoryId: AWLAD_CATEGORY_IDS.salon, catalogKind: "service", image: "groom.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0005", name: "قهوة تركية وسط", description: "", price: 1500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "coffee.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0006", name: "قهوة تركية سادة", description: "", price: 1500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "coffee.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0007", name: "قهوة حلوة", description: "", price: 1500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "coffee.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0008", name: "شاي", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "products/black-tea.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0009", name: "شاي نعناع", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "products/mint-tea.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0010", name: "شاي كرك", description: "", price: 1500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "products/karak.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0011", name: "نومي بصرة", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.hot, catalogKind: "product", image: "products/black-lime.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0012", name: "تايكر", description: "", price: 1250, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/energy.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0013", name: "تايكر مكسيكي", description: "", price: 1500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/mexican-energy.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0014", name: "K9", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/k9.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0015", name: "عصير أورنجال", description: "", price: 750, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/orange.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0016", name: "سينالكو", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/orange-soda.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0017", name: "بيبسي", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/cola.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0018", name: "سفن", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "products/lemon-lime.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0019", name: "ليمون", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.cold, catalogKind: "product", image: "cold-drinks.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0020", name: "باب الآغا", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/baba-al-agha.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0021", name: "بسكويت أوريو", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/sandwich-biscuits.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0022", name: "نستله VIP", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/wafer.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0023", name: "بوب كيك", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/pop-cake.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0024", name: "كرواسون", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "bakery.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0025", name: "ميني كيك", description: "", price: 250, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/mini-cake.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0026", name: "بسكويت", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/biscuits.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0027", name: "شيبس ليز", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/potato-chips.webp" },
  { id: "aeef5902-6ec7-4d77-bac8-569995ac0028", name: "دوريتوس", description: "", price: 500, categoryId: AWLAD_CATEGORY_IDS.bakery, catalogKind: "product", image: "products/tortilla-chips.webp" },
];
