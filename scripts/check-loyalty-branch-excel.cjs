const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const root = path.resolve(__dirname, "..");

function load(relative, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exported = {};
  new Function("require", "exports", output)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    return require(name);
  }, exported);
  return exported;
}

async function main() {
  const excel = load("lib/export/loyalty-branch-excel.ts");
  const generatedAt = "2026-11-24T15:00:00Z";
  const now = Date.parse(generatedAt);
  const earlier = milliseconds => new Date(now - milliseconds).toISOString();
  for (const [value, label, minutes] of [
    [null, "غير مسجل", null], ["invalid", "غير مسجل", null],
    [earlier(-1000), "بعد وقت التقرير", null], [earlier(0), "أقل من دقيقة", 0],
    [earlier(59_999), "أقل من دقيقة", 0], [earlier(60_000), "1 دقيقة", 1],
    [earlier(3_599_999), "59 دقيقة", 59], [earlier(3_600_000), "1 ساعة", 60],
    [earlier(86_399_999), "23 ساعة", 1439], [earlier(86_400_000), "1 يوم", 1440],
  ]) assert.deepEqual(excel.branchActivityAge(value, generatedAt), { label, minutes });

  const stats = { issuedCards: 1001, downloadedCards: 3, appleInstalledCards: 2, googleSaveLinks: 1, stamps: 5, redemptions: 1, customers: 1001, staff: 1, lastActivityAt: earlier(120_000), lastActivityKind: "stamp" };
  const branch = { id: "branch-uuid", name: "الفرع الأول", active: true, address: "عنوان الفرع", city: "المدينة", phone: "+966500000000", workingHours: "09:00–18:00", createdAt: "2026-11-01T21:30:00Z", ...stats };
  const names = ['=HYPERLINK("https://example.invalid","x")', "+SUM(1,2)", "-2+3", "@SUM(A1:A2)", "اسم\u0001عميل"];
  const customers = Array.from({ length: 1001 }, (_, i) => ({
    id: `PRIVATE_PROFILE_${i}`, cardId: `PRIVATE_CARD_${i}`, name: names[i] ?? `عميل ${i}`, phone: `050${String(i).padStart(7, "0")}`,
    branchId: branch.id, branchName: branch.name, issuedAt: "2026-11-02T20:30:00Z", source: "cashier", cashierId: "staff-uuid", cashierName: "موظف الفرع",
    downloadedAt: i === 0 ? earlier(600_000) : null, appleInstalledAt: i === 0 ? earlier(500_000) : null, googleSaveLinkAt: i === 1 ? earlier(400_000) : null,
    stamps: i === 0 ? 5 : 0, redemptions: i === 0 ? 1 : 0, lastActivityAt: i === 0 ? earlier(120_000) : null, lastActivityKind: i === 0 ? "stamp" : null,
    cardCode: "PRIVATE_CARD_CODE", accessLink: "PRIVATE_ACCESS_LINK",
  }));
  const snapshot = { brandName: "علامة الاختبار", generatedAt, from: "2026-11-01", to: "2026-11-24", summary: stats, branches: [branch, { ...branch, id: null, name: "غير مسجل", active: false, issuedCards: 0 }], customers,
    staff: [{ id: "PRIVATE_STAFF_ID", name: "موظف الفرع", active: true, branchId: branch.id, branchName: branch.name, issuedCards: 1001, stamps: 5, redemptions: 1, lastActivityAt: earlier(120_000), lastActivityKind: "stamp" }] };
  const before = JSON.stringify(snapshot);
  const bytes = await excel.buildLoyaltyBranchExcel(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.equal(workbook.worksheets.length, 5);
  const [summary, branches, people, staff, guide] = workbook.worksheets;
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.views[0].rightToLeft, true);
    assert.equal(sheet.views[0].state, "frozen");
    assert.equal(sheet.views[0].ySplit, 5);
    assert.equal(sheet.pageSetup.orientation, "landscape");
  }
  assert.deepEqual(branches.getRow(5).values.slice(1), excel.BRANCH_EXCEL_HEADERS);
  assert.deepEqual(people.getRow(5).values.slice(1), excel.CUSTOMER_EXCEL_HEADERS);
  assert.deepEqual(staff.getRow(5).values.slice(1), excel.STAFF_EXCEL_HEADERS);
  assert.equal(people.rowCount, 1006);
  assert.equal(people.getCell("B1006").value, "عميل 1000");
  assert.equal(people.getCell("C6").value, "0500000000");
  assert.equal(people.getCell("C6").type, ExcelJS.ValueType.String);
  assert.equal(branches.getCell("H6").value, 1001);
  assert.equal(branches.getCell("I6").value, 3);
  assert.equal(branches.getCell("J6").value, 2);
  assert.equal(branches.getCell("K6").value, 1);
  assert.equal(branches.getCell("G6").value.toISOString(), "2026-11-02T00:30:00.000Z");
  assert.equal(people.getCell("D6").value.toISOString(), "2026-11-02T23:30:00.000Z");
  assert.equal(people.getCell("G7").value, "غير مسجل");
  assert.equal(people.getCell("E7").value, "موظف الكاشير");
  assert.equal(people.getCell("M6").value, "إضافة ختم");
  assert.equal(people.getCell("N6").value, "2 دقيقة");
  assert.equal(people.getCell("O6").value, 2);
  assert.equal(branches.getCell("B7").value, "الفرع غير مسجل");
  assert.equal(summary.getCell("B7").value, 1001);
  assert.equal(summary.getCell("B15").value.toISOString(), "2026-11-24T17:58:00.000Z");
  assert(guide.getCell("B9").text.includes("لا يعني أن العميل أكمل الحفظ"));
  for (let index = 0; index < 4; index++) {
    assert.equal(people.getCell(index + 6, 2).type, ExcelJS.ValueType.String);
    assert.equal(people.getCell(index + 6, 2).value, names[index]);
  }
  assert.equal(people.getCell("B10").value, "اسمعميل");
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await Promise.all(Object.keys(zip.files).filter(name => name.endsWith(".xml")).map(name => zip.file(name).async("string")))).join("\n");
  assert(!/<f(?:\s|>)/.test(xml));
  assert(!Object.keys(zip.files).some(name => name.startsWith("xl/externalLinks/")));
  for (const sentinel of ["PRIVATE_CARD_CODE", "PRIVATE_ACCESS_LINK", "PRIVATE_CARD_", "PRIVATE_PROFILE_", "PRIVATE_STAFF_ID"]) assert(!xml.includes(sentinel), sentinel);
  assert(xml.includes('ref="A5:O1006"'));
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(await excel.buildLoyaltyBranchExcel({ ...snapshot, branches: [], customers: [], staff: [] }));
  assert.equal(empty.worksheets[2].rowCount, 5);
  await assert.rejects(excel.buildLoyaltyBranchExcel({ ...snapshot, generatedAt: "invalid" }));

  let captured, failure;
  const route = load("app/api/loyalty/branches/export/route.ts", {
    "@/lib/data/loyalty-branch-report": { getOwnerLoyaltyBranchExport: async filters => { captured = filters; if (failure) throw failure; return snapshot; } },
    "@/lib/export/loyalty-branch-excel": { ...excel, buildLoyaltyBranchExcel: async () => bytes },
  });
  const response = await route.GET(new Request("https://example.invalid/api/loyalty/branches/export?branch=unassigned&from=2026-11-01&to=2026-11-24&search=customer"));
  assert.deepEqual(captured, { branchId: "unassigned", from: "2026-11-01", to: "2026-11-24", search: "customer", page: 1 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Type"), excel.LOYALTY_BRANCH_EXCEL_MIME);
  assert.match(response.headers.get("Content-Disposition"), /branda-branch-customers-2026-11-24\.xlsx/);
  for (const [message, name, expected] of [["Unauthorized", "Error", 401], ["Unauthorized: missing session", "Error", 401], ["Forbidden branch scope", "Error", 403], ["private validation detail", "ZodError", 400], ["private db details", "Error", 503]]) {
    failure = Object.assign(new Error(message), { name });
    const denied = await route.GET(new Request("https://example.invalid/api/loyalty/branches/export"));
    assert.equal(denied.status, expected);
    assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
    assert(!(await denied.text()).includes(message));
  }
  console.log("PASS branch XLSX: 1001 customers without truncation, five RTL sheets, period/count distinctions, dates and age boundaries, formula safety, secret exclusion, route scope and private errors");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
