// Check the actual settings component and owner action without changing an account.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, stubs = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  new Function("require", "exports", outputText)(name => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".css")) return {};
    return require(name);
  }, exports);
  return exports;
}

async function run() {
  const config = load("lib/loyalty/points-program.ts");
  const stamps = config.defaultPointsProgram;
  const points = config.readPointsProgram({ points_mode: "points", points_rate_sar: "12.50", points_rate_quantity: 4,
    points_milestones: [{ points: 200, reward: "قهوة" }, { points: 500, reward: "قهوة وحلا" }] });
  let cafe = { id: config.POINTS_CAFE_ID };
  let features = ["loyalty"];
  let databaseError = null;
  const writes = [];
  const { saveCoffeePointsProgram } = load("app/actions/coffee-points-program.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => cafe },
    "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => features },
    "@/lib/platform/feature-gates": { featureCodesAllow: (codes, name) => codes.includes(name) },
    "@/lib/loyalty/points-program": config,
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name, args) => {
      writes.push({ name, args }); return { error: databaseError };
    } }) },
  });
  const { PointsProgramEditor } = load("components/loyalty/points-program-editor.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/app/actions/coffee-points-program": { saveCoffeePointsProgram },
  });
  const render = draft => renderToStaticMarkup(React.createElement(PointsProgramEditor, { draft, saved: stamps }));
  assert.doesNotMatch(render(stamps), /تسعيرة النقاط/);
  assert.match(render(points), /تسعيرة النقاط/);
  assert.match(render(points), /قهوة وحلا/);
  assert.match(render(points), /تكلفة المكافأة بالنقاط/);
  assert.match(render(points), /من رصيد العميل عند تأكيد الصرف/);
  assert.deepEqual(config.readPointsProgram({}), stamps);

  for (const draft of [{ ...points, rateSar: 0.011 }, { ...points, rateQuantity: 0 }, { ...points, milestones: [] },
    { ...points, milestones: points.milestones.toReversed() }, { ...points, milestones: [points.milestones[0], points.milestones[0]] }]) {
    assert.equal((await saveCoffeePointsProgram(draft, stamps)).ok, false);
  }
  features = []; assert.equal((await saveCoffeePointsProgram(points, stamps)).ok, false);
  features = ["loyalty"];
  cafe = { id: config.POINTS_CAFE_ID, staff: true }; assert.equal((await saveCoffeePointsProgram(points, stamps)).ok, false);
  assert.equal(writes.length, 0);
  cafe = { id: "c6eb553e-2101-44fc-9b38-d0cf74f54018" };
  assert.deepEqual(await saveCoffeePointsProgram(points, stamps), { ok: true, program: points });
  assert.deepEqual(writes[0], { name: "save_loyalty_points_program", args: { p_cafe_id: cafe.id, p_mode: "points", p_rate_sar: 12.5,
    p_rate_quantity: 4, p_milestones: points.milestones, p_expected: stamps } });
  databaseError = { code: "40001" }; assert.match((await saveCoffeePointsProgram(points, stamps)).message, /جلسة أخرى/);
  databaseError = { code: "PGRST202" }; assert.match((await saveCoffeePointsProgram(points, stamps)).message, /تحديث النقاط في قاعدة البيانات/);
  databaseError = null;
  assert.deepEqual((await saveCoffeePointsProgram({ ...points, mode: "stamps" }, points)).program, { ...points, mode: "stamps" });
  console.log("Coffee points owner settings passed: modes, prices, milestones, scope, revisions and stamp fallback");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
