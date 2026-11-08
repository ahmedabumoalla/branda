export const TEA_BAKERY_SLUG = "brand-9010051467ed";
export const TEA_BAKERY_LOGO = "/menu-art/tea-bakery/logo-v1.png";
export const TEA_BAKERY_HERO = "/menu-art/tea-bakery/hero-v1.webp";

/** Editorial category artwork, never a substitute for a product photograph. */
export function teaBakeryCategoryStory(name: string) {
  const stories: Record<string, { image: string; english: string; note: string }> = {
    "المشروبات": { image: "drinks", english: "The art of a good cup", note: "لكل مزاج رشفة" },
    "V60": { image: "v60", english: "Slowly poured", note: "للقهوة وقتها" },
    "الحلا": { image: "desserts", english: "A little sweetness", note: "ختام يليق بلحظتك" },
    "المخبوزات": { image: "bakery", english: "From the bakery", note: "ما يُكمل فنجانك" },
  };
  const story = stories[name.trim()];
  return story ? { ...story, image: `/menu-art/tea-bakery/${story.image}-v1.webp` } : null;
}
