/** Presentation for the brands explicitly using the approved editorial menu */
export function editorialBrand(slug: string) {
  if (slug === "shahi-w-hail") return {
    name: "شاهي وهيل", community: "شاهي وهيل", wordmark: "TEA & HEEL",
    logo: "/menu-logos/shahi-transparent-v2.webp", hero: "/menu-art/shahi-tea-editorial-v1.webp",
    note: "شاهي تفاصيل لحظات", caption: "TEA & GOOD MOMENTS", mood: "شاهي ومزاج",
    description: "شاهي تحبّه وهيل يكمّل المزاج ولحظة تستاهل تعيشها على مهلك",
  };
  return {
    name: "مقهى كاث", community: "كاث", wordmark: "KATH",
    logo: "/menu-logos/kath-transparent-v1.webp", hero: "/menu-art/kath-coffee-editorial-v1.webp",
    note: "قهوة تفاصيل لحظات", caption: "COFFEE & GOOD MOMENTS", mood: "قهوة ومزاج",
    description: "قهوة تحبّها حلا يكمّلها ولحظة تستاهل تعيشها على مهلك",
  };
}
