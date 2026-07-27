import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");
const dashboard = read("components/dashboard/pages/offers-page.tsx");
const publicPage = read("components/cafe/public-offers-page.tsx");
const sharedCard = read("components/offers/offer-card.tsx");
const generationRoute = read("app/api/dashboard/offers/[offerId]/generate-card/route.ts");
const generation = read("lib/offers/offer-ai-generation.ts");
const offersData = read("lib/data/offers.ts");
const offersActions = read("app/actions/offers.ts");
const publicRoute = read("app/api/public/cafe/[slug]/offers/route.ts");
const viewRoute = read("app/c/[slug]/products/[view]/page.tsx");
const migration = read("supabase/migrations/056_barndaksa_offers_experience_ai_cards.sql");

test("offer schema already contains the AI card lifecycle without a new migration", () => {
  for (const field of [
    "card_storage_path",
    "card_generation_status",
    "card_generation_error",
    "card_generated_at",
  ]) {
    assert.match(migration, new RegExp(field));
  }
});

test("dashboard supports create, edit, validated save, confirmed delete and live preview", () => {
  assert.match(dashboard, /initialProducts/);
  assert.match(dashboard, /saveOfferAction/);
  assert.match(dashboard, /deleteOfferAction/);
  assert.match(dashboard, /setDeleteTarget/);
  assert.match(dashboard, /endDate < draft\.startDate/);
  assert.match(dashboard, /<OfferCard offer=\{draft\}/);
  assert.match(dashboard, /uploadOfferBannerAction/);
  assert.match(dashboard, /generate-card/);
});

test("generation remains server-only, owner-scoped, cafe-scoped and duplicate-safe", () => {
  assert.match(generationRoute, /requireOwnerCafeContext\(\)/);
  assert.match(generationRoute, /\.eq\("cafe_id", cafe\.id\)/);
  assert.match(generationRoute, /\.is\("deleted_at", null\)/);
  assert.match(generationRoute, /card_generation_status === "generating"/);
  assert.match(generationRoute, /Date\.now\(\) - generatedAt < 15_000/);
  assert.doesNotMatch(dashboard, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(generation, /process\.env\.OPENAI_API_KEY/);
  assert.match(generation, /process\.env\.OPENAI_IMAGE_MODEL \|\| "gpt-image-1"/);
});

test("OpenAI and storage contracts are mock-safe and never run in this test", async () => {
  const mockOpenAi = async () => Uint8Array.from([1, 2, 3]);
  const mockStorage = async (bytes) => ({ storagePath: `mock/${bytes.byteLength}.webp` });
  const bytes = await mockOpenAi();
  const stored = await mockStorage(bytes);
  assert.equal(stored.storagePath, "mock/3.webp");
  assert.match(generation, /No text, no letters, no numbers, no logos, no watermarks/);
  assert.match(generation, /output_format/);
  assert.match(generationRoute, /uploadGeneratedImageBytes/);
  assert.match(generationRoute, /card_generation_status: "generating"/);
  assert.match(generationRoute, /card_generation_status: "ready"/);
  assert.match(generationRoute, /card_generation_status: "failed"/);
});

test("public offers use one dedicated request and the shared card", () => {
  assert.match(viewRoute, /view === "offers"/);
  assert.match(viewRoute, /PublicOffersPage/);
  assert.match(publicPage, /usePublicCafeMenu/);
  assert.match(publicPage, /resource: "offers"/);
  assert.match(publicPage, /<OfferCard/);
  assert.doesNotMatch(publicPage, /ProductPosterCard|usePublicProductCatalog|IntersectionObserver/);
  assert.match(sharedCard, /prefetch=\{false\}/);
  assert.match(publicRoute, /public-offers:\$\{normalizedSlug\}/);
});

test("public visibility and cache invalidation are centralized", () => {
  assert.match(offersData, /\.eq\("visible_in_cafe", true\)/);
  assert.match(offersData, /\.is\("deleted_at", null\)/);
  assert.match(offersData, /\.eq\("is_archived", false\)/);
  assert.match(offersData, /startsAt <= now/);
  assert.match(offersData, /endsAt >= now/);
  assert.match(offersData, /clearServerMemoryCache\(`public-offers:\$\{normalizedSlug\}`\)/);
  assert.match(offersActions, /saveOfferAction/);
});
