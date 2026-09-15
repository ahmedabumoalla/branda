const fs = require("fs");
const path = require("path");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureNamedImport(filePath, modulePath, names) {
  let content = fs.readFileSync(filePath, "utf8");
  const modulePattern = escapeRegExp(modulePath);
  const importRegex = new RegExp(`import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${modulePattern}["'];`);

  const match = content.match(importRegex);

  if (match) {
    const currentNames = match[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    const missing = names.filter((name) => !currentNames.includes(name));

    if (missing.length) {
      const nextNames = [...currentNames, ...missing].sort();
      const nextImport = `import {\n  ${nextNames.join(",\n  ")},\n} from "${modulePath}";`;
      content = content.replace(importRegex, nextImport);
    }
  } else {
    const importLine = `import {\n  ${names.join(",\n  ")},\n} from "${modulePath}";\n`;

    const lastImportRegex = /import[\s\S]*?from\s*["'][^"']+["'];\s*/g;
    const imports = [...content.matchAll(lastImportRegex)];

    if (imports.length) {
      const last = imports[imports.length - 1];
      const insertAt = last.index + last[0].length;
      content = content.slice(0, insertAt) + importLine + content.slice(insertAt);
    } else {
      content = importLine + content;
    }
  }

  fs.writeFileSync(filePath, content, "utf8");
}

const projectRoot = process.cwd();

const settingsFile = path.join(projectRoot, "lib", "data", "settings.ts");
const themeFile = path.join(projectRoot, "lib", "data", "theme.ts");

ensureNamedImport(settingsFile, "@/lib/data/mappers", [
  "mapDbSettingsToCafeSettings",
]);

ensureNamedImport(settingsFile, "@/lib/storage/resolve-storage-url", [
  "resolvePublishedStoragePathToUrl",
  "storageBucketForLogo",
]);

ensureNamedImport(themeFile, "@/lib/data/mappers", [
  "mapDbCustomIdentity",
]);

ensureNamedImport(themeFile, "@/lib/storage/resolve-storage-url", [
  "resolvePublishedStoragePathToUrl",
  "storageBucketForBackground",
  "storageBucketForLogo",
]);

console.log("Fixed missing imports in settings.ts and theme.ts");
