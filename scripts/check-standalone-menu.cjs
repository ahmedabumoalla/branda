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
  price: 18.75, calories: 0, preparation_time_minutes: 0, ingredients: ["Milk", "Nuts"], available: true,
  image_storage_path: imagePath, image_url: null, image_gallery: [], gallery_storage_paths: [],
  media: [{ type: "image", assetId: imagePath }, { type: "video", assetId: `${cafeId}/product/video.mp4` }],
  promo: null, deleted_at: null, sort_order: 1,
};

function fakeClient({ published = true, status = "active", products = [fixtureProduct], deleted = false, slug = "double-b-bistro", branches = [], categories, businessCategory = "cafes_coffee" } = {}) {
  const queries = [], signedPaths = [];
  const tables = {
    branches,
    cafes: [{ id: cafeId, slug, name: "Double B Bistro", status, business_category: businessCategory, is_public: false, deleted_at: deleted ? "deleted" : null }],
    brand_feature_overrides: published === null ? [] : [{ cafe_id: cafeId, feature_id: "standalone_menu", enabled: published }],
    menu_categories: categories ?? [
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
        is(key, value) { rows = rows.filter((row) => (row[key] ?? null) === value); return builder; },
        not(key, operator, value) { rows = rows.filter((row) => (row[key] ?? null) !== value); return builder; },
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

function loader(client, features = ["menu"]) {
  return loadTs("lib/data/standalone-menu.ts", {
    "next/cache": { unstable_cache: fn => fn },
    "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => features },
    "server-only": {}, react: { cache: (fn) => fn }, "@/lib/supabase/admin": { createAdminClient: () => client },
  }).getStandaloneMenu;
}

async function run() {
  const giftDetails={quoteOnly:false,stock:0,optionGroups:[{id:'wrap',label:'Gift wrap',type:'select',required:true,choices:[{id:'paper',label:'Paper',priceDelta:10}]}]};
  const gift=fakeClient({businessCategory:'gifts_flowers',products:[{...fixtureProduct,available:false,catalog_kind:'service',commerce_details:giftDetails},{...fixtureProduct,id:'hidden-gift',category_id:'hidden',image_storage_path:`${cafeId}/hidden.webp`,available:false}]});
  const giftMenu=await loader(gift.client)('double-b-bistro');assert.equal(giftMenu.products.length,1);assert.equal(giftMenu.products[0].available,false);assert.equal(giftMenu.products[0].catalogKind,'service');assert.deepEqual(giftMenu.products[0].commerceDetails,giftDetails);assert(!gift.signedPaths.some(path=>path.includes('hidden.webp')),'Gift sold-out visibility does not expose hidden categories');
  const zeroStock=await loader(fakeClient({businessCategory:'gifts_flowers',products:[{...fixtureProduct,available:true,commerce_details:{stock:0}},{...fixtureProduct,id:'manually-unavailable',available:false,commerce_details:{stock:3}},{...fixtureProduct,id:'in-stock',available:true,commerce_details:{stock:3}}]}).client)('double-b-bistro');
  assert.equal(zeroStock.products.length,3,'Both owner-disabled and stock-exhausted listings remain visible');
  assert.deepEqual(zeroStock.products.map(p=>[p.id,p.available]),[['product',false],['manually-unavailable',false],['in-stock',true]],'Stock and owner availability jointly determine orderability');
  const branches=[{id:'main',cafe_id:cafeId,name:'Main',menu_slug:'murooj',active:true,is_primary:true,deleted_at:null},{id:'drive',cafe_id:cafeId,name:'Drive',menu_slug:'drive-thru',active:true,deleted_at:null},{id:'hidden-branch',cafe_id:cafeId,name:'Hidden branch',menu_slug:'hidden',active:false,deleted_at:null},{id:'foreign-branch',cafe_id:'foreign',name:'Foreign branch',menu_slug:'foreign',active:true,deleted_at:null}];
  const categories=['main','drive','hidden-branch'].map(branch_id=>({id:branch_id+'-category',cafe_id:cafeId,branch_id,name:'Coffee',visible:true,deleted_at:null}));
  const branchProducts=categories.map((c,i)=>({...fixtureProduct,id:c.branch_id+'-product',category_id:c.id,branch_id:c.branch_id,price:13-i,price_options:i===1?[12,13]:[],image_storage_path:`${cafeId}/${c.branch_id}/photo.webp`,media:[]}));
  const branched=fakeClient({branches,categories,products:branchProducts});
  const branchLoad=loader(branched.client);
  const mainMenu=await branchLoad('double-b-bistro');assert.equal(mainMenu.branch.slug,'murooj');assert.deepEqual(mainMenu.products.map(p=>p.id),['main-product']);assert.equal(mainMenu.branches.length,2);
  const driveMenu=await branchLoad('double-b-bistro',false,'drive-thru');assert.deepEqual(driveMenu.products.map(p=>p.id),['drive-product']);assert.deepEqual(driveMenu.products[0].priceOptions,[12,13]);
  for(const branch of ['hidden','foreign','missing',"bad' OR true"])assert.equal(await branchLoad('double-b-bistro',false,branch),null);
  assert(!branched.signedPaths.some(p=>p.includes('hidden-branch')),'Hidden branch media never signed');
  const availableDeliProduct = { ...fixtureProduct, id: "latte", available: true };
  const deli = fakeClient({slug:'delicake',products:[availableDeliProduct]});
  assert.equal(await loader(deli.client,[])('delicake'),null);
  assert.equal(deli.signedPaths.length,0,'Deli media remains behind current package authorization');
  assert.equal((await loader(deli.client)('delicake')).products.length,1);
  assert(deli.signedPaths.includes(imagePath));
  const foreignDeli=fakeClient({slug:'delicake',products:[{...availableDeliProduct,image_storage_path:'other/secret.webp',media:[]}]});
  await loader(foreignDeli.client)('delicake');assert.equal(foreignDeli.signedPaths.length,0,'Deli never signs another tenant asset');
  const pausedDeliProduct = { ...fixtureProduct, id: "mocha", name: "Mocha", available: false };
  const deliCatalog = [pausedDeliProduct, availableDeliProduct];
  const originalDeliCatalog = structuredClone(deliCatalog);
  const selectedImageMenu = await loader(fakeClient({products:[{...fixtureProduct,media:[{type:'image',assetId:imagePath,primary:true},{type:'video',assetId:`${cafeId}/product/video.mp4`}]}]}).client)('double-b-bistro');
  assert.equal(selectedImageMenu.products[0].primaryMediaType,'image');
  const freebieMenu = await loader(fakeClient({products:[{...fixtureProduct,promo:{kind:'منتج مجاني مع الطلب',freeProductId:'mocha',startDate:'2020-01-01',endDate:'2099-12-31'}},pausedDeliProduct]}).client)('double-b-bistro');
  assert.equal(freebieMenu.products[0].promo,null,'An unavailable free product must not be promised in the menu');
  const mixedDeli = await loader(fakeClient({ slug: "delicake", products: deliCatalog }).client)("delicake");
  assert.deepEqual(mixedDeli.products.map((product) => product.id), ["latte"], "Deli guests only see available products");
  assert.deepEqual(deliCatalog, originalDeliCatalog, "Hiding paused Deli products must not alter the owner catalog");
  const pausedOnlyDeli = fakeClient({ slug: "delicake", products: [pausedDeliProduct] });
  assert.deepEqual((await loader(pausedOnlyDeli.client)("delicake")).products, []);
  assert.equal(pausedOnlyDeli.signedPaths.length, 0, "Paused-only Deli products must not have private media signed");
  for (const slug of ["taza", "kat-coffe", "double-b-bistro"]) {
    const otherMenu = await loader(fakeClient({ slug, products: deliCatalog }).client)(slug);
    assert.deepEqual(otherMenu.products.map((product) => product.id), ["latte"], `${slug} hides unavailable products`);
    assert.equal(otherMenu.products[0].available, true);
  }
  const pagedDeli = fakeClient({ slug: "delicake", products: [
    ...Array.from({ length: 500 }, (_, index) => ({ ...pausedDeliProduct, id: `paused-${index}` })),
    availableDeliProduct,
  ] });
  assert.deepEqual((await loader(pagedDeli.client)("delicake")).products.map((product) => product.id), ["latte"], "A full paused page must not truncate later available Deli products");
  const kath = fakeClient({slug:'kat-coffe'});
  assert.equal(await loader(kath.client,[])('kat-coffe'),null);
  assert.equal(kath.signedPaths.length,0,'cached media must remain behind current package authorization');
  const kathMenu=await loader(kath.client)('kat-coffe');assert.equal(kathMenu.products.length,1);assert.ok(kath.signedPaths.includes(imagePath));
  const foreignKath=fakeClient({slug:'kat-coffe',products:[{...fixtureProduct,image_storage_path:'other/secret.webp',media:[]}]});
  await loader(foreignKath.client)('kat-coffe');assert.equal(foreignKath.signedPaths.length,0,'cache never signs another tenant asset');
  const togetherSlug='brand-871ec6e243c0';
  const blockedTogether=fakeClient({slug:togetherSlug,businessCategory:'gifts_flowers'});
  assert.equal(await loader(blockedTogether.client,[])(togetherSlug),null);assert.equal(blockedTogether.signedPaths.length,0);
  for(const product of [{...fixtureProduct,category_id:'hidden'},{...fixtureProduct,deleted_at:'deleted'},{...fixtureProduct,image_storage_path:'other/private.webp',media:[]}]) {
    const guarded=fakeClient({slug:togetherSlug,businessCategory:'gifts_flowers',products:[product]});await loader(guarded.client)(togetherSlug);assert.equal(guarded.signedPaths.length,0,'Together stable image signing preserves current visibility, deletion and tenant gates');
  }
  const empty = await loader(fakeClient({ products: [] }).client)("double-b-bistro");
  assert.deepEqual(empty.products, [], "New brands must never receive sample products");
  assert.equal(empty.logoUrl, "/brand/barndaksa-logo-brown.png", "Empty brand uses transparent platform mark");
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
  for (const status of ["active", "published"]) {
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
  for (const status of ["suspended", "inactive", "pending"]) {
    const fake = fakeClient({ status });
    assert.equal(await loader(fake.client)("double-b-bistro"), null);
    assert.ok(!fake.queries.includes("menu_products"));
  }
  for (const features of [[], ["loyalty"], ["offers"]]) {
    const fake = fakeClient();
    assert.equal(await loader(fake.client, features)("double-b-bistro"), null);
    assert.ok(!fake.queries.includes("menu_products"), "Disabled menu must not read catalog or sign media");
    assert.equal(fake.signedPaths.length, 0);
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
  const publicationWrites = [], invalidations = [];
  const authorizedActions = loadTs("app/actions/standalone-menu.ts", {
    "next/cache": { revalidatePath(value) { invalidations.push(value); } },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => ({ id: "verified-platform-admin" }) },
    "@/lib/supabase/server": { createClient: async () => ({
      from(table) {
        if (table === "brand_feature_overrides") return {
          async upsert(row, options) { publicationWrites.push({ row, options }); return { error: null }; },
        };
        assert.equal(table, "cafes");
        const query = {
          select(value) { assert.equal(value, "slug"); return query; },
          eq(key, value) { assert.equal(key, "id"); assert.equal(value, cafeId); return query; },
          is(key, value) { assert.equal(key, "deleted_at"); assert.equal(value, null); return query; },
          async single() { return { data: { slug: "another-brand" }, error: null }; },
        };
        return query;
      },
    }) },
  });
  assert.equal(await authorizedActions.setStandaloneMenuPublicationAction(cafeId, false), false);
  assert.equal(await authorizedActions.setStandaloneMenuPublicationAction(cafeId, true), true);
  assert.deepEqual(publicationWrites.map(({ row }) => row.enabled), [false, true]);
  assert.ok(publicationWrites.every(({ row, options }) => row.cafe_id === cafeId && row.feature_id === "standalone_menu" && row.updated_by === "verified-platform-admin" && options.onConflict === "cafe_id,feature_id"));
  assert.deepEqual(invalidations, ["/menu/another-brand", "/menu/another-brand"]);
  await assert.rejects(authorizedActions.setStandaloneMenuPublicationAction("invalid-id", true));
  assert.equal(publicationWrites.length, 2, "Invalid input must not write publication state");
  console.log("PASS: subscription gating, suspension, publication admin authorization, tenant isolation, complete fields, hidden/deleted products, pagination, media isolation and search.");

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
