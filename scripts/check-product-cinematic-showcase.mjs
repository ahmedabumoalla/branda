import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [detail, showcase, layout, media, packageJson] = await Promise.all([
  read("components/cafe/product-detail-client.tsx"),
  read("components/cafe/product-cinematic-showcase.tsx"),
  read("components/cafe/themes/themed-product-detail.tsx"),
  read("components/cafe/product-image.tsx"),
  read("package.json"),
]);

for (const symbol of [
  "createCafeOrderAction",
  "getCustomerSession",
  "getCustomerLoginHref",
  "productFinalPrice",
  "promoBadgeText",
  "quantity",
  "branchName",
  "pickupAt",
  "notes",
  "addToOrder",
  "activeBranches",
  "orderingEnabled",
]) {
  assert.match(detail, new RegExp(symbol));
}

assert.match(
  detail,
  /createCafeOrderAction\(\{\s*slug,\s*customer,\s*product,\s*quantity,\s*branchName: activeBranches\.length === 1 \? activeBranches\[0\]\.name : branchName,\s*pickupAt: pickupLabel,\s*notes: notes\.trim\(\) \|\| undefined/,
);
assert.match(
  detail,
  /router\.push\(appendPreviewToNextPath\(path\("account"\), previewThemeId\)\)/,
);
assert.match(
  detail,
  /<ProductMediaDisplay\s+product=\{product\}\s+alt=\{product\.name\}\s+className="relative z-10 max-h-full w-full object-contain p-6 sm:p-8"/,
);
assert.match(detail, /ProductCinematicShowcase/);

assert.doesNotMatch(showcase, /\bfetch\s*\(|axios|useState|setState|canvas|webgl/i);
assert.match(showcase, /requestAnimationFrame\(paintTilt\)/);
assert.match(showcase, /frameRef\.current === null/);
assert.match(showcase, /cancelAnimationFrame/);
assert.match(showcase, /event\.pointerType !== "mouse"/);
assert.match(showcase, /closest\("video,button,input,select,textarea"\)/);
assert.match(showcase, /prefers-reduced-motion: reduce/);
assert.match(showcase, /connection\?\.saveData === true/);
assert.match(showcase, /hasVideo \? <div className="cinematic-sheen/);
assert.match(showcase, /touch-pan-y/);
assert.doesNotMatch(showcase, /preventDefault|DeviceOrientation|gyroscope/i);

for (const prohibited of [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "gsap",
  "framer-motion",
  "motion/react",
]) {
  assert.equal(packageJson.includes(`"${prohibited}"`), false);
}

assert.match(layout, /detail === "kiosk"/);
assert.match(layout, /detail === "stack" \|\| detail === "minimal"/);
assert.match(layout, /lg:grid-cols-\[minmax\(0,0\.95fr\)_minmax\(0,1\.05fr\)\]/);
assert.match(media, /autoplay|autoPlay/);
assert.match(media, /muted/);
assert.match(media, /controls/);
assert.match(media, /loop/);
assert.match(media, /preload/);

console.log("Product cinematic 2.5D checks passed.");
