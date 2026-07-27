import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [menuPage, categoryManager, productCard] = await Promise.all([
  read("components/dashboard/pages/menu-page.tsx"),
  read("components/dashboard/menu/category-manager.tsx"),
  read("components/dashboard/menu/product-card.tsx"),
]);

for (const action of [
  "saveMenuProductAction",
  "deleteMenuProductAction",
  "saveMenuCategoriesAction",
  "deleteMenuCategoryAction",
]) {
  assert.match(menuPage, new RegExp(action));
}
for (const handler of [
  "saveProduct",
  "handleCategoriesChange",
  "handleCategoryDelete",
  "filtered",
  "availableCount",
]) {
  assert.match(menuPage, new RegExp(handler));
}
assert.match(menuPage, /const MenuProductFormModal = dynamic/);
assert.match(menuPage, /const MenuImportModal = dynamic/);
assert.match(menuPage, /const \[categoriesOpen, setCategoriesOpen\] = useState\(false\)/);
assert.match(menuPage, /categoriesOpen \? \(/);
assert.match(menuPage, /overflow-x-auto/);
assert.match(menuPage, /sticky top-2/);
assert.match(menuPage, /grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3/);

assert.match(productCard, /ProductMediaDisplay/);
assert.match(productCard, /product=\{product\}/);
assert.match(productCard, /className="h-full w-full object-contain bg-\[#F8F4EF\]"/);
assert.match(productCard, /onClick=\{onEdit\}/);
assert.match(productCard, /onClick=\{onToggleAvailability\}/);
assert.match(productCard, /onClick=\{onDelete\}/);
assert.match(productCard, /flex h-full min-w-0 flex-col/);

for (const handler of [
  "onChange",
  "onDelete",
  "openAdd",
  "openEdit",
  "saveForm",
  "removeCategory",
  "toggleField",
  "moveCategory",
]) {
  assert.match(categoryManager, new RegExp(handler));
}
assert.match(categoryManager, /LocalAssetImage/);
assert.match(categoryManager, /optimizeImageForStorage/);
assert.match(categoryManager, /saveOptimizedImageAsset/);

console.log("Dashboard menu UI-only checks passed.");
