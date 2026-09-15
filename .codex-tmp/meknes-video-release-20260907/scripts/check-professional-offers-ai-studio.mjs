import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const dashboard = read("components/dashboard/pages/offers-page.tsx");
const publicPage = read("components/cafe/public-offers-page.tsx");
const card = read("components/offers/offer-card.tsx");
const generationRoute = read("app/api/dashboard/offers/[offerId]/generate-card/route.ts");
const generation = read("lib/offers/offer-ai-generation.ts");
const offers = read("lib/data/offers.ts");
const productDetail = read("components/cafe/product-detail-client.tsx");
const catalog = read("components/cafe/product-collection-page.tsx");
const packageJson = JSON.parse(read("package.json"));

for (const token of [
  "saveOfferAction",
  "deleteOfferAction",
  "initialProducts",
  "OfferCard",
  "generate-card",
]) {
  if (!dashboard.includes(token)) throw new Error(`Offer studio contract missing: ${token}`);
}
for (const token of [
  "requireOwnerCafeContext",
  'card_generation_status: "generating"',
  'card_generation_status: "ready"',
  'card_generation_status: "failed"',
  "uploadGeneratedImageBytes",
]) {
  if (!generationRoute.includes(token)) throw new Error(`Generation safety missing: ${token}`);
}
if (!generation.includes("process.env.OPENAI_API_KEY") || dashboard.includes("OPENAI_API_KEY")) {
  throw new Error("OpenAI key must remain server-only");
}
if (!generation.includes("No text, no letters, no numbers, no logos, no watermarks")) {
  throw new Error("Artwork prompt must forbid generated text and logos");
}
if (!publicPage.includes('resource: "offers"') || !publicPage.includes("<OfferCard")) {
  throw new Error("Public offers must use the dedicated offers resource and shared card");
}
if (/ProductPosterCard|usePublicProductCatalog|IntersectionObserver/.test(publicPage)) {
  throw new Error("Public offers must not load product cards, catalog, or scroll pagination");
}
if (!card.includes("prefetch={false}")) {
  throw new Error("Linked offer product navigation must keep prefetch disabled");
}
if (!offers.includes("clearServerMemoryCache(`public-offers:${normalizedSlug}`)")) {
  throw new Error("Public offers cache invalidation is missing");
}
for (const token of ["initialProduct", "ProductMediaDisplay", "productFinalPrice"]) {
  if (!productDetail.includes(token)) throw new Error(`Product detail isolation changed: ${token}`);
}
if (!catalog.includes("usePublicProductCatalog")) {
  throw new Error("Lightweight catalog contract changed");
}
for (const dependency of ["openai", "swiper", "embla-carousel", "gsap", "three"]) {
  if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency]) {
    throw new Error(`Unexpected dependency added: ${dependency}`);
  }
}
if (/supabase\/migrations/i.test(`${dashboard}\n${publicPage}\n${generationRoute}`)) {
  throw new Error("Offers studio must not introduce a migration");
}

console.log("Professional offers AI studio checks passed.");
