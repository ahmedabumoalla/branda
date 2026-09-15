import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const detail = read("components/cafe/product-detail-client.tsx");
const showcase = read("components/cafe/product-cinematic-showcase.tsx");
const page = read("app/c/[slug]/product/[id]/page.tsx");
const layout = read("components/cafe/themes/themed-product-detail.tsx");
const motionFeatures = read("components/cafe/product-motion-features.ts");
const media = read("components/cafe/product-image.tsx");
const pkg = JSON.parse(read("package.json"));

const forbiddenDetail = [
  "createCafeOrderAction",
  "getCustomerSession",
  "clearCachedCustomerSession",
  "getCustomerLoginHref",
  "setQuantity",
  "branchName",
  "pickupAt",
  "setNotes",
  "addToOrder",
  "defaultPickupTime",
  "activeBranches",
  "ملخص الطلب",
  "ملخص شراء التذكرة",
  "اختر الفرع",
  "وقت الاستلام",
  "ملاحظات الطلب",
  "اطلب للاستلام",
];

for (const token of forbiddenDetail) {
  if (detail.includes(token)) throw new Error(`Order residue remains in product detail: ${token}`);
}

for (const token of [
  "ProductMediaDisplay",
  "productFinalPrice",
  "promoBadgeText",
  "formatSar",
  "LazyMotion",
  "loadMotionFeatures",
  "MotionConfig",
  "useReducedMotion",
  "تفاصيل المنتج",
  "استكشف بقية المنتجات",
]) {
  if (!detail.includes(token)) throw new Error(`Required product detail behavior missing: ${token}`);
}

if (pkg.dependencies?.motion !== "12.42.2") {
  throw new Error("Motion must be pinned exactly to 12.42.2");
}
if (!motionFeatures.includes("domAnimation")) {
  throw new Error("Motion DOM features must be loaded from the async feature module");
}
if (!page.includes("getPublicProductBySlug") || page.includes("fetch(")) {
  throw new Error("Product must be loaded once on the server without an internal fetch");
}
if (/usePublicCafeMenu|branches|fetch\(/.test(detail)) {
  throw new Error("Product presentation must not fetch client resources or branches");
}
if (/canvas|webgl|three|gsap|motion-plus/i.test(`${detail}\n${showcase}`)) {
  throw new Error("A prohibited rendering or animation dependency was found");
}
if (!showcase.includes("requestAnimationFrame") || !showcase.includes("frameRef.current === null")) {
  throw new Error("Pointer motion must remain interaction-bound and RAF-guarded");
}
if (!showcase.includes("cancelAnimationFrame")) {
  throw new Error("Pointer frame must be cancelled on cleanup");
}
if (!showcase.includes("prefers-reduced-motion") || !detail.includes('reducedMotion="user"')) {
  throw new Error("Reduced motion is not fully supported");
}
for (const theme of ['detail === "kiosk"', 'detail === "stack"', 'detail === "minimal"']) {
  if (!layout.includes(theme)) throw new Error(`Theme layout missing: ${theme}`);
}
for (const behavior of ["ProductMediaCarousel", "AutoplayProductVideo", "playsInline", 'preload="metadata"']) {
  if (!media.includes(behavior)) throw new Error(`Media contract missing: ${behavior}`);
}
if (/supabase\/migrations/.test(`${detail}\n${showcase}\n${page}`)) {
  throw new Error("Product detail task must not introduce migrations");
}

console.log("Premium product detail checks passed.");
