export type LoadingBrand = {
  name: string;
  logo?: string;
  background: string;
  accent: string;
  foreground: string;
  greeting: string;
  detail: string;
  salon?: boolean;
  blend?: boolean;
  plain?: boolean;
};

// Loading identity only: never use this registry to select a brand's menu layout
const brands: Record<string, LoadingBrand> = {
  "brand-0c1c249cb74b": { plain: true, name: "AWJ CAFE", logo: "/brand-assets/awj/logo.png", background: "#faf7f1", accent: "#b81d2c", foreground: "#30211f", greeting: "أهلًا بك في أوج", detail: "نجهّز لك المنيو" },
  "brand-7060952bf681": { plain: true, name: "أولاد العز", logo: "/brand-assets/awlad-al-izz/logo.jpeg", background: "#ffffff", accent: "#1609b8", foreground: "#08064e", greeting: "حياك عند أولاد العز", detail: "نجهّز لك الصفحة", salon: true },
  delicake: { name: "Deli Cake", logo: "/deli-cake/logo-official-light-v2.svg", background: "#202619", accent: "#c7c4a5", foreground: "#f8ebdd", greeting: "لحظتك الحلوة تبدأ هنا", detail: "نجهّز لك اختيارات ديلي كيك" },
  rast: { name: "مقهى الكواكب", logo: "/menu-logos/kawakib-transparent-20261008.png", background: "#272c26", accent: "#bdc8a4", foreground: "#ece9df", greeting: "قهوتك على ذوقك", detail: "نجهّز لك اختيارات الكواكب" },
  "brand-10620d3a586c": { name: "الركن الفرنسي", logo: "/french-corner/official-logo-transparent-v1.webp", background: "#080908", accent: "#ddbf79", foreground: "#f8f1dd", greeting: "ذوق يستحق لحظتك", detail: "نجهّز لك اختيارات الركن الفرنسي" },
  "double-b-bistro": { name: "Double B", background: "#252a21", accent: "#c5b48b", foreground: "#f6efdf", greeting: "بداية على ذوقك", detail: "نجهّز لك اختيارات دبل بي" },
  basilico: { name: "Basilico", logo: "/menu-logos/basilico-transparent-v1.png", background: "#152e25", accent: "#d9bf86", foreground: "#fff6e7", greeting: "للنكهة حكاية", detail: "نجهّز لك اختيارات بازيليكو" },
  "kat-coffe": { name: "Kath Coffee & More", logo: "/menu-logos/kath-transparent-v1.webp", background: "#3b241b", accent: "#e5b572", foreground: "#fbf6ed", greeting: "مزاجك له مكان", detail: "نجهّز لك اختيارات كاث" },
  "shahi-w-hail": { name: "شاهي وهيل", logo: "/menu-logos/shahi-transparent-v2.webp", background: "#20342a", accent: "#bac9a1", foreground: "#fff5df", greeting: "للروقان بداية", detail: "نجهّز لك اختيارات شاهي وهيل" },
  "barber-55": { name: "Barber 55", logo: "/salon/barber-55/logo.webp", background: "#101727", accent: "#ff6b88", foreground: "#e7edf5", greeting: "تفاصيل تصنع إطلالتك", detail: "نجهّز لك الخدمات والحجز", salon: true, blend: true },
  "brand-04cb352c9f44": { name: "صالون عناية", logo: "/menu-art/care/care-logo-v1.webp", background: "#10120f", accent: "#d4b780", foreground: "#faf3e7", greeting: "عناية تليق بتفاصيلك", detail: "نجهّز لك الخدمات والحجز", salon: true },
  "brand-7a92e7b3cb30": { name: "Fine Cut", logo: "/salon/fine-cut/logo-transparent-v2.webp", background: "#10120f", accent: "#d4b780", foreground: "#faf3e7", greeting: "إطلالتك تستحق العناية", detail: "نجهّز لك الخدمات والحجز", salon: true },
  "brand-dc78f4cd5bb8": { name: "100° DEGREES", logo: "/salon/100-degrees/wordmark.webp", background: "#faf8f3", accent: "#795236", foreground: "#302822", greeting: "صالون 100 درجة الرجالي", detail: "نجهّز لك الخدمات والحجز", salon: true },
  // MND keeps its dark wordmark, so its loading screen uses the cream paper and warm orange of its own menu.
  "mind-hospital": { name: "MND Café & Bakery", logo: "/menu-art/dabab/dabab-hospital-logo-v1.webp", background: "#f6efe2", accent: "#a14d0d", foreground: "#2d221d", greeting: "لحظة هادئة تكمّل يومك", detail: "نجهّز لك اختيارات MND" },
};

export function menuLoadingBrand(slug: string | undefined) {
  return slug && Object.hasOwn(brands, slug) ? brands[slug] : undefined;
}
