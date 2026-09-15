const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function loadTs(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) return loadTs(`${name.slice(2)}.ts`, mocks);
    return require(name);
  };
  new Function("require", "exports", source)(localRequire, exports);
  return exports;
}

const helpers = loadTs("lib/menu/standalone-menu.ts");
const cafeId = "bb404c1a-a439-41ab-aed8-ea0c17875bd9";
const imagePath = `${cafeId}/product/photo.webp`;
const fixtureProduct = {
  id: "product", cafe_id: cafeId, category_id: "category", name: "Original dish", description: "Full description\nOption +8 SAR",
  price: 18.75, calories: 0, preparation_time_minutes: 0, ingredients: ["Milk", "Nuts"], available: false,
  image_storage_path: imagePath, image_url: null, image_gallery: [], gallery_storage_paths: [],
  media: [{ type: "image", assetId: imagePath }, { type: "video", assetId: `${cafeId}/product/video.mp4` }],
  promo: null, deleted_at: null, sort_order: 1,
};

function fakeClient({ published = true, status = "active", products = [fixtureProduct], deleted = false } = {}) {
  const queries = [], signedPaths = [];
  const tables = {
    cafes: [{ id: cafeId, slug: "double-b-bistro", name: "Double B Bistro", status, is_public: false, deleted_at: deleted ? "deleted" : null }],
    brand_feature_overrides: published === null ? [] : [{ cafe_id: cafeId, feature_id: "standalone_menu", enabled: published }],
    menu_categories: [
      { id: "category", cafe_id: cafeId, name: "Category", visible: true, deleted_at: null },
      { id: "hidden", cafe_id: cafeId, name: "Hidden", visible: false, deleted_at: null },
    ],
    cafe_settings: [{ cafe_id: cafeId, logo_url: null, description: null, owner_email: "private@example.test" }],
    menu_products: products,
  };
  const client = {
    from(table) {
      queries.push(table);
      let rows = [...tables[table]];
      const builder = {
        select() { return builder; },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return builder; },
        is(key, value) { rows = rows.filter((row) => row[key] === value); return builder; },
        order() { return builder; },
        range(start, end) { rows = rows.slice(start, end + 1); return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return builder;
    },
    storage: { from(bucket) { return {
      async createSignedUrls(paths) {
        signedPaths.push(...paths);
        return { data: paths.map((p) => ({ path: p, signedUrl: `https://storage.test/${bucket}/${p}` })), error: null };
      },
    }; } },
  };
  return { client, queries, signedPaths };
}

function loader(client) {
  return loadTs("lib/data/standalone-menu.ts", {
    "server-only": {}, react: { cache: (fn) => fn }, "@/lib/supabase/admin": { createAdminClient: () => client },
  }).getStandaloneMenu;
}

async function run() {
  assert.equal(helpers.menuDisplayText("مـقـلـقـل لحم"), "مقلقل لحم");
  assert.equal(helpers.menuDisplayText("18.75"), "18.75");
  const motionGate = loadTs("lib/menu/motion-foundations.ts").shouldAnimateMenu;
  assert.equal(motionGate(), false, "SSR must not animate");
  const oldWindow = Object.getOwnPropertyDescriptor(global, "window");
  const oldNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
  try {
    Object.defineProperty(global, "window", { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
    assert.equal(motionGate(), false, "Reduced motion overrides animation");
    Object.defineProperty(global, "window", { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
    Object.defineProperty(global, "navigator", { configurable: true, value: { hardwareConcurrency: 2 } });
    assert.equal(motionGate(), false, "Low-end devices skip nonessential motion");
    Object.defineProperty(global, "navigator", { configurable: true, value: { hardwareConcurrency: 8 } });
    assert.equal(motionGate(), true);
  } finally {
    if (oldWindow) Object.defineProperty(global, "window", oldWindow); else delete global.window;
    if (oldNavigator) Object.defineProperty(global, "navigator", oldNavigator); else delete global.navigator;
  }
  for (const status of ["active", "suspended", "inactive", "pending"]) {
    const fake = fakeClient({ status });
    const menu = await loader(fake.client)("double-b-bistro");
    assert.equal(menu.products.length, 1, `Menu must survive status ${status}`);
    for (const field of ["name", "description", "price", "calories", "ingredients", "available", "promo"]) {
      assert.deepEqual(menu.products[0][field], fixtureProduct[field], `Preserve ${field}`);
    }
    assert.equal(menu.products[0].preparationTimeMinutes, 0);
    assert.equal(menu.products[0].images.length, 1);
    assert.equal(menu.products[0].videos.length, 1);
    assert.ok(!JSON.stringify(menu).includes("private@example.test"));
    assert.ok(!Object.hasOwn(menu.products[0], "cafe_id"));
  }
  for (const published of [false, null]) {
    const fake = fakeClient({ published });
    assert.equal(await loader(fake.client)("double-b-bistro"), null);
    assert.ok(!fake.queries.includes("menu_products"), "Reject before reading the catalog");
  }
  assert.equal(await loader(fakeClient({ deleted: true }).client)("double-b-bistro"), null);
  const products = [fixtureProduct,
    { ...fixtureProduct, id: "hidden-product", category_id: "hidden" },
    { ...fixtureProduct, id: "deleted-product", deleted_at: "yesterday" },
    { ...fixtureProduct, id: "other-tenant", cafe_id: "other" },
    { ...fixtureProduct, id: "unassigned", category_id: null },
  ];
  const scoped = await loader(fakeClient({ products }).client)("double-b-bistro");
  assert.deepEqual(scoped.products.map((item) => item.id), ["product", "unassigned"]);
  const many = fakeClient({ products: Array.from({ length: 501 }, (_, i) => ({ ...fixtureProduct, id: String(i) })) });
  assert.equal((await loader(many.client)("double-b-bistro")).products.length, 501);
  assert.equal(many.queries.filter((table) => table === "menu_products").length, 2);
  const crossAsset = fakeClient({ products: [{ ...fixtureProduct, image_storage_path: "other/secret.webp", media: [] }] });
  await loader(crossAsset.client)("double-b-bistro");
  assert.deepEqual(crossAsset.signedPaths, []);
  for (const bad of [`${cafeId}/../private`, `${cafeId}/%2e%2e/private`, `${cafeId}/a\\b`, "other/a.webp"]) {
    assert.equal(helpers.isOwnedMenuAsset(bad, cafeId), false);
  }
  assert.equal(await loader(fakeClient().client)("../admin"), null);
  assert.equal(helpers.matchesMenuSearch({ ...fixtureProduct, category: "Food" }, "option milk"), true);
  assert.equal(helpers.matchesMenuSearch({ ...fixtureProduct, category: "Food" }, "missing"), false);
  assert.equal(helpers.normalizeMenuSearch("إفـطَار"), "افطار");
  let attemptedDatabaseAccess = false;
  const unauthorizedActions = loadTs("app/actions/standalone-menu.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => { throw new Error("Unauthorized"); } },
    "@/lib/supabase/server": { createClient: async () => { attemptedDatabaseAccess = true; } },
  });
  await assert.rejects(unauthorizedActions.setStandaloneMenuPublicationAction(cafeId, true), /Unauthorized/);
  await assert.rejects(unauthorizedActions.getStandaloneMenuPublicationAction(cafeId), /Unauthorized/);
  assert.equal(attemptedDatabaseAccess, false);
  console.log("PASS: suspension independence, publication, tenant isolation, complete fields, hidden/deleted products, pagination, media isolation and search.");

  if (process.argv.includes("--live")) {
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }, realtime: { transport: require("next/dist/compiled/ws") },
    });
    const menu = await loader(client)("double-b-bistro");
    assert.ok(menu);
    const { data: actual, error } = await client.from("menu_products").select("*").eq("cafe_id", cafeId).is("deleted_at", null);
    if (error) throw error;
    assert.equal(menu.products.length, actual.length, "Every current product must appear");
    for (const row of actual) {
      const product = menu.products.find((item) => item.id === row.id);
      assert.ok(product);
      for (const field of ["name", "description", "price", "ingredients", "available", "promo"]) assert.deepEqual(product[field], row[field]);
      assert.equal(product.calories ?? null, row.calories);
      assert.equal(product.preparationTimeMinutes ?? null, row.preparation_time_minutes);
      assert.ok(product.images.length, `Missing image: ${row.id}`);
    }
    const urls = [...new Set(menu.products.flatMap((product) => product.images.map((image) => image.url)))];
    for (let offset = 0; offset < urls.length; offset += 6) {
      await Promise.all(urls.slice(offset, offset + 6).map(async (url) => {
        const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
        assert.ok(response.ok, `Menu image returned HTTP ${response.status}`);
      }));
    }
    console.log(`PASS: ${urls.length} original menu images are reachable.`);
    console.log(`PASS: live read-only comparison of ${actual.length} products with source names, descriptions, prices, ingredients, calories, availability and images.`);
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
