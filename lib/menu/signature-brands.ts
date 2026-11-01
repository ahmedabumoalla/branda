/** Explicit identities: the legacy `rast` slug belongs to a different venue */
export const signatureBrands = {
  "brand-c138e578b03c": { key: "rast", name: "RAST", arabic: "راست", logo: "rast-logo", hero: "rast-hero", headline: "هنا يروق", emphasis: "المزاج", note: "قهوة على مهلك ولحظة على ذوقك", signature: "A MOMENT AT RAST", catalog: "على ذوقك", loyalty: "كل زيارة لها طعم ثاني" },
  "brand-5e0a98e765d2": { key: "black", name: "BLACK DROP", arabic: "بلاك دروب", logo: "black-drop-logo", hero: "black-hero", headline: "تفاصيل تبدأ", emphasis: "بقطرة", note: "خذ وقتك واختر رشفتك", signature: "IT STARTS WITH A DROP", catalog: "اختر مزاجك", loyalty: "قطرة اليوم تقرّب مكافأتك" },
  "brand-f9e223695585": { key: "once", name: "ONCE", arabic: "وانّس", logo: "once-logo", hero: "once-hero", headline: "مساحتك لفكرة", emphasis: "وفنجان", note: "هُنا مساحتك لتصنع عظمة فكرك", signature: "COFFEE • THOUGHTS • ONCE", catalog: "وش يونس وقتك؟", loyalty: "لحظاتك معنا تستاهل" },
  "brand-bd0eeac9e747": { key: "box", name: "BOX BBQ", arabic: "بوكس", logo: "box-logo", hero: "box-hero", headline: "نكهة تحكي", emphasis: "عن نفسها", note: "اختر برجر مزاجك وكمّلها على ذوقك", signature: "OPEN THE BOX. FEEL THE FLAVOUR.", catalog: "خلّها على ذوقك", loyalty: "زيارتك الجاية ألذ" },
} as const;

export type SignatureBrand = typeof signatureBrands[keyof typeof signatureBrands];
export function signatureBrand(slug: string): SignatureBrand | null {
  return Object.prototype.hasOwnProperty.call(signatureBrands, slug) ? signatureBrands[slug as keyof typeof signatureBrands] : null;
}

export function signatureAsset(name: string, mobile = false) {
  return `/menu-art/four-brands/${name}${mobile ? "-mobile" : ""}-v1.webp`;
}
