import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), cache = new Map();
function load(file, mocks = {}) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      const found = [base, base + ".ts", base + ".tsx"].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      return load(found, mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const sharp = require("sharp");
const { prepareLoyaltyLogo } = load("lib/cafe/prepare-loyalty-logo.ts");
let checks = 0;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="25" y="25" width="50" height="50" fill="#fa8000"/><rect x="40" y="40" width="20" height="20" fill="white"/></svg>');
for (const format of ["svg", "png", "jpeg", "webp", "avif", "tiff", "gif"]) {
  const input = format === "svg" ? svg : await sharp(svg).toFormat(format).toBuffer();
  const result = await prepareLoyaltyLogo(input);
  const { data, info } = await sharp(Buffer.from(result.dataUrl.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, format + " clears exterior backdrop");
  assert.ok(data[(50 * info.width + 50) * 4 + 3] > 245, format + " keeps enclosed white details");
  assert.match(result.palette.primary, /^#[a-f0-9]{6}$/);
  assert.ok(parseInt(result.palette.secondary.slice(1, 3), 16) > 200, format + " extracts orange identity");
  checks += 4;
}
await assert.rejects(prepareLoyaltyLogo(Buffer.from('not an image')));checks++;
await assert.rejects(prepareLoyaltyLogo(Buffer.alloc(10 * 1024 * 1024 + 1)));checks++;
await assert.rejects(prepareLoyaltyLogo(Buffer.from('<svg><image href="https://example.test/private"/></svg>')));checks++;
const transparent = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 15, g: 25, b: 150, alpha: .5 } } }).png().toBuffer();
const faded = await prepareLoyaltyLogo(transparent);
assert.equal(faded.backgroundRemoved, false);
assert.equal((await sharp(Buffer.from(faded.dataUrl.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer())[3], 128);
checks++;
const { approvedLoyaltyColors } = load('lib/loyalty/approved-design.ts');
const mutedBrand = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#455248"/><rect x="25" y="40" width="50" height="20" fill="#e9e7da"/></svg>');
const muted = await prepareLoyaltyLogo(mutedBrand);
assert.equal(muted.palette.primary, '#455248', 'Muted green backdrop remains the card identity');
assert.notEqual(muted.palette.text, '#000000', 'Dark card uses light readable text');
assert.equal(muted.backgroundRemoved, true); checks += 3;
const darkMark = await prepareLoyaltyLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="25" y="25" width="50" height="50" fill="#455248"/></svg>'));
assert.equal(darkMark.palette.primary, '#455248', 'Transparent dark logo is not washed to pale gray'); checks++;
assert.equal(approvedLoyaltyColors('rast', { autoLogo: true, primary: '#113355', secondary: '#ffbb44' }).background, '#113355'); checks++;
const { brandStampStyle } = load('lib/loyalty/brand-stamp-artwork.ts');
assert.equal(brandStampStyle('brand-1c2b6f7e028f', 'meal'), 'shirt');
assert.equal(brandStampStyle('brand-1c2b6f7e028f', 'brand'), 'brand');checks += 2;
const { branchIdentity, branchProgram } = load('lib/loyalty/branch-appearance.ts');
const branch = { id: 'a', name: 'Branch A', logo: 'data:image/webp;base64,AA==', background: '#111111', foreground: '#ffffff', accent: '#ff8800' };
assert.equal(branchIdentity({ slug: 'brand', name: 'Brand' }, branch).logoUrl, branch.logo);
assert.equal(branchProgram({ purchasesRequired: 5 }, branch).purchasesRequired, 5);checks += 2;
const { googleClassId } = load('lib/wallet/payload.ts');
assert.notEqual(googleClassId('issuer','cafe','branch-a'), googleClassId('issuer','cafe','branch-b'));checks++;
const { integratedSystemGroupsForBrand, systemItemHref } = load('components/dashboard/integrated-system-navigation.ts', {
  '@/components/finance/finance-navigation': { financeMenuGroups: [{ id: 'sales', entries: [] }] },
});
const groups = integratedSystemGroupsForBrand('brand-1c2b6f7e028f');
const item = groups.find(g => g.id === 'loyalty').items.find(i => i.href === '/dashboard/loyalty/branches');
assert.ok(item);assert.equal(systemItemHref(item, { cafeSlug: 'brand-1c2b6f7e028f', enabledFeatures: ['loyalty'] }), '/dashboard/loyalty/branches');
assert.equal(systemItemHref(item, { cafeSlug: 'brand-1c2b6f7e028f', enabledFeatures: [] }), null);checks += 3;
console.log(`Automatic logo/branch identity: ${checks} checks passed, no external calls`);
