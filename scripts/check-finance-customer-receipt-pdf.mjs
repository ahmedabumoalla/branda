import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const { jsPDF } = dependency("jspdf");
const documents = [];
function RecordingPdf(options) {
  const doc = new jsPDF(options), originalText = doc.text.bind(doc);
  doc.receiptTextDraws = [];
  doc.text = (value, ...args) => {
    doc.receiptTextDraws.push({ page: doc.getCurrentPageInfo().pageNumber, value: Array.isArray(value) ? value.join(" ") : String(value) });
    return originalText(value, ...args);
  };
  documents.push(doc); return doc;
}
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => name === "jspdf" ? { jsPDF: RecordingPdf } : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : dependency(name), exports);
  return exports;
}
const { financeCustomerReceiptSchema } = load("lib/finance/customer-receipt.ts");
const { buildFinanceCustomerReceiptPdf } = load("lib/export/finance-customer-receipt-pdf.ts");
const fonts = { regular: fs.readFileSync("public/fonts/tajawal-regular.ttf").toString("base64"), bold: fs.readFileSync("public/fonts/tajawal-bold.ttf").toString("base64") };
const receipt = {
  brandName: "مقهى تجربة الكوفي", number: 275, createdAt: "2026-10-26T21:30:00Z", localReference: "L-DB87E7DA-000023",
  subtotal: 120, discount: 12, tax: 14.09, total: 108, paid: 108, vatRate: 15, taxInclusive: true, paymentMethod: "pos",
  lines: [
    { name: "قهوة عربية مختصة بالحليب", quantity: 2, unitPrice: 30, net: 46.96, tax: 7.04 },
    { name: "كيكة التمر", quantity: 1.5, unitPrice: 40, net: 46.95, tax: 7.05 },
  ],
};
const original = JSON.stringify(receipt);
const bytes = buildFinanceCustomerReceiptPdf(receipt, fonts);
assert.ok(bytes instanceof Uint8Array);
assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
assert.match(Buffer.from(bytes).toString("latin1"), /\/FontFile2/);
assert.equal(JSON.stringify(receipt), original, "Receipt projection remains immutable");
const first = documents.at(-1);
assert.equal(first.getNumberOfPages(), 1, "Ordinary receipt fits one A4 page");
assert.ok(Math.abs(first.internal.pageSize.getWidth() - 210) < .1);
assert.ok(Math.abs(first.internal.pageSize.getHeight() - 297) < .1);
const totalRows = first.lastAutoTable.body.map(row => [row.cells[0].raw, row.cells[1].raw]);
assert.deepEqual(totalRows.slice(0, 6), [["120.00", "المجموع قبل الخصم"], ["12.00", "الخصم"], ["93.91", "القيمة قبل الضريبة"], ["14.09", "ضريبة القيمة المضافة"], ["108.00", "الإجمالي المستحق"], ["108.00", "المبلغ المدفوع"]]);
assert.deepEqual(totalRows[6], ["شبكة", "طريقة الدفع"]);
assert.deepEqual(totalRows[7], ["15%", "نسبة ضريبة القيمة المضافة"], "Tax percentage stays in its numeric cell without bidi ambiguity");
const arabic = "فاتورة مبيعات تاريخ الإصدار بتوقيت الرياض جميع المبالغ بالريال السعودي المرجع المحلي الإجمالي شامل الضريبة سعر الوحدة الكمية الصنف المجموع قبل الخصم الخصم القيمة قبل الضريبة ضريبة القيمة المضافة الإجمالي المستحق المبلغ المدفوع طريقة الدفع الأسعار المسجلة شاملة الضريبة غير شاملة الضريبة نسخة من الفاتورة المسجلة نقدي شبكة تحويل بنكي غير محدد " + receipt.brandName + receipt.lines.map(line => line.name).join(" ");
for (const style of ["normal", "bold"]) {
  first.setFont("Tajawal", style);
  assert.ok([...first.processArabic(arabic)].every(character => first.getFont().metadata.characterToGlyph(character.charCodeAt(0)) > 0), `Every shaped Arabic glyph exists in embedded ${style} font`);
}
const zero = { ...receipt, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, vatRate: null, taxInclusive: null, localReference: null, lines: [{ name: "منتج مجاني", quantity: 1, unitPrice: 0, net: 0, tax: 0 }] };
buildFinanceCustomerReceiptPdf(zero, fonts);
assert.equal(documents.at(-1).lastAutoTable.body[4].cells[0].raw, "0.00", "Zero is a real amount, not missing data");
assert.equal(documents.at(-1).lastAutoTable.body.length, 7, "Unknown tax settings are not invented");
buildFinanceCustomerReceiptPdf({ ...receipt, total: 107.99, paid: 20.01 }, fonts);
assert.equal(documents.at(-1).lastAutoTable.body[4].cells[0].raw, "107.99", "Persisted total never recalculated from current prices or tax rate");
assert.equal(documents.at(-1).lastAutoTable.body[5].cells[0].raw, "20.01");
for (const [method, label] of [["cash", "نقدي"], ["bank", "تحويل بنكي"], ["", "غير محدد"]]) {
  buildFinanceCustomerReceiptPdf({ ...receipt, paymentMethod: method }, fonts);
  assert.equal(documents.at(-1).lastAutoTable.body[6].cells[0].raw, label);
}
const manyReceipt = { ...receipt, brandName: "علامة عربية ".repeat(20), lines: Array.from({ length: 160 }, (_, index) => ({ ...receipt.lines[index % 2], name: `منتج ${index + 1} ${"قهوة مختصة محمصة بعناية ".repeat(index % 8 + 1)}` })) };
const manyBytes = buildFinanceCustomerReceiptPdf(manyReceipt, fonts);
const many = documents.at(-1);
assert.ok(many.getNumberOfPages() >= 5, "All lines continue across pages");
for (const [index, page] of many.internal.pages.entries()) {
  if (!page) continue;
  assert.ok(page.join(" ").includes("BT"), `Page ${index} contains real text`);
  assert.ok(many.receiptTextDraws.some(draw => draw.page === index && draw.value === "#275"), `Repeated invoice identity on page ${index}`);
  assert.ok(many.receiptTextDraws.some(draw => draw.page === index && draw.value === "نسخة من الفاتورة المسجلة"), `Repeated footer on page ${index}`);
}
const totalLabels = many.receiptTextDraws.filter(draw => ["الإجمالي المستحق", "المجموع قبل الخصم", "المبلغ المدفوع", "ضريبة القيمة المضافة"].includes(draw.value));
assert.equal(totalLabels.length, 4, "Final financial summary appears exactly once");
assert.equal(new Set(totalLabels.map(draw => draw.page)).size, 1, "Totals remain together on one page");
const injection = "<script>alert(1)</script> /JavaScript /Launch";
const inert = buildFinanceCustomerReceiptPdf({ ...receipt, brandName: injection, lines: [{ ...receipt.lines[0], name: injection }] }, fonts);
assert.ok(!/\/S\s*\/(JavaScript|Launch)\b|\/JS\b/.test(Buffer.from(inert).toString("latin1")), "Plain receipt text cannot add executable PDF actions");
for (const invalid of [
  { ...receipt, phone: "0500000000" }, { ...receipt, notes: "private" }, { ...receipt, cost: 5 },
  { ...receipt, lines: [{ ...receipt.lines[0], cardCode: "private" }] }, { ...receipt, total: NaN },
  { ...receipt, total: Infinity }, { ...receipt, discount: -1 }, { ...receipt, createdAt: "invalid" },
  { ...receipt, lines: [] }, { ...receipt, lines: [{ ...receipt.lines[0], quantity: 0 }] },
]) assert.throws(() => financeCustomerReceiptSchema.parse(invalid));
assert.throws(() => buildFinanceCustomerReceiptPdf(receipt, { regular: "", bold: "" }));
assert.doesNotThrow(() => financeCustomerReceiptSchema.parse({ ...receipt, brandName: "ع".repeat(300) }));
const artifact = path.join(os.tmpdir(), "branda-finance-customer-receipt.pdf");
const multipage = path.join(os.tmpdir(), "branda-finance-customer-receipt-many.pdf");
fs.writeFileSync(artifact, bytes); fs.writeFileSync(multipage, manyBytes);
console.log(`PASS customer receipt PDF: schema privacy, real A4 PDF, Arabic fonts, zero/discount/persisted totals, inert input, wrapped content across ${many.getNumberOfPages()} pages`);
console.log(JSON.stringify({ artifact, multipage, pages: many.getNumberOfPages() }));
