import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const operationalRoots = ["app", "components", "lib"];
const forbiddenOperationalPatterns = [
  /\bpublic\.reservations\b/i,
  /\.from\(\s*["']reservations["']\s*\)/i,
  /\breservation_services\b/i,
  /\bproduct_reviews\b/i,
  /\bproduct_questions\b/i,
  /\bmarketing_tools\b/i,
  /\/dashboard\/marketing(?:-tools)?\b/i,
  /\/dashboard\/branda-finance\b/i,
];

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function collectFiles(directory, files = []) {
  const absolute = join(rootPath, directory);
  for (const entry of await readdir(absolute)) {
    if (entry.includes(".bak")) continue;
    const path = join(absolute, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      await collectFiles(relative(rootPath, path), files);
    } else if (/\.(?:[cm]?[jt]sx?|css)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

test("operational code cannot query or route to removed systems", async () => {
  const files = [];
  for (const directory of operationalRoots) {
    await collectFiles(directory, files);
  }

  const violations = [];
  for (const path of files) {
    const content = await readFile(path, "utf8");
    for (const pattern of forbiddenOperationalPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relative(rootPath, path)}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("customer bottom navigation is always the required four destinations", async () => {
  const sharedDock = await source("components/cafe/themes/customer-mobile-experience.tsx");
  const themedShell = await source("components/cafe/themes/themed-cafe-shell.tsx");
  const primitives = await source("components/cafe/themes/customer-experience-primitives.tsx");
  const fastApp = await source("components/customer-app/customer-fast-app-client.tsx");

  for (const content of [sharedDock, fastApp]) {
    const navigationSource = content.slice(content.lastIndexOf("<nav"));
    const labels = ["المنتجات", "العروض", "المكافآت", "الحساب"];
    const positions = labels.map((label) => navigationSource.indexOf(label));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  }

  assert.match(sharedDock, /grid-cols-4/);
  assert.match(fastApp, /grid-cols-4/);
  assert.match(themedShell, /CustomerBottomDock/);
  assert.match(themedShell, /defaultCustomerDockItems/);
  assert.doesNotMatch(`${themedShell}\n${primitives}`, /CustomerQuickDock|buildCustomerQuickDockItems/);
  assert.doesNotMatch(fastApp, /label="(?:الرئيسية|الحجوزات|الألعاب)"/);
});

test("product cards contain no rating stars or review counters", async () => {
  const card = await source("components/cafe/themes/themed-product-card.tsx");
  assert.doesNotMatch(card, /\bStar\b|rating|reviewCount|questionCount/i);
});
