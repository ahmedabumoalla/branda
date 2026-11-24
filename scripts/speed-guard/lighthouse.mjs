import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AGENT, brandPaths, config, pageType, riyadhTime, sendWhatsApp, summary } from "./shared.mjs";

// حارس السرعة, layer 2: after each production deployment, open the main public pages in Lighthouse on a throttled
// mobile profile, take the median of several runs and alert when a page passes its budget. The guard's browser
// identifies itself, and the platform ignores such visits in brand statistics (lib/analytics/speed-guard-visit.ts)

const { runs } = config.lighthouse;
// A page type can carry its own budget: a menu's weight follows the brand's product photos, not the code
const budgetFor = value => ({ ...config.lighthouse.budgets, ...(config.lighthouse.typeBudgets?.[pageType(value)] || {}) });
const lighthouse = process.env.LIGHTHOUSE_BIN || "lighthouse";
const work = mkdtempSync(path.join(tmpdir(), "speed-guard-lh-"));
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

function audit(url, index) {
  const output = path.join(work, `${index}.json`);
  execFileSync(lighthouse, [url, "--quiet", "--output=json", `--output-path=${output}`, "--only-categories=performance",
    `--emulated-user-agent=${AGENT} Chrome-Lighthouse`, ...(config.lighthouse.blockedUrlPatterns || []).map(pattern => `--blocked-url-patterns=${pattern}`), "--chrome-flags=--headless=new --no-sandbox --disable-gpu"], { stdio: ["ignore", "ignore", "inherit"], timeout: 180000, shell: process.platform === "win32" });
  const report = JSON.parse(readFileSync(output, "utf8"));
  const value = id => report.audits[id]?.numericValue ?? NaN;
  return { lcpMs: value("largest-contentful-paint"), ttfbMs: value("server-response-time"), totalKb: value("total-byte-weight") / 1024, score: Math.round((report.categories.performance.score ?? 0) * 100) };
}

const paths = [...config.lighthouse.fixedPaths, ...(await brandPaths(config.lighthouse.sampleBrands, Math.floor(Date.now() / 86400000)))];
const results = [];
let index = 0;
try {
  for (const value of paths) {
    const samples = [];
    for (let run = 0; run < runs; run++) {
      try { samples.push(audit(new URL(value, config.site).href, index++)); } catch (error) { console.log(`[speed-guard] Lighthouse run failed on ${value}: ${error instanceof Error ? error.message.split("\n")[0] : error}`); }
    }
    if (!samples.length) { results.push({ path: value, failed: true, problems: ["ما انفتحت الصفحة في الفحص"] }); continue; }
    const result = { path: value, lcpMs: Math.round(median(samples.map(s => s.lcpMs))), ttfbMs: Math.round(median(samples.map(s => s.ttfbMs))), totalKb: Math.round(median(samples.map(s => s.totalKb))), score: median(samples.map(s => s.score)) };
    const budgets = budgetFor(value);
    result.problems = [
      result.lcpMs > budgets.lcpMs && `أكبر عنصر طلع بعد ${(result.lcpMs / 1000).toFixed(1)} ثانية والحد ${budgets.lcpMs / 1000}`,
      result.ttfbMs > budgets.ttfbMs && `السيرفر بدأ يرد بعد ${result.ttfbMs} ms والحد ${budgets.ttfbMs}`,
      result.totalKb > budgets.totalKb && `وزن الصفحة ${result.totalKb} KB والحد ${budgets.totalKb}`,
      result.score < budgets.score && `درجة الأداء ${result.score} والحد ${budgets.score}`,
    ].filter(Boolean);
    results.push(result);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const bad = results.filter(result => result.problems.length);
summary([
  "### حارس السرعة: فحص ما بعد النشر",
  "| الصفحة | أكبر عنصر | بداية الرد | الوزن | الدرجة |", "|---|---|---|---|---|",
  ...results.map(r => r.failed ? `| ${r.path} | فشل الفتح | - | - | - |` : `| ${r.path} | ${(r.lcpMs / 1000).toFixed(1)} s | ${r.ttfbMs} ms | ${r.totalKb} KB | ${r.score}${r.problems.length ? " ⚠️" : ""} |`),
]);
if (bad.length) {
  await sendWhatsApp([
    `حارس السرعة: بعد آخر نشر فيه ${bad.length} صفحة أبطأ من حدها، الساعة ${riyadhTime()}`,
    ...bad.slice(0, 5).map(r => `${r.path}\n${r.problems.join("\n")}`),
    "ما رجّعت النسخة القديمة، القرار لك",
  ].join("\n"));
  process.exit(1);
}
