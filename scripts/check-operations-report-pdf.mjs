import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(relative, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)(name => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : dependency(name), exports);
  return exports;
}
const { buildOperationsReportContent, buildOperationsReportPdf, downloadOperationsReportPdf } = load("lib/export/operations-report-pdf.ts");
const { reportMetrics, reportMetricLabels, defaultReportFilters } = load("lib/analytics/operations-report.ts");
const { jsPDF } = dependency("jspdf");
const fonts = {
  regular: fs.readFileSync("public/fonts/tajawal-regular.ttf").toString("base64"),
  bold: fs.readFileSync("public/fonts/tajawal-bold.ttf").toString("base64"),
};
const brand = index => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  name: `مقهى الكواكب ${index}`, slug: `brand-${index}`, status: "active", subscriptionStatus: "active",
  planName: "باقة النمو", expiresAt: "2026-12-31T23:00:00Z", subscribed: index % 2 === 1,
  features: ["loyalty", "standalone_menu", "customers"],
  lastStorefrontVisit: "2026-10-09T10:15:00Z", lastMenuVisit: null,
  periodLastStorefrontVisit: "2026-10-09T10:15:00Z", periodLastMenuVisit: null,
  metrics: Object.fromEntries(reportMetrics.map((metric, metricIndex) => [metric, index * 100 + metricIndex])),
});
const report = {
  generatedAt: "2026-10-09T21:15:00Z", from: "2026-10-01", to: "2026-10-09",
  menuTrackingSince: "2026-10-05T00:00:00Z", walletTrackingSince: "2026-09-01T00:00:00Z", registrationTrackingSince: "2026-10-09T00:00:00Z",
  brands: Array.from({ length: 31 }, (_, index) => brand(index + 1)),
};
const injection = '<script>globalThis.pdfInjection = true</script> /JavaScript /OpenAction';
const filters = { ...defaultReportFilters, query: injection, subscription: "subscribed", feature: "standalone_menu",
  conditions: [{ metric: "loyaltyCards", operator: "gte", value: 30 }], sort: "rewardOperations", direction: "desc" };
const content = buildOperationsReportContent(report, report.brands, filters);
assert.equal(content.brands.length, 31);
assert.equal(content.brands.at(-1).metrics.length, 13);
assert.deepEqual(content.brands[0].metrics.map(row => row[1]), reportMetrics.map(metric => reportMetricLabels[metric]));
assert.equal(content.totalRows[0][0], new Intl.NumberFormat("en-US").format(49600));
assert.ok(content.filterRows.some(row => row[0] === injection));
assert.ok(content.filterRows.some(row => row[0] === "المنيو المستقل"));
assert.ok(content.filterRows.some(row => row[0] === "المشتركة فقط"));
assert.ok(content.filterRows.some(row => row[1] === reportMetricLabels.loyaltyCards && row[0].includes("أكبر من أو يساوي")));
assert.match(content.filterRows[0][0], /١٠|10/); // UTC date is October 9; Riyadh is October 10.
assert.equal(content.brands[0].visits.length, 4);
assert.match(content.brands[0].visits[0][0], /لا توجد/);
assert.ok(content.notes.some(note => note.includes("لا تثبت حفظ")));
assert.ok(content.notes.some(note => note.includes("مصدر غير المحدد")));
const original = JSON.stringify(report);
const one = buildOperationsReportPdf(report, [report.brands[0]], defaultReportFilters, fonts);
for (const style of ["normal", "bold"]) {
  one.setFont("Tajawal", style);
  const metadata = one.getFont().metadata;
  const text = one.processArabic(Object.values(reportMetricLabels).join(" "));
  assert.ok([...text].every(character => metadata.characterToGlyph(character.charCodeAt(0)) > 0), "all Arabic label glyphs exist after shaping");
}
const many = buildOperationsReportPdf(report, report.brands, filters, fonts);
assert.equal(JSON.stringify(report), original, "export must not mutate source data");
assert.equal(globalThis.pdfInjection, undefined, "filter strings remain inert");
assert.ok(many.getNumberOfPages() >= one.getNumberOfPages() + 30, "all matching brands, not just first screen, receive pages");
const bytes = Buffer.from(many.output("arraybuffer"));
assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
assert.match(bytes.toString("latin1"), /\/FontFile2/);
assert.ok(!/\/JavaScript\b|\/S\s*\/Launch\b/.test(bytes.toString("latin1")), "no executable document actions from filter text");
assert.ok(bytes.length > 10000);
const empty = buildOperationsReportPdf(report, [], defaultReportFilters, fonts);
assert.ok(empty.getNumberOfPages() >= 2);
const longBrand = { ...report.brands[0], name: "علامة طويلة ".repeat(30), features: ["ميزة طويلة ".repeat(250)] };
const long = buildOperationsReportPdf(report, [longBrand], { ...filters, query: "بحث طويل ".repeat(200) }, fonts);
assert.ok(long.getNumberOfPages() > one.getNumberOfPages(), "long content flows to subsequent pages");
const artifact = path.join(os.tmpdir(), "branda-operations-report-pdf-review.pdf");
fs.writeFileSync(artifact, Buffer.from(one.output("arraybuffer")));
fs.writeFileSync(path.join(os.tmpdir(), "branda-operations-report-pdf-all-review.pdf"), bytes);

const originalFetch = globalThis.fetch;
const originalSave = jsPDF.API.save;
const requested = [];
let downloaded;
globalThis.fetch = async url => {
  requested.push(url);
  return new Response(fs.readFileSync(`public${url}`));
};
jsPDF.API.save = function (filename) { downloaded = { filename, bytes: this.output("arraybuffer") }; return Promise.resolve(); };
try {
  await downloadOperationsReportPdf(report, [report.brands[0]], defaultReportFilters);
  assert.deepEqual(requested.sort(), ["/fonts/tajawal-bold.ttf", "/fonts/tajawal-regular.ttf"]);
  assert.equal(downloaded.filename, "barnda-operations-2026-10-10.pdf", "filename follows Saudi timezone");
  assert.equal(Buffer.from(downloaded.bytes).subarray(0, 5).toString(), "%PDF-");
  globalThis.fetch = async () => new Response("", { status: 404 });
  await assert.rejects(() => downloadOperationsReportPdf(report, [], defaultReportFilters), /تعذر تحميل/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalSave) jsPDF.API.save = originalSave;
  else delete jsPDF.API.save;
}
console.log(`PASS operations PDF: 13 metrics, filters, totals, Saudi dates, fonts, inert input, empty/long content, download/errors; 31 brands across ${many.getNumberOfPages()} pages.`);
console.log(`Review artifact: ${artifact}`);
