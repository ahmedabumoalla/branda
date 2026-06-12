import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowedExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".sql", ".md"]);
const skip = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "out", "coverage", "docs"]);
const issues = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (allowedExt.has(path.extname(item.name)) && !item.name.startsWith("barndaksa-security-audit") && !item.name.startsWith("barndaksa-source-verify")) scan(full);
  }
}
function scan(file) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const text = fs.readFileSync(file, "utf8");
  const checks = [
    [/packages\.applied-caas|internal\.api\.openai/g, "internal npm registry URL"],
    [/�/g, "replacement-character encoding corruption"],
    [/ط؛ظٹ|ط§ظƒ|ظ…ط±ط¨|طھط¹ط°ط±/g, "probable mojibake Arabic text"],
    [/unstable_cache\(/g, "unstable_cache call - verify no cookies/server client inside"],
    [/NEXT_PUBLIC_.*SERVICE_ROLE|SERVICE_ROLE.*NEXT_PUBLIC/g, "service role exposed as public env"],
  ];
  for (const [rx, label] of checks) {
    const matches = text.match(rx);
    if (matches) issues.push({ file: rel, issue: label, count: matches.length });
  }
}
walk(root);
if (issues.length) {
  console.error(JSON.stringify({ ok: false, issues }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, message: "Source verification passed" }, null, 2));
