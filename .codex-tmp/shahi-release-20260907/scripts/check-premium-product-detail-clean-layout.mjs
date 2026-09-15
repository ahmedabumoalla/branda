import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const count = (source, token) => source.split(token).length - 1;

const page = read("app/c/[slug]/product/[id]/page.tsx");
const detail = read("components/cafe/product-detail-client.tsx");
const showcase = read("components/cafe/product-cinematic-showcase.tsx");
const layout = read("components/cafe/themes/themed-product-detail.tsx");
const media = read("components/cafe/product-image.tsx");
const catalog = read("components/cafe/product-collection-page.tsx");
const catalogHook = read("lib/cafe/use-public-product-catalog.ts");
const catalogRoute = read("app/api/public/cafe/[slug]/catalog/route.ts");
const catalogCard = read("components/cafe/themes/customer-mobile-experience.tsx");
const orders = read("app/actions/orders.ts");
const packageJson = JSON.parse(read("package.json"));

for (const token of [
  "getPublicProductBySlug(slug, id)",
  "initialProduct={initialProduct}",
]) {
  if (!page.includes(token)) throw new Error(`Server product contract missing: ${token}`);
}

for (const token of [
  "initialProduct",
  "initialProduct?.id === id",
  "ProductMediaDisplay",
  "ProductCinematicShowcase",
  "productFinalPrice",
  "promoBadgeText",
  "formatSar",
  "availabilityLabel",
]) {
  if (!detail.includes(token)) throw new Error(`Product detail contract missing: ${token}`);
}

if (/fetch\(|createCafeOrderAction|getCustomerSession|branches/.test(detail)) {
  throw new Error("Product detail introduced a client fetch, order action, branch, or session");
}

for (const field of ["category", "availability", "description", "price"]) {
  const marker = `data-product-field="${field}"`;
  if (count(detail, marker) !== 1) {
    throw new Error(`Product field must render exactly once: ${field}`);
  }
}

if (/cinematic-badges|availabilityLabel\s*\?\s*\(/.test(showcase)) {
  throw new Error("Product facts must not be duplicated over the media stage");
}
if (count(layout, "barndaksa-premium-card") !== 3) {
  throw new Error("Each theme branch must define one hero surface");
}
if (/min-w-\[\d+px\]|w-\[\d+px\]/.test(`${detail}\n${layout}`)) {
  throw new Error("Fixed-width product layout can overflow a 320px viewport");
}
for (const token of ["min-w-0", "break-words", "grid-cols-2", "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"]) {
  if (!`${detail}\n${layout}`.includes(token)) {
    throw new Error(`Responsive layout safeguard missing: ${token}`);
  }
}
for (const branch of ['detail === "kiosk"', 'detail === "stack"', 'detail === "minimal"']) {
  if (!layout.includes(branch)) throw new Error(`Theme layout missing: ${branch}`);
}

for (const token of ["ProductMediaCarousel", "AutoplayProductVideo", "playsInline", 'preload="metadata"']) {
  if (!media.includes(token)) throw new Error(`Media contract missing: ${token}`);
}
if (!catalog.includes("usePublicProductCatalog")) {
  throw new Error("Lightweight catalog contract is missing");
}
if (!catalogHook.includes("public-product-catalog-summary:") || /cursor|nextCursor/.test(`${catalogHook}\n${catalogRoute}`)) {
  throw new Error("Lightweight single-response catalog contract changed");
}
if (!catalogCard.includes("prefetch={false}")) {
  throw new Error("Product card prefetch protection changed");
}
if (!orders.includes("createCafeOrderAction")) {
  throw new Error("Order system contract changed");
}

for (const dependency of ["gsap", "three", "framer-motion", "motion-plus"]) {
  if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency]) {
    throw new Error(`Prohibited dependency found: ${dependency}`);
  }
}
if (/supabase\/migrations/i.test(`${page}\n${detail}\n${showcase}\n${layout}`)) {
  throw new Error("Product layout introduced a migration");
}

console.log("Premium product detail clean layout checks passed.");
