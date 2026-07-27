import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const detail = read("components/cafe/product-detail-client.tsx");
const showcase = read("components/cafe/product-cinematic-showcase.tsx");
const layout = read("components/cafe/themes/themed-product-detail.tsx");
const media = read("components/cafe/product-image.tsx");
const productPage = read("app/c/[slug]/product/[id]/page.tsx");
const productRoute = read("app/api/public/cafe/[slug]/products/[id]/route.ts");
const catalogPage = read("components/cafe/product-collection-page.tsx");
const catalogHook = read("lib/cafe/use-public-product-catalog.ts");
const catalogRoute = read("app/api/public/cafe/[slug]/catalog/route.ts");
const catalogCard = read("components/cafe/themes/customer-mobile-experience.tsx");
const orderActions = read("app/actions/orders.ts");
const packageJson = JSON.parse(read("package.json"));

for (const token of [
  "createCafeOrderAction",
  "getCustomerSession",
  "clearCachedCustomerSession",
  "getCustomerLoginHref",
  "quantity",
  "branchName",
  "pickupAt",
  "setNotes",
  "addToOrder",
  "orderingEnabled",
  "ملخص الطلب",
  "اختيار الفرع",
  "وقت الاستلام",
  "وقت الدخول",
  "ملاحظات",
  "شراء تذكرة",
  "اطلب",
]) {
  if (detail.includes(token)) {
    throw new Error(`Order behavior remains in product detail: ${token}`);
  }
}

for (const token of [
  "ProductMediaDisplay",
  "productFinalPrice",
  "promoBadgeText",
  "formatSar",
  "ProductCinematicShowcase",
  "تفاصيل المنتج",
  "product.ingredients.length",
  "EventDetails",
  "استكشف بقية المنتجات",
  "productsHref",
]) {
  if (!detail.includes(token)) {
    throw new Error(`Required safe product presentation is missing: ${token}`);
  }
}

if (/motion\/react|LazyMotion|MotionConfig|useReducedMotion|CustomerBottomDock/.test(detail)) {
  throw new Error("Product detail must use CSS motion only and must not render the bottom dock");
}
if (/fetch\(|usePublicCafeMenu|branches|getCustomerSession/.test(detail)) {
  throw new Error("Product detail must not fetch catalog, branches, or customer session");
}
if (!productPage.includes('import { getPublicProductBySlug } from "@/lib/data/menu";')) {
  throw new Error("Product page must import getPublicProductBySlug");
}
if (!productPage.includes("await getPublicProductBySlug(slug, id)")) {
  throw new Error("Product page must resolve the selected product using slug and id");
}
if (!productPage.includes("initialProduct={initialProduct}")) {
  throw new Error("Product page must pass initialProduct to ProductDetailClient");
}
if (productPage.includes("fetch(") || detail.includes("fetch(")) {
  throw new Error("Product detail must not introduce a duplicate client fetch");
}
if (!productRoute.includes("getPublicProductBySlug")) {
  throw new Error("The isolated full product endpoint contract is missing");
}
if (!orderActions.includes("createCafeOrderAction")) {
  throw new Error("The global order system must remain available outside product detail");
}
if (!detail.includes("@media (prefers-reduced-motion: reduce)")) {
  throw new Error("CSS reduced-motion support is missing");
}
if (!showcase.includes("prefers-reduced-motion: reduce")) {
  throw new Error("2.5D reduced-motion support is missing");
}
if (
  !showcase.includes("frameRef.current === null") ||
  !showcase.includes("cancelAnimationFrame") ||
  !showcase.includes("event.pointerType !== \"mouse\"")
) {
  throw new Error("2.5D pointer updates must remain mouse-only, guarded, and cancellable");
}
for (const limit of [
  "var(--cinematic-x) * 6px",
  "var(--cinematic-y) * 5px",
  "var(--cinematic-y) * -2.5deg",
  "var(--cinematic-x) * 3.5deg",
]) {
  if (!showcase.includes(limit)) throw new Error(`2.5D limit missing: ${limit}`);
}
if (!showcase.includes("!hasVideo") || !showcase.includes("saveData")) {
  throw new Error("Video and data-saver safeguards are missing");
}
for (const theme of ['detail === "kiosk"', 'detail === "stack"', 'detail === "minimal"']) {
  if (!layout.includes(theme)) throw new Error(`Theme layout missing: ${theme}`);
}
for (const token of ["min-w-0", "break-words", "max-w-full", "sm:grid-cols-2"]) {
  if (!`${detail}\n${layout}`.includes(token)) {
    throw new Error(`Responsive overflow safeguard missing: ${token}`);
  }
}
for (const mediaContract of [
  "ProductMediaCarousel",
  "AutoplayProductVideo",
  "playsInline",
  'preload="metadata"',
]) {
  if (!media.includes(mediaContract)) {
    throw new Error(`Media contract missing: ${mediaContract}`);
  }
}

if (!catalogPage.includes("usePublicProductCatalog")) {
  throw new Error("The lightweight catalog hook is no longer used");
}
if (/IntersectionObserver|loadMore|loadingMore|hasMore|عرض المزيد/.test(catalogPage)) {
  throw new Error("Catalog scroll pagination returned");
}
if (!catalogCard.includes("prefetch={false}")) {
  throw new Error("Product card detail prefetch must remain disabled");
}
if (!catalogHook.includes("public-product-catalog-summary:")) {
  throw new Error("Tenant-scoped catalog cache key is missing");
}
if (/cursor|nextCursor/.test(catalogHook) || /cursor|nextCursor/.test(catalogRoute)) {
  throw new Error("Catalog must remain a single response without pagination");
}

for (const dependency of ["gsap", "three", "framer-motion", "motion-plus"]) {
  if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency]) {
    throw new Error(`Prohibited new dependency found: ${dependency}`);
  }
}
if (/canvas|webgl/i.test(`${detail}\n${showcase}`)) {
  throw new Error("Canvas/WebGL must not be used in product detail");
}
if (/supabase\/migrations/i.test(`${detail}\n${showcase}\n${productPage}`)) {
  throw new Error("Product detail must not introduce a migration");
}

console.log("Premium product detail safe checks passed.");
