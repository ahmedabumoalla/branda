import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const sourcePath = "lib/export/brand-analytics-pdf.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const api = {};
new Function("require", "exports", compiled)(dependency, api);
const { buildBrandAnalyticsReportContent, buildBrandAnalyticsPdf, downloadBrandAnalyticsPdf } = api;
const { jsPDF } = dependency("jspdf");
const assets = {
  regular: fs.readFileSync("public/fonts/tajawal-regular.ttf").toString("base64"),
  bold: fs.readFileSync("public/fonts/tajawal-bold.ttf").toString("base64"),
  logo: fs.readFileSync("public/brand/barndaksa-logo-brown.png").toString("base64"),
};
const at = "2026-10-01T08:15:00Z";
const last = "2026-11-01T10:30:00Z";
const customers = Array.from({ length: 63 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: index === 20 ? "عميل افتراضي باسم عربي طويل لاختبار الالتفاف داخل أعمدة التقرير دون اقتطاع أو تداخل" : `عميل تجريبي ${index + 1}`,
  phone: `0500000${String(index).padStart(3, "0")}`, email: index % 3 === 0 ? `synthetic-customer-${index}@example.invalid` : "",
  status: "active", identityMatch: "profile", joinedAt: at, cardIssuedAt: index === 0 ? null : at, cardCount: index === 0 ? 0 : 1,
  currentStamps: index % 6, totalStamps: index * 3, rewardsRedeemed: index % 7, lastStampAt: index % 4 ? last : at,
  lastRedemptionAt: index % 7 ? null : last, lastVisitAt: index % 4 ? last : at,
  inactiveDays: index % 4 ? 3.5 : 34, isInactive: index % 4 === 0, visitDays: index + 1,
  averageVisitGapDays: index > 0 ? 3.5 : null, isLoyal: index % 4 !== 0 && index > 2, firstReturnAt: index > 0 ? "2026-10-05T09:15:00Z" : null,
  wallet: { firstDownloadAt: index % 2 ? at : null, lastDownloadAt: index % 2 ? last : null, downloads: index % 2 ? 3 : 0,
    firstGoogleSaveAt: index % 3 ? at : null, lastGoogleSaveAt: index % 3 ? last : null, googleSaveLinks: index % 3 ? 2 : 0,
    firstInstalledAt: index % 5 ? null : at, lastInstalledAt: index % 5 ? null : last, installedDevices: index % 5 ? 0 : 1 },
}));
const retention = [7, 14, 30].map(days => ({ days, eligible: 60, retained: 42, rate: 70 }));
const fixture = {
  generatedAt: "2026-11-04T21:15:00Z", recordingStartedAt: at, walletRecordingStartedAt: at,
  customers,
  report: { generatedAt: "2026-11-04T21:15:00Z", days: 30,
    brand: { id: "00000000-0000-4000-8000-000000000999", name: "علامة تجريبية لعرض تنسيق التقرير", slug: "synthetic-brand", category: "cafe",
      registeredCustomers: customers.length, cardholders: customers.length - 1, activeCustomers: 47, inactiveCustomers: 16, returningCustomers: 62,
      loyalCustomers: 45, walletCustomers: 50, visitsInPeriod: 1855, averageVisitGapDays: 3.5, retention, lastVisitAt: last },
    heatmap: Array.from({ length: 168 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24, visits: index === 130 ? 1000 : index % 11 })),
    cohorts: ["2026-09", "2026-10", "2026-11"].map((month, index) => ({ month, issued: 21,
      retention: retention.map(item => index === 2 ? { ...item, eligible: 0, retained: 0, rate: null } : item) })),
    customers: customers.slice(0, 25), total: customers.length, page: 1, pageSize: 25,
  },
};

const frozen = JSON.stringify(fixture);
const content = buildBrandAnalyticsReportContent(fixture);
assert.match(content.period, /07\/10\/2026/, "period starts at inclusive Riyadh calendar day minus 29");
assert.equal(content.identities.length, 63, "all customers are included beyond the visible first page");
assert.equal(content.activity.length, 63);
assert.equal(content.wallets.length, 63);
assert.equal(content.firstReturns.length, 63);
assert.equal(content.inactive.length, 16);
assert.ok(content.identities.at(-1).includes(customers.at(-1).phone));
assert.ok(content.identities.at(-1).includes("63"), "stable customer reference appears across tables");
assert.ok(content.summary.some(row => row[1] === "نشطون خلال آخر 10 أيام"));
assert.ok(content.notes.some(note => note.includes("لا يثبت") && note.includes("أندرويد")));
assert.ok(content.notes.some(note => note.includes("أول") || note.includes("يوم لاحق")));
assert.equal(content.retention[0][0], "70%");
assert.equal(content.cohortRows[2][0], "لم تكتمل المدة");
assert.match(content.wallets[0][2], /غير مسجل/);
assert.throws(() => buildBrandAnalyticsReportContent({ ...fixture, customers: customers.slice(0, 25) }), /غير مكتملة/);
assert.throws(() => buildBrandAnalyticsReportContent({ ...fixture, customers: [customers[0], ...customers.slice(0, 62)] }), /غير مكتملة/);

const doc = buildBrandAnalyticsPdf(fixture, assets);
assert.equal(JSON.stringify(fixture), frozen, "export does not mutate source data");
for (const style of ["normal", "bold"]) {
  doc.setFont("Tajawal", style);
  const metadata = doc.getFont().metadata;
  const shaped = doc.processArabic("العملاء الأختام المكافآت الاحتفاظ آيفون أندرويد برندة");
  assert.ok([...shaped].every(character => metadata.characterToGlyph(character.charCodeAt(0)) > 0), "all shaped Arabic glyphs embedded");
}
assert.ok(doc.getNumberOfPages() >= 12, "multi-page detail is exported");
const bytes = Buffer.from(doc.output("arraybuffer"));
assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
assert.match(bytes.toString("latin1"), /\/FontFile2/);
assert.match(bytes.toString("latin1"), /\/Subtype \/Image/);
assert.ok(!/\/JavaScript\b|\/S\s*\/Launch\b/.test(bytes.toString("latin1")));

const empty = { ...fixture, customers: [], report: { ...fixture.report, total: 0, customers: [], heatmap: [], cohorts: [],
  brand: { ...fixture.report.brand, registeredCustomers: 0 } } };
const emptyDoc = buildBrandAnalyticsPdf(empty, assets);
assert.ok(emptyDoc.getNumberOfPages() >= 9, "empty report remains a complete branded document");
const injected = structuredClone(empty);
injected.report.brand.name = '<script>globalThis.pdfInjection=true</script> /JavaScript /OpenAction';
buildBrandAnalyticsPdf(injected, assets);
assert.equal(globalThis.pdfInjection, undefined, "brand and customer content remains plain inert text");
const long = structuredClone(empty);
long.report.brand.name = "اسم علامة تجريبية طويل لاختبار حدود التخطيط ".repeat(7);
const longDoc = buildBrandAnalyticsPdf(long, assets);

const originalFetch = globalThis.fetch;
const originalSave = jsPDF.API.save;
const requested = [];
let downloaded;
globalThis.fetch = async url => { requested.push(url); return new Response(fs.readFileSync(`public${url}`)); };
jsPDF.API.save = function (filename) { downloaded = { filename, bytes: this.output("arraybuffer") }; return Promise.resolve(); };
try {
  await downloadBrandAnalyticsPdf(empty);
  assert.deepEqual(requested.sort(), ["/brand/barndaksa-logo-brown.png", "/fonts/tajawal-bold.ttf", "/fonts/tajawal-regular.ttf"]);
  assert.equal(downloaded.filename, "barnda-synthetic-brand-loyalty-2026-11-05.pdf", "filename is Riyadh date");
  assert.equal(Buffer.from(downloaded.bytes).subarray(0, 5).toString(), "%PDF-");
  globalThis.fetch = async () => new Response("", { status: 404 });
  await assert.rejects(() => downloadBrandAnalyticsPdf(empty), /تعذر تحميل/);
} finally {
  globalThis.fetch = originalFetch;
  if (originalSave) jsPDF.API.save = originalSave;
  else delete jsPDF.API.save;
}

const output = path.resolve("output/brand-analytics/pdf");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "synthetic-report.pdf"), bytes);
fs.writeFileSync(path.join(output, "synthetic-long-brand.pdf"), Buffer.from(longDoc.output("arraybuffer")));
fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({
  executedAt: new Date().toISOString(), node: process.version, command: "node scripts/check-brand-analytics-pdf.mjs",
  result: "PASS", syntheticCustomers: customers.length, inactiveCustomers: content.inactive.length,
  pages: doc.getNumberOfPages(), byteLength: bytes.length, pdfSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  inputHashes: Object.fromEntries([sourcePath, "scripts/check-brand-analytics-pdf.mjs", "lib/analytics/brand-customer-analytics.ts", "public/fonts/tajawal-regular.ttf", "public/fonts/tajawal-bold.ttf", "public/brand/barndaksa-logo-brown.png", "package-lock.json"].map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])),
  checks: ["all-pages customers", "inactive details", "wallet semantics", "mature cohorts", "stable references", "truncation and duplicate rejection", "embedded Arabic glyphs", "original brand logo", "inert input", "empty and long brand", "download Riyadh filename", "asset failure"],
}, null, 2));
console.log(`PASS brand analytics PDF: ${customers.length} synthetic customers / ${doc.getNumberOfPages()} pages; complete details, branding, Arabic fonts, wallet semantics, pagination, empty/long/error/security checks`);
